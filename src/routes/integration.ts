// =====================================================
// API 연동 관리 라우터 (JWT 필요)
// POST   /api/admin/integration/test     - 연동 테스트
// POST   /api/admin/integration/save     - 연동 저장 (AES-256-GCM)
// DELETE /api/admin/integration/:platform - 연동 삭제
// GET    /api/admin/integration          - 연동 목록
// POST   /api/order/lookup              - 주문 조회
// =====================================================
import { Hono } from 'hono'
import { createSupabaseAdmin } from '../lib/supabase'
import { encrypt, decrypt } from '../lib/crypto'
import { adminAuthMiddleware } from '../middleware/auth'
import { lookupOrder, formatOrderResult } from '../lib/orderLookup'
import { Bindings, Variables } from '../types'

const integration = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// ─────────────────────────────────────────
// [1] 연동 목록 조회 (키는 마스킹)
// GET /api/admin/integration
// ─────────────────────────────────────────
integration.get('/integration', adminAuthMiddleware, async (c) => {
  const tenantId = c.get('tenantId')!
  const supabase = createSupabaseAdmin(c.env)

  const { data, error } = await supabase
    .from('tenant_api_integrations')
    .select('id, platform_name, shop_id, is_active, last_synced_at, created_at')
    .eq('tenant_id', tenantId)

  if (error) return c.json({ success: false, error: error.message }, 500)

  return c.json({ success: true, data })
})

// ─────────────────────────────────────────
// [2] 연동 테스트
// POST /api/admin/integration/test
// ─────────────────────────────────────────
integration.post('/integration/test', adminAuthMiddleware, async (c) => {
  let body: {
    platform_name?: string
    api_key?: string
    api_secret?: string
    shop_id?: string
    access_token?: string
  }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400)
  }

  const { platform_name, api_key, api_secret, shop_id, access_token } = body

  if (!platform_name) {
    return c.json({ success: false, error: 'platform_name이 필요합니다.' }, 400)
  }

  try {
    let testResult: { ok: boolean; message: string }

    switch (platform_name) {
      case 'cafe24':
        testResult = await testCafe24(shop_id || '', access_token || '')
        break
      case 'smartstore':
        testResult = await testSmartstore(access_token || '')
        break
      case 'imweb':
        testResult = await testImweb(api_key || '', api_secret || '')
        break
      case 'woocommerce':
        testResult = await testWoocommerce(shop_id || '', api_key || '', api_secret || '')
        break
      case 'custom':
        testResult = { ok: true, message: '커스텀 API 설정이 저장됩니다.' }
        break
      default:
        testResult = { ok: false, message: '지원하지 않는 플랫폼입니다.' }
    }

    return c.json({
      success: testResult.ok,
      message: testResult.message,
    })
  } catch (e) {
    return c.json({ success: false, error: 'API 연결 테스트 실패' }, 500)
  }
})

// ─────────────────────────────────────────
// [3] 연동 저장 (AES-256-GCM 암호화)
// POST /api/admin/integration/save
// ─────────────────────────────────────────
integration.post('/integration/save', adminAuthMiddleware, async (c) => {
  let body: {
    platform_name?: string
    api_key?: string
    api_secret?: string
    shop_id?: string
    access_token?: string
    token_expires_at?: string
  }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400)
  }

  const tenantId = c.get('tenantId')!
  const { platform_name, api_key, api_secret, shop_id, access_token, token_expires_at } = body

  if (!platform_name) {
    return c.json({ success: false, error: 'platform_name이 필요합니다.' }, 400)
  }

  const supabase = createSupabaseAdmin(c.env)

  // 민감 정보 암호화
  const encKey = c.env.ENCRYPTION_KEY
  const encryptedData: Record<string, unknown> = {
    tenant_id: tenantId,
    platform_name,
    shop_id: shop_id || null,
    is_active: true,
    last_synced_at: new Date().toISOString(),
    token_expires_at: token_expires_at || null,
  }

  if (api_key) encryptedData.api_key = await encrypt(api_key, encKey)
  if (api_secret) encryptedData.api_secret = await encrypt(api_secret, encKey)
  if (access_token) encryptedData.access_token = await encrypt(access_token, encKey)

  // UPSERT (tenant_id + platform_name 유니크)
  const { error } = await supabase
    .from('tenant_api_integrations')
    .upsert(encryptedData, { onConflict: 'tenant_id,platform_name' })

  if (error) return c.json({ success: false, error: error.message }, 500)

  return c.json({ success: true, message: 'API 연동 설정이 저장되었습니다.' })
})

// ─────────────────────────────────────────
// [4] 연동 삭제
// DELETE /api/admin/integration/:platform
// ─────────────────────────────────────────
integration.delete('/integration/:platform', adminAuthMiddleware, async (c) => {
  const tenantId = c.get('tenantId')!
  const platform = c.req.param('platform')
  const supabase = createSupabaseAdmin(c.env)

  const { error } = await supabase
    .from('tenant_api_integrations')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('platform_name', platform)

  if (error) return c.json({ success: false, error: error.message }, 500)

  return c.json({ success: true, message: `${platform} 연동이 삭제되었습니다.` })
})

// ─────────────────────────────────────────
// [5] 주문 조회 (5분 캐싱)
// POST /api/order/lookup
// ─────────────────────────────────────────
const orderCache = new Map<string, { data: string; expireAt: number }>()

integration.post('/order/lookup', adminAuthMiddleware, async (c) => {
  let body: {
    query_type?: 'order_id' | 'phone'
    query_value?: string
    platform?: string
  }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400)
  }

  const tenantId = c.get('tenantId')!
  const { query_type, query_value } = body

  if (!query_type || !query_value?.trim()) {
    return c.json({ success: false, error: 'query_type과 query_value가 필요합니다.' }, 400)
  }

  // 5분 캐시
  const cacheKey = `order_${tenantId}_${query_type}_${query_value}`
  const cached = orderCache.get(cacheKey)
  if (cached && Date.now() < cached.expireAt) {
    return c.json({ success: true, data: { answer: cached.data, cached: true } })
  }

  const supabase = createSupabaseAdmin(c.env)
  const result = await lookupOrder(supabase, c.env.ENCRYPTION_KEY, {
    tenantId,
    queryType: query_type,
    queryValue: query_value.trim(),
    channel: 'web',
  })

  const answer = formatOrderResult(result)
  orderCache.set(cacheKey, { data: answer, expireAt: Date.now() + 5 * 60 * 1000 })

  return c.json({ success: true, data: { answer, found: result.found } })
})

// ─────────────────────────────────────────
// 플랫폼 API 테스트 헬퍼
// ─────────────────────────────────────────
async function testCafe24(mallId: string, token: string) {
  if (!mallId || !token)
    return { ok: false, message: '쇼핑몰 ID와 Access Token이 필요합니다.' }
  try {
    const res = await fetch(
      `https://${mallId}.cafe24api.com/api/v2/store`,
      { headers: { Authorization: `Bearer ${token}`, 'X-Cafe24-Api-Version': '2024-03-01' } }
    )
    return res.ok
      ? { ok: true, message: '카페24 연동 성공!' }
      : { ok: false, message: `카페24 인증 실패 (${res.status})` }
  } catch {
    return { ok: false, message: '카페24 서버 연결 실패' }
  }
}

async function testSmartstore(token: string) {
  if (!token) return { ok: false, message: 'Access Token이 필요합니다.' }
  try {
    const res = await fetch(
      'https://api.commerce.naver.com/external/v1/seller/channel',
      { headers: { Authorization: `Bearer ${token}` } }
    )
    return res.ok
      ? { ok: true, message: '네이버 스마트스토어 연동 성공!' }
      : { ok: false, message: `스마트스토어 인증 실패 (${res.status})` }
  } catch {
    return { ok: false, message: '스마트스토어 서버 연결 실패' }
  }
}

async function testImweb(apiKey: string, apiSecret: string) {
  if (!apiKey || !apiSecret) return { ok: false, message: 'API Key와 Secret이 필요합니다.' }
  try {
    const res = await fetch('https://api.imweb.me/v2/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: apiKey, secret: apiSecret }),
    })
    return res.ok
      ? { ok: true, message: '아임웹 연동 성공!' }
      : { ok: false, message: `아임웹 인증 실패 (${res.status})` }
  } catch {
    return { ok: false, message: '아임웹 서버 연결 실패' }
  }
}

async function testWoocommerce(shopUrl: string, key: string, secret: string) {
  if (!shopUrl || !key || !secret)
    return { ok: false, message: '쇼핑몰 URL, Consumer Key, Secret이 필요합니다.' }
  try {
    const url = shopUrl.startsWith('http') ? shopUrl : `https://${shopUrl}`
    const res = await fetch(`${url}/wp-json/wc/v3/system_status`, {
      headers: {
        Authorization: `Basic ${btoa(`${key}:${secret}`)}`,
      },
    })
    return res.ok
      ? { ok: true, message: 'WooCommerce 연동 성공!' }
      : { ok: false, message: `WooCommerce 인증 실패 (${res.status})` }
  } catch {
    return { ok: false, message: 'WooCommerce 서버 연결 실패' }
  }
}

export default integration
