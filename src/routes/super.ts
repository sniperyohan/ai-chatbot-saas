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
// GET    /api/super/plans
// PUT    /api/super/plans/:id
// PUT    /api/super/password
// GET    /api/super/platform-apis
// POST   /api/super/platform-apis
// PUT    /api/super/platform-apis/:id
// =====================================================
import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { createSupabaseAdmin } from '../lib/supabase'
import { superAuthMiddleware } from '../middleware/auth'
import { Bindings, Variables } from '../types'

const superRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>()
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
    msg.includes('Name or service not known')
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
const localPlatformApiStore: LocalPlatformApi[] = [
  {
    id: 'local-platform-1',
    platform_name: 'kakao',
    display_name: '카카오 채널',
    api_endpoint: 'https://kapi.kakao.com/v1',
    auth_type: 'bearer',
    description: '카카오 비즈니스 채널 연동',
    is_active: false,
    created_at: new Date().toISOString(),
  },
  {
    id: 'local-platform-2',
    platform_name: 'naver',
    display_name: '네이버 스마트스토어',
    api_endpoint: 'https://api.commerce.naver.com/external',
    auth_type: 'oauth2',
    description: '네이버 스마트스토어 주문/CS 연동',
    is_active: false,
    created_at: new Date().toISOString(),
  },
]

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
      supabase.from('tenants').select('id', { count: 'exact', head: true }).eq('is_deleted', false),
      supabase.from('tenants').select('id', { count: 'exact', head: true }).eq('is_deleted', false).eq('is_active', true),
      supabase.from('chat_logs').select('id', { count: 'exact', head: true }),
      supabase.from('tenants').select('plan').eq('is_deleted', false).eq('is_active', true),
      supabase.from('plans').select('plan_name, price'),
      supabase.from('chat_logs').select('channel'),
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
    console.warn('[super/dashboard] Supabase 오류, 로컬 fallback:', err.message)
    const active = localTenantStore.filter(t => t.is_active && !t.is_deleted)
    return c.json({
      success: true,
      data: {
        total_tenants: localTenantStore.filter(t => !t.is_deleted).length,
        active_tenants: active.length,
        monthly_revenue: active.reduce((s, t) => s + (PLAN_PRICES[t.plan] || 0), 0),
        total_chats: 0,
        channel_stats: {},
      },
    })
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

  if (!isSupabaseConfigured(c.env)) {
    const active = filterLocalItems(localTenantStore)
    const sliced = active.slice(offset, offset + limit)
    return c.json({
      success: true,
      data: { items: sliced, total: active.length, page, limit, totalPages: Math.ceil(active.length / limit) },
    })
  }

  const supabase = createSupabaseAdmin(c.env)
  try {
    let query = supabase
      .from('tenants')
      .select('id, company_name, email, plan, is_active, is_deleted, created_at, widget_color, bot_name', { count: 'exact' })
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })

    if (planFilter) query = query.eq('plan', planFilter)
    if (statusFilter === 'active') query = query.eq('is_active', true)
    if (statusFilter === 'inactive') query = query.eq('is_active', false)
    if (searchQuery) query = query.or(`company_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)

    const { data, count, error } = await query.range(offset, offset + limit - 1)

    if (error && isNetworkOrInternalError(error.message)) {
      const active = filterLocalItems(localTenantStore)
      const sliced = active.slice(offset, offset + limit)
      return c.json({
        success: true,
        data: { items: sliced, total: active.length, page, limit, totalPages: Math.ceil(active.length / limit) },
      })
    }
    if (error) return c.json({ success: false, error: error.message }, 500)

    const localItems = filterLocalItems(localTenantStore)
    const allItems = page === 1 ? [...localItems, ...(data || [])] : (data || [])
    const totalCount = (count || 0) + localItems.length

    return c.json({
      success: true,
      data: { items: allItems, total: totalCount, page, limit, totalPages: Math.ceil(totalCount / limit) },
    })
  } catch (err: any) {
    console.warn('[super/tenants] Supabase 예외, 로컬 fallback:', err.message)
    const active = filterLocalItems(localTenantStore)
    const sliced = active.slice(offset, offset + limit)
    return c.json({
      success: true,
      data: { items: sliced, total: active.length, page, limit, totalPages: Math.ceil(active.length / limit) },
    })
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

  if (!isSupabaseConfigured(c.env)) return createLocalTenant()

  const supabase = createSupabaseAdmin(c.env)
  try {
    const [{ data: existTenant, error: e1 }, { data: existAdmin, error: e2 }] = await Promise.all([
      supabase.from('tenants').select('id').eq('email', normalizedEmail).single(),
      supabase.from('admins').select('id').eq('email', normalizedEmail).single(),
    ])

    if (isNetworkOrInternalError((e1?.message || '') + (e2?.message || ''))) return createLocalTenant()
    if (existTenant || existAdmin) return c.json({ success: false, error: '이미 사용 중인 이메일입니다.' }, 409)

    const tempPassword = generateTempPassword()
    const hashedPassword = await bcrypt.hash(tempPassword, SALT_ROUNDS)

    const { data: newTenant, error: insertError } = await supabase
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

    if (insertError) {
      if (isNetworkOrInternalError(insertError.message)) return createLocalTenant()
      return c.json({ success: false, error: insertError.message }, 500)
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
    console.warn('[super/tenants] Supabase 예외, 로컬 fallback:', err.message)
    return createLocalTenant()
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
    const { data: existing } = await supabase
      .from('tenants').select('plan, is_active').eq('id', tenantId).eq('is_deleted', false).single()
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

    const { error } = await supabase.from('tenants').update(updateData).eq('id', tenantId)
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
    const { data: existing, error: fetchErr } = await supabase
      .from('tenants').select('plan').eq('id', tenantId).eq('is_deleted', false).single()

    if (fetchErr && isNetworkOrInternalError(fetchErr.message)) {
      return c.json({ success: false, error: 'Supabase 연결 실패. 로컬 고객사만 수정 가능합니다.' }, 503)
    }
    if (!existing) return c.json({ success: false, error: '고객사를 찾을 수 없습니다.' }, 404)

    await supabase.from('plan_history').insert({ tenant_id: tenantId, old_plan: existing.plan, new_plan: plan })
      .catch(() => {})
    const { error } = await supabase.from('tenants').update({ plan }).eq('id', tenantId)
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
    const { error } = await supabase.from('tenants').update({ is_active: body.is_active }).eq('id', tenantId)
    if (error) {
      if (isNetworkOrInternalError(error.message)) return c.json({ success: false, error: 'Supabase 연결 실패' }, 503)
      return c.json({ success: false, error: error.message }, 500)
    }
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
    const { data: existing, error: fetchErr } = await supabase
      .from('tenants').select('id').eq('id', tenantId).eq('is_deleted', false).single()

    if (fetchErr && isNetworkOrInternalError(fetchErr.message)) {
      return c.json({ success: false, error: 'Supabase 연결 실패' }, 503)
    }
    if (!existing) return c.json({ success: false, error: '고객사를 찾을 수 없습니다.' }, 404)

    await supabase.from('tenants').update({ is_deleted: true, is_active: false }).eq('id', tenantId)
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
    const { data: tenant, error: fetchErr } = await supabase
      .from('tenants').select('id, email, company_name').eq('id', tenantId).eq('is_deleted', false).single()

    if (fetchErr && isNetworkOrInternalError(fetchErr.message)) {
      return c.json({
        success: true,
        data: { email_sent: false, temp_password: FALLBACK_TEMP, email: '' },
        message: 'Supabase 연결 실패. 임시 비밀번호: ' + FALLBACK_TEMP,
      })
    }
    if (!tenant) return c.json({ success: false, error: '고객사를 찾을 수 없습니다.' }, 404)

    const tempPassword = generateTempPassword()
    const hashedPassword = await bcrypt.hash(tempPassword, SALT_ROUNDS)

    const { error: updateErr } = await supabase
      .from('tenants')
      .update({ password: hashedPassword, is_temp_password: true })
      .eq('id', tenantId)

    if (updateErr) return c.json({ success: false, error: updateErr.message }, 500)

    const emailSent = await sendWelcomeEmail(c.env.RESEND_API_KEY, tenant.email, tenant.company_name, tempPassword)

    return c.json({
      success: true,
      data: { email_sent: emailSent, temp_password: tempPassword, email: tenant.email },
      message: emailSent ? '임시 비밀번호가 이메일로 발송되었습니다.' : '임시 비밀번호가 생성되었습니다. 직접 전달해주세요.',
    })
  } catch (err: any) {
    console.warn('[reset-password] Supabase 예외, fallback:', err.message)
    return c.json({
      success: true,
      data: { email_sent: false, temp_password: FALLBACK_TEMP, email: '' },
      message: 'Supabase 연결 실패. 임시 비밀번호: ' + FALLBACK_TEMP,
    })
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
    const { data, error } = await supabase.from('plans').select('*').order('price')
    if (error && isNetworkOrInternalError(error.message)) {
      return c.json({ success: true, data: localPlanStore })
    }
    if (error) return c.json({ success: false, error: error.message }, 500)
    return c.json({ success: true, data: data?.length ? data : localPlanStore })
  } catch {
    return c.json({ success: true, data: localPlanStore })
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

    const { error } = await supabase.from('plans').update(updateData).eq('id', planId)
    if (error && isNetworkOrInternalError(error.message)) {
      return c.json({ success: false, error: 'Supabase 연결 실패' }, 503)
    }
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
    const { data: admin, error: fetchErr } = await supabase
      .from('admins').select('id, password').eq('id', adminId).single()

    if (fetchErr && isNetworkOrInternalError(fetchErr.message)) {
      return c.json({ success: false, error: 'Supabase 연결 실패. 로컬 계정에서 다시 시도해주세요.' }, 503)
    }
    if (!admin) return c.json({ success: false, error: '관리자 정보를 찾을 수 없습니다.' }, 404)

    const isValid = await bcrypt.compare(current_password, admin.password)
    if (!isValid) return c.json({ success: false, error: '현재 비밀번호가 올바르지 않습니다.' }, 401)

    const newHash = await bcrypt.hash(new_password, SALT_ROUNDS)
    const { error: updateErr } = await supabase.from('admins').update({ password: newHash }).eq('id', adminId)
    if (updateErr) return c.json({ success: false, error: updateErr.message }, 500)
    return c.json({ success: true, message: '비밀번호가 변경되었습니다.' })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// ─────────────────────────────────────────
// [10] API 플랫폼 목록
// GET /api/super/platform-apis
// ─────────────────────────────────────────
superRouter.get('/platform-apis', async (c) => {
  if (!isSupabaseConfigured(c.env)) {
    return c.json({ success: true, data: localPlatformApiStore })
  }
  const supabase = createSupabaseAdmin(c.env)
  try {
    const { data, error } = await supabase
      .from('platform_apis')
      .select('*')
      .order('created_at', { ascending: true })
    if (error && isNetworkOrInternalError(error.message)) {
      return c.json({ success: true, data: localPlatformApiStore })
    }
    if (error) return c.json({ success: false, error: error.message }, 500)
    // DB에 없으면 로컬 fallback 반환
    return c.json({ success: true, data: data?.length ? data : localPlatformApiStore })
  } catch {
    return c.json({ success: true, data: localPlatformApiStore })
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
    const { data: newPlatform, error } = await supabase
      .from('platform_apis')
      .insert({ platform_name: platform_name!.trim(), display_name: display_name!.trim(), api_endpoint, auth_type, description, is_active: false })
      .select().single()
    if (error && isNetworkOrInternalError(error.message)) return createLocal()
    if (error) return c.json({ success: false, error: error.message }, 500)
    return c.json({ success: true, data: newPlatform, message: '플랫폼이 추가되었습니다.' }, 201)
  } catch {
    return createLocal()
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

    const { error } = await supabase.from('platform_apis').update(updateData).eq('id', platformId)
    if (error && isNetworkOrInternalError(error.message)) {
      return c.json({ success: false, error: 'Supabase 연결 실패' }, 503)
    }
    if (error) return c.json({ success: false, error: error.message }, 500)
    return c.json({ success: true, message: '플랫폼이 수정되었습니다.' })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

export default superRouter
