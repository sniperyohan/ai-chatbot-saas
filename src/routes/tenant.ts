// =====================================================
// 테넌트 자체 정보 + 시나리오 라우터 (JWT 필요)
// GET  /api/admin/me
// PUT  /api/admin/me
// GET  /api/admin/scenarios
// POST /api/admin/scenarios
// PUT  /api/admin/scenarios/:id
// =====================================================
import { Hono } from 'hono'
import { createSupabaseAdmin } from '../lib/supabase'
import { adminAuthMiddleware } from '../middleware/auth'
import { Bindings, Variables } from '../types'

const tenant = new Hono<{ Bindings: Bindings; Variables: Variables }>()
tenant.use('*', adminAuthMiddleware)

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

export default tenant
