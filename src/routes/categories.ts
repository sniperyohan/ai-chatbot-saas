// =====================================================
// 카테고리 관리 API
// GET    /api/categories          - 카테고리 목록 조회
// POST   /api/categories          - 카테고리 추가
// PUT    /api/categories/:id      - 카테고리 수정
// DELETE /api/categories/:id      - 카테고리 삭제
// =====================================================
import { Hono } from 'hono'
import { dbGet, dbAll, dbRun, generateId, nowISO } from '../lib/db'
import { adminAuthMiddleware } from '../middleware/auth'
import { Bindings, Variables } from '../types'

const categories = new Hono<{ Bindings: Bindings; Variables: Variables }>()
categories.use('*', adminAuthMiddleware)

// ─────────────────────────────────────────
// [1] 카테고리 목록 조회
// GET /api/categories
// ─────────────────────────────────────────
categories.get('/', async (c) => {
  const tenantId = c.get('tenantId')!

  const { data, error } = await dbAll<{
    id: string; name: string; sort_order: number; is_active: number; created_at: string
  }>(c.env,
    `SELECT id, name, sort_order, is_active, created_at
     FROM categories
     WHERE tenant_id = ? AND is_active = 1
     ORDER BY sort_order ASC, created_at ASC`,
    tenantId
  )

  if (error) return c.json({ success: false, error }, 500)

  return c.json({ success: true, data: data || [] })
})

// ─────────────────────────────────────────
// [2] 카테고리 추가
// POST /api/categories
// ─────────────────────────────────────────
categories.post('/', async (c) => {
  const tenantId = c.get('tenantId')!

  let body: { name?: string; sort_order?: number }
  try { body = await c.req.json() }
  catch { return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400) }

  const name = body.name?.trim()
  if (!name) return c.json({ success: false, error: '카테고리 이름을 입력하세요.' }, 400)

  // 중복 체크
  const { data: existing } = await dbGet<{ id: string }>(c.env,
    `SELECT id FROM categories WHERE tenant_id = ? AND name = ? AND is_active = 1`,
    tenantId, name
  )
  if (existing) return c.json({ success: false, error: '이미 존재하는 카테고리입니다.' }, 409)

  // sort_order 자동 계산
  const { data: maxOrder } = await dbGet<{ max_order: number }>(c.env,
    `SELECT MAX(sort_order) as max_order FROM categories WHERE tenant_id = ?`,
    tenantId
  )
  const sortOrder = body.sort_order ?? ((maxOrder?.max_order || 0) + 1)

  const id = generateId()
  const now = nowISO()

  const { error } = await dbRun(c.env,
    `INSERT INTO categories (id, tenant_id, name, sort_order, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?)`,
    id, tenantId, name, sortOrder, now, now
  )

  if (error) return c.json({ success: false, error }, 500)

  return c.json({ success: true, data: { id, name, sort_order: sortOrder } }, 201)
})

// ─────────────────────────────────────────
// [3] 카테고리 수정
// PUT /api/categories/:id
// ─────────────────────────────────────────
categories.put('/:id', async (c) => {
  const tenantId = c.get('tenantId')!
  const id = c.req.param('id')

  let body: { name?: string; sort_order?: number }
  try { body = await c.req.json() }
  catch { return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400) }

  const fields: string[] = []
  const values: any[] = []

  if (body.name?.trim()) {
    fields.push('name = ?')
    values.push(body.name.trim())
  }
  if (body.sort_order !== undefined) {
    fields.push('sort_order = ?')
    values.push(body.sort_order)
  }

  if (fields.length === 0)
    return c.json({ success: false, error: '수정할 내용이 없습니다.' }, 400)

  fields.push('updated_at = ?')
  values.push(nowISO())
  values.push(id, tenantId)

  const { error } = await dbRun(c.env,
    `UPDATE categories SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`,
    ...values
  )

  if (error) return c.json({ success: false, error }, 500)

  return c.json({ success: true, message: '카테고리가 수정되었습니다.' })
})

// ─────────────────────────────────────────
// [4] 카테고리 삭제
// DELETE /api/categories/:id
// ─────────────────────────────────────────
categories.delete('/:id', async (c) => {
  const tenantId = c.get('tenantId')!
  const id = c.req.param('id')

  // 해당 카테고리 사용 중인 FAQ 수 확인
  const { data: usageCount } = await dbGet<{ cnt: number }>(c.env,
    `SELECT COUNT(*) as cnt FROM documents WHERE tenant_id = ? AND category = (
       SELECT name FROM categories WHERE id = ? AND tenant_id = ?
     ) AND is_deleted = 0`,
    tenantId, id, tenantId
  )

  if (usageCount && usageCount.cnt > 0)
    return c.json({
      success: false,
      error: `이 카테고리를 사용 중인 FAQ가 ${usageCount.cnt}개 있습니다. 먼저 FAQ를 다른 카테고리로 변경해주세요.`
    }, 409)

  const { error } = await dbRun(c.env,
    `UPDATE categories SET is_active = 0, updated_at = ? WHERE id = ? AND tenant_id = ?`,
    nowISO(), id, tenantId
  )

  if (error) return c.json({ success: false, error }, 500)

  return c.json({ success: true, message: '카테고리가 삭제되었습니다.' })
})

export default categories
