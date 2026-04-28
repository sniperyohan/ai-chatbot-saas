import { Hono } from 'hono'
import { adminAuthMiddleware } from '../middleware/auth'
import { dbAll, dbGet, dbRun } from '../lib/db'
import { Bindings } from '../types'

const router = new Hono<{ Bindings: Bindings }>()
router.use('*', adminAuthMiddleware)

// GET /api/admin/scenarios
router.get('/', async (c) => {
  const tenant = c.get('tenant')
  const { data } = await dbAll(c.env,
    `SELECT *, type as scenario_type FROM scenarios WHERE tenant_id = ? AND is_active != -1 ORDER BY created_at ASC`,
    tenant.id
  )
  return c.json({ success: true, data: { items: data || [] } })
})

// POST /api/admin/scenarios
router.post('/', async (c) => {
  const tenant = c.get('tenant')
  const body = await c.req.json()
  const { name, type, scenario_type, trigger_keywords, response_template, is_active } = body
  const resolvedType = type || scenario_type

  if (!resolvedType) return c.json({ success: false, error: '타입은 필수입니다.' }, 400)

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const keywords = JSON.stringify(trigger_keywords || [])
  const active = is_active === false ? 0 : 1
  const scenarioName = name || resolvedType

  await dbRun(c.env,
    `INSERT INTO scenarios (id, tenant_id, name, type, trigger_keywords, response_template, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, tenant.id, scenarioName, resolvedType, keywords, response_template || '', active, now, now
  )

  return c.json({ success: true, data: { id } })
})

// PUT /api/admin/scenarios/:id
router.put('/:id', async (c) => {
  const tenant = c.get('tenant')
  const id = c.req.param('id')
  const body = await c.req.json()
  const { name, type, scenario_type, trigger_keywords, response_template, is_active } = body
  const putType = type || scenario_type

  const existing = await dbGet(c.env,
    `SELECT id FROM scenarios WHERE id = ? AND tenant_id = ?`,
    id, tenant.id
  )
  if (!existing) return c.json({ success: false, error: '시나리오를 찾을 수 없습니다.' }, 404)

  const now = new Date().toISOString()
  const keywords = JSON.stringify(trigger_keywords || [])
  const active = is_active === false ? 0 : 1
  const scenarioName = name || putType

  await dbRun(c.env,
    `UPDATE scenarios SET name=?, type=?, trigger_keywords=?, response_template=?, is_active=?, updated_at=? WHERE id=? AND tenant_id=?`,
    scenarioName, putType, keywords, response_template || '', active, now, id, tenant.id
  )

  return c.json({ success: true })
})

// DELETE /api/admin/scenarios/:id (소프트 삭제)
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
