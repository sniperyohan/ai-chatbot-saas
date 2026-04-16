// =====================================================
// 주문 조회 플로우 (카페24 / 스마트스토어 / 아임웹 / 고도몰)
// =====================================================
import { decrypt } from './crypto'
import { maskPhone, maskOrderId } from './crypto'
import { dbGet } from './db'
import { Bindings } from '../types'

export interface OrderQueryParams {
  tenantId: string
  queryType: 'order_id' | 'phone'
  queryValue: string
  channel: string
}

interface PlatformIntegration {
  platform_name: string
  api_key?: string
  api_secret?: string
  shop_id?: string
  access_token?: string
  is_active: boolean
}

interface OrderResult {
  found: boolean
  message: string
  orders?: OrderInfo[]
}

interface OrderInfo {
  order_id: string
  status: string
  items?: string
  amount?: number
  created_at?: string
  tracking_number?: string
}

const ORDER_INQUIRY_PROMPT = `주문 조회를 위해 아래 중 하나를 알려주세요.\n1️⃣ 주문번호  2️⃣ 가입하신 전화번호`

/** 주문 조회 진입점 */
export async function handleOrderInquiry(
  env: Bindings,
  encKey: string,
  tenantId: string,
  channel: string
): Promise<string> {
  const { data: integration } = await dbGet<{ id: string }>(env,
    'SELECT id FROM integrations WHERE tenant_id = ? AND is_active = 1 LIMIT 1', tenantId
  )
  if (!integration) return '주문 조회는 마이페이지에서 확인해주세요.'
  return ORDER_INQUIRY_PROMPT
}

/** 실제 주문 조회 실행 */
export async function lookupOrder(
  env: Bindings,
  encKey: string,
  params: OrderQueryParams
): Promise<OrderResult> {
  const { data: integration } = await dbGet<{
    platform_name: string; api_key: string | null; api_secret: string | null
    shop_id: string | null; access_token: string | null; is_active: number
  }>(env,
    'SELECT platform_name, api_key, api_secret, shop_id, access_token, is_active FROM integrations WHERE tenant_id = ? AND is_active = 1 LIMIT 1',
    params.tenantId
  )

  if (!integration) return { found: false, message: '주문 조회 서비스가 연동되지 않았습니다.' }

  // API 키 복호화
  const decrypted: PlatformIntegration = {
    platform_name: integration.platform_name,
    shop_id: integration.shop_id || undefined,
    is_active: !!integration.is_active,
  }
  if (integration.api_key) {
    try { decrypted.api_key = await decrypt(integration.api_key, encKey) } catch { /* pass */ }
  }
  if (integration.api_secret) {
    try { decrypted.api_secret = await decrypt(integration.api_secret, encKey) } catch { /* pass */ }
  }
  if (integration.access_token) {
    try { decrypted.access_token = await decrypt(integration.access_token, encKey) } catch { /* pass */ }
  }

  let result: OrderResult
  try {
    switch (integration.platform_name) {
      case 'cafe24':      result = await queryCafe24(decrypted, params);      break
      case 'smartstore':  result = await querySmartstore(decrypted, params);  break
      case 'imweb':       result = await queryImweb(decrypted, params);       break
      case 'godomall':    result = await queryGodomall(decrypted, params);    break
      case 'custom':      result = await queryCustomApi(decrypted, params);   break
      default:            result = { found: false, message: '지원하지 않는 플랫폼입니다.' }
    }
  } catch (e) {
    console.error('Order lookup error:', e)
    result = { found: false, message: '주문 조회 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' }
  }

  return result
}

/** 주문 결과 → 자연스러운 한국어 메시지 */
export function formatOrderResult(result: OrderResult): string {
  if (!result.found) return result.message

  if (!result.orders || result.orders.length === 0) {
    return '조회된 주문이 없습니다. 주문번호 또는 전화번호를 다시 확인해주세요.'
  }

  const lines: string[] = ['📦 주문 조회 결과입니다.\n']
  for (const order of result.orders.slice(0, 3)) {
    lines.push(`🔹 주문번호: ${order.order_id}`)
    lines.push(`   상태: ${translateStatus(order.status)}`)
    if (order.items) lines.push(`   상품: ${order.items}`)
    if (order.amount) lines.push(`   결제금액: ${order.amount.toLocaleString()}원`)
    if (order.tracking_number) lines.push(`   운송장번호: ${order.tracking_number}`)
    lines.push('')
  }

  if (result.orders.length > 3) {
    lines.push(`외 ${result.orders.length - 3}건의 주문이 있습니다.`)
  }

  return lines.join('\n')
}

function translateStatus(status: string): string {
  const map: Record<string, string> = {
    pending: '결제 대기',
    paid: '결제 완료',
    preparing: '상품 준비 중',
    shipping: '배송 중',
    delivered: '배송 완료',
    cancelled: '주문 취소',
    refunded: '환불 완료',
    awaiting_fulfillment: '주문 확인 중',
    // 카페24 상태
    standby: '대기',
    normally_confirm: '정상확인',
    // 스마트스토어 상태
    PAYMENT_WAITING: '결제 대기',
    PAYING: '결제 중',
    PAYMENT_DONE: '결제 완료',
    DELIVERING: '배송 중',
    DELIVERED: '배송 완료',
  }
  return map[status] || status
}

// ─────────────────────────────────────────
// 플랫폼별 API 호출
// ─────────────────────────────────────────
async function queryCafe24(
  integration: PlatformIntegration,
  params: OrderQueryParams
): Promise<OrderResult> {
  const mallId = integration.shop_id
  if (!mallId) return { found: false, message: '쇼핑몰 ID가 설정되지 않았습니다.' }

  const queryParam =
    params.queryType === 'order_id'
      ? `order_id=${params.queryValue}`
      : `buyer_phone=${params.queryValue.replace(/-/g, '')}`

  const res = await fetch(
    `https://${mallId}.cafe24api.com/api/v2/orders?${queryParam}&limit=10`,
    {
      headers: {
        Authorization: `Bearer ${integration.access_token}`,
        'Content-Type': 'application/json',
        'X-Cafe24-Api-Version': '2024-03-01',
      },
    }
  )

  if (!res.ok) {
    if (res.status === 401) return { found: false, message: '쇼핑몰 API 인증이 만료되었습니다.' }
    return { found: false, message: '주문 정보를 가져올 수 없습니다.' }
  }

  const json = (await res.json()) as { orders?: { order_id: string; order_status: string; items?: { product_name: string }[]; actual_price: number; tracking_no?: string; created_date: string }[] }
  const orders = json.orders || []

  return {
    found: orders.length > 0,
    message: orders.length === 0 ? '해당 주문을 찾을 수 없습니다.' : '',
    orders: orders.map((o) => ({
      order_id: o.order_id,
      status: o.order_status,
      items: o.items?.map((i) => i.product_name).join(', '),
      amount: o.actual_price,
      tracking_number: o.tracking_no,
      created_at: o.created_date,
    })),
  }
}

async function querySmartstore(
  integration: PlatformIntegration,
  params: OrderQueryParams
): Promise<OrderResult> {
  const body: Record<string, unknown> = { pageNum: 1, pageSize: 10 }

  if (params.queryType === 'order_id') {
    body.orderId = params.queryValue
  } else {
    body.mobilePhone = params.queryValue.replace(/-/g, '')
  }

  const res = await fetch(
    'https://api.commerce.naver.com/external/v1/pay-order/seller/search',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${integration.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  )

  if (!res.ok) return { found: false, message: '주문 정보를 가져올 수 없습니다.' }

  const json = (await res.json()) as { data?: { contents?: { orderId: string; paymentDate: string; orderStatus: string; orderItems?: { productName: string }[]; generalPaymentAmount: number }[] } }
  const orders = json.data?.contents || []

  return {
    found: orders.length > 0,
    message: orders.length === 0 ? '해당 주문을 찾을 수 없습니다.' : '',
    orders: orders.map((o) => ({
      order_id: o.orderId,
      status: o.orderStatus,
      items: o.orderItems?.map((i) => i.productName).join(', '),
      amount: o.generalPaymentAmount,
      created_at: o.paymentDate,
    })),
  }
}

async function queryImweb(
  integration: PlatformIntegration,
  params: OrderQueryParams
): Promise<OrderResult> {
  const queryParam =
    params.queryType === 'order_id'
      ? `order_code=${params.queryValue}`
      : `member_phone=${params.queryValue}`

  const res = await fetch(
    `https://api.imweb.me/v2/shop/orders?${queryParam}&page_num=1&page_size=10`,
    {
      headers: {
        'access-token': integration.api_key || '',
        'secret-key': integration.api_secret || '',
      },
    }
  )

  if (!res.ok) return { found: false, message: '주문 정보를 가져올 수 없습니다.' }

  const json = (await res.json()) as { data?: { list?: { order_code: string; status: string; order_items?: { name: string }[]; pay_price: number; pay_date: string }[] } }
  const orders = json.data?.list || []

  return {
    found: orders.length > 0,
    message: orders.length === 0 ? '해당 주문을 찾을 수 없습니다.' : '',
    orders: orders.map((o) => ({
      order_id: o.order_code,
      status: o.status,
      items: o.order_items?.map((i) => i.name).join(', '),
      amount: o.pay_price,
      created_at: o.pay_date,
    })),
  }
}

async function queryGodomall(
  integration: PlatformIntegration,
  params: OrderQueryParams
): Promise<OrderResult> {
  const queryParam =
    params.queryType === 'order_id'
      ? `ordNo=${params.queryValue}`
      : `mobileNo=${params.queryValue}`

  const res = await fetch(
    `https://api.godomall.com/v1/orders?${queryParam}`,
    {
      headers: {
        Authorization: `Bearer ${integration.api_key}`,
        'Content-Type': 'application/json',
      },
    }
  )

  if (!res.ok) return { found: false, message: '주문 정보를 가져올 수 없습니다.' }

  const json = (await res.json()) as { data?: { list?: { ord_no: string; status_str: string; goods_name: string; settle_price: number; reg_dt: string }[] } }
  const orders = json.data?.list || []

  return {
    found: orders.length > 0,
    message: orders.length === 0 ? '해당 주문을 찾을 수 없습니다.' : '',
    orders: orders.map((o) => ({
      order_id: o.ord_no,
      status: o.status_str,
      items: o.goods_name,
      amount: o.settle_price,
      created_at: o.reg_dt,
    })),
  }
}

async function queryCustomApi(
  integration: PlatformIntegration,
  params: OrderQueryParams
): Promise<OrderResult> {
  // 커스텀 API는 tenant의 external_product_api_url 사용 (별도 설정)
  return { found: false, message: '커스텀 API 설정을 확인해주세요.' }
}
