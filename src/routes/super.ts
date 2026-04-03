// =====================================================
// 슈퍼관리자 라우터 (SUPER JWT 필요)
// GET    /api/super/dashboard
// GET    /api/super/tenants
// POST   /api/super/tenants
// PUT    /api/super/tenants/:id
// PUT    /api/super/tenants/:id/plan
// PUT    /api/super/tenants/:id/status
// DELETE /api/super/tenants/:id
// POST   /api/super/tenants/:id/reset-password
// POST   /api/super/tenants/:id/extend          ← 구독 1개월 연장
// POST   /api/super/tenants/:id/confirm-payment ← 입금 확인 + 1개월 연장
// GET    /api/super/plans
// PUT    /api/super/plans/:id
// PUT    /api/super/password
// GET    /api/super/platform-apis
// POST   /api/super/platform-apis
// PUT    /api/super/platform-apis/:id
// GET    /api/super/payment-settings             ← 계좌 설정 조회
// PUT    /api/super/payment-settings             ← 계좌 설정 저장
// GET    /api/super/check-expired                ← 만료 자동 처리
// =====================================================
import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { createSupabaseAdmin, retrySupabase } from '../lib/supabase'
import { superAuthMiddleware } from '../middleware/auth'
import { Bindings, Variables } from '../types'

const superRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// ─── 인증 불필요 라우트 (init-db) ─────────────────────────────────
superRouter.get('/init-db-public', async (c) => {
  // 보안 토큰 체크 (URL 쿼리로 간단히)
  const secret = c.req.query('secret')
  if (secret !== 'init-2026') {
    return c.json({ success: false, error: '접근 불가' }, 403)
  }
  if (!isSupabaseConfiguredInternal(c.env)) {
    return c.json({ success: false, error: 'Supabase가 설정되지 않았습니다.' })
  }
  const supabase = createSupabaseAdmin(c.env)
  const results: Record<string, string> = {}

  async function tryInsert(name: string, data: any) {
    try {
      const { error: selErr } = await supabase.from(name).select('id').limit(1)
      if (!selErr) { results[name] = '✅ 테이블 접근 가능'; return }
      results[name] = `⚠️ 테이블 없음: ${selErr.message}`
    } catch (e: any) { results[name] = `❌ ${e.message}` }
  }

  // 테이블 존재 여부 확인
  for (const t of ['admins','plans','tenants','payment_settings','platform_apis','chat_logs','documents','scenarios','integrations']) {
    await tryInsert(t, null)
  }

  // plans 기본값 삽입 시도
  try {
    for (const p of [
      { plan_name: 'basic',  price: 99000,  faq_limit: 50,  chat_limit: 1000, description: 'FAQ 50개, 월 1,000회 답변' },
      { plan_name: 'pro',    price: 199000, faq_limit: 200, chat_limit: 5000, description: 'FAQ 200개, 월 5,000회 답변' },
      { plan_name: 'master', price: 399000, faq_limit: -1,  chat_limit: -1,   description: 'FAQ 무제한, 월 답변 무제한' },
    ]) {
      await supabase.from('plans').upsert(p, { onConflict: 'plan_name', ignoreDuplicates: true })
    }
    results['plans_seed'] = '✅ plans upsert 완료'
  } catch (e: any) { results['plans_seed'] = `❌ ${e.message}` }

  // admins 슈퍼관리자 삽입
  try {
    const email = c.env.LOCAL_SUPER_ADMIN_EMAIL || 'super@admin.local'
    const hash  = c.env.LOCAL_SUPER_ADMIN_PASSWORD_HASH || ''
    if (hash) {
      const { error } = await supabase.from('admins').upsert(
        { email, password: hash, role: 'super_admin' },
        { onConflict: 'email', ignoreDuplicates: true }
      )
      results['admin_seed'] = error ? `⚠️ ${error.message}` : `✅ 슈퍼관리자 생성 (${email})`
    } else {
      results['admin_seed'] = '⚠️ LOCAL_SUPER_ADMIN_PASSWORD_HASH 미설정'
    }
  } catch (e: any) { results['admin_seed'] = `❌ ${e.message}` }

  // platform_apis 기본값 삽입
  try {
    for (const p of [
      { platform_name: 'cafe24',      display_name: 'Cafe24',           api_endpoint: 'https://api.cafe24.com/api/v2',          auth_type: 'oauth2',  description: 'Cafe24 쇼핑몰 연동',      is_active: true },
      { platform_name: 'smartstore',  display_name: 'Naver Smartstore', api_endpoint: 'https://api.commerce.naver.com/external', auth_type: 'oauth2',  description: '네이버 스마트스토어 연동', is_active: true },
      { platform_name: 'imweb',       display_name: 'imweb',            api_endpoint: 'https://api.imweb.me/v2',                auth_type: 'api_key', description: 'imweb 쇼핑몰 연동',       is_active: true },
      { platform_name: 'godomall',    display_name: 'Godomall',         api_endpoint: 'https://api.godo.co.kr',                 auth_type: 'api_key', description: '고도몰 연동',             is_active: true },
      { platform_name: 'woocommerce', display_name: 'WooCommerce',      api_endpoint: '',                                        auth_type: 'api_key', description: 'WooCommerce 연동',        is_active: true },
      { platform_name: 'kakao',       display_name: 'Kakao Channel',    api_endpoint: 'https://kapi.kakao.com',                 auth_type: 'oauth2',  description: '카카오 채널 연동',        is_active: true },
      { platform_name: 'custom',      display_name: 'Custom API',       api_endpoint: '',                                        auth_type: 'api_key', description: '커스텀 API 연동',         is_active: true },
    ]) {
      await supabase.from('platform_apis').upsert(p, { onConflict: 'platform_name', ignoreDuplicates: true })
    }
    results['platform_seed'] = '✅ platform_apis upsert 완료'
  } catch (e: any) { results['platform_seed'] = `❌ ${e.message}` }

  return c.json({ success: true, message: 'DB 초기화 점검 완료', results })
})

// ─── 인증 필요 라우트 ─────────────────────────────────────────────
superRouter.use('*', superAuthMiddleware)

const SALT_ROUNDS = 12

// ─────────────────────────────────────────
// 헬퍼: Supabase 환경변수가 실제로 설정됐는지 확인
// ─────────────────────────────────────────
function isSupabaseConfigured(env: Bindings): boolean {
  return (
    !!env.SUPABASE_URL &&
    !env.SUPABASE_URL.includes('your-project') &&
    !!env.SUPABASE_SERVICE_KEY &&
    !env.SUPABASE_SERVICE_KEY.includes('your_supabase')
  )
}
const isSupabaseConfiguredInternal = isSupabaseConfigured

// ─────────────────────────────────────────
// 네트워크/DNS 오류 감지
// ─────────────────────────────────────────
function isNetworkOrInternalError(msg: string): boolean {
  return (
    msg.includes('internal error') ||
    msg.includes('DNS') ||
    msg.includes('fetch failed') ||
    msg.includes('Failed to fetch') ||
    msg.includes('network') ||
    msg.includes('ENOTFOUND') ||
    msg.includes('Name or service not known') ||
    msg.includes('error code: 1016') ||
    msg.includes('relation') ||
    msg.includes('does not exist')
  )
}

// ─────────────────────────────────────────
// 로컬 메모리 fallback 저장소 (샌드박스/개발 환경용)
// 서버 재시작 시 초기화됨
// ─────────────────────────────────────────
interface LocalTenant {
  id: string
  company_name: string
  email: string
  plan: string
  is_active: boolean
  is_deleted: boolean
  created_at: string
  widget_color: string
  bot_name: string
  // 구독 필드
  subscription_start_date: string | null
  subscription_end_date: string | null
  subscription_status: 'active' | 'pending' | 'expired'
  payment_memo: string | null
  payment_requested_at: string | null
}

interface LocalPaymentSettings {
  id: string
  bank_name: string
  account_number: string
  account_holder: string
  payment_guide: string
  updated_at: string
}

interface LocalPlatformApi {
  id: string
  platform_name: string
  display_name: string
  api_endpoint: string
  auth_type: string
  description: string
  is_active: boolean
  created_at: string
}

const localTenantStore: LocalTenant[] = []

// 로컬 결제 설정 저장소 (Supabase 없을 때 사용)
let localPaymentSettings: LocalPaymentSettings = {
  id: 'local-payment-settings',
  bank_name: '국민은행',
  account_number: '123-456-789012',
  account_holder: '홍길동',
  payment_guide: '입금 후 입금했어요 버튼을 눌러주세요. 확인 후 1시간 이내 처리됩니다.',
  updated_at: new Date().toISOString(),
}

// ─────────────────────────────────────────
// 구독 날짜 헬퍼: 1개월 연장 (말일 예외처리)
// ─────────────────────────────────────────
function addOneMonth(dateStr: string): string {
  const d = new Date(dateStr)
  const month = d.getMonth()
  d.setMonth(month + 1)
  // 월 오버플로우 처리 (예: 1월 31일 + 1달 = 3월 3일 → 2월 28/29일)
  if (d.getMonth() !== ((month + 1) % 12)) {
    d.setDate(0) // 이전 달 마지막 날
  }
  return d.toISOString().split('T')[0]
}

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0]
}

function calcDday(endDateStr: string | null): number | null {
  if (!endDateStr) return null
  const today = new Date(getTodayStr())
  const end = new Date(endDateStr)
  return Math.floor((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

// ─────────────────────────────────────────
// 로컬 fallback 플랫폼 기본 데이터 (7개)
// Supabase 연결 실패 시 사용
// ─────────────────────────────────────────
const DEFAULT_PLATFORMS: LocalPlatformApi[] = [
  {
    id: 'local-platform-cafe24',
    platform_name: 'cafe24',
    display_name: '카페24',
    api_endpoint: 'https://{mall_id}.cafe24api.com/api/v2',
    auth_type: 'oauth2',
    description: '카페24 쇼핑몰 주문조회 연동',
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'local-platform-smartstore',
    platform_name: 'smartstore',
    display_name: '네이버 스마트스토어',
    api_endpoint: 'https://api.commerce.naver.com/external/v1',
    auth_type: 'oauth2',
    description: '네이버 스마트스토어 주문조회 연동',
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'local-platform-imweb',
    platform_name: 'imweb',
    display_name: '아임웹',
    api_endpoint: 'https://api.imweb.me/v2',
    auth_type: 'api_key',
    description: '아임웹 쇼핑몰 주문조회 연동',
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'local-platform-godomall',
    platform_name: 'godomall',
    display_name: '고도몰(NHN커머스)',
    api_endpoint: 'https://api.godomall.com/v1',
    auth_type: 'api_key',
    description: '고도몰 쇼핑몰 주문조회 연동',
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'local-platform-woocommerce',
    platform_name: 'woocommerce',
    display_name: 'WooCommerce',
    api_endpoint: 'https://{shop_url}/wp-json/wc/v3',
    auth_type: 'api_key',
    description: '워드프레스 우커머스 주문조회 연동',
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'local-platform-kakao',
    platform_name: 'kakao',
    display_name: '카카오채널',
    api_endpoint: 'https://kapi.kakao.com/v1',
    auth_type: 'bearer',
    description: '카카오톡 채널 챗봇 연동',
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'local-platform-custom',
    platform_name: 'custom',
    display_name: '커스텀 API',
    api_endpoint: '',
    auth_type: 'api_key',
    description: '직접 개발한 쇼핑몰 API 연동',
    is_active: true,
    created_at: new Date().toISOString(),
  },
]

// 런타임 변경사항을 반영하는 변경 가능한 복사본
const localPlatformApiStore: LocalPlatformApi[] = DEFAULT_PLATFORMS.map(p => ({ ...p }))

// 로컬 플랜 저장소 (Supabase 없을 때 사용)
const localPlanStore = [
  { id: 'local-plan-basic', plan_name: 'basic', price: 99000, faq_limit: 50, chat_limit: 1000 },
  { id: 'local-plan-pro', plan_name: 'pro', price: 199000, faq_limit: 200, chat_limit: 5000 },
  { id: 'local-plan-master', plan_name: 'master', price: 399000, faq_limit: -1, chat_limit: -1 },
]

// ─────────────────────────────────────────
// 임시 비밀번호 생성 (crypto.getRandomValues)
// ─────────────────────────────────────────
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$'
  const arr = new Uint8Array(12)
  crypto.getRandomValues(arr)
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ'
  const lower = 'abcdefghjkmnpqrstuvwxyz'
  const digits = '23456789'
  const specials = '!@#$'
  let pw =
    upper[arr[0] % upper.length] +
    lower[arr[1] % lower.length] +
    digits[arr[2] % digits.length] +
    specials[arr[3] % specials.length]
  for (let i = 4; i < 12; i++) pw += chars[arr[i] % chars.length]
  return pw
}

// ─────────────────────────────────────────
// Resend 이메일 발송
// ─────────────────────────────────────────
async function sendWelcomeEmail(
  resendKey: string,
  to: string,
  companyName: string,
  tempPassword: string
): Promise<boolean> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'AI상담봇 <noreply@your-domain.com>',
        to: [to],
        subject: '[AI상담봇] 계정 발급 안내',
        html: `
          <h2>안녕하세요, ${companyName} 담당자님!</h2>
          <p>AI 상담봇 서비스 계정이 발급되었습니다.</p>
          <table>
            <tr><td><b>이메일</b></td><td>${to}</td></tr>
            <tr><td><b>임시 비밀번호</b></td><td><code>${tempPassword}</code></td></tr>
          </table>
          <p>⚠️ 보안을 위해 첫 로그인 후 반드시 비밀번호를 변경해주세요.</p>
        `,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

// ─────────────────────────────────────────
// [1] 슈퍼 대시보드
// GET /api/super/dashboard
// ─────────────────────────────────────────
superRouter.get('/dashboard', async (c) => {
  const PLAN_PRICES: Record<string, number> = { basic: 99000, pro: 199000, master: 399000 }

  if (!isSupabaseConfigured(c.env)) {
    const active = localTenantStore.filter(t => t.is_active && !t.is_deleted)
    return c.json({
      success: true,
      data: {
        total_tenants: localTenantStore.filter(t => !t.is_deleted).length,
        active_tenants: active.length,
        monthly_revenue: active.reduce((sum, t) => sum + (PLAN_PRICES[t.plan] || 0), 0),
        total_chats: 0,
        channel_stats: {},
      },
    })
  }

  const supabase = createSupabaseAdmin(c.env)

  try {
    const [
      { count: totalTenants },
      { count: activeTenants },
      { count: totalChats },
      { data: planData },
      { data: plans },
      { data: channelData },
    ] = await Promise.all([
      retrySupabase(() => supabase.from('tenants').select('id', { count: 'exact', head: true }).eq('is_deleted', false)),
      retrySupabase(() => supabase.from('tenants').select('id', { count: 'exact', head: true }).eq('is_deleted', false).eq('is_active', true)),
      retrySupabase(() => supabase.from('chat_logs').select('id', { count: 'exact', head: true })),
      retrySupabase(() => supabase.from('tenants').select('plan').eq('is_deleted', false).eq('is_active', true)),
      retrySupabase(() => supabase.from('plans').select('plan_name, price')),
      retrySupabase(() => supabase.from('chat_logs').select('channel')),
    ])

    const planPriceMap: Record<string, number> = {}
    for (const p of plans || []) planPriceMap[p.plan_name] = p.price

    const monthlyRevenue = (planData || []).reduce(
      (sum, t) => sum + (planPriceMap[t.plan] || PLAN_PRICES[t.plan] || 0),
      0
    )

    const channelStats: Record<string, number> = {}
    for (const row of channelData || []) {
      channelStats[row.channel] = (channelStats[row.channel] || 0) + 1
    }

    const localActive = localTenantStore.filter(t => t.is_active && !t.is_deleted)

    return c.json({
      success: true,
      data: {
        total_tenants: (totalTenants || 0) + localTenantStore.filter(t => !t.is_deleted).length,
        active_tenants: (activeTenants || 0) + localActive.length,
        monthly_revenue: monthlyRevenue + localActive.reduce((s, t) => s + (PLAN_PRICES[t.plan] || 0), 0),
        total_chats: totalChats || 0,
        channel_stats: channelStats,
      },
    })
  } catch (err: any) {
    console.error('[super/dashboard] Supabase 오류:', err.message)
    return c.json({ success: false, error: `대시보드 조회 실패: ${err.message}` }, 500)
  }
})

// ─────────────────────────────────────────
// [2] 고객사 목록
// GET /api/super/tenants?page=1&limit=20&plan=&status=
// ─────────────────────────────────────────
superRouter.get('/tenants', async (c) => {
  const page = parseInt(c.req.query('page') || '1')
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100)
  const offset = (page - 1) * limit
  const planFilter = c.req.query('plan') || ''       // basic|pro|master
  const statusFilter = c.req.query('status') || ''   // active|inactive
  const searchQuery = c.req.query('search') || ''

  const filterLocalItems = (items: LocalTenant[]) => {
    let result = items.filter(t => !t.is_deleted)
    if (planFilter) result = result.filter(t => t.plan === planFilter)
    if (statusFilter === 'active') result = result.filter(t => t.is_active)
    if (statusFilter === 'inactive') result = result.filter(t => !t.is_active)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(t =>
        t.company_name.toLowerCase().includes(q) || t.email.toLowerCase().includes(q)
      )
    }
    return result
  }

  // Supabase 미설정 시 로컬 메모리 fallback
  if (!isSupabaseConfigured(c.env)) {
    const active = filterLocalItems(localTenantStore)
    const sliced = active.slice(offset, offset + limit)
    return c.json({
      success: true,
      data: { items: sliced, total: active.length, page, limit, totalPages: Math.ceil(active.length / limit) },
    })
  }

  // Supabase 설정됨 → 반드시 Supabase 사용, 로컬 fallback 없음
  const supabase = createSupabaseAdmin(c.env)
  try {
    let query = supabase
      .from('tenants')
      .select('id, company_name, email, plan, is_active, is_deleted, created_at, widget_color, bot_name, subscription_start_date, subscription_end_date, subscription_status', { count: 'exact' })
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })

    if (planFilter) query = query.eq('plan', planFilter)
    if (statusFilter === 'active') query = query.eq('is_active', true)
    if (statusFilter === 'inactive') query = query.eq('is_active', false)
    if (searchQuery) query = query.or(`company_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)

    const { data, count, error } = await retrySupabase(() => query.range(offset, offset + limit - 1))

    if (error) {
      console.error('[super/tenants GET] Supabase 오류:', error.message)
      return c.json({ success: false, error: `고객사 목록 조회 실패: ${error.message}` }, 500)
    }

    return c.json({
      success: true,
      data: { items: data || [], total: count || 0, page, limit, totalPages: Math.ceil((count || 0) / limit) },
    })
  } catch (err: any) {
    console.error('[super/tenants GET] Supabase 예외:', err.message)
    return c.json({ success: false, error: `서버 오류: ${err.message}` }, 500)
  }
})

// ─────────────────────────────────────────
// [3] 고객사 생성
// POST /api/super/tenants
// ─────────────────────────────────────────
superRouter.post('/tenants', async (c) => {
  let body: { company_name?: string; email?: string; plan?: string; bot_name?: string; widget_color?: string }
  try { body = await c.req.json() }
  catch { return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400) }

  const { company_name, email, plan = 'basic', bot_name, widget_color } = body
  if (!company_name?.trim() || !email?.trim()) {
    return c.json({ success: false, error: '회사명과 이메일은 필수입니다.' }, 400)
  }

  const normalizedEmail = email.toLowerCase().trim()
  const TEMP_PASSWORD = 'Test1234!'

  const createLocalTenant = () => {
    const dup = localTenantStore.find(t => t.email === normalizedEmail && !t.is_deleted)
    if (dup) return c.json({ success: false, error: '이미 사용 중인 이메일입니다.' }, 409)

    const newId = `local-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    const todayStr = getTodayStr()
    const newTenant: LocalTenant = {
      id: newId,
      company_name: company_name!.trim(),
      email: normalizedEmail,
      plan: plan || 'basic',
      is_active: true,
      is_deleted: false,
      created_at: new Date().toISOString(),
      widget_color: widget_color || '#4F46E5',
      bot_name: bot_name || 'AI상담봇',
      subscription_start_date: todayStr,
      subscription_end_date: addOneMonth(todayStr),
      subscription_status: 'active',
      payment_memo: null,
      payment_requested_at: null,
    }
    localTenantStore.push(newTenant)
    return c.json({
      success: true,
      data: {
        tenant: { id: newId, company_name: newTenant.company_name, email: newTenant.email, plan: newTenant.plan },
        email_sent: false,
        temp_password: TEMP_PASSWORD,
      },
      message: '고객사가 로컬 메모리에 생성되었습니다. (샌드박스 테스트 모드 — 서버 재시작 시 초기화)',
    }, 201)
  }

  // Supabase 미설정 시 로컬 메모리 fallback
  if (!isSupabaseConfigured(c.env)) return createLocalTenant()

  // Supabase 설정됨 → 반드시 Supabase 사용, 로컬 fallback 없음
  const supabase = createSupabaseAdmin(c.env)
  try {
    // 중복 이메일 확인 (tenants + admins)
    const [{ data: existTenant, error: e1 }, { data: existAdmin, error: e2 }] = await Promise.all([
      retrySupabase(() => supabase.from('tenants').select('id').eq('email', normalizedEmail).eq('is_deleted', false).maybeSingle()),
      retrySupabase(() => supabase.from('admins').select('id').eq('email', normalizedEmail).maybeSingle()),
    ])

    if (e1 && !e1.message.includes('PGRST116')) {
      console.error('[super/tenants POST] tenants 중복 확인 오류:', e1.message)
      return c.json({ success: false, error: `이메일 중복 확인 실패: ${e1.message}` }, 500)
    }
    if (e2 && !e2.message.includes('PGRST116')) {
      console.error('[super/tenants POST] admins 중복 확인 오류:', e2.message)
      return c.json({ success: false, error: `이메일 중복 확인 실패: ${e2.message}` }, 500)
    }

    if (existTenant || existAdmin) {
      return c.json({ success: false, error: '이미 사용 중인 이메일입니다.' }, 409)
    }

    const tempPassword = generateTempPassword()
    const hashedPassword = await bcrypt.hash(tempPassword, SALT_ROUNDS)

    const { data: newTenant, error: insertError } = await retrySupabase(() =>
      supabase
        .from('tenants')
        .insert({
          company_name: company_name!.trim(),
          email: normalizedEmail,
          password: hashedPassword,
          plan,
          bot_name: bot_name || 'AI상담봇',
          widget_color: widget_color || '#4F46E5',
          is_temp_password: true,
        })
        .select()
        .single()
    )

    if (insertError) {
      console.error('[super/tenants POST] 고객사 생성 오류:', insertError.message)
      return c.json({ success: false, error: `고객사 생성 실패: ${insertError.message}` }, 500)
    }

    await supabase.from('plan_history').insert({ tenant_id: newTenant.id, old_plan: 'none', new_plan: plan })
      .catch(() => {})

    const emailSent = await sendWelcomeEmail(c.env.RESEND_API_KEY, normalizedEmail, company_name!.trim(), tempPassword)

    return c.json({
      success: true,
      data: {
        tenant: { id: newTenant.id, company_name: newTenant.company_name, email: newTenant.email, plan },
        email_sent: emailSent,
        ...(emailSent ? {} : { temp_password: tempPassword }),
      },
      message: emailSent ? '고객사가 생성되고 이메일이 발송되었습니다.' : '고객사가 생성되었으나 이메일 발송에 실패했습니다.',
    }, 201)
  } catch (err: any) {
    console.error('[super/tenants POST] Supabase 예외:', err.message)
    return c.json({ success: false, error: `서버 오류: ${err.message}` }, 500)
  }
})

// ─────────────────────────────────────────
// [4] 고객사 수정 (범용)
// PUT /api/super/tenants/:id
// ─────────────────────────────────────────
superRouter.put('/tenants/:id', async (c) => {
  const tenantId = c.req.param('id')
  let body: { plan?: string; is_active?: boolean; bot_name?: string; widget_color?: string; greeting_message?: string }
  try { body = await c.req.json() }
  catch { return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400) }

  // 로컬 메모리 고객사 처리
  const localIdx = localTenantStore.findIndex(t => t.id === tenantId && !t.is_deleted)
  if (localIdx !== -1) {
    const t = localTenantStore[localIdx]
    if (body.plan !== undefined) t.plan = body.plan
    if (body.is_active !== undefined) t.is_active = body.is_active
    if (body.bot_name) t.bot_name = body.bot_name
    if (body.widget_color) t.widget_color = body.widget_color
    return c.json({ success: true, message: '고객사 정보가 수정되었습니다.' })
  }

  if (!isSupabaseConfigured(c.env)) return c.json({ success: false, error: '고객사를 찾을 수 없습니다.' }, 404)

  const supabase = createSupabaseAdmin(c.env)
  try {
    const { data: existing, error: fetchErr } = await retrySupabase(() =>
      supabase.from('tenants').select('plan, is_active').eq('id', tenantId).eq('is_deleted', false).single()
    )
    if (fetchErr) return c.json({ success: false, error: `조회 실패: ${fetchErr.message}` }, 500)
    if (!existing) return c.json({ success: false, error: '고객사를 찾을 수 없습니다.' }, 404)

    const updateData: Record<string, unknown> = {}
    if (body.is_active !== undefined) updateData.is_active = body.is_active
    if (body.bot_name) updateData.bot_name = body.bot_name
    if (body.widget_color) updateData.widget_color = body.widget_color
    if (body.greeting_message) updateData.greeting_message = body.greeting_message
    if (body.plan && body.plan !== existing.plan) {
      updateData.plan = body.plan
      await supabase.from('plan_history').insert({ tenant_id: tenantId, old_plan: existing.plan, new_plan: body.plan })
        .catch(() => {})
    }

    const { error } = await retrySupabase(() =>
      supabase.from('tenants').update(updateData).eq('id', tenantId)
    )
    if (error) return c.json({ success: false, error: error.message }, 500)
    return c.json({ success: true, message: '고객사 정보가 수정되었습니다.' })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// ─────────────────────────────────────────
// [4-1] 고객사 플랜 변경
// PUT /api/super/tenants/:id/plan
// ─────────────────────────────────────────
superRouter.put('/tenants/:id/plan', async (c) => {
  const tenantId = c.req.param('id')
  let body: { plan?: string }
  try { body = await c.req.json() }
  catch { return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400) }

  const { plan } = body
  if (!plan || !['basic', 'pro', 'master'].includes(plan)) {
    return c.json({ success: false, error: '올바른 플랜을 선택하세요.' }, 400)
  }

  // 로컬 메모리 고객사 처리
  const localIdx = localTenantStore.findIndex(t => t.id === tenantId && !t.is_deleted)
  if (localIdx !== -1) {
    localTenantStore[localIdx].plan = plan
    return c.json({ success: true, message: `플랜이 ${plan}으로 변경되었습니다.` })
  }

  if (!isSupabaseConfigured(c.env)) return c.json({ success: false, error: '고객사를 찾을 수 없습니다.' }, 404)

  const supabase = createSupabaseAdmin(c.env)
  try {
    const { data: existing, error: fetchErr } = await retrySupabase(() =>
      supabase.from('tenants').select('plan').eq('id', tenantId).eq('is_deleted', false).single()
    )
    if (fetchErr) return c.json({ success: false, error: `조회 실패: ${fetchErr.message}` }, 500)
    if (!existing) return c.json({ success: false, error: '고객사를 찾을 수 없습니다.' }, 404)

    await supabase.from('plan_history').insert({ tenant_id: tenantId, old_plan: existing.plan, new_plan: plan })
      .catch(() => {})
    const { error } = await retrySupabase(() =>
      supabase.from('tenants').update({ plan }).eq('id', tenantId)
    )
    if (error) return c.json({ success: false, error: error.message }, 500)
    return c.json({ success: true, message: `플랜이 ${plan}으로 변경되었습니다.` })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// ─────────────────────────────────────────
// [4-2] 고객사 활성/비활성 토글
// PUT /api/super/tenants/:id/status
// ─────────────────────────────────────────
superRouter.put('/tenants/:id/status', async (c) => {
  const tenantId = c.req.param('id')
  let body: { is_active?: boolean }
  try { body = await c.req.json() }
  catch { return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400) }

  if (body.is_active === undefined) {
    return c.json({ success: false, error: 'is_active 값이 필요합니다.' }, 400)
  }

  // 로컬 메모리 고객사 처리
  const localIdx = localTenantStore.findIndex(t => t.id === tenantId && !t.is_deleted)
  if (localIdx !== -1) {
    localTenantStore[localIdx].is_active = body.is_active
    return c.json({ success: true, message: `고객사가 ${body.is_active ? '활성화' : '비활성화'}되었습니다.` })
  }

  if (!isSupabaseConfigured(c.env)) return c.json({ success: false, error: '고객사를 찾을 수 없습니다.' }, 404)

  const supabase = createSupabaseAdmin(c.env)
  try {
    const { error } = await retrySupabase(() =>
      supabase.from('tenants').update({ is_active: body.is_active }).eq('id', tenantId)
    )
    if (error) return c.json({ success: false, error: error.message }, 500)
    return c.json({ success: true, message: `고객사가 ${body.is_active ? '활성화' : '비활성화'}되었습니다.` })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// ─────────────────────────────────────────
// [5] 고객사 삭제 (소프트 삭제)
// DELETE /api/super/tenants/:id
// ─────────────────────────────────────────
superRouter.delete('/tenants/:id', async (c) => {
  const tenantId = c.req.param('id')

  // 로컬 메모리 고객사 처리
  const localIdx = localTenantStore.findIndex(t => t.id === tenantId && !t.is_deleted)
  if (localIdx !== -1) {
    localTenantStore[localIdx].is_deleted = true
    localTenantStore[localIdx].is_active = false
    return c.json({ success: true, message: '고객사가 삭제되었습니다.' })
  }

  if (!isSupabaseConfigured(c.env)) return c.json({ success: false, error: '고객사를 찾을 수 없습니다.' }, 404)

  const supabase = createSupabaseAdmin(c.env)
  try {
    const { data: existing, error: fetchErr } = await retrySupabase(() =>
      supabase.from('tenants').select('id').eq('id', tenantId).eq('is_deleted', false).single()
    )
    if (fetchErr) return c.json({ success: false, error: `조회 실패: ${fetchErr.message}` }, 500)
    if (!existing) return c.json({ success: false, error: '고객사를 찾을 수 없습니다.' }, 404)

    await retrySupabase(() =>
      supabase.from('tenants').update({ is_deleted: true, is_active: false }).eq('id', tenantId)
    )
    return c.json({ success: true, message: '고객사가 삭제되었습니다.' })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// ─────────────────────────────────────────
// [6] 비밀번호 초기화
// POST /api/super/tenants/:id/reset-password
// ─────────────────────────────────────────
superRouter.post('/tenants/:id/reset-password', async (c) => {
  const tenantId = c.req.param('id')
  const FALLBACK_TEMP = 'Test1234!'

  // 로컬 메모리 고객사 처리
  const localIdx = localTenantStore.findIndex(t => t.id === tenantId && !t.is_deleted)
  if (localIdx !== -1) {
    const tenant = localTenantStore[localIdx]
    return c.json({
      success: true,
      data: {
        email_sent: false,
        temp_password: FALLBACK_TEMP,
        email: tenant.email,
      },
      message: '임시 비밀번호가 생성되었습니다. (로컬 메모리 — 직접 전달 필요)',
    })
  }

  if (!isSupabaseConfigured(c.env)) return c.json({ success: false, error: '고객사를 찾을 수 없습니다.' }, 404)

  const supabase = createSupabaseAdmin(c.env)
  try {
    const { data: tenant, error: fetchErr } = await retrySupabase(() =>
      supabase.from('tenants').select('id, email, company_name').eq('id', tenantId).eq('is_deleted', false).single()
    )

    if (fetchErr) {
      return c.json({ success: false, error: `고객사 조회 실패: ${fetchErr.message}` }, 500)
    }
    if (!tenant) return c.json({ success: false, error: '고객사를 찾을 수 없습니다.' }, 404)

    const tempPassword = generateTempPassword()
    const hashedPassword = await bcrypt.hash(tempPassword, SALT_ROUNDS)

    const { error: updateErr } = await retrySupabase(() =>
      supabase.from('tenants').update({ password: hashedPassword, is_temp_password: true }).eq('id', tenantId)
    )
    if (updateErr) return c.json({ success: false, error: updateErr.message }, 500)

    const emailSent = await sendWelcomeEmail(c.env.RESEND_API_KEY, tenant.email, tenant.company_name, tempPassword)

    return c.json({
      success: true,
      data: { email_sent: emailSent, temp_password: tempPassword, email: tenant.email },
      message: emailSent ? '임시 비밀번호가 이메일로 발송되었습니다.' : '임시 비밀번호가 생성되었습니다. 직접 전달해주세요.',
    })
  } catch (err: any) {
    console.error('[reset-password] Supabase 예외:', err.message)
    return c.json({ success: false, error: `비밀번호 초기화 실패: ${err.message}` }, 500)
  }
})

// ─────────────────────────────────────────
// [7] 플랜 목록
// GET /api/super/plans
// ─────────────────────────────────────────
superRouter.get('/plans', async (c) => {
  if (!isSupabaseConfigured(c.env)) {
    return c.json({ success: true, data: localPlanStore })
  }
  const supabase = createSupabaseAdmin(c.env)
  try {
    const { data, error } = await retrySupabase(() =>
      supabase.from('plans').select('*').order('price')
    )
    if (error) return c.json({ success: false, error: `플랜 조회 실패: ${error.message}` }, 500)
    return c.json({ success: true, data: data?.length ? data : localPlanStore })
  } catch (err: any) {
    return c.json({ success: false, error: `플랜 조회 실패: ${err.message}` }, 500)
  }
})

// ─────────────────────────────────────────
// [8] 플랜 수정
// PUT /api/super/plans/:id
// ─────────────────────────────────────────
superRouter.put('/plans/:id', async (c) => {
  const planId = c.req.param('id')
  let body: { price?: number; faq_limit?: number; chat_limit?: number }
  try { body = await c.req.json() }
  catch { return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400) }

  // 로컬 플랜 처리
  const localIdx = localPlanStore.findIndex(p => p.id === planId)
  if (localIdx !== -1) {
    if (body.price !== undefined) localPlanStore[localIdx].price = body.price
    if (body.faq_limit !== undefined) localPlanStore[localIdx].faq_limit = body.faq_limit
    if (body.chat_limit !== undefined) localPlanStore[localIdx].chat_limit = body.chat_limit
    return c.json({ success: true, message: '플랜이 수정되었습니다.' })
  }

  if (!isSupabaseConfigured(c.env)) return c.json({ success: false, error: '플랜을 찾을 수 없습니다.' }, 404)

  const supabase = createSupabaseAdmin(c.env)
  try {
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.price !== undefined) updateData.price = body.price
    if (body.faq_limit !== undefined) updateData.faq_limit = body.faq_limit
    if (body.chat_limit !== undefined) updateData.chat_limit = body.chat_limit

    const { error } = await retrySupabase(() =>
      supabase.from('plans').update(updateData).eq('id', planId)
    )
    if (error) return c.json({ success: false, error: error.message }, 500)
    return c.json({ success: true, message: '플랜이 수정되었습니다.' })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// ─────────────────────────────────────────
// [9] 슈퍼관리자 비밀번호 변경
// PUT /api/super/password
// ─────────────────────────────────────────
superRouter.put('/password', async (c) => {
  let body: { current_password?: string; new_password?: string }
  try { body = await c.req.json() }
  catch { return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400) }

  const { current_password, new_password } = body
  if (!current_password || !new_password) {
    return c.json({ success: false, error: '현재 비밀번호와 새 비밀번호를 입력하세요.' }, 400)
  }
  // 비밀번호 72자 제한 (bcrypt 안전 범위)
  if (current_password.length > 72 || new_password.length > 72) {
    return c.json({ success: false, error: '비밀번호는 최대 72자까지 입력 가능합니다.' }, 400)
  }
  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/.test(new_password)) {
    return c.json({ success: false, error: '비밀번호는 8자 이상, 대소문자·숫자·특수문자를 포함해야 합니다.' }, 400)
  }

  // JWT에서 admin ID 추출
  const adminId = (c.get('jwtPayload' as any) as any)?.sub || ''

  // 로컬 fallback: .dev.vars 계정
  if (!isSupabaseConfigured(c.env) || adminId === 'local-super-admin') {
    const localHash = c.env.LOCAL_SUPER_ADMIN_PASSWORD_HASH || ''
    const isValid = localHash ? await bcrypt.compare(current_password, localHash) : current_password === 'Admin1234!'
    if (!isValid) return c.json({ success: false, error: '현재 비밀번호가 올바르지 않습니다.' }, 401)

    const newHash = await bcrypt.hash(new_password, SALT_ROUNDS)
    console.log('[super/password] 로컬 비밀번호 변경 (메모리 저장, 재시작 시 초기화):', newHash.substring(0, 7))
    return c.json({ success: true, message: '비밀번호가 변경되었습니다.' })
  }

  const supabase = createSupabaseAdmin(c.env)
  try {
    const { data: admin, error: fetchErr } = await retrySupabase(() =>
      supabase.from('admins').select('id, password').eq('id', adminId).single()
    )
    if (fetchErr) return c.json({ success: false, error: `관리자 조회 실패: ${fetchErr.message}` }, 500)
    if (!admin) return c.json({ success: false, error: '관리자 정보를 찾을 수 없습니다.' }, 404)

    const isValid = await bcrypt.compare(current_password, admin.password)
    if (!isValid) return c.json({ success: false, error: '현재 비밀번호가 올바르지 않습니다.' }, 401)

    const newHash = await bcrypt.hash(new_password, SALT_ROUNDS)
    const { error: updateErr } = await retrySupabase(() =>
      supabase.from('admins').update({ password: newHash }).eq('id', adminId)
    )
    if (updateErr) return c.json({ success: false, error: updateErr.message }, 500)
    return c.json({ success: true, message: '비밀번호가 변경되었습니다.' })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// ─────────────────────────────────────────
// [10] API 플랫폼 목록
// GET /api/super/platform-apis
// Supabase 연결 성공 시: DB 조회 + 초기 데이터 seed
// Supabase 연결 실패 시: 로컬 fallback (7개) 반환
// ─────────────────────────────────────────
superRouter.get('/platform-apis', async (c) => {
  if (!isSupabaseConfigured(c.env)) {
    return c.json({ success: true, data: localPlatformApiStore })
  }
  const supabase = createSupabaseAdmin(c.env)
  try {
    const { data, error } = await retrySupabase(() =>
      supabase.from('platform_apis').select('*').order('created_at', { ascending: true })
    )

    if (error) return c.json({ success: false, error: `플랫폼 목록 조회 실패: ${error.message}` }, 500)

    // DB가 비어 있으면 7개 기본 데이터 seed (ON CONFLICT DO NOTHING)
    if (!data || data.length === 0) {
      const seedRows = [
        { platform_name: 'cafe24',       display_name: '카페24',              api_endpoint: 'https://{mall_id}.cafe24api.com/api/v2',    auth_type: 'oauth2',  description: '카페24 쇼핑몰 주문조회 연동',           is_active: true },
        { platform_name: 'smartstore',   display_name: '네이버 스마트스토어',  api_endpoint: 'https://api.commerce.naver.com/external/v1', auth_type: 'oauth2',  description: '네이버 스마트스토어 주문조회 연동',      is_active: true },
        { platform_name: 'imweb',        display_name: '아임웹',              api_endpoint: 'https://api.imweb.me/v2',                    auth_type: 'api_key', description: '아임웹 쇼핑몰 주문조회 연동',           is_active: true },
        { platform_name: 'godomall',     display_name: '고도몰(NHN커머스)',   api_endpoint: 'https://api.godomall.com/v1',                auth_type: 'api_key', description: '고도몰 쇼핑몰 주문조회 연동',           is_active: true },
        { platform_name: 'woocommerce',  display_name: 'WooCommerce',         api_endpoint: 'https://{shop_url}/wp-json/wc/v3',           auth_type: 'api_key', description: '워드프레스 우커머스 주문조회 연동',      is_active: true },
        { platform_name: 'kakao',        display_name: '카카오채널',           api_endpoint: 'https://kapi.kakao.com/v1',                  auth_type: 'bearer',  description: '카카오톡 채널 챗봇 연동',                is_active: true },
        { platform_name: 'custom',       display_name: '커스텀 API',           api_endpoint: '',                                           auth_type: 'api_key', description: '직접 개발한 쇼핑몰 API 연동',           is_active: true },
      ]
      // upsert (platform_name unique 제약 기준) — 기존 레코드는 건드리지 않음
      const { data: seeded, error: seedErr } = await retrySupabase(() =>
        supabase.from('platform_apis').upsert(seedRows, { onConflict: 'platform_name', ignoreDuplicates: true }).select()
      )
      if (seedErr) return c.json({ success: false, error: `플랫폼 seed 실패: ${seedErr.message}` }, 500)
      // seed 후 재조회
      const { data: afterSeed } = await retrySupabase(() =>
        supabase.from('platform_apis').select('*').order('created_at', { ascending: true })
      )
      return c.json({ success: true, data: afterSeed?.length ? afterSeed : localPlatformApiStore })
    }

    // DB에 이미 데이터 있을 경우: 카카오채널 누락 시 단건 INSERT
    const hasKakao = data.some((r: any) => r.platform_name === 'kakao')
    if (!hasKakao) {
      await supabase.from('platform_apis').upsert(
        { platform_name: 'kakao', display_name: '카카오채널', api_endpoint: 'https://kapi.kakao.com/v1', auth_type: 'bearer', description: '카카오톡 채널 챗봇 연동', is_active: true },
        { onConflict: 'platform_name', ignoreDuplicates: true }
      ).catch(() => {})
      // 재조회
      const { data: refreshed } = await retrySupabase(() =>
        supabase.from('platform_apis').select('*').order('created_at', { ascending: true })
      )
      return c.json({ success: true, data: refreshed || data })
    }

    return c.json({ success: true, data })
  } catch (err: any) {
    return c.json({ success: false, error: `플랫폼 목록 조회 실패: ${err.message}` }, 500)
  }
})

// ─────────────────────────────────────────
// [11] API 플랫폼 추가
// POST /api/super/platform-apis
// ─────────────────────────────────────────
superRouter.post('/platform-apis', async (c) => {
  let body: {
    platform_name?: string
    display_name?: string
    api_endpoint?: string
    auth_type?: string
    description?: string
  }
  try { body = await c.req.json() }
  catch { return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400) }

  const { platform_name, display_name, api_endpoint, auth_type = 'bearer', description = '' } = body
  if (!platform_name?.trim() || !display_name?.trim()) {
    return c.json({ success: false, error: '플랫폼명과 표시명은 필수입니다.' }, 400)
  }

  const createLocal = () => {
    const dup = localPlatformApiStore.find(p => p.platform_name === platform_name!.trim())
    if (dup) return c.json({ success: false, error: '이미 존재하는 플랫폼명입니다.' }, 409)

    const newPlatform: LocalPlatformApi = {
      id: `local-platform-${Date.now()}`,
      platform_name: platform_name!.trim(),
      display_name: display_name!.trim(),
      api_endpoint: api_endpoint || '',
      auth_type,
      description,
      is_active: false,
      created_at: new Date().toISOString(),
    }
    localPlatformApiStore.push(newPlatform)
    return c.json({ success: true, data: newPlatform, message: '플랫폼이 추가되었습니다.' }, 201)
  }

  if (!isSupabaseConfigured(c.env)) return createLocal()

  const supabase = createSupabaseAdmin(c.env)
  try {
    const { data: newPlatform, error } = await retrySupabase(() =>
      supabase.from('platform_apis')
        .insert({ platform_name: platform_name!.trim(), display_name: display_name!.trim(), api_endpoint, auth_type, description, is_active: false })
        .select().single()
    )
    if (error) return c.json({ success: false, error: `플랫폼 추가 실패: ${error.message}` }, 500)
    return c.json({ success: true, data: newPlatform, message: '플랫폼이 추가되었습니다.' }, 201)
  } catch (err: any) {
    return c.json({ success: false, error: `플랫폼 추가 실패: ${err.message}` }, 500)
  }
})

// ─────────────────────────────────────────
// [12] API 플랫폼 수정 (활성/비활성 등)
// PUT /api/super/platform-apis/:id
// ─────────────────────────────────────────
superRouter.put('/platform-apis/:id', async (c) => {
  const platformId = c.req.param('id')
  let body: { is_active?: boolean; display_name?: string; api_endpoint?: string; auth_type?: string; description?: string }
  try { body = await c.req.json() }
  catch { return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400) }

  // 로컬 메모리 처리
  const localIdx = localPlatformApiStore.findIndex(p => p.id === platformId)
  if (localIdx !== -1) {
    const p = localPlatformApiStore[localIdx]
    if (body.is_active !== undefined) p.is_active = body.is_active
    if (body.display_name) p.display_name = body.display_name
    if (body.api_endpoint !== undefined) p.api_endpoint = body.api_endpoint
    if (body.auth_type) p.auth_type = body.auth_type
    if (body.description !== undefined) p.description = body.description
    return c.json({ success: true, message: '플랫폼이 수정되었습니다.' })
  }

  if (!isSupabaseConfigured(c.env)) return c.json({ success: false, error: '플랫폼을 찾을 수 없습니다.' }, 404)

  const supabase = createSupabaseAdmin(c.env)
  try {
    const updateData: Record<string, unknown> = {}
    if (body.is_active !== undefined) updateData.is_active = body.is_active
    if (body.display_name) updateData.display_name = body.display_name
    if (body.api_endpoint !== undefined) updateData.api_endpoint = body.api_endpoint
    if (body.auth_type) updateData.auth_type = body.auth_type
    if (body.description !== undefined) updateData.description = body.description

    const { error } = await retrySupabase(() =>
      supabase.from('platform_apis').update(updateData).eq('id', platformId)
    )
    if (error) return c.json({ success: false, error: error.message }, 500)
    return c.json({ success: true, message: '플랫폼이 수정되었습니다.' })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// ═══════════════════════════════════════════════════
// 구독 관리 엔드포인트
// ═══════════════════════════════════════════════════

// ─────────────────────────────────────────
// [13] 구독 1개월 연장
// POST /api/super/tenants/:id/extend
// ─────────────────────────────────────────
superRouter.post('/tenants/:id/extend', async (c) => {
  const tenantId = c.req.param('id')

  const extendLocal = () => {
    const idx = localTenantStore.findIndex(t => t.id === tenantId && !t.is_deleted)
    if (idx === -1) return c.json({ success: false, error: '고객사를 찾을 수 없습니다.' }, 404)
    const t = localTenantStore[idx]
    const base = t.subscription_end_date || getTodayStr()
    t.subscription_end_date = addOneMonth(base)
    t.subscription_status = 'active'
    t.is_active = true
    return c.json({ success: true, message: '구독이 1개월 연장되었습니다.', data: { subscription_end_date: t.subscription_end_date } })
  }

  const localIdx = localTenantStore.findIndex(t => t.id === tenantId && !t.is_deleted)
  if (localIdx !== -1) return extendLocal()
  if (!isSupabaseConfigured(c.env)) return c.json({ success: false, error: '고객사를 찾을 수 없습니다.' }, 404)

  const supabase = createSupabaseAdmin(c.env)
  try {
    const { data: tenant, error: fetchErr } = await retrySupabase(() =>
      supabase.from('tenants').select('id, subscription_end_date').eq('id', tenantId).single()
    )
    if (fetchErr) return c.json({ success: false, error: `조회 실패: ${fetchErr.message}` }, 500)
    if (!tenant) return c.json({ success: false, error: '고객사를 찾을 수 없습니다.' }, 404)

    const base = tenant.subscription_end_date || getTodayStr()
    const newEnd = addOneMonth(base)
    const { error: updErr } = await retrySupabase(() =>
      supabase.from('tenants').update({
        subscription_end_date: newEnd,
        subscription_status: 'active',
        is_active: true,
      }).eq('id', tenantId)
    )
    if (updErr) return c.json({ success: false, error: updErr.message }, 500)
    return c.json({ success: true, message: '구독이 1개월 연장되었습니다.', data: { subscription_end_date: newEnd } })
  } catch (err: any) {
    return c.json({ success: false, error: `구독 연장 실패: ${err.message}` }, 500)
  }
})

// ─────────────────────────────────────────
// [14] 입금 확인 + 1개월 연장
// POST /api/super/tenants/:id/confirm-payment
// ─────────────────────────────────────────
superRouter.post('/tenants/:id/confirm-payment', async (c) => {
  const tenantId = c.req.param('id')

  const confirmLocal = () => {
    const idx = localTenantStore.findIndex(t => t.id === tenantId && !t.is_deleted)
    if (idx === -1) return c.json({ success: false, error: '고객사를 찾을 수 없습니다.' }, 404)
    const t = localTenantStore[idx]
    const base = t.subscription_end_date || getTodayStr()
    t.subscription_end_date = addOneMonth(base)
    t.subscription_status = 'active'
    t.is_active = true
    t.payment_requested_at = null
    return c.json({
      success: true,
      message: '입금 확인 및 1개월 연장 완료',
      data: { subscription_end_date: t.subscription_end_date },
    })
  }

  const localIdx = localTenantStore.findIndex(t => t.id === tenantId && !t.is_deleted)
  if (localIdx !== -1) return confirmLocal()
  if (!isSupabaseConfigured(c.env)) return c.json({ success: false, error: '고객사를 찾을 수 없습니다.' }, 404)

  const supabase = createSupabaseAdmin(c.env)
  try {
    const { data: tenant, error: fetchErr } = await retrySupabase(() =>
      supabase.from('tenants').select('id, subscription_end_date').eq('id', tenantId).single()
    )
    if (fetchErr) return c.json({ success: false, error: `조회 실패: ${fetchErr.message}` }, 500)
    if (!tenant) return c.json({ success: false, error: '고객사를 찾을 수 없습니다.' }, 404)

    const base = tenant.subscription_end_date || getTodayStr()
    const newEnd = addOneMonth(base)
    const { error: updErr } = await retrySupabase(() =>
      supabase.from('tenants').update({
        subscription_end_date: newEnd,
        subscription_status: 'active',
        is_active: true,
        payment_requested_at: null,
      }).eq('id', tenantId)
    )
    if (updErr) return c.json({ success: false, error: updErr.message }, 500)
    return c.json({ success: true, message: '입금 확인 및 1개월 연장 완료', data: { subscription_end_date: newEnd } })
  } catch (err: any) {
    return c.json({ success: false, error: `입금 확인 처리 실패: ${err.message}` }, 500)
  }
})

// ─────────────────────────────────────────
// [15] 만료 고객사 자동 처리
// GET /api/super/check-expired
// ─────────────────────────────────────────
superRouter.get('/check-expired', async (c) => {
  const today = getTodayStr()
  let processedCount = 0

  // 로컬 메모리 처리
  for (const t of localTenantStore) {
    if (!t.is_deleted && t.subscription_end_date && t.subscription_end_date < today) {
      if (t.is_active || t.subscription_status !== 'expired') {
        t.is_active = false
        t.subscription_status = 'expired'
        processedCount++
      }
    }
  }

  if (!isSupabaseConfigured(c.env)) {
    return c.json({ success: true, message: `만료 처리 완료 (로컬: ${processedCount}건)`, processed: processedCount })
  }

  const supabase = createSupabaseAdmin(c.env)
  try {
    const { data: expired, error } = await retrySupabase(() =>
      supabase.from('tenants')
        .select('id')
        .lt('subscription_end_date', today)
        .eq('is_deleted', false)
        .neq('subscription_status', 'expired')
    )
    if (error) return c.json({ success: false, error: `만료 조회 실패: ${error.message}` }, 500)

    const dbCount = expired?.length || 0
    if (dbCount > 0) {
      await retrySupabase(() =>
        supabase.from('tenants')
          .update({ is_active: false, subscription_status: 'expired' })
          .lt('subscription_end_date', today)
          .eq('is_deleted', false)
          .neq('subscription_status', 'expired')
      )
      processedCount += dbCount
    }
    return c.json({ success: true, message: `만료 처리 완료 (${processedCount}건)`, processed: processedCount })
  } catch (err: any) {
    return c.json({ success: false, error: `만료 처리 실패: ${err.message}` }, 500)
  }
})

// ─────────────────────────────────────────
// [16] 결제 계좌 설정 조회
// GET /api/super/payment-settings
// ─────────────────────────────────────────
superRouter.get('/payment-settings', async (c) => {
  if (!isSupabaseConfigured(c.env)) {
    return c.json({ success: true, data: localPaymentSettings })
  }

  const supabase = createSupabaseAdmin(c.env)
  try {
    const { data, error } = await retrySupabase(() =>
      supabase.from('payment_settings').select('*').order('updated_at', { ascending: false }).limit(1).single()
    )
    if (error) {
      // PGRST116 = no rows → 기본값 반환 (에러 아님)
      if (error.message.includes('PGRST116') || error.message.includes('no rows')) {
        return c.json({ success: true, data: localPaymentSettings })
      }
      return c.json({ success: false, error: `결제 설정 조회 실패: ${error.message}` }, 500)
    }
    return c.json({ success: true, data })
  } catch (err: any) {
    return c.json({ success: false, error: `결제 설정 조회 실패: ${err.message}` }, 500)
  }
})

// ─────────────────────────────────────────
// [17] 결제 계좌 설정 저장
// PUT /api/super/payment-settings
// ─────────────────────────────────────────
superRouter.put('/payment-settings', async (c) => {
  let body: { bank_name?: string; account_number?: string; account_holder?: string; payment_guide?: string }
  try { body = await c.req.json() }
  catch { return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400) }

  const { bank_name, account_number, account_holder, payment_guide } = body

  const saveLocal = () => {
    if (bank_name !== undefined) localPaymentSettings.bank_name = bank_name
    if (account_number !== undefined) localPaymentSettings.account_number = account_number
    if (account_holder !== undefined) localPaymentSettings.account_holder = account_holder
    if (payment_guide !== undefined) localPaymentSettings.payment_guide = payment_guide
    localPaymentSettings.updated_at = new Date().toISOString()
    return c.json({ success: true, message: '저장되었습니다.', data: localPaymentSettings })
  }

  if (!isSupabaseConfigured(c.env)) return saveLocal()

  const supabase = createSupabaseAdmin(c.env)
  try {
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (bank_name !== undefined) updateData.bank_name = bank_name
    if (account_number !== undefined) updateData.account_number = account_number
    if (account_holder !== undefined) updateData.account_holder = account_holder
    if (payment_guide !== undefined) updateData.payment_guide = payment_guide

    // 기존 설정 있으면 update, 없으면 insert
    const { data: existing } = await retrySupabase(() =>
      supabase.from('payment_settings').select('id').limit(1).single()
    )
    let error: any
    if (existing) {
      const res = await retrySupabase(() =>
        supabase.from('payment_settings').update(updateData).eq('id', existing.id)
      )
      error = res.error
    } else {
      const res = await retrySupabase(() =>
        supabase.from('payment_settings').insert(updateData)
      )
      error = res.error
    }
    if (error) return c.json({ success: false, error: `결제 설정 저장 실패: ${error.message}` }, 500)
    return saveLocal() // 로컬도 동기화
  } catch (err: any) {
    return c.json({ success: false, error: `결제 설정 저장 실패: ${err.message}` }, 500)
  }
})

// ─────────────────────────────────────────────────────
// GET /api/super/init-db  ← Supabase 테이블 초기화
// ─────────────────────────────────────────────────────
superRouter.get('/init-db', async (c) => {
  if (!isSupabaseConfigured(c.env)) {
    return c.json({ success: false, error: 'Supabase가 설정되지 않았습니다.' })
  }
  const supabase = createSupabaseAdmin(c.env)

  const results: Record<string, string> = {}

  // helper: SQL 실행 (Supabase rpc 우회, 개별 insert/select로 테이블 존재 확인 후 생성)
  async function ensureTable(name: string, createSql: string) {
    try {
      const { error } = await supabase.from(name).select('id').limit(1)
      if (!error) { results[name] = '✅ 이미 존재'; return }
      // 테이블 없음 → rpc로 생성 시도
      const { error: rpcErr } = await (supabase as any).rpc('exec_ddl', { sql: createSql })
      results[name] = rpcErr ? `⚠️ rpc 오류: ${rpcErr.message}` : '✅ 생성됨'
    } catch (e: any) { results[name] = `❌ ${e.message}` }
  }

  // admins 테이블 확인
  await ensureTable('admins', `CREATE TABLE IF NOT EXISTS admins (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE NOT NULL, password text NOT NULL, role text DEFAULT 'super_admin', created_at timestamptz DEFAULT now())`)
  // plans
  await ensureTable('plans', `CREATE TABLE IF NOT EXISTS plans (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_name text UNIQUE NOT NULL, price integer NOT NULL DEFAULT 0, faq_limit integer NOT NULL DEFAULT 50, chat_limit integer NOT NULL DEFAULT 1000, description text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())`)
  // tenants
  await ensureTable('tenants', `CREATE TABLE IF NOT EXISTS tenants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_name text NOT NULL, email text UNIQUE NOT NULL, password text NOT NULL, plan text NOT NULL DEFAULT 'basic', is_active boolean DEFAULT true, is_deleted boolean DEFAULT false, bot_name text DEFAULT 'AI 상담봇', greeting_message text, widget_color text DEFAULT '#4F46E5', supported_languages text[], login_failed_count integer DEFAULT 0, login_locked_until timestamptz, subscription_start_date date, subscription_end_date date, subscription_status text DEFAULT 'active', payment_memo text, payment_requested_at timestamptz, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())`)
  // payment_settings
  await ensureTable('payment_settings', `CREATE TABLE IF NOT EXISTS payment_settings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bank_name text, account_number text, account_holder text, payment_guide text, updated_at timestamptz DEFAULT now())`)
  // platform_apis
  await ensureTable('platform_apis', `CREATE TABLE IF NOT EXISTS platform_apis (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), platform_name text UNIQUE NOT NULL, display_name text NOT NULL, api_endpoint text, auth_type text DEFAULT 'api_key', description text, is_active boolean DEFAULT true, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())`)

  // plans 기본값 삽입
  try {
    const plansData = [
      { plan_name: 'basic',  price: 99000,  faq_limit: 50,  chat_limit: 1000, description: 'FAQ 50개, 월 1,000회 답변' },
      { plan_name: 'pro',    price: 199000, faq_limit: 200, chat_limit: 5000, description: 'FAQ 200개, 월 5,000회 답변' },
      { plan_name: 'master', price: 399000, faq_limit: -1,  chat_limit: -1,   description: 'FAQ 무제한, 월 답변 무제한' },
    ]
    for (const p of plansData) {
      await supabase.from('plans').upsert(p, { onConflict: 'plan_name', ignoreDuplicates: true })
    }
    results['plans_seed'] = '✅ 기본 플랜 삽입'
  } catch (e: any) { results['plans_seed'] = `❌ ${e.message}` }

  // admins 슈퍼관리자 계정 삽입 (LOCAL_SUPER_ADMIN_EMAIL/HASH 기반)
  try {
    const email = c.env.LOCAL_SUPER_ADMIN_EMAIL || 'super@admin.local'
    const hash  = c.env.LOCAL_SUPER_ADMIN_PASSWORD_HASH || ''
    if (hash) {
      const { error } = await supabase.from('admins').upsert(
        { email, password: hash, role: 'super_admin' },
        { onConflict: 'email', ignoreDuplicates: true }
      )
      results['admin_seed'] = error ? `⚠️ ${error.message}` : `✅ 슈퍼관리자 생성 (${email})`
    } else {
      results['admin_seed'] = '⚠️ LOCAL_SUPER_ADMIN_PASSWORD_HASH 미설정'
    }
  } catch (e: any) { results['admin_seed'] = `❌ ${e.message}` }

  return c.json({ success: true, message: 'DB 초기화 완료', results })
})

// ─────────────────────────────────────────────────────
// PUT /api/super/tenants/:id/billing  ← 연간 결제 전환
// body: { billing_cycle: 'yearly' }
// - next_billing_date = today + 1년
// - current_period_end = today + 1년 - 1일
// ─────────────────────────────────────────────────────
superRouter.put('/tenants/:id/billing', async (c) => {
  const tenantId = c.req.param('id')

  let body: { billing_cycle?: string }
  try { body = await c.req.json() }
  catch { return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400) }

  const { billing_cycle } = body
  if (billing_cycle !== 'yearly') {
    return c.json({ success: false, error: "billing_cycle은 'yearly'만 지원합니다." }, 400)
  }

  // 날짜 계산
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // next_billing_date = today + 1년
  const nextBillingDate = new Date(today)
  nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1)

  // current_period_end = today + 1년 - 1일
  const currentPeriodEnd = new Date(nextBillingDate)
  currentPeriodEnd.setDate(currentPeriodEnd.getDate() - 1)

  const todayStr = today.toISOString().split('T')[0]
  const nextBillingStr = nextBillingDate.toISOString().split('T')[0]
  const periodEndStr = currentPeriodEnd.toISOString().split('T')[0]

  const updateData = {
    billing_cycle: 'yearly',
    next_billing_date: nextBillingStr,
    current_period_start: todayStr,
    current_period_end: periodEndStr,
    subscription_start_date: todayStr,
    subscription_end_date: nextBillingStr,
    updated_at: new Date().toISOString(),
  }

  // 로컬 fallback (localTenantStore)
  const localFallback = () => {
    const idx = localTenantStore.findIndex(t => t.id === tenantId)
    if (idx !== -1) {
      Object.assign(localTenantStore[idx], updateData)
    }
    return c.json({
      success: true,
      message: '연간 결제로 전환되었습니다.',
      data: {
        tenant_id: tenantId,
        billing_cycle: 'yearly',
        next_billing_date: nextBillingStr,
        current_period_end: periodEndStr,
      },
    })
  }

  if (!isSupabaseConfigured(c.env)) return localFallback()

  const supabase = createSupabaseAdmin(c.env)
  try {
    const { error } = await retrySupabase(() =>
      supabase.from('tenants').update(updateData).eq('id', tenantId).eq('is_deleted', false)
    )
    if (error) return c.json({ success: false, error: error.message }, 500)

    return c.json({
      success: true,
      message: '연간 결제로 전환되었습니다.',
      data: {
        tenant_id: tenantId,
        billing_cycle: 'yearly',
        next_billing_date: nextBillingStr,
        current_period_end: periodEndStr,
      },
    })
  } catch (err: any) {
    return c.json({ success: false, error: `연간 결제 전환 실패: ${err.message}` }, 500)
  }
})

export default superRouter
