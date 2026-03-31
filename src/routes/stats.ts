// =====================================================
// 통계 / 로그 라우터 (JWT 필요)
// GET /api/admin/stats  - 대시보드 통계
// GET /api/admin/logs   - 대화 로그 목록
// =====================================================
import { Hono } from 'hono'
import { createSupabaseAdmin } from '../lib/supabase'
import { adminAuthMiddleware } from '../middleware/auth'
import { Bindings, Variables } from '../types'

const stats = new Hono<{ Bindings: Bindings; Variables: Variables }>()
stats.use('*', adminAuthMiddleware)

function isSupabaseConfigured(env: Bindings): boolean {
  return (
    !!env.SUPABASE_URL &&
    !env.SUPABASE_URL.includes('your-project') &&
    !!env.SUPABASE_SERVICE_KEY &&
    !env.SUPABASE_SERVICE_KEY.includes('your_supabase')
  )
}

// 로컬 테스트 계정 stats 데이터
const LOCAL_STATS: Record<string, any> = {
  'local-test-basic': { today: 5, yesterday: 3, month: 87, total: 312, faq: 12 },
  'local-test-pro':   { today: 24, yesterday: 18, month: 456, total: 2100, faq: 85 },
  'local-test-master':{ today: 102, yesterday: 89, month: 1850, total: 18900, faq: 320 },
}

// 간단한 메모리 캐시 (1시간)
const statsCache = new Map<string, { data: unknown; expireAt: number }>()

function getCache(key: string): unknown | null {
  const entry = statsCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expireAt) {
    statsCache.delete(key)
    return null
  }
  return entry.data
}

function setCache(key: string, data: unknown, ttlMs = 3600000) {
  statsCache.set(key, { data, expireAt: Date.now() + ttlMs })
}

// KST 날짜 유틸
function getKSTToday(): string {
  const now = new Date(Date.now() + 9 * 3600000)
  return now.toISOString().slice(0, 10)
}

function getKSTMonthStart(): string {
  const now = new Date(Date.now() + 9 * 3600000)
  return `${now.toISOString().slice(0, 7)}-01`
}

// ─────────────────────────────────────────
// [1] 대시보드 통계
// GET /api/admin/stats
// ─────────────────────────────────────────
stats.get('/stats', async (c) => {
  const tenantId = c.get('tenantId')!
  const cacheKey = `stats_${tenantId}`

  // 로컬 fallback: 테스트 계정이거나 Supabase 미설정
  const localData = LOCAL_STATS[tenantId]
  if (localData || !isSupabaseConfigured(c.env)) {
    const d = localData || { today: 0, yesterday: 0, month: 0, total: 0, faq: 0 }
    const growthRate = d.yesterday > 0 ? Math.round(((d.today - d.yesterday) / d.yesterday) * 100) : (d.today > 0 ? 100 : 0)
    const now = new Date()
    return c.json({
      success: true,
      data: {
        today_count: d.today,
        yesterday_count: d.yesterday,
        month_count: d.month,
        total_count: d.total,
        faq_count: d.faq,
        growth_rate_today: growthRate,
        channel_stats: { web: d.today },
        intent_stats: { FAQ_INQUIRY: Math.round(d.today * 0.6), GREETING: Math.round(d.today * 0.2), OTHER: Math.round(d.today * 0.2) },
        recent_logs: [
          { id: 'r1', created_at_kst: new Date(now.getTime()).toISOString().replace('T', ' ').slice(0,16), channel: 'web', user_message: '배송은 언제 되나요?', intent: 'FAQ_INQUIRY' },
          { id: 'r2', created_at_kst: new Date(now.getTime()-60000).toISOString().replace('T', ' ').slice(0,16), channel: 'web', user_message: '반품 방법을 알려주세요.', intent: 'FAQ_INQUIRY' },
          { id: 'r3', created_at_kst: new Date(now.getTime()-120000).toISOString().replace('T', ' ').slice(0,16), channel: 'web', user_message: '안녕하세요!', intent: 'GREETING' },
          { id: 'r4', created_at_kst: new Date(now.getTime()-300000).toISOString().replace('T', ' ').slice(0,16), channel: 'web', user_message: '결제 오류가 발생했어요.', intent: 'COMPLAINT' },
          { id: 'r5', created_at_kst: new Date(now.getTime()-600000).toISOString().replace('T', ' ').slice(0,16), channel: 'web', user_message: '교환 신청하고 싶어요.', intent: 'FAQ_INQUIRY' },
        ],
        generated_at: now.toISOString(),
      },
      cached: false,
    })
  }

  const cached = getCache(cacheKey)
  if (cached) {
    return c.json({ success: true, data: cached, cached: true })
  }

  const supabase = createSupabaseAdmin(c.env)
  const today = getKSTToday()
  const monthStart = getKSTMonthStart()

  // 오늘 대화수
  const { count: todayCount } = await supabase
    .from('chat_logs')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('created_at', `${today}T00:00:00+09:00`)
    .lte('created_at', `${today}T23:59:59+09:00`)

  // 이번 달 대화수
  const { count: monthCount } = await supabase
    .from('chat_logs')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('created_at', `${monthStart}T00:00:00+09:00`)

  // 전체 대화수
  const { count: totalCount } = await supabase
    .from('chat_logs')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)

  // FAQ 등록수
  const { count: faqCount } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('is_deleted', false)

  // 채널별 대화수
  const { data: channelData } = await supabase
    .from('chat_logs')
    .select('channel')
    .eq('tenant_id', tenantId)

  const channelStats: Record<string, number> = {}
  for (const row of channelData || []) {
    channelStats[row.channel] = (channelStats[row.channel] || 0) + 1
  }

  // 의도별 분류수
  const { data: intentData } = await supabase
    .from('chat_logs')
    .select('intent')
    .eq('tenant_id', tenantId)

  const intentStats: Record<string, number> = {}
  for (const row of intentData || []) {
    intentStats[row.intent] = (intentStats[row.intent] || 0) + 1
  }

  // 어제 대화수 (증감률 계산)
  const yesterday = new Date(Date.now() + 9 * 3600000 - 86400000)
    .toISOString()
    .slice(0, 10)

  const { count: yesterdayCount } = await supabase
    .from('chat_logs')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('created_at', `${yesterday}T00:00:00+09:00`)
    .lte('created_at', `${yesterday}T23:59:59+09:00`)

  const growthRate =
    (yesterdayCount || 0) === 0
      ? 100
      : Math.round((((todayCount || 0) - (yesterdayCount || 0)) / (yesterdayCount || 1)) * 100)

  const result = {
    today_count: todayCount || 0,
    month_count: monthCount || 0,
    total_count: totalCount || 0,
    faq_count: faqCount || 0,
    channel_stats: channelStats,
    intent_stats: intentStats,
    growth_rate_today: growthRate,
    yesterday_count: yesterdayCount || 0,
    generated_at: new Date(Date.now() + 9 * 3600000).toISOString(),
  }

  setCache(cacheKey, result)

  return c.json({ success: true, data: result, cached: false })
})

// ─────────────────────────────────────────
// [2] 대화 로그 목록
// GET /api/admin/logs?page=1&limit=20&channel=web&intent=FAQ_INQUIRY&date_from=&date_to=
// ─────────────────────────────────────────
stats.get('/logs', async (c) => {
  const tenantId = c.get('tenantId')!

  // 로컬 fallback
  if (!isSupabaseConfigured(c.env) || LOCAL_STATS[tenantId]) {
    return c.json({
      success: true,
      data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 },
    })
  }

  const supabase = createSupabaseAdmin(c.env)

  const page = parseInt(c.req.query('page') || '1')
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100)
  const channel = c.req.query('channel')
  const intent = c.req.query('intent')
  const dateFrom = c.req.query('date_from')
  const dateTo = c.req.query('date_to')

  const offset = (page - 1) * limit

  let query = supabase
    .from('chat_logs')
    .select(
      'id, message_id, channel, user_message, bot_answer, detected_language, intent, created_at',
      { count: 'exact' }
    )
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (channel) query = query.eq('channel', channel)
  if (intent) query = query.eq('intent', intent)
  if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00+09:00`)
  if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59+09:00`)

  const { data, count, error } = await query

  if (error) {
    return c.json({ success: false, error: error.message }, 500)
  }

  // KST 변환 표시용
  const items = (data || []).map((log) => ({
    ...log,
    created_at_kst: toKSTString(log.created_at),
  }))

  return c.json({
    success: true,
    data: {
      items,
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    },
  })
})

function toKSTString(utcStr: string): string {
  if (!utcStr) return ''
  const d = new Date(utcStr)
  const kst = new Date(d.getTime() + 9 * 3600000)
  return kst.toISOString().replace('T', ' ').slice(0, 19) + ' KST'
}

export default stats
