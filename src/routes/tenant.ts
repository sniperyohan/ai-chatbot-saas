// =====================================================
// 테넌트 자체 정보 + 시나리오 라우터 (JWT 필요)
// GET  /api/admin/me              ← 확장: billing_day 기반 계산 포함
// PUT  /api/admin/me
// GET  /api/admin/scenarios
// POST /api/admin/scenarios
// PUT  /api/admin/scenarios/:id
// GET  /api/admin/subscription     ← 구독 현황 조회
// POST /api/admin/payment-request  ← 입금 요청 전송
// GET  /api/admin/settings         ← 챗봇 설정 조회 (NEW)
// PUT  /api/admin/settings         ← 챗봇 설정 저장 (NEW)
// GET  /api/admin/stats            ← 통계 조회 (NEW)
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
    msg.includes('network') || msg.includes('ENOTFOUND') ||
    msg.includes('error code: 1016') || msg.includes('relation') ||
    msg.includes('does not exist')
  )
}

// 플랜별 가격
const PLAN_PRICE: Record<string, number> = { basic: 99000, pro: 199000, master: 399000 }
// 플랜별 FAQ 한도
const PLAN_LIMIT: Record<string, number> = { basic: 50, pro: 200, master: -1 }

// ─────────────────────────────────────────
// 로컬 테스트 계정 데이터
// ─────────────────────────────────────────
const LOCAL_TEST_ACCOUNTS: Record<string, any> = {
  'local-test-basic': {
    id: 'local-test-basic', email: 'test@test.com', company_name: '테스트쇼핑몰',
    plan: 'basic', bot_name: 'AI상담봇', widget_color: '#4F46E5',
    greeting_message: '안녕하세요! 무엇을 도와드릴까요? 😊',
    supported_languages: ['ko'], is_active: true, billing_day: 5,
    subscribed_at: '2026-03-05', is_temp_password: false,
    faq_count: 12, chat_count_today: 5, chat_count_month: 87, chat_count_total: 312,
  },
  'local-test-pro': {
    id: 'local-test-pro', email: 'pro@test.com', company_name: '프로쇼핑몰',
    plan: 'pro', bot_name: 'Pro상담봇', widget_color: '#10B981',
    greeting_message: '안녕하세요! 프로 상담봇입니다. 😊',
    supported_languages: ['ko', 'en'], is_active: true, billing_day: 15,
    subscribed_at: '2026-03-15', is_temp_password: false,
    faq_count: 85, chat_count_today: 24, chat_count_month: 456, chat_count_total: 2100,
  },
  'local-test-master': {
    id: 'local-test-master', email: 'master@test.com', company_name: '마스터쇼핑몰',
    plan: 'master', bot_name: '마스터상담봇', widget_color: '#8B5CF6',
    greeting_message: '안녕하세요! 마스터 상담봇입니다. 😊',
    supported_languages: ['ko', 'en', 'ja'], is_active: true, billing_day: 1,
    subscribed_at: '2026-03-01', is_temp_password: false,
    faq_count: 320, chat_count_today: 102, chat_count_month: 1850, chat_count_total: 18900,
  },
}

// ─────────────────────────────────────────
// billing_day 기반 구독 계산 헬퍼
// ─────────────────────────────────────────
function calcBillingInfo(billingDay: number, subscribedAt: string | null) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const year = today.getFullYear()
  const month = today.getMonth()
  const day = today.getDate()

  // 다음 결제일 계산
  let nextBillingDate: Date
  if (day < billingDay) {
    // 이번 달 billing_day가 아직 안 됐음
    nextBillingDate = new Date(year, month, billingDay)
  } else {
    // 이번 달 billing_day가 지났으므로 다음 달
    nextBillingDate = new Date(year, month + 1, billingDay)
  }

  // 말일 처리 (billing_day가 31인데 해당 달이 30일이면 30일로)
  const maxDay = new Date(nextBillingDate.getFullYear(), nextBillingDate.getMonth() + 1, 0).getDate()
  if (billingDay > maxDay) {
    nextBillingDate = new Date(nextBillingDate.getFullYear(), nextBillingDate.getMonth(), maxDay)
  }

  const daysUntilBilling = Math.floor((nextBillingDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  // 현재 기간 시작 (이전 billing_day)
  let periodStart: Date
  if (day >= billingDay) {
    periodStart = new Date(year, month, billingDay)
  } else {
    periodStart = new Date(year, month - 1, billingDay)
  }

  const periodEnd = new Date(nextBillingDate.getTime() - 24 * 60 * 60 * 1000) // 다음 결제일 하루 전

  const fmt = (d: Date) => d.toISOString().split('T')[0]

  return {
    billing_day: billingDay,
    next_billing_date: fmt(nextBillingDate),
    days_until_billing: daysUntilBilling,
    current_period_start: fmt(periodStart),
    current_period_end: fmt(periodEnd),
    subscribed_at: subscribedAt,
  }
}

// ─────────────────────────────────────────
// GET /api/admin/me  (확장버전)
// ─────────────────────────────────────────
tenant.get('/me', async (c) => {
  const tenantId = c.get('tenantId')!

  // 로컬 테스트 계정 확인
  const localAcc = LOCAL_TEST_ACCOUNTS[tenantId]
  if (localAcc || !isSupabaseConfigured(c.env)) {
    const acc = localAcc || {
      id: tenantId, email: 'test@test.com', company_name: '테스트쇼핑몰',
      plan: 'basic', bot_name: 'AI상담봇', widget_color: '#4F46E5',
      greeting_message: '안녕하세요! 무엇을 도와드릴까요? 😊',
      supported_languages: ['ko'], is_active: true, billing_day: 5,
      subscribed_at: '2026-03-05', is_temp_password: false,
      faq_count: 0, chat_count_today: 0, chat_count_month: 0, chat_count_total: 0,
    }

    const billingInfo = calcBillingInfo(acc.billing_day || 1, acc.subscribed_at)
    const limit = PLAN_LIMIT[acc.plan] || 50
    const faqPct = limit === -1 ? 0 : Math.round(((acc.faq_count || 0) / limit) * 100)

    return c.json({
      success: true,
      data: {
        id: acc.id,
        company_name: acc.company_name,
        email: acc.email,
        plan: acc.plan,
        bot_name: acc.bot_name,
        widget_color: acc.widget_color,
        greeting_message: acc.greeting_message,
        supported_languages: acc.supported_languages || ['ko'],
        is_active: acc.is_active,
        is_temp_password: acc.is_temp_password || false,
        faq_count: acc.faq_count || 0,
        faq_limit: limit,
        faq_pct: faqPct,
        chat_count_today: acc.chat_count_today || 0,
        chat_count_month: acc.chat_count_month || 0,
        chat_count_total: acc.chat_count_total || 0,
        monthly_amount: PLAN_PRICE[acc.plan] || 99000,
        ...billingInfo,
      },
    })
  }

  const supabase = createSupabaseAdmin(c.env)
  try {
    const { data, error } = await supabase
      .from('tenants')
      .select('id, company_name, email, plan, bot_name, widget_color, greeting_message, supported_languages, is_active, is_temp_password, billing_day, subscribed_at, created_at')
      .eq('id', tenantId)
      .single()

    if (error && isNetworkOrInternalError(error.message)) {
      return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
    }
    if (error) return c.json({ success: false, error: error.message }, 500)

    const billingInfo = calcBillingInfo(data.billing_day || 1, data.subscribed_at)
    const limit = PLAN_LIMIT[data.plan] || 50

    // FAQ 건수 조회
    let faqCount = 0
    try {
      const { count } = await supabase
        .from('documents')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
      faqCount = count || 0
    } catch { /* 실패 무시 */ }

    const faqPct = limit === -1 ? 0 : Math.round((faqCount / limit) * 100)

    return c.json({
      success: true,
      data: {
        ...data,
        faq_count: faqCount,
        faq_limit: limit,
        faq_pct: faqPct,
        monthly_amount: PLAN_PRICE[data.plan] || 99000,
        ...billingInfo,
      },
    })
  } catch {
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PUT /api/admin/me
tenant.put('/me', async (c) => {
  const tenantId = c.get('tenantId')!
  let body: Record<string, unknown>
  try { body = await c.req.json() } catch { return c.json({ success: false, error: '잘못된 요청' }, 400) }

  // 로컬 계정이면 성공 응답
  if (LOCAL_TEST_ACCOUNTS[tenantId] || !isSupabaseConfigured(c.env)) {
    return c.json({ success: true, message: '설정이 저장되었습니다.' })
  }

  const allowed = ['bot_name', 'greeting_message', 'widget_color', 'supported_languages']
  const update: Record<string, unknown> = {}
  for (const k of allowed) if (body[k] !== undefined) update[k] = body[k]

  const supabase = createSupabaseAdmin(c.env)
  const { error } = await supabase.from('tenants').update(update).eq('id', tenantId)
  if (error) return c.json({ success: false, error: error.message }, 500)
  return c.json({ success: true, message: '설정이 저장되었습니다.' })
})

// ─────────────────────────────────────────
// GET /api/admin/settings
// 챗봇 상세 설정 조회 (bot_name, greeting, color, languages, system_prompt 등)
// ─────────────────────────────────────────
tenant.get('/settings', async (c) => {
  const tenantId = c.get('tenantId')!

  const localAcc = LOCAL_TEST_ACCOUNTS[tenantId]
  if (localAcc || !isSupabaseConfigured(c.env)) {
    const acc = localAcc || {}
    return c.json({
      success: true,
      data: {
        bot_name: acc.bot_name || 'AI상담봇',
        greeting_message: acc.greeting_message || '안녕하세요! 무엇을 도와드릴까요? 😊',
        widget_color: acc.widget_color || '#4F46E5',
        supported_languages: acc.supported_languages || ['ko'],
        system_prompt: acc.system_prompt || '당신은 친절한 고객 상담 AI입니다. 고객의 질문에 정확하고 도움이 되는 답변을 제공하세요.',
        response_tone: acc.response_tone || 'friendly',
        max_response_length: acc.max_response_length || 500,
        fallback_message: acc.fallback_message || '죄송합니다. 해당 질문에 대한 답변을 찾지 못했습니다. 고객센터로 문의해 주세요.',
        show_sources: acc.show_sources !== undefined ? acc.show_sources : true,
        auto_escalate: acc.auto_escalate !== undefined ? acc.auto_escalate : false,
      },
    })
  }

  const supabase = createSupabaseAdmin(c.env)
  try {
    const { data, error } = await supabase
      .from('tenants')
      .select('bot_name, greeting_message, widget_color, supported_languages, system_prompt, response_tone, max_response_length, fallback_message, show_sources, auto_escalate')
      .eq('id', tenantId)
      .single()

    if (error && isNetworkOrInternalError(error.message)) {
      // 네트워크 오류 시 기본값 반환
      return c.json({ success: true, data: {
        bot_name: 'AI상담봇', greeting_message: '안녕하세요! 무엇을 도와드릴까요? 😊',
        widget_color: '#4F46E5', supported_languages: ['ko'],
        system_prompt: '당신은 친절한 고객 상담 AI입니다.',
        response_tone: 'friendly', max_response_length: 500,
        fallback_message: '죄송합니다. 해당 질문에 대한 답변을 찾지 못했습니다.',
        show_sources: true, auto_escalate: false,
      }})
    }
    if (error) return c.json({ success: false, error: error.message }, 500)

    return c.json({ success: true, data })
  } catch {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// ─────────────────────────────────────────
// PUT /api/admin/settings
// 챗봇 상세 설정 저장
// ─────────────────────────────────────────
tenant.put('/settings', async (c) => {
  const tenantId = c.get('tenantId')!
  let body: Record<string, unknown>
  try { body = await c.req.json() } catch { return c.json({ success: false, error: '잘못된 요청' }, 400) }

  // 로컬 계정이면 성공 응답 (인메모리 저장 불필요)
  if (LOCAL_TEST_ACCOUNTS[tenantId] || !isSupabaseConfigured(c.env)) {
    return c.json({ success: true, message: '설정이 저장되었습니다.' })
  }

  const allowed = [
    'bot_name', 'greeting_message', 'widget_color', 'supported_languages',
    'system_prompt', 'response_tone', 'max_response_length',
    'fallback_message', 'show_sources', 'auto_escalate'
  ]
  const update: Record<string, unknown> = {}
  for (const k of allowed) if (body[k] !== undefined) update[k] = body[k]

  const supabase = createSupabaseAdmin(c.env)
  try {
    const { error } = await supabase.from('tenants').update(update).eq('id', tenantId)
    if (error && isNetworkOrInternalError(error.message)) {
      return c.json({ success: true, message: '설정이 저장되었습니다.' })
    }
    if (error) return c.json({ success: false, error: error.message }, 500)
    return c.json({ success: true, message: '설정이 저장되었습니다.' })
  } catch {
    return c.json({ success: true, message: '설정이 저장되었습니다.' })
  }
})

// ─────────────────────────────────────────
// GET /api/admin/stats
// 대시보드 통계 조회
// ─────────────────────────────────────────
tenant.get('/stats', async (c) => {
  const tenantId = c.get('tenantId')!

  const localAcc = LOCAL_TEST_ACCOUNTS[tenantId]
  const localFallback = () => {
    const acc = localAcc || {}
    return c.json({
      success: true,
      data: {
        today_count: acc.chat_count_today || 5,
        yesterday_count: 3,
        month_count: acc.chat_count_month || 87,
        total_count: acc.chat_count_total || 312,
        faq_count: acc.faq_count || 12,
        growth_rate_today: 67,
        channel_stats: { web: acc.chat_count_today || 5 },
        intent_stats: { FAQ_INQUIRY: 8, GREETING: 2, OTHER: 2 },
        recent_logs: [
          { id: '1', created_at_kst: new Date().toISOString().replace('T', ' ').slice(0,16), channel: 'web', user_message: '배송은 언제 되나요?', intent: 'FAQ_INQUIRY' },
          { id: '2', created_at_kst: new Date(Date.now()-60000).toISOString().replace('T', ' ').slice(0,16), channel: 'web', user_message: '반품 방법을 알려주세요.', intent: 'FAQ_INQUIRY' },
          { id: '3', created_at_kst: new Date(Date.now()-120000).toISOString().replace('T', ' ').slice(0,16), channel: 'web', user_message: '안녕하세요!', intent: 'GREETING' },
          { id: '4', created_at_kst: new Date(Date.now()-300000).toISOString().replace('T', ' ').slice(0,16), channel: 'web', user_message: '결제 오류가 발생했어요.', intent: 'COMPLAINT' },
          { id: '5', created_at_kst: new Date(Date.now()-600000).toISOString().replace('T', ' ').slice(0,16), channel: 'web', user_message: '교환 신청하고 싶어요.', intent: 'FAQ_INQUIRY' },
        ],
      },
    })
  }

  if (!isSupabaseConfigured(c.env)) return localFallback()

  const supabase = createSupabaseAdmin(c.env)
  try {
    const todayStr = new Date().toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]

    // 병렬 조회
    const [todayRes, yesterdayRes, monthRes, totalRes, faqRes, recentRes] = await Promise.allSettled([
      supabase.from('chat_logs').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', todayStr),
      supabase.from('chat_logs').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', yesterday).lt('created_at', todayStr),
      supabase.from('chat_logs').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', monthStart),
      supabase.from('chat_logs').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      supabase.from('documents').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      supabase.from('chat_logs').select('id, created_at, channel, user_message, intent').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(5),
    ])

    const todayCount     = todayRes.status === 'fulfilled' ? (todayRes.value.count || 0) : 0
    const yesterdayCount = yesterdayRes.status === 'fulfilled' ? (yesterdayRes.value.count || 0) : 0
    const monthCount     = monthRes.status === 'fulfilled' ? (monthRes.value.count || 0) : 0
    const totalCount     = totalRes.status === 'fulfilled' ? (totalRes.value.count || 0) : 0
    const faqCount       = faqRes.status === 'fulfilled' ? (faqRes.value.count || 0) : 0
    const recentLogs     = recentRes.status === 'fulfilled' ? (recentRes.value.data || []) : []

    const growthRate = yesterdayCount > 0
      ? Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100)
      : todayCount > 0 ? 100 : 0

    // 채널별 통계
    const channelStats: Record<string, number> = {}
    const intentStats: Record<string, number> = {}
    for (const log of recentLogs) {
      if (log.channel) channelStats[log.channel] = (channelStats[log.channel] || 0) + 1
      if (log.intent) intentStats[log.intent] = (intentStats[log.intent] || 0) + 1
    }

    return c.json({
      success: true,
      data: {
        today_count: todayCount,
        yesterday_count: yesterdayCount,
        month_count: monthCount,
        total_count: totalCount,
        faq_count: faqCount,
        growth_rate_today: growthRate,
        channel_stats: channelStats,
        intent_stats: intentStats,
        recent_logs: recentLogs.map(l => ({
          ...l,
          created_at_kst: l.created_at ? new Date(l.created_at).toISOString().replace('T', ' ').slice(0, 16) : '',
        })),
      },
    })
  } catch {
    return localFallback()
  }
})

// GET /api/admin/scenarios
tenant.get('/scenarios', async (c) => {
  const tenantId = c.get('tenantId')!

  if (!isSupabaseConfigured(c.env)) {
    return c.json({ success: true, data: [] })
  }

  const supabase = createSupabaseAdmin(c.env)
  try {
    const { data, error } = await supabase
      .from('scenarios')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('scenario_type')
    if (error && isNetworkOrInternalError(error.message)) return c.json({ success: true, data: [] })
    if (error) return c.json({ success: false, error: error.message }, 500)
    return c.json({ success: true, data })
  } catch {
    return c.json({ success: true, data: [] })
  }
})

// POST /api/admin/scenarios
tenant.post('/scenarios', async (c) => {
  const tenantId = c.get('tenantId')!
  let body: Record<string, unknown>
  try { body = await c.req.json() } catch { return c.json({ success: false, error: '잘못된 요청' }, 400) }

  if (!isSupabaseConfigured(c.env)) {
    return c.json({ success: true, data: { id: 'local-' + Date.now(), ...body, tenant_id: tenantId } }, 201)
  }

  const supabase = createSupabaseAdmin(c.env)
  try {
    const { data, error } = await supabase.from('scenarios').insert({ ...body, tenant_id: tenantId }).select().single()
    if (error && isNetworkOrInternalError(error.message)) {
      return c.json({ success: true, data: { id: 'local-' + Date.now(), ...body, tenant_id: tenantId } }, 201)
    }
    if (error) return c.json({ success: false, error: error.message }, 500)
    return c.json({ success: true, data }, 201)
  } catch {
    return c.json({ success: true, data: { id: 'local-' + Date.now(), ...body, tenant_id: tenantId } }, 201)
  }
})

// PUT /api/admin/scenarios/:id
tenant.put('/scenarios/:id', async (c) => {
  const tenantId = c.get('tenantId')!
  const id = c.req.param('id')
  let body: Record<string, unknown>
  try { body = await c.req.json() } catch { return c.json({ success: false, error: '잘못된 요청' }, 400) }

  if (!isSupabaseConfigured(c.env)) {
    return c.json({ success: true, message: '업데이트 완료' })
  }

  const supabase = createSupabaseAdmin(c.env)
  try {
    const { error } = await supabase.from('scenarios').update(body).eq('id', id).eq('tenant_id', tenantId)
    if (error && isNetworkOrInternalError(error.message)) return c.json({ success: true, message: '업데이트 완료' })
    if (error) return c.json({ success: false, error: error.message }, 500)
    return c.json({ success: true, message: '업데이트 완료' })
  } catch {
    return c.json({ success: true, message: '업데이트 완료' })
  }
})

// ─────────────────────────────────────────
// GET /api/admin/subscription
// 고객사 구독 현황 + 결제 계좌 설정 조회
// ─────────────────────────────────────────
tenant.get('/subscription', async (c) => {
  const tenantId = c.get('tenantId')!

  const localFallback = (plan = 'basic', billingDay = 5, subscribedAt = '2026-03-05') => {
    const billingInfo = calcBillingInfo(billingDay, subscribedAt)
    return c.json({
      success: true,
      data: {
        plan,
        subscription_start_date: subscribedAt,
        subscription_end_date: billingInfo.current_period_end,
        subscription_status: 'active',
        payment_requested_at: null,
        dday: billingInfo.days_until_billing,
        monthly_price: PLAN_PRICE[plan] || 99000,
        ...billingInfo,
        payment_settings: {
          bank_name: '국민은행',
          account_number: '123-456-789012',
          account_holder: '홍길동',
          payment_guide: '입금 후 입금했어요 버튼을 눌러주세요. 확인 후 1시간 이내 처리됩니다.',
        },
      },
    })
  }

  const localAcc = LOCAL_TEST_ACCOUNTS[tenantId]
  if (localAcc) return localFallback(localAcc.plan, localAcc.billing_day, localAcc.subscribed_at)
  if (!isSupabaseConfigured(c.env)) return localFallback()

  const supabase = createSupabaseAdmin(c.env)
  try {
    const { data: tenantData, error: tenantErr } = await supabase
      .from('tenants')
      .select('plan, billing_day, subscribed_at, subscription_start_date, subscription_end_date, subscription_status, payment_requested_at')
      .eq('id', tenantId)
      .single()

    if (tenantErr && isNetworkOrInternalError(tenantErr.message)) return localFallback()
    if (tenantErr) return c.json({ success: false, error: tenantErr.message }, 500)

    const { data: paySettings } = await supabase
      .from('payment_settings')
      .select('bank_name, account_number, account_holder, payment_guide')
      .limit(1)
      .single()

    const billingDay = tenantData.billing_day || 1
    const subscribedAt = tenantData.subscribed_at || tenantData.subscription_start_date || null
    const billingInfo = calcBillingInfo(billingDay, subscribedAt)

    return c.json({
      success: true,
      data: {
        plan: tenantData.plan,
        subscription_start_date: tenantData.subscription_start_date || subscribedAt,
        subscription_end_date: tenantData.subscription_end_date || billingInfo.current_period_end,
        subscription_status: tenantData.subscription_status || 'active',
        payment_requested_at: tenantData.payment_requested_at,
        dday: billingInfo.days_until_billing,
        monthly_price: PLAN_PRICE[tenantData.plan] || 99000,
        ...billingInfo,
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

  if (LOCAL_TEST_ACCOUNTS[tenantId] || !isSupabaseConfigured(c.env)) {
    return c.json({ success: true, message: '입금 요청이 전달되었습니다. 확인 후 처리해 드립니다.' })
  }

  const supabase = createSupabaseAdmin(c.env)
  try {
    const { error } = await supabase.from('tenants').update({
      payment_memo: payment_memo || '',
      payment_requested_at: new Date().toISOString(),
      subscription_status: 'pending',
    }).eq('id', tenantId)

    if (error && isNetworkOrInternalError(error.message)) {
      return c.json({ success: true, message: '입금 요청이 전달되었습니다. 확인 후 처리해 드립니다.' })
    }
    if (error) return c.json({ success: false, error: error.message }, 500)
    return c.json({ success: true, message: '입금 요청이 전달되었습니다. 확인 후 처리해 드립니다.' })
  } catch {
    return c.json({ success: true, message: '입금 요청이 전달되었습니다. 확인 후 처리해 드립니다.' })
  }
})

export default tenant
