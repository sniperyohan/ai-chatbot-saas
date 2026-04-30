import { Hono } from 'hono'
import { adminAuthMiddleware } from '../middleware/auth'
import { dbAll, dbGet, dbRun } from '../lib/db'
import { Bindings } from '../types'

const router = new Hono<{ Bindings: Bindings }>()
router.use('*', adminAuthMiddleware)

// ─────────────────────────────────────────────
// 요금제별 시나리오 한도
// ─────────────────────────────────────────────
const PLAN_LIMITS: Record<string, { scenarios: number; responses: number }> = {
  basic:  { scenarios: 5,           responses: 1 },           // 단일 응답
  pro:    { scenarios: 15,          responses: 5 },           // 랜덤 응답 최대 5개
  master: { scenarios: Number.MAX_SAFE_INTEGER, responses: Number.MAX_SAFE_INTEGER }, // 무제한
}

function getPlanLimit(plan?: string) {
  const p = (plan || 'basic').toLowerCase()
  return PLAN_LIMITS[p] || PLAN_LIMITS.basic
}

// 응답 템플릿을 JSON 배열로 정규화
// - 입력이 string이면 [string]
// - 입력이 string[]이면 그대로
// - 빈 값은 빈 배열
function normalizeResponses(input: any): string[] {
  if (Array.isArray(input)) {
    return input.filter(r => typeof r === 'string' && r.trim().length > 0)
  }
  if (typeof input === 'string' && input.trim().length > 0) {
    return [input]
  }
  return []
}

// ─────────────────────────────────────────────
// GET /api/admin/scenarios - 시나리오 목록
// ─────────────────────────────────────────────
router.get('/', async (c) => {
  const tenant = c.get('tenant')
  const { data } = await dbAll(c.env,
    `SELECT *, type as scenario_type FROM scenarios
     WHERE tenant_id = ? AND is_active != -1
     ORDER BY sort_order ASC, created_at ASC`,
    tenant.id
  )

  // response_template을 배열로 파싱해서 응답
  const items = (data || []).map((s: any) => {
    let responses: string[] = []
    try {
      const parsed = JSON.parse(s.response_template || '""')
      responses = Array.isArray(parsed)
        ? parsed.filter((r: any) => typeof r === 'string')
        : (typeof parsed === 'string' && parsed ? [parsed] : [])
    } catch {
      responses = s.response_template ? [s.response_template] : []
    }
    return {
      ...s,
      responses,                          // 새 필드: 배열
      response_template: s.response_template || '',  // 호환용 유지
    }
  })

  // 현재 요금제 제한 정보도 함께 반환 (프론트에서 활용)
  const limit = getPlanLimit(tenant.plan)

  return c.json({
    success: true,
    data: {
      items,
      plan: (tenant.plan || 'basic').toLowerCase(),
      limit: {
        scenarios: limit.scenarios === Number.MAX_SAFE_INTEGER ? null : limit.scenarios,
        responses: limit.responses === Number.MAX_SAFE_INTEGER ? null : limit.responses,
      },
    },
  })
})

// ─────────────────────────────────────────────
// POST /api/admin/scenarios - 시나리오 추가
// ─────────────────────────────────────────────
router.post('/', async (c) => {
  const tenant = c.get('tenant')
  const body = await c.req.json()
  const {
    name, type, scenario_type,
    trigger_keywords,
    response_template, responses,
    icon, description, color, sort_order,
    is_active,
  } = body

  const resolvedType = type || scenario_type
  if (!resolvedType) return c.json({ success: false, error: '타입은 필수입니다.' }, 400)

  // 요금제 한도 체크
  const limit = getPlanLimit(tenant.plan)
  const { data: existingList } = await dbAll(c.env,
    `SELECT id FROM scenarios WHERE tenant_id = ? AND is_active != -1`,
    tenant.id
  )
  if ((existingList?.length || 0) >= limit.scenarios) {
    return c.json({
      success: false,
      error: `현재 요금제(${(tenant.plan || 'basic').toUpperCase()})의 시나리오 한도(${limit.scenarios}개)를 초과했습니다. 더 많은 시나리오가 필요하면 요금제를 업그레이드하세요.`,
    }, 400)
  }

  // 응답 정규화 + 한도 체크
  let respArray = normalizeResponses(responses ?? response_template)
  if (respArray.length > limit.responses) {
    respArray = respArray.slice(0, limit.responses)
  }

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const keywordsJson = JSON.stringify(trigger_keywords || [])
  const responsesJson = JSON.stringify(respArray)
  const active = is_active === false ? 0 : 1
  const scenarioName = name || resolvedType
  const finalIcon = icon || '💬'
  const finalDesc = description || ''
  const finalColor = color || '#10B981'
  const finalSort = typeof sort_order === 'number' ? sort_order : 0

  await dbRun(c.env,
    `INSERT INTO scenarios
     (id, tenant_id, name, type, trigger_keywords, response_template,
      icon, description, color, sort_order,
      is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, tenant.id, scenarioName, resolvedType, keywordsJson, responsesJson,
    finalIcon, finalDesc, finalColor, finalSort,
    active, now, now
  )

  return c.json({ success: true, data: { id } })
})

// ─────────────────────────────────────────────
// PUT /api/admin/scenarios/:id - 시나리오 수정
// ─────────────────────────────────────────────
router.put('/:id', async (c) => {
  const tenant = c.get('tenant')
  const id = c.req.param('id')
  const body = await c.req.json()
  const {
    name, type, scenario_type,
    trigger_keywords,
    response_template, responses,
    icon, description, color, sort_order,
    is_active,
  } = body

  const putType = type || scenario_type

  const existing = await dbGet<{ id: string }>(c.env,
    `SELECT id FROM scenarios WHERE id = ? AND tenant_id = ?`,
    id, tenant.id
  )
  if (!existing) return c.json({ success: false, error: '시나리오를 찾을 수 없습니다.' }, 404)

  // 응답 정규화 + 한도 체크
  const limit = getPlanLimit(tenant.plan)
  let respArray = normalizeResponses(responses ?? response_template)
  if (respArray.length > limit.responses) {
    respArray = respArray.slice(0, limit.responses)
  }

  const now = new Date().toISOString()
  const keywordsJson = JSON.stringify(trigger_keywords || [])
  const responsesJson = JSON.stringify(respArray)
  const active = is_active === false ? 0 : 1
  const scenarioName = name || putType
  const finalIcon = icon || '💬'
  const finalDesc = description || ''
  const finalColor = color || '#10B981'
  const finalSort = typeof sort_order === 'number' ? sort_order : 0

  await dbRun(c.env,
    `UPDATE scenarios SET
       name=?, type=?, trigger_keywords=?, response_template=?,
       icon=?, description=?, color=?, sort_order=?,
       is_active=?, updated_at=?
     WHERE id=? AND tenant_id=?`,
    scenarioName, putType, keywordsJson, responsesJson,
    finalIcon, finalDesc, finalColor, finalSort,
    active, now, id, tenant.id
  )

  return c.json({ success: true })
})

// ─────────────────────────────────────────────
// DELETE /api/admin/scenarios/:id - 소프트 삭제
// ─────────────────────────────────────────────
router.delete('/:id', async (c) => {
  const tenant = c.get('tenant')
  const id = c.req.param('id')
  const now = new Date().toISOString()

  await dbRun(c.env,
    `UPDATE scenarios SET is_active = -1, updated_at = ? WHERE id = ? AND tenant_id = ?`,
    now, id, tenant.id
  )
  return c.json({ success: true })
})

export default router
