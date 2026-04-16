// =====================================================
// 통계 / 로그 라우터 - Cloudflare D1 버전
// GET /api/admin/stats  - 대시보드 통계
// GET /api/admin/logs   - 대화 로그 목록
// =====================================================
import { Hono } from 'hono'
import { dbGet, dbAll } from '../lib/db'
import { adminAuthMiddleware } from '../middleware/auth'
import { Bindings, Variables } from '../types'

const stats = new Hono<{ Bindings: Bindings; Variables: Variables }>()
stats.use('*', adminAuthMiddleware)

// KST 날짜 유틸
function getKSTToday(): string {
  const now = new Date(Date.now() + 9 * 3600000)
  return now.toISOString().slice(0, 10)
}

function getKSTMonthStart(): string {
  const now = new Date(Date.now() + 9 * 3600000)
  return `${now.toISOString().slice(0, 7)}-01`
}

function toKSTString(utcStr: string): string {
  if (!utcStr) return ''
  const d   = new Date(utcStr)
  const kst = new Date(d.getTime() + 9 * 3600000)
  return kst.toISOString().replace('T', ' ').slice(0, 19) + ' KST'
}

// ─────────────────────────────────────────
// [1] 대시보드 통계
// GET /api/admin/stats
// ─────────────────────────────────────────
stats.get('/stats', async (c) => {
  const tenantId  = c.get('tenantId')!
  const today     = getKSTToday()
  const monthStart = getKSTMonthStart()
  const yesterday = new Date(Date.now() + 9 * 3600000 - 86400000)
    .toISOString()
    .slice(0, 10)

  const [todayRes, yesterdayRes, monthRes, totalRes, faqRes, channelRes, intentRes, recentRes] =
    await Promise.all([
      dbGet<{ cnt: number }>(c.env,
        "SELECT COUNT(*) as cnt FROM chat_logs WHERE tenant_id = ? AND created_at >= ?",
        tenantId, `${today}T00:00:00.000Z`
      ),
      dbGet<{ cnt: number }>(c.env,
        "SELECT COUNT(*) as cnt FROM chat_logs WHERE tenant_id = ? AND created_at >= ? AND created_at < ?",
        tenantId, `${yesterday}T00:00:00.000Z`, `${today}T00:00:00.000Z`
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
      dbAll<{ channel: string; cnt: number }>(c.env,
        'SELECT channel, COUNT(*) as cnt FROM chat_logs WHERE tenant_id = ? GROUP BY channel',
        tenantId
      ),
      dbAll<{ intent: string; cnt: number }>(c.env,
        'SELECT intent, COUNT(*) as cnt FROM chat_logs WHERE tenant_id = ? GROUP BY intent',
        tenantId
      ),
      dbAll<{ id: string; created_at: string; channel: string; user_message: string; intent: string }>(c.env,
        'SELECT id, created_at, channel, user_message, intent FROM chat_logs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 5',
        tenantId
      ),
    ])

  const todayCount     = todayRes.data?.cnt     || 0
  const yesterdayCount = yesterdayRes.data?.cnt  || 0
  const monthCount     = monthRes.data?.cnt      || 0
  const totalCount     = totalRes.data?.cnt      || 0
  const faqCount       = faqRes.data?.cnt        || 0
  const recentLogs     = recentRes.data          || []

  const channelStats: Record<string, number> = {}
  for (const row of (channelRes.data || [])) channelStats[row.channel || 'web'] = row.cnt
  const intentStats: Record<string, number> = {}
  for (const row of (intentRes.data || []))  intentStats[row.intent   || 'OTHER'] = row.cnt

  const growthRate = yesterdayCount > 0
    ? Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100)
    : (todayCount > 0 ? 100 : 0)

  return c.json({
    success: true,
    data: {
      today_count:       todayCount,
      yesterday_count:   yesterdayCount,
      month_count:       monthCount,
      total_count:       totalCount,
      faq_count:         faqCount,
      growth_rate_today: growthRate,
      channel_stats:     channelStats,
      intent_stats:      intentStats,
      recent_logs:       recentLogs.map(l => ({
        ...l,
        created_at_kst: toKSTString(l.created_at),
      })),
      generated_at: new Date(Date.now() + 9 * 3600000).toISOString(),
    },
    cached: false,
  })
})

// ─────────────────────────────────────────
// [2] 대화 로그 목록
// GET /api/admin/logs
// ─────────────────────────────────────────
stats.get('/logs', async (c) => {
  const tenantId = c.get('tenantId')!
  const page     = Math.max(1, parseInt(c.req.query('page')  || '1'))
  const limit    = Math.min(100, parseInt(c.req.query('limit') || '20'))
  const channel  = c.req.query('channel')
  const intent   = c.req.query('intent')
  const dateFrom = c.req.query('date_from')
  const dateTo   = c.req.query('date_to')
  const offset   = (page - 1) * limit

  const conditions: string[] = ['tenant_id = ?']
  const params: unknown[]    = [tenantId]

  if (channel)  { conditions.push('channel = ?');                      params.push(channel) }
  if (intent)   { conditions.push('intent = ?');                       params.push(intent) }
  if (dateFrom) { conditions.push('created_at >= ?');                  params.push(`${dateFrom}T00:00:00.000Z`) }
  if (dateTo)   { conditions.push('created_at <= ?');                  params.push(`${dateTo}T23:59:59.999Z`) }

  const where = `WHERE ${conditions.join(' AND ')}`

  const [rowsRes, countRes] = await Promise.all([
    dbAll<{
      id: string; message_id: string; channel: string
      user_message: string; bot_answer: string
      detected_language: string; intent: string; created_at: string
    }>(c.env,
      `SELECT id, message_id, channel, user_message, bot_answer, detected_language, intent, created_at
       FROM chat_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      ...params, limit, offset
    ),
    dbGet<{ total: number }>(c.env,
      `SELECT COUNT(*) as total FROM chat_logs ${where}`, ...params
    ),
  ])

  if (rowsRes.error) return c.json({ success: false, error: rowsRes.error }, 500)

  const items = (rowsRes.data || []).map(log => ({
    ...log,
    created_at_kst: toKSTString(log.created_at),
  }))

  return c.json({
    success: true,
    data: {
      items,
      total:      countRes.data?.total || 0,
      page,
      limit,
      totalPages: Math.ceil((countRes.data?.total || 0) / limit),
    },
  })
})

export default stats
