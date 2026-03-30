// =====================================================
// 슈퍼관리자 라우터 (SUPER JWT 필요)
// GET  /api/super/dashboard
// GET  /api/super/tenants
// POST /api/super/tenants
// PUT  /api/super/tenants/:id
// DELETE /api/super/tenants/:id
// GET  /api/super/plans
// PUT  /api/super/plans/:id
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

const localTenantStore: LocalTenant[] = []

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
// 임시 비밀번호 생성 (crypto.getRandomValues)
// ─────────────────────────────────────────
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$'
  const arr = new Uint8Array(12)
  crypto.getRandomValues(arr)
  // 규칙 보장: 대/소/숫자/특수 각 1개
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
          <p>로그인 URL: <a href="https://your-domain.com/admin/login">관리자 페이지</a></p>
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
  // Supabase 미설정 또는 연결 불가 → 로컬 메모리 fallback
  if (!isSupabaseConfigured(c.env)) {
    const activeTenants = localTenantStore.filter(t => t.is_active && !t.is_deleted)
    const PLAN_PRICES: Record<string, number> = { basic: 99000, pro: 199000, master: 399000 }
    const monthlyRevenue = activeTenants.reduce((sum, t) => sum + (PLAN_PRICES[t.plan] || 0), 0)
    return c.json({
      success: true,
      data: {
        total_tenants: localTenantStore.filter(t => !t.is_deleted).length,
        active_tenants: activeTenants.length,
        monthly_revenue: monthlyRevenue,
        total_chats: 0,
        channel_stats: {},
      },
    })
  }

  const supabase = createSupabaseAdmin(c.env)

  // Supabase 연결 시도, 네트워크 오류 시 로컬 fallback
  try {
    const { count: totalTenants } = await supabase
      .from('tenants')
      .select('id', { count: 'exact', head: true })
      .eq('is_deleted', false)

    const { count: activeTenants } = await supabase
      .from('tenants')
      .select('id', { count: 'exact', head: true })
      .eq('is_deleted', false)
      .eq('is_active', true)

    const { count: totalChats } = await supabase
      .from('chat_logs')
      .select('id', { count: 'exact', head: true })

    // 이번 달 예상 매출 (플랜 가격 합산)
    const { data: planData } = await supabase
      .from('tenants')
      .select('plan')
      .eq('is_deleted', false)
      .eq('is_active', true)

    const { data: plans } = await supabase.from('plans').select('plan_name, price')
    const planPriceMap: Record<string, number> = {}
    for (const p of plans || []) planPriceMap[p.plan_name] = p.price

    const monthlyRevenue = (planData || []).reduce(
      (sum, t) => sum + (planPriceMap[t.plan] || 0),
      0
    )

    // 채널별 대화량
    const { data: channelData } = await supabase
      .from('chat_logs')
      .select('channel')

    const channelStats: Record<string, number> = {}
    for (const row of channelData || []) {
      channelStats[row.channel] = (channelStats[row.channel] || 0) + 1
    }

    // 로컬 메모리 고객사도 합산
    const localActive = localTenantStore.filter(t => t.is_active && !t.is_deleted)
    const PLAN_PRICES: Record<string, number> = { basic: 99000, pro: 199000, master: 399000 }
    const localRevenue = localActive.reduce((sum, t) => sum + (PLAN_PRICES[t.plan] || 0), 0)

    return c.json({
      success: true,
      data: {
        total_tenants: (totalTenants || 0) + localTenantStore.filter(t => !t.is_deleted).length,
        active_tenants: (activeTenants || 0) + localActive.length,
        monthly_revenue: monthlyRevenue + localRevenue,
        total_chats: totalChats || 0,
        channel_stats: channelStats,
      },
    })
  } catch (err: any) {
    console.warn('[super/dashboard] Supabase 오류, 로컬 fallback:', err.message)
    const activeTenants = localTenantStore.filter(t => t.is_active && !t.is_deleted)
    const PLAN_PRICES: Record<string, number> = { basic: 99000, pro: 199000, master: 399000 }
    const monthlyRevenue = activeTenants.reduce((sum, t) => sum + (PLAN_PRICES[t.plan] || 0), 0)
    return c.json({
      success: true,
      data: {
        total_tenants: localTenantStore.filter(t => !t.is_deleted).length,
        active_tenants: activeTenants.length,
        monthly_revenue: monthlyRevenue,
        total_chats: 0,
        channel_stats: {},
      },
    })
  }
})

// ─────────────────────────────────────────
// [2] 고객사 목록
// GET /api/super/tenants?page=1&limit=20
// ─────────────────────────────────────────
superRouter.get('/tenants', async (c) => {
  const page = parseInt(c.req.query('page') || '1')
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100)
  const offset = (page - 1) * limit

  // Supabase 미설정 → 로컬 메모리 fallback
  if (!isSupabaseConfigured(c.env)) {
    const active = localTenantStore.filter(t => !t.is_deleted)
    const sliced = active.slice(offset, offset + limit)
    return c.json({
      success: true,
      data: {
        items: sliced,
        total: active.length,
        page,
        limit,
        totalPages: Math.ceil(active.length / limit),
      },
    })
  }

  const supabase = createSupabaseAdmin(c.env)

  try {
    const { data, count, error } = await supabase
      .from('tenants')
      .select(
        'id, company_name, email, plan, is_active, is_deleted, created_at, widget_color, bot_name',
        { count: 'exact' }
      )
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // 네트워크/internal 오류 감지 → 로컬 fallback
    if (error && isNetworkOrInternalError(error.message)) {
      console.warn('[super/tenants] Supabase 네트워크 오류, 로컬 fallback:', error.message)
      const active = localTenantStore.filter(t => !t.is_deleted)
      const sliced = active.slice(offset, offset + limit)
      return c.json({
        success: true,
        data: {
          items: sliced,
          total: active.length,
          page,
          limit,
          totalPages: Math.ceil(active.length / limit),
        },
      })
    }

    if (error) return c.json({ success: false, error: error.message }, 500)

    // DB 결과 + 로컬 메모리 고객사 합산 (페이지 1에만 로컬 항목 앞에 추가)
    const localItems = localTenantStore.filter(t => !t.is_deleted)
    const allItems = page === 1 ? [...localItems, ...(data || [])] : (data || [])
    const totalCount = (count || 0) + localItems.length

    return c.json({
      success: true,
      data: {
        items: allItems,
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    })
  } catch (err: any) {
    console.warn('[super/tenants] Supabase 예외, 로컬 fallback:', err.message)
    const active = localTenantStore.filter(t => !t.is_deleted)
    const sliced = active.slice(offset, offset + limit)
    return c.json({
      success: true,
      data: {
        items: sliced,
        total: active.length,
        page,
        limit,
        totalPages: Math.ceil(active.length / limit),
      },
    })
  }
})

// ─────────────────────────────────────────
// [3] 고객사 생성
// POST /api/super/tenants
// ─────────────────────────────────────────
superRouter.post('/tenants', async (c) => {
  let body: {
    company_name?: string
    email?: string
    plan?: string
    bot_name?: string
    widget_color?: string
  }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400)
  }

  const { company_name, email, plan = 'basic', bot_name, widget_color } = body
  if (!company_name?.trim() || !email?.trim()) {
    return c.json({ success: false, error: '회사명과 이메일은 필수입니다.' }, 400)
  }

  const normalizedEmail = email.toLowerCase().trim()

  // ───────────────────────────────────────────────────
  // 로컬 메모리 fallback 처리 함수
  // ───────────────────────────────────────────────────
  const createLocalTenant = () => {
    // 로컬 이메일 중복 체크
    const dupLocal = localTenantStore.find(t => t.email === normalizedEmail && !t.is_deleted)
    if (dupLocal) {
      return c.json({ success: false, error: '이미 사용 중인 이메일입니다.' }, 409)
    }

    const TEMP_PASSWORD = 'Test1234!'
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
    console.log('[super/tenants] 로컬 메모리에 고객사 생성:', newTenant)

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

  // Supabase 미설정 → 즉시 로컬 fallback
  if (!isSupabaseConfigured(c.env)) {
    console.log('[super/tenants] Supabase 미설정 → 로컬 fallback')
    return createLocalTenant()
  }

  // ───────────────────────────────────────────────────
  // Supabase 설정됨 → DB 시도, 네트워크 오류 시 로컬 fallback
  // ───────────────────────────────────────────────────
  const supabase = createSupabaseAdmin(c.env)

  try {
    // 이메일 중복 체크 (tenants + admins)
    const [{ data: existTenant, error: e1 }, { data: existAdmin, error: e2 }] = await Promise.all([
      supabase.from('tenants').select('id').eq('email', normalizedEmail).single(),
      supabase.from('admins').select('id').eq('email', normalizedEmail).single(),
    ])

    // 네트워크 오류 감지 → 로컬 fallback
    const combinedErrMsg = (e1?.message || '') + (e2?.message || '')
    if (isNetworkOrInternalError(combinedErrMsg)) {
      console.warn('[super/tenants] Supabase 네트워크 오류(중복체크), 로컬 fallback:', combinedErrMsg)
      return createLocalTenant()
    }

    if (existTenant || existAdmin) {
      return c.json({ success: false, error: '이미 사용 중인 이메일입니다.' }, 409)
    }

    // 임시 비밀번호 생성
    const tempPassword = generateTempPassword()
    const hashedPassword = await bcrypt.hash(tempPassword, SALT_ROUNDS)

    // 트랜잭션 저장 (tenants + plan_history)
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

    // insert 오류 - 네트워크 오류 감지 → 로컬 fallback
    if (insertError) {
      if (isNetworkOrInternalError(insertError.message)) {
        console.warn('[super/tenants] Supabase insert 네트워크 오류, 로컬 fallback:', insertError.message)
        return createLocalTenant()
      }
      return c.json({ success: false, error: insertError.message }, 500)
    }

    // plan_history 초기 기록
    await supabase.from('plan_history').insert({
      tenant_id: newTenant.id,
      old_plan: 'none',
      new_plan: plan,
    }).catch(() => {/* plan_history 실패는 무시 */})

    // 이메일 발송
    const emailSent = await sendWelcomeEmail(
      c.env.RESEND_API_KEY,
      normalizedEmail,
      company_name!.trim(),
      tempPassword
    )

    return c.json({
      success: true,
      data: {
        tenant: { id: newTenant.id, company_name: newTenant.company_name, email: newTenant.email, plan },
        email_sent: emailSent,
        // 이메일 발송 실패 시 임시 비밀번호를 응답에 포함
        ...(emailSent ? {} : { temp_password: tempPassword }),
      },
      message: emailSent
        ? '고객사가 생성되고 이메일이 발송되었습니다.'
        : '고객사가 생성되었으나 이메일 발송에 실패했습니다. temp_password를 확인하세요.',
    }, 201)

  } catch (err: any) {
    // 최상위 예외 catch → 로컬 fallback
    console.warn('[super/tenants] Supabase 예외, 로컬 fallback:', err.message)
    return createLocalTenant()
  }
})

// ─────────────────────────────────────────
// [4] 고객사 수정
// PUT /api/super/tenants/:id
// ─────────────────────────────────────────
superRouter.put('/tenants/:id', async (c) => {
  const tenantId = c.req.param('id')
  let body: {
    plan?: string
    is_active?: boolean
    bot_name?: string
    widget_color?: string
    greeting_message?: string
  }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400)
  }

  const supabase = createSupabaseAdmin(c.env)

  // 기존 정보 조회
  const { data: existing } = await supabase
    .from('tenants')
    .select('plan, is_active')
    .eq('id', tenantId)
    .eq('is_deleted', false)
    .single()

  if (!existing) {
    return c.json({ success: false, error: '고객사를 찾을 수 없습니다.' }, 404)
  }

  const updateData: Record<string, unknown> = {}
  if (body.is_active !== undefined) updateData.is_active = body.is_active
  if (body.bot_name) updateData.bot_name = body.bot_name
  if (body.widget_color) updateData.widget_color = body.widget_color
  if (body.greeting_message) updateData.greeting_message = body.greeting_message

  // 플랜 변경 처리
  if (body.plan && body.plan !== existing.plan) {
    updateData.plan = body.plan
    await supabase.from('plan_history').insert({
      tenant_id: tenantId,
      old_plan: existing.plan,
      new_plan: body.plan,
    })
  }

  const { error } = await supabase.from('tenants').update(updateData).eq('id', tenantId)
  if (error) return c.json({ success: false, error: error.message }, 500)

  return c.json({ success: true, message: '고객사 정보가 수정되었습니다.' })
})

// ─────────────────────────────────────────
// [5] 고객사 삭제 (소프트 삭제)
// DELETE /api/super/tenants/:id
// ─────────────────────────────────────────
superRouter.delete('/tenants/:id', async (c) => {
  const tenantId = c.req.param('id')
  const supabase = createSupabaseAdmin(c.env)

  const { data: existing } = await supabase
    .from('tenants')
    .select('id')
    .eq('id', tenantId)
    .eq('is_deleted', false)
    .single()

  if (!existing) {
    return c.json({ success: false, error: '고객사를 찾을 수 없습니다.' }, 404)
  }

  await supabase
    .from('tenants')
    .update({ is_deleted: true, is_active: false })
    .eq('id', tenantId)

  return c.json({ success: true, message: '고객사가 삭제되었습니다.' })
})

// ─────────────────────────────────────────
// [6] 플랜 목록
// GET /api/super/plans
// ─────────────────────────────────────────
superRouter.get('/plans', async (c) => {
  const supabase = createSupabaseAdmin(c.env)
  const { data, error } = await supabase.from('plans').select('*').order('price')
  if (error) return c.json({ success: false, error: error.message }, 500)
  return c.json({ success: true, data })
})

// ─────────────────────────────────────────
// [7] 플랜 수정
// PUT /api/super/plans/:id
// ─────────────────────────────────────────
superRouter.put('/plans/:id', async (c) => {
  const planId = c.req.param('id')
  let body: { price?: number; faq_limit?: number; chat_limit?: number }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400)
  }

  const supabase = createSupabaseAdmin(c.env)
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.price !== undefined) updateData.price = body.price
  if (body.faq_limit !== undefined) updateData.faq_limit = body.faq_limit
  if (body.chat_limit !== undefined) updateData.chat_limit = body.chat_limit

  const { error } = await supabase.from('plans').update(updateData).eq('id', planId)
  if (error) return c.json({ success: false, error: error.message }, 500)

  return c.json({ success: true, message: '플랜이 수정되었습니다.' })
})

export default superRouter
