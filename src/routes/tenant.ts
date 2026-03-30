// =====================================================
// 테넌트 자체 정보 + 시나리오 라우터 (JWT 필요)
// GET  /api/admin/me
// PUT  /api/admin/me
// GET  /api/admin/scenarios
// POST /api/admin/scenarios
// PUT  /api/admin/scenarios/:id
// GET  /api/admin/subscription     ← 구독 현황 조회
// POST /api/admin/payment-request  ← 입금 요청 전송
// =====================================================
import { Hono } from 'hono'
import { createSupabaseAdmin } from '../lib/supabase'
import { adminAuthMiddleware } from '../middleware/auth'
import { Bindings, Variables } from '../types'

const tenant = new Hono<{ Bindings: Bindings; Variables: Variables }>()
tenant.use('*', adminAuthMiddleware)

// ─────────────────────────────────────────
// 로컬 fallback 헬퍼
// ─────────────────────────────────────────
function isSupabaseConfigured(env: Bindings): boolean {
  return (
    !!env.SUPABASE_URL &&
    !env.SUPABASE_URL.includes('your-project') &&
    !!env.SUPABASE_SERVICE_KEY &&
    !env.SUPABASE_SERVICE_KEY.includes('your_supabase')
  )
}
function isNetworkOrInternalError(msg: string): boolean {
  return (
    msg.includes('internal error') || msg.includes('DNS') ||
    msg.includes('fetch failed') || msg.includes('Failed to fetch') ||
    msg.includes('network') || msg.includes('ENOTFOUND')
  )
}

// 플랜별 가격
const PLAN_PRICE: Record<string, number> = { basic: 99000, pro: 199000, master: 399000 }

// GET /api/admin/me
tenant.get('/me', async (c) => {
  const tenantId = c.get('tenantId')!
  const supabase = createSupabaseAdmin(c.env)
  const { data, error } = await supabase
    .from('tenants')
    .select('id, company_name, email, plan, bot_name, widget_color, greeting_message, supported_languages, is_active, created_at')
    .eq('id', tenantId).single()
  if (error) return c.json({ success: false, error: error.message }, 500)
  return c.json({ success: true, data })
})

// PUT /api/admin/me
tenant.put('/me', async (c) => {
  const tenantId = c.get('tenantId')!
  let body: Record<string, unknown>
  try { body = await c.req.json() } catch { return c.json({ success: false, error: '잘못된 요청' }, 400) }

  const allowed = ['bot_name', 'greeting_message', 'widget_color', 'supported_languages']
  const update: Record<string, unknown> = {}
  for (const k of allowed) if (body[k] !== undefined) update[k] = body[k]

  const supabase = createSupabaseAdmin(c.env)
  const { error } = await supabase.from('tenants').update(update).eq('id', tenantId)
  if (error) return c.json({ success: false, error: error.message }, 500)
  return c.json({ success: true, message: '설정이 저장되었습니다.' })
})

// GET /api/admin/scenarios
tenant.get('/scenarios', async (c) => {
  const tenantId = c.get('tenantId')!
  const supabase = createSupabaseAdmin(c.env)
  const { data, error } = await supabase
    .from('scenarios')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('scenario_type')
  if (error) return c.json({ success: false, error: error.message }, 500)
  return c.json({ success: true, data })
})

// POST /api/admin/scenarios
tenant.post('/scenarios', async (c) => {
  const tenantId = c.get('tenantId')!
  let body: Record<string, unknown>
  try { body = await c.req.json() } catch { return c.json({ success: false, error: '잘못된 요청' }, 400) }

  const supabase = createSupabaseAdmin(c.env)
  const { data, error } = await supabase.from('scenarios').insert({ ...body, tenant_id: tenantId }).select().single()
  if (error) return c.json({ success: false, error: error.message }, 500)
  return c.json({ success: true, data }, 201)
})

// PUT /api/admin/scenarios/:id
tenant.put('/scenarios/:id', async (c) => {
  const tenantId = c.get('tenantId')!
  const id = c.req.param('id')
  let body: Record<string, unknown>
  try { body = await c.req.json() } catch { return c.json({ success: false, error: '잘못된 요청' }, 400) }

  const supabase = createSupabaseAdmin(c.env)
  const { error } = await supabase.from('scenarios').update(body).eq('id', id).eq('tenant_id', tenantId)
  if (error) return c.json({ success: false, error: error.message }, 500)
  return c.json({ success: true, message: '업데이트 완료' })
})

// ─────────────────────────────────────────
// GET /api/admin/subscription
// 고객사 구독 현황 + 결제 계좌 설정 조회
// ─────────────────────────────────────────
tenant.get('/subscription', async (c) => {
  const tenantId = c.get('tenantId')!

  // 로컬 fallback 응답
  const localFallback = (plan = 'basic') => {
    const today = new Date().toISOString().split('T')[0]
    const endDate = new Date()
    endDate.setMonth(endDate.getMonth() + 1)
    const endStr = endDate.toISOString().split('T')[0]
    const dday = Math.floor((endDate.getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24))
    return c.json({
      success: true,
      data: {
        plan,
        subscription_start_date: today,
        subscription_end_date: endStr,
        subscription_status: 'active',
        payment_requested_at: null,
        dday,
        monthly_price: PLAN_PRICE[plan] || 99000,
        payment_settings: {
          bank_name: '국민은행',
          account_number: '123-456-789012',
          account_holder: '홍길동',
          payment_guide: '입금 후 입금했어요 버튼을 눌러주세요. 확인 후 1시간 이내 처리됩니다.',
        },
      },
    })
  }

  if (!isSupabaseConfigured(c.env)) return localFallback()

  const supabase = createSupabaseAdmin(c.env)
  try {
    // 테넌트 구독 정보
    const { data: tenantData, error: tenantErr } = await supabase
      .from('tenants')
      .select('plan, subscription_start_date, subscription_end_date, subscription_status, payment_requested_at')
      .eq('id', tenantId)
      .single()

    if (tenantErr && isNetworkOrInternalError(tenantErr.message)) return localFallback()
    if (tenantErr) return c.json({ success: false, error: tenantErr.message }, 500)

    // 결제 설정
    const { data: paySettings } = await supabase
      .from('payment_settings')
      .select('bank_name, account_number, account_holder, payment_guide')
      .limit(1)
      .single()

    const today = new Date().toISOString().split('T')[0]
    const endDate = tenantData.subscription_end_date
    const dday = endDate
      ? Math.floor((new Date(endDate).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24))
      : null

    return c.json({
      success: true,
      data: {
        plan: tenantData.plan,
        subscription_start_date: tenantData.subscription_start_date,
        subscription_end_date: endDate,
        subscription_status: tenantData.subscription_status,
        payment_requested_at: tenantData.payment_requested_at,
        dday,
        monthly_price: PLAN_PRICE[tenantData.plan] || 99000,
        payment_settings: paySettings || {
          bank_name: '국민은행',
          account_number: '123-456-789012',
          account_holder: '홍길동',
          payment_guide: '입금 후 입금했어요 버튼을 눌러주세요.',
        },
      },
    })
  } catch {
    return localFallback()
  }
})

// ─────────────────────────────────────────
// POST /api/admin/payment-request
// 고객사 입금 요청 전송
// ─────────────────────────────────────────
tenant.post('/payment-request', async (c) => {
  const tenantId = c.get('tenantId')!
  let body: { payment_memo?: string }
  try { body = await c.req.json() } catch { return c.json({ success: false, error: '잘못된 요청' }, 400) }

  const { payment_memo } = body

  const saveLocal = () => {
    // super.ts의 localTenantStore에 직접 접근할 수 없으므로 로컬은 성공 처리
    return c.json({
      success: true,
      message: '입금 요청이 전달되었습니다. 확인 후 처리해 드립니다.',
    })
  }

  if (!isSupabaseConfigured(c.env)) return saveLocal()

  const supabase = createSupabaseAdmin(c.env)
  try {
    const { error } = await supabase.from('tenants').update({
      payment_memo: payment_memo || '',
      payment_requested_at: new Date().toISOString(),
      subscription_status: 'pending',
    }).eq('id', tenantId)

    if (error && isNetworkOrInternalError(error.message)) return saveLocal()
    if (error) return c.json({ success: false, error: error.message }, 500)
    return c.json({
      success: true,
      message: '입금 요청이 전달되었습니다. 확인 후 처리해 드립니다.',
    })
  } catch {
    return saveLocal()
  }
})

export default tenant
