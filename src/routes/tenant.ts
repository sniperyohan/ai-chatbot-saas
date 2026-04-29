// =====================================================
// 테넌트 자체 정보 + 시나리오 라우터 - Cloudflare D1 버전
// GET  /api/admin/me
// PUT  /api/admin/me
// GET  /api/admin/settings
// PUT  /api/admin/settings
// GET  /api/admin/stats
// GET  /api/admin/scenarios
// POST /api/admin/scenarios
// PUT  /api/admin/scenarios/:id
// GET  /api/admin/subscription
// POST /api/admin/payment-request
// POST /api/admin/faq/excel
// GET  /api/admin/analytics/top10
// =====================================================
import { Hono } from 'hono'
import { dbGet, dbAll, dbRun, generateId, nowISO } from '../lib/db'
import { adminAuthMiddleware } from '../middleware/auth'
import { Bindings, Variables } from '../types'

const tenant = new Hono<{ Bindings: Bindings; Variables: Variables }>()
tenant.use('*', adminAuthMiddleware)

// 플랜별 가격
const PLAN_PRICE: Record<string, number> = { basic: 99000, pro: 199000, master: 399000 }
// 플랜별 FAQ 한도
const PLAN_LIMIT: Record<string, number> = { basic: 50, pro: 200, master: -1 }

// ─────────────────────────────────────────
// billing_day 기반 구독 계산 헬퍼
// ─────────────────────────────────────────
function calcBillingInfo(billingDay: number, subscribedAt: string | null) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const year  = today.getFullYear()
  const month = today.getMonth()
  const day   = today.getDate()

  let nextBillingDate: Date
  if (day < billingDay) {
    nextBillingDate = new Date(year, month, billingDay)
  } else {
    nextBillingDate = new Date(year, month + 1, billingDay)
  }

  // 말일 처리
  const maxDay = new Date(nextBillingDate.getFullYear(), nextBillingDate.getMonth() + 1, 0).getDate()
  if (billingDay > maxDay) {
    nextBillingDate = new Date(nextBillingDate.getFullYear(), nextBillingDate.getMonth(), maxDay)
  }

  const daysUntilBilling = Math.floor((nextBillingDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  let periodStart: Date
  if (day >= billingDay) {
    periodStart = new Date(year, month, billingDay)
  } else {
    periodStart = new Date(year, month - 1, billingDay)
  }

  const periodEnd = new Date(nextBillingDate.getTime() - 24 * 60 * 60 * 1000)

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
// GET /api/admin/me
// ─────────────────────────────────────────
tenant.get('/me', async (c) => {
  const tenantId = c.get('tenantId')!

  const { data: t, error } = await dbGet<{
    id: string; company_name: string; email: string; plan: string
    bot_name: string; widget_color: string; greeting_message: string
    supported_languages: string; is_active: number; is_temp_password: number
    billing_day: number; subscribed_at: string | null; created_at: string
    faq_limit: number; chat_limit: number
  }>(c.env,
    `SELECT id, company_name, email, plan, bot_name, widget_color,
            greeting_message, supported_languages, is_active, is_temp_password,
            billing_day, subscribed_at, created_at, faq_limit, chat_limit
     FROM tenants WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    tenantId
  )

  if (error) return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  if (!t)    return c.json({ success: false, error: '사용자를 찾을 수 없습니다.' }, 404)

  // FAQ 건수 조회
  const { data: faqRow } = await dbGet<{ cnt: number }>(c.env,
    'SELECT COUNT(*) as cnt FROM documents WHERE tenant_id = ? AND is_deleted = 0 AND is_active = 1',
    tenantId
  )
  const faqCount = faqRow?.cnt || 0

  const billingInfo = calcBillingInfo(t.billing_day || 1, t.subscribed_at)
  const limit  = PLAN_LIMIT[t.plan] || 50
  const faqPct = limit === -1 ? 0 : Math.round((faqCount / limit) * 100)

  let langs: string[] = ['ko']
  try { langs = JSON.parse(t.supported_languages) } catch {}

  return c.json({
    success: true,
    data: {
      id:               t.id,
      company_name:     t.company_name,
      email:            t.email,
      plan:             t.plan,
      bot_name:         t.bot_name,
      widget_color:     t.widget_color,
      greeting_message: t.greeting_message,
      supported_languages: langs,
      is_active:        !!t.is_active,
      is_temp_password: !!t.is_temp_password,
      faq_count:        faqCount,
      faq_limit:        limit,
      faq_pct:          faqPct,
      monthly_amount:   PLAN_PRICE[t.plan] || 99000,
      ...billingInfo,
    },
  })
})

// ─────────────────────────────────────────
// PUT /api/admin/me
// ─────────────────────────────────────────
tenant.put('/me', async (c) => {
  const tenantId = c.get('tenantId')!
  let body: Record<string, unknown>
  try { body = await c.req.json() } catch { return c.json({ success: false, error: '잘못된 요청' }, 400) }

  const allowed  = ['bot_name', 'greeting_message', 'widget_color', 'supported_languages']
  const fields: string[] = []
  const values: unknown[] = []

  for (const k of allowed) {
    if (body[k] !== undefined) {
      fields.push(`${k} = ?`)
      values.push(k === 'supported_languages' && Array.isArray(body[k])
        ? JSON.stringify(body[k])
        : body[k]
      )
    }
  }

  if (!fields.length) return c.json({ success: false, error: '변경할 항목이 없습니다.' }, 400)
  fields.push('updated_at = ?'); values.push(nowISO())
  values.push(tenantId)

  const { error } = await dbRun(c.env,
    `UPDATE tenants SET ${fields.join(', ')} WHERE id = ?`, ...values
  )
  if (error) return c.json({ success: false, error: error }, 500)
  return c.json({ success: true, message: '설정이 저장되었습니다.' })
})

// ─────────────────────────────────────────
// GET /api/admin/settings
// ─────────────────────────────────────────
tenant.get('/settings', async (c) => {
  const tenantId = c.get('tenantId')!

  const { data: t, error } = await dbGet<{
    bot_name: string; greeting_message: string; widget_color: string
    supported_languages: string; system_prompt: string; response_tone: string
    max_response_length: number; fallback_message: string; show_sources: number; auto_escalate: number
    business_hours_enabled: number; business_hours: string; off_hours_message: string; lunch_break: string
  }>(c.env,
    `SELECT bot_name, greeting_message, widget_color, supported_languages,
            system_prompt, response_tone, max_response_length,
            fallback_message, show_sources, auto_escalate,
            business_hours_enabled, business_hours, off_hours_message, lunch_break
     FROM tenants WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    tenantId
  )

  if (error) return c.json({ success: false, error: '서버 오류' }, 500)
  if (!t)    return c.json({ success: false, error: '사용자를 찾을 수 없습니다.' }, 404)

  let langs: string[] = ['ko']
  try { langs = JSON.parse(t.supported_languages) } catch {}
  let bizHours: Record<string, unknown> = {}
  try { bizHours = JSON.parse(t.business_hours) } catch {}
  let lunchBreak: Record<string, unknown> = {}
  try { lunchBreak = JSON.parse(t.lunch_break) } catch {}

  return c.json({
    success: true,
    data: {
      bot_name:              t.bot_name || 'AI상담봇',
      greeting_message:      t.greeting_message || '안녕하세요! 무엇을 도와드릴까요? 😊',
      widget_color:          t.widget_color || '#4F46E5',
      supported_languages:   langs,
      system_prompt:         t.system_prompt || '당신은 친절한 고객 상담 AI입니다. 고객의 질문에 정확하고 도움이 되는 답변을 제공하세요.',
      response_tone:         t.response_tone || 'friendly',
      max_response_length:   t.max_response_length || 500,
      fallback_message:      t.fallback_message || '죄송합니다. 해당 질문에 대한 답변을 찾지 못했습니다. 고객센터로 문의해 주세요.',
      show_sources:          !!t.show_sources,
      auto_escalate:         !!t.auto_escalate,
      business_hours_enabled: !!t.business_hours_enabled,
      business_hours:        bizHours,
      off_hours_message:     t.off_hours_message || '운영시간이 아닙니다.',
      lunch_break:           lunchBreak,
    },
  })
})

// ─────────────────────────────────────────
// PUT /api/admin/settings
// ─────────────────────────────────────────
tenant.put('/settings', async (c) => {
  const tenantId = c.get('tenantId')!
  let body: Record<string, unknown>
  try { body = await c.req.json() } catch { return c.json({ success: false, error: '잘못된 요청' }, 400) }

  const allowed = [
    'bot_name', 'greeting_message', 'widget_color', 'supported_languages',
    'system_prompt', 'response_tone', 'max_response_length',
    'fallback_message', 'show_sources', 'auto_escalate',
    'business_hours_enabled', 'business_hours', 'off_hours_message', 'lunch_break',
  ]
  const jsonFields = new Set(['supported_languages', 'business_hours', 'lunch_break'])
  const intFields  = new Set(['show_sources', 'auto_escalate', 'business_hours_enabled'])
  const numFields  = new Set(['max_response_length'])

  const fields: string[] = []
  const values: unknown[] = []

  for (const k of allowed) {
    if (body[k] === undefined) continue
    fields.push(`${k} = ?`)
    if (jsonFields.has(k) && typeof body[k] === 'object') {
      values.push(JSON.stringify(body[k]))
    } else if (intFields.has(k)) {
      values.push(body[k] ? 1 : 0)
    } else if (numFields.has(k)) {
      values.push(Number(body[k]) || 500)
    } else {
      values.push(body[k])
    }
  }

  if (fields.length === 0) return c.json({ success: true, message: '변경 없음' })

  fields.push('updated_at = ?'); values.push(nowISO())
  values.push(tenantId)

  const { error } = await dbRun(c.env,
    `UPDATE tenants SET ${fields.join(', ')} WHERE id = ?`, ...values
  )
  if (error) return c.json({ success: false, error }, 500)
  return c.json({ success: true, message: '설정이 저장되었습니다.' })
})

// ─────────────────────────────────────────
// GET /api/admin/stats
// ─────────────────────────────────────────
tenant.get('/stats', async (c) => {
  const tenantId = c.get('tenantId')!

  const todayStr     = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
  const yesterdayStr = new Date(Date.now() + 9 * 3600000 - 86400000).toISOString().slice(0, 10)
  const monthStart   = todayStr.slice(0, 7) + '-01'

  const [todayRow, yesterdayRow, monthRow, totalRow, faqRow, recentRows] = await Promise.all([
    dbGet<{ cnt: number }>(c.env,
      "SELECT COUNT(*) as cnt FROM chat_logs WHERE tenant_id = ? AND created_at >= ?",
      tenantId, `${todayStr}T00:00:00.000Z`
    ),
    dbGet<{ cnt: number }>(c.env,
      "SELECT COUNT(*) as cnt FROM chat_logs WHERE tenant_id = ? AND created_at >= ? AND created_at < ?",
      tenantId, `${yesterdayStr}T00:00:00.000Z`, `${todayStr}T00:00:00.000Z`
    ),
    dbGet<{ cnt: number }>(c.env,
      "SELECT COUNT(*) as cnt FROM chat_logs WHERE tenant_id = ? AND created_at >= ?",
      tenantId, `${monthStart}T00:00:00.000Z`
    ),
    dbGet<{ cnt: number }>(c.env,
      'SELECT COUNT(*) as cnt FROM chat_logs WHERE tenant_id = ?',
      tenantId
    ),
    dbGet<{ cnt: number }>(c.env,
      'SELECT COUNT(*) as cnt FROM documents WHERE tenant_id = ? AND is_deleted = 0 AND is_active = 1',
      tenantId
    ),
    dbAll<{ id: string; created_at: string; channel: string; user_message: string; intent: string }>(c.env,
      'SELECT id, created_at, channel, user_message, intent FROM chat_logs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 5',
      tenantId
    ),
  ])

  const todayCount     = todayRow.data?.cnt     || 0
  const yesterdayCount = yesterdayRow.data?.cnt  || 0
  const monthCount     = monthRow.data?.cnt      || 0
  const totalCount     = totalRow.data?.cnt      || 0
  const faqCount       = faqRow.data?.cnt        || 0
  const recentLogs     = recentRows.data         || []

  const growthRate = yesterdayCount > 0
    ? Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100)
    : (todayCount > 0 ? 100 : 0)

  const channelStats: Record<string, number> = {}
  const intentStats:  Record<string, number> = {}
  for (const log of recentLogs) {
    if (log.channel) channelStats[log.channel] = (channelStats[log.channel] || 0) + 1
    if (log.intent)  intentStats[log.intent]   = (intentStats[log.intent]  || 0) + 1
  }

  return c.json({
    success: true,
    data: {
      today_count:      todayCount,
      yesterday_count:  yesterdayCount,
      month_count:      monthCount,
      total_count:      totalCount,
      faq_count:        faqCount,
      growth_rate_today: growthRate,
      channel_stats:    channelStats,
      intent_stats:     intentStats,
      recent_logs:      recentLogs.map(l => ({
        ...l,
        created_at_kst: l.created_at
          ? new Date(new Date(l.created_at).getTime() + 9 * 3600000)
              .toISOString().replace('T', ' ').slice(0, 16)
          : '',
      })),
    },
  })
})

// ─────────────────────────────────────────
// GET /api/admin/scenarios
// ─────────────────────────────────────────
tenant.get('/scenarios', async (c) => {
  const tenantId = c.get('tenantId')!
  const { data, error } = await dbAll<any>(c.env,
    'SELECT * FROM scenarios WHERE tenant_id = ? ORDER BY created_at ASC',
    tenantId
  )
  if (error) return c.json({ success: false, error: String(error) }, 500)
  return c.json({ success: true, data: data || [] })
})

// POST /api/admin/scenarios
tenant.post('/scenarios', async (c) => {
  let body: Record<string, unknown>
  try { body = await c.req.json() } catch { return c.json({ success: false, error: '잘못된 요청' }, 400) }
  const tenantId = c.get('tenantId')!
  const id = generateId()
  const now = new Date().toISOString()
  const { error } = await dbRun(c.env,
    `INSERT INTO scenarios (id, tenant_id, name, type, is_active, trigger_keywords, response_template, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, tenantId, String(body.name || ''), String(body.type || 'custom'), body.is_active !== false ? 1 : 0, JSON.stringify(body.trigger_keywords || []), String(body.response_template || ''), now, now
  )
  if (error) return c.json({ success: false, error: String(error) }, 500)
  return c.json({ success: true, data: { id, ...body, tenant_id: tenantId, created_at: now, updated_at: now } }, 201)
})

// PUT /api/admin/scenarios/:id
tenant.put('/scenarios/:id', async (c) => {
  const id = c.req.param('id')
  const tenantId = c.get('tenantId')!
  let body: Record<string, unknown>
  try { body = await c.req.json() } catch { return c.json({ success: false, error: '잘못된 요청' }, 400) }
  const now = new Date().toISOString()
  const { error } = await dbRun(c.env,
    `UPDATE scenarios SET name = ?, type = ?, is_active = ?, trigger_keywords = ?, response_template = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`,
    String(body.name || ''), String(body.type || 'custom'), body.is_active !== false ? 1 : 0, JSON.stringify(body.trigger_keywords || []), String(body.response_template || ''), now, id, tenantId
  )
  if (error) return c.json({ success: false, error: String(error) }, 500)
  return c.json({ success: true })
})

// DELETE /api/admin/scenarios/:id
tenant.delete('/scenarios/:id', async (c) => {
  const id = c.req.param('id')
  const tenantId = c.get('tenantId')!
  const { error } = await dbRun(c.env,
    'DELETE FROM scenarios WHERE id = ? AND tenant_id = ?',
    id, tenantId
  )
  if (error) return c.json({ success: false, error: String(error) }, 500)
  return c.json({ success: true })
})

// ─────────────────────────────────────────
// GET /api/admin/subscription
// ─────────────────────────────────────────
tenant.get('/subscription', async (c) => {
  const tenantId = c.get('tenantId')!

  const { data: t, error: tErr } = await dbGet<{
    plan: string; billing_day: number; subscribed_at: string | null
    subscription_start_date: string | null; subscription_end_date: string | null
    subscription_status: string; payment_requested_at: string | null
  }>(c.env,
    `SELECT plan, billing_day, subscribed_at, subscription_start_date,
            subscription_end_date, subscription_status, payment_requested_at
     FROM tenants WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    tenantId
  )
  if (tErr) return c.json({ success: false, error: '서버 오류' }, 500)
  if (!t)   return c.json({ success: false, error: '사용자를 찾을 수 없습니다.' }, 404)

  const { data: paySettings } = await dbGet<{
    bank_name: string; account_number: string; account_holder: string; payment_guide: string
   }>(c.env, 'SELECT bank_name, account_number, account_holder, payment_guide FROM super_payment_settings ORDER BY updated_at DESC LIMIT 1')

  const billingDay    = t.billing_day || 1
  const subscribedAt  = t.subscribed_at || t.subscription_start_date || null
  const billingInfo   = calcBillingInfo(billingDay, subscribedAt)

  return c.json({
    success: true,
    data: {
      plan: t.plan,
      subscription_start_date: t.subscription_start_date || subscribedAt,
      subscription_end_date:   t.subscription_end_date   || billingInfo.current_period_end,
      subscription_status:     t.subscription_status     || 'active',
      payment_requested_at:    t.payment_requested_at,
      dday: (() => {
        const expStr = t.subscription_end_date || t.expires_at;
        if (expStr == null) return billingInfo.days_until_billing;
        const today = new Date(); today.setHours(0,0,0,0);
        const exp = new Date(expStr); exp.setHours(0,0,0,0);
        return Math.floor((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      })(),
      monthly_price: PLAN_PRICE[t.plan] || 99000,
      ...billingInfo,
      payment_settings: paySettings || {
        bank_name: '국민은행', account_number: '123-456-789012',
        account_holder: '홍길동', payment_guide: '입금 후 입금했어요 버튼을 눌러주세요.',
      },
    },
  })
})

// ─────────────────────────────────────────
// POST /api/admin/payment-request
// ─────────────────────────────────────────
tenant.post('/payment-request', async (c) => {
  const tenantId = c.get('tenantId')!
  let body: { payment_memo?: string }
  try { body = await c.req.json() } catch { return c.json({ success: false, error: '잘못된 요청' }, 400) }

  await dbRun(c.env,
    "UPDATE tenants SET payment_memo = ?, payment_requested_at = ?, subscription_status = 'pending', updated_at = ? WHERE id = ?",
    body.payment_memo || '', nowISO(), nowISO(), tenantId
  )
  return c.json({ success: true, message: '입금 요청이 전달되었습니다. 확인 후 처리해 드립니다.' })
})

// ─────────────────────────────────────────
// POST /api/admin/faq/excel
// 엑셀 파싱 후 FAQ 일괄 저장
// ─────────────────────────────────────────
tenant.post('/faq/excel', async (c) => {
  const tenantId = c.get('tenantId')!

  let rows: { question: string; answer: string; category: string }[] = []
  try {
    const body = await c.req.json()
    rows = body.rows || []
  } catch {
    return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400)
  }

  if (!Array.isArray(rows) || rows.length === 0)
    return c.json({ success: false, error: '저장할 FAQ 데이터가 없습니다.' }, 400)
  if (rows.length > 500)
    return c.json({ success: false, error: '한번에 최대 500개까지 업로드 가능합니다.' }, 400)

  const validRows = rows.filter(r => r.question?.trim() && r.answer?.trim())
  if (validRows.length === 0)
    return c.json({ success: false, error: '유효한 FAQ가 없습니다. 질문과 답변을 모두 입력하세요.' }, 400)

  // 플랜 FAQ 한도 확인
  const { data: tenantRow } = await dbGet<{ plan: string }>(c.env,
    'SELECT plan FROM tenants WHERE id = ? LIMIT 1', tenantId
  )
  const planName = tenantRow?.plan || 'basic'
  const faqLimit = PLAN_LIMIT[planName] ?? 50

  if (faqLimit !== -1) {
    const { data: cntRow } = await dbGet<{ cnt: number }>(c.env,
      'SELECT COUNT(*) as cnt FROM documents WHERE tenant_id = ? AND is_deleted = 0 AND is_active = 1', tenantId
    )
    const currentCnt = cntRow?.cnt || 0
    if (currentCnt >= faqLimit)
      return c.json({ success: false, error: `현재 플랜(${planName})의 FAQ 등록 한도(${faqLimit}개)에 도달했습니다.` }, 403)
  }

  // 기존 질문 중복 체크
  const { data: existingDocs } = await dbAll<{ original_question: string; refined_question: string }>(c.env,
    'SELECT original_question, refined_question FROM documents WHERE tenant_id = ? AND is_deleted = 0', tenantId
  )
  const existingQuestions = new Set<string>(
    (existingDocs || []).flatMap(d => [
      d.original_question?.toLowerCase()?.trim(),
      d.refined_question?.toLowerCase()?.trim(),
    ].filter(Boolean) as string[])
  )

  let saved   = 0
  let skipped = 0
  const now   = nowISO()

  for (const row of validRows) {
    const qKey = row.question.toLowerCase().trim()
    if (existingQuestions.has(qKey)) { skipped++; continue }

    const { error } = await dbRun(c.env,
      `INSERT INTO documents
        (id, tenant_id, question, answer, original_question, original_answer,
         refined_question, refined_answer, content, category, language,
         is_active, is_deleted, is_ai_refined, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,1,0,0,?,?)`,
      generateId(), tenantId,
      row.question.trim(), row.answer.trim(),
      row.question.trim(), row.answer.trim(),
      row.question.trim(), row.answer.trim(),
      `${row.question.trim()}\n${row.answer.trim()}`,
      row.category?.trim() || '일반', 'ko', now, now
    )
    if (!error) {
      saved++
      existingQuestions.add(qKey)
    }
  }

  return c.json({
    success: true,
    data: {
      saved, skipped, total: validRows.length,
      message: skipped > 0
        ? `${saved}개 저장, ${skipped}개 중복으로 건너뜀`
        : `${saved}개의 FAQ가 모두 저장되었습니다.`,
    },
  })
})

// ─────────────────────────────────────────
// GET /api/admin/analytics/top10
// ─────────────────────────────────────────
tenant.get('/analytics/top10', async (c) => {
  const tenantId = c.get('tenantId')!
  const period   = c.req.query('period') || 'month'

  const sampleTop10 = [
    { question: '배송 조회는 어떻게 하나요?', count: 45, intent: 'FAQ_INQUIRY' },
    { question: '환불 요청은 어떻게 하나요?', count: 38, intent: 'FAQ_INQUIRY' },
    { question: '결제 오류가 났어요', count: 29, intent: 'COMPLAINT' },
    { question: '교환 신청 방법을 알려주세요', count: 24, intent: 'FAQ_INQUIRY' },
    { question: '배송 기간이 얼마나 걸리나요?', count: 21, intent: 'FAQ_INQUIRY' },
    { question: '회원 탈퇴 방법이 궁금해요', count: 18, intent: 'FAQ_INQUIRY' },
    { question: '포인트 사용 방법은?', count: 15, intent: 'FAQ_INQUIRY' },
    { question: '쿠폰 적용이 안 돼요', count: 13, intent: 'COMPLAINT' },
    { question: '주문 취소 방법을 알려주세요', count: 11, intent: 'FAQ_INQUIRY' },
    { question: '비밀번호를 잊어버렸어요', count: 9, intent: 'FAQ_INQUIRY' },
  ]
  const sampleUnanswered = [
    { question: '해외 배송도 되나요?', count: 17 },
    { question: '법인 구매 가능한가요?', count: 12 },
    { question: '도매 가격 문의합니다', count: 9 },
    { question: '재고 문의드려요', count: 7 },
    { question: '맞춤 제작 가능한가요?', count: 6 },
  ]

  // 기간 필터
  const now = new Date()
  let startISO: string | null = null
  if (period === 'today') {
    startISO = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10) + 'T00:00:00.000Z'
  } else if (period === 'week') {
    startISO = new Date(now.getTime() - 7 * 86400000).toISOString()
  } else if (period === 'month') {
    const m = new Date(Date.now() + 9 * 3600000)
    startISO = `${m.toISOString().slice(0, 7)}-01T00:00:00.000Z`
  }

  const sql    = startISO
    ? 'SELECT user_message, intent, bot_response FROM chat_logs WHERE tenant_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 1000'
    : 'SELECT user_message, intent, bot_response FROM chat_logs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1000'
  const params = startISO ? [tenantId, startISO] : [tenantId]

  const { data: logs } = await dbAll<{ user_message: string; intent: string; bot_response: string }>(c.env, sql, ...params)

  if (!logs || logs.length === 0) {
    return c.json({
      success: true,
      data: { period, top10: sampleTop10, unanswered: sampleUnanswered, total_queries: 0, is_sample: true },
    })
  }

  const freqMap = new Map<string, { count: number; intent: string; answered: boolean }>()
  for (const log of logs) {
    const msg = (log.user_message || '').trim().slice(0, 100)
    if (!msg || msg.length < 2) continue
    const answered = !!(log.bot_response && log.bot_response.length > 10)
    const existing = freqMap.get(msg)
    if (existing) {
      existing.count++
    } else {
      freqMap.set(msg, { count: 1, intent: log.intent || 'UNKNOWN', answered })
    }
  }

  const sorted     = [...freqMap.entries()].sort((a, b) => b[1].count - a[1].count)
  const top10      = sorted.slice(0, 10).map(([question, v]) => ({ question, count: v.count, intent: v.intent }))
  const unanswered = sorted.filter(([, v]) => !v.answered).slice(0, 10).map(([question, v]) => ({ question, count: v.count }))

  return c.json({
    success: true,
    data: {
      period, top10, unanswered, total_queries: logs.length, is_sample: false,
    },
  })
})

export default tenant
