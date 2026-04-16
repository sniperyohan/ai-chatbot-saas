// =====================================================
// 슈퍼관리자 라우터 - Cloudflare D1 버전
// GET    /api/super/dashboard
// GET    /api/super/tenants
// POST   /api/super/tenants
// PUT    /api/super/tenants/:id
// PUT    /api/super/tenants/:id/plan
// PUT    /api/super/tenants/:id/status
// DELETE /api/super/tenants/:id
// POST   /api/super/tenants/:id/reset-password
// POST   /api/super/tenants/:id/extend
// POST   /api/super/tenants/:id/confirm-payment
// GET    /api/super/plans
// PUT    /api/super/plans/:id
// PUT    /api/super/password
// GET    /api/super/platform-apis
// POST   /api/super/platform-apis
// PUT    /api/super/platform-apis/:id
// GET    /api/super/payment-settings
// PUT    /api/super/payment-settings
// GET    /api/super/check-expired
// GET    /api/super/init-db-public
// =====================================================
import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { dbGet, dbAll, dbRun, dbBatch, generateId, nowISO } from '../lib/db'
import { superAuthMiddleware } from '../middleware/auth'
import { Bindings, Variables } from '../types'

const superRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>()

const SALT_ROUNDS = 12

// ─── 요금제 정의 ──────────────────────────────────────
const PLANS: Record<string, { faq_limit: number; chat_limit: number; price: number }> = {
  basic:  { faq_limit: 50,   chat_limit: 1000, price: 99000  },
  pro:    { faq_limit: 200,  chat_limit: 5000, price: 199000 },
  master: { faq_limit: -1,   chat_limit: -1,   price: 399000 },
}

// ─── DB init 엔드포인트 (공개, secret 쿼리 필요) ──────
superRouter.get('/init-db-public', async (c) => {
  const secret = c.req.query('secret')
  if (secret !== 'init-2026')
    return c.json({ success: false, error: '접근 불가' }, 403)
  if (!c.env.DB)
    return c.json({ success: false, error: 'D1 DB가 바인딩되지 않았습니다.' }, 503)

  const results: Record<string, string> = {}

  // 테이블 존재 확인
  for (const t of ['admins','plans','tenants','payment_settings','platform_apis','chat_logs','documents','integrations']) {
    const { error } = await dbGet(c.env, `SELECT 1 FROM ${t} LIMIT 1`)
    results[t] = error ? `⚠️ ${error}` : '✅ 접근 가능'
  }

  // plans 시드
  for (const p of [
    { plan_name: 'basic',  price: 99000,  faq_limit: 50,  chat_limit: 1000, description: 'FAQ 50개, 월 1,000회 답변' },
    { plan_name: 'pro',    price: 199000, faq_limit: 200, chat_limit: 5000, description: 'FAQ 200개, 월 5,000회 답변' },
    { plan_name: 'master', price: 399000, faq_limit: -1,  chat_limit: -1,   description: 'FAQ 무제한, 월 답변 무제한' },
  ]) {
    await dbRun(c.env,
      'INSERT OR IGNORE INTO plans (id,plan_name,price,faq_limit,chat_limit,description) VALUES (?,?,?,?,?,?)',
      generateId(), p.plan_name, p.price, p.faq_limit, p.chat_limit, p.description
    )
  }
  results['plans_seed'] = '✅ 완료'

  // 슈퍼관리자 시드
  const email = c.env.LOCAL_SUPER_ADMIN_EMAIL || ''
  const hash  = c.env.LOCAL_SUPER_ADMIN_PASSWORD_HASH || ''
  if (email && hash) {
    const { error } = await dbRun(c.env,
      'INSERT OR IGNORE INTO admins (id,email,password,role) VALUES (?,?,?,?)',
      generateId(), email, hash, 'super_admin'
    )
    results['admin_seed'] = error ? `⚠️ ${error}` : `✅ 슈퍼관리자 생성 (${email})`
  } else {
    results['admin_seed'] = '⚠️ LOCAL_SUPER_ADMIN_EMAIL / LOCAL_SUPER_ADMIN_PASSWORD_HASH 미설정'
  }

  return c.json({ success: true, results })
})

// ─── 이하 모든 라우트에 슈퍼 JWT 인증 필요 ───────────
superRouter.use('*', superAuthMiddleware)

// ─────────────────────────────────────────
// GET /api/super/dashboard
// ─────────────────────────────────────────
superRouter.get('/dashboard', async (c) => {
  const { data: tenantCount }  = await dbGet<{ total: number }>(c.env, 'SELECT COUNT(*) as total FROM tenants WHERE is_deleted = 0')
  const { data: activeCount }  = await dbGet<{ total: number }>(c.env, 'SELECT COUNT(*) as total FROM tenants WHERE is_deleted = 0 AND is_active = 1')
  const { data: chatCount }    = await dbGet<{ total: number }>(c.env, 'SELECT COUNT(*) as total FROM chat_logs')
  const { data: docCount }     = await dbGet<{ total: number }>(c.env, 'SELECT COUNT(*) as total FROM documents WHERE is_active = 1')
  const { data: planRows }     = await dbAll<{ plan: string; cnt: number }>(c.env,
    'SELECT plan, COUNT(*) as cnt FROM tenants WHERE is_deleted = 0 GROUP BY plan'
  )
  const { data: recentTenants } = await dbAll(c.env,
    'SELECT id, company_name, email, plan, is_active, created_at FROM tenants WHERE is_deleted = 0 ORDER BY created_at DESC LIMIT 5'
  )

  const planStats: Record<string, number> = {}
  for (const row of planRows || []) planStats[row.plan] = row.cnt

  // 월 매출 계산
  const totalRevenue = Object.entries(planStats).reduce((sum, [plan, cnt]) => {
    return sum + (PLANS[plan]?.price || 0) * cnt
  }, 0)

  return c.json({
    success: true,
    data: {
      stats: {
        totalTenants:  tenantCount?.total  || 0,
        activeTenants: activeCount?.total  || 0,
        totalChats:    chatCount?.total    || 0,
        totalDocuments: docCount?.total    || 0,
        monthlyRevenue: totalRevenue,
      },
      planStats,
      recentTenants: recentTenants || [],
    },
  })
})

// ─────────────────────────────────────────
// GET /api/super/tenants
// ─────────────────────────────────────────
superRouter.get('/tenants', async (c) => {
  const page   = parseInt(c.req.query('page')   || '1')
  const limit  = parseInt(c.req.query('limit')  || '20')
  const search = c.req.query('search') || ''
  const plan   = c.req.query('plan')   || ''
  const status = c.req.query('status') || ''

  const conditions: string[] = ['is_deleted = 0']
  const params: unknown[]    = []

  if (search) {
    conditions.push('(company_name LIKE ? OR email LIKE ?)')
    params.push(`%${search}%`, `%${search}%`)
  }
  if (plan)   { conditions.push('plan = ?');      params.push(plan) }
  if (status === 'active')   { conditions.push('is_active = 1') }
  if (status === 'inactive') { conditions.push('is_active = 0') }

  const where  = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const offset = (page - 1) * limit

  const { data: tenants, error } = await dbAll(c.env,
    `SELECT id, company_name, email, plan, is_active, is_temp_password,
            billing_day, subscribed_at, subscription_end_date,
            faq_limit, chat_limit, created_at, updated_at
     FROM tenants ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ...params, limit, offset
  )
  if (error) return c.json({ success: false, error: `고객사 목록 조회 실패: ${error}` }, 500)

  const { data: countRow } = await dbGet<{ total: number }>(c.env,
    `SELECT COUNT(*) as total FROM tenants ${where}`, ...params
  )

  return c.json({
    success: true,
    data: tenants || [],
    meta: { total: countRow?.total || 0, page, limit },
  })
})

// ─────────────────────────────────────────
// POST /api/super/tenants
// ─────────────────────────────────────────
superRouter.post('/tenants', async (c) => {
  let body: any
  try { body = await c.req.json() }
  catch { return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400) }

  const { company_name, email, password, plan = 'basic', billing_day = 1 } = body
  if (!company_name || !email || !password)
    return c.json({ success: false, error: '필수 항목을 입력하세요.' }, 400)

  const normalizedEmail = email.toLowerCase().trim()

  // 중복 확인
  const { data: existing } = await dbGet(c.env,
    'SELECT id FROM tenants WHERE email = ? AND is_deleted = 0 LIMIT 1', normalizedEmail
  )
  if (existing) return c.json({ success: false, error: '이미 등록된 이메일입니다.' }, 409)

  const { data: existAdmin } = await dbGet(c.env,
    'SELECT id FROM admins WHERE email = ? LIMIT 1', normalizedEmail
  )
  if (existAdmin) return c.json({ success: false, error: '이미 관리자로 등록된 이메일입니다.' }, 409)

  const planInfo = PLANS[plan] || PLANS.basic
  const hashed   = await bcrypt.hash(password, SALT_ROUNDS)
  const id       = generateId()
  const now      = nowISO()
  const subStart = new Date().toISOString().slice(0, 10)
  const subEnd   = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { error } = await dbRun(c.env,
    `INSERT INTO tenants
      (id, company_name, email, password, plan, billing_day,
       faq_limit, chat_limit, subscribed_at, subscription_start_date, subscription_end_date,
       is_active, is_deleted, is_temp_password, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,1,0,1,?,?)`,
    id, company_name, normalizedEmail, hashed, plan, billing_day,
    planInfo.faq_limit, planInfo.chat_limit,
    subStart, subStart, subEnd, now, now
  )
  if (error) return c.json({ success: false, error: `고객사 생성 실패: ${error}` }, 500)

  // 요금제 이력 기록
  await dbRun(c.env,
    'INSERT INTO plan_history (id,tenant_id,old_plan,new_plan,changed_by,memo) VALUES (?,?,?,?,?,?)',
    generateId(), id, 'none', plan, 'super_admin', '신규 고객사 생성'
  )

  const { data: newTenant } = await dbGet(c.env, 'SELECT * FROM tenants WHERE id = ? LIMIT 1', id)
  return c.json({ success: true, data: newTenant }, 201)
})

// ─────────────────────────────────────────
// PUT /api/super/tenants/:id
// ─────────────────────────────────────────
superRouter.put('/tenants/:id', async (c) => {
  const tenantId = c.req.param('id')
  let body: any
  try { body = await c.req.json() }
  catch { return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400) }

  const { data: tenant } = await dbGet(c.env,
    'SELECT id FROM tenants WHERE id = ? AND is_deleted = 0 LIMIT 1', tenantId
  )
  if (!tenant) return c.json({ success: false, error: '고객사를 찾을 수 없습니다.' }, 404)

  const fields: string[] = []
  const values: unknown[] = []

  const allowed = ['company_name','bot_name','widget_color','greeting_message',
                   'fallback_message','billing_day','payment_memo','system_prompt']
  for (const key of allowed) {
    if (body[key] !== undefined) { fields.push(`${key} = ?`); values.push(body[key]) }
  }
  if (!fields.length)
    return c.json({ success: false, error: '변경할 항목이 없습니다.' }, 400)

  fields.push('updated_at = ?'); values.push(nowISO())
  values.push(tenantId)

  const { error } = await dbRun(c.env,
    `UPDATE tenants SET ${fields.join(', ')} WHERE id = ?`, ...values
  )
  if (error) return c.json({ success: false, error: `수정 실패: ${error}` }, 500)

  const { data: updated } = await dbGet(c.env, 'SELECT * FROM tenants WHERE id = ? LIMIT 1', tenantId)
  return c.json({ success: true, data: updated })
})

// ─────────────────────────────────────────
// PUT /api/super/tenants/:id/plan
// ─────────────────────────────────────────
superRouter.put('/tenants/:id/plan', async (c) => {
  const tenantId = c.req.param('id')
  let body: { plan?: string; memo?: string }
  try { body = await c.req.json() }
  catch { return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400) }

  const newPlan = body.plan
  if (!newPlan || !PLANS[newPlan])
    return c.json({ success: false, error: '유효하지 않은 요금제입니다.' }, 400)

  const { data: tenant } = await dbGet<{ id: string; plan: string }>(c.env,
    'SELECT id, plan FROM tenants WHERE id = ? AND is_deleted = 0 LIMIT 1', tenantId
  )
  if (!tenant) return c.json({ success: false, error: '고객사를 찾을 수 없습니다.' }, 404)

  const planInfo = PLANS[newPlan]
  const { error } = await dbRun(c.env,
    'UPDATE tenants SET plan = ?, faq_limit = ?, chat_limit = ?, updated_at = ? WHERE id = ?',
    newPlan, planInfo.faq_limit, planInfo.chat_limit, nowISO(), tenantId
  )
  if (error) return c.json({ success: false, error: `요금제 변경 실패: ${error}` }, 500)

  await dbRun(c.env,
    'INSERT INTO plan_history (id,tenant_id,old_plan,new_plan,changed_by,memo) VALUES (?,?,?,?,?,?)',
    generateId(), tenantId, tenant.plan, newPlan, 'super_admin', body.memo || ''
  )

  return c.json({ success: true, message: `요금제가 ${newPlan}으로 변경되었습니다.` })
})

// ─────────────────────────────────────────
// PUT /api/super/tenants/:id/status
// ─────────────────────────────────────────
superRouter.put('/tenants/:id/status', async (c) => {
  const tenantId = c.req.param('id')
  let body: { is_active?: boolean }
  try { body = await c.req.json() }
  catch { return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400) }

  if (body.is_active === undefined)
    return c.json({ success: false, error: 'is_active 값을 입력하세요.' }, 400)

  const { error } = await dbRun(c.env,
    'UPDATE tenants SET is_active = ?, updated_at = ? WHERE id = ? AND is_deleted = 0',
    body.is_active ? 1 : 0, nowISO(), tenantId
  )
  if (error) return c.json({ success: false, error: `상태 변경 실패: ${error}` }, 500)

  return c.json({ success: true, message: `계정이 ${body.is_active ? '활성화' : '비활성화'}되었습니다.` })
})

// ─────────────────────────────────────────
// DELETE /api/super/tenants/:id
// ─────────────────────────────────────────
superRouter.delete('/tenants/:id', async (c) => {
  const tenantId = c.req.param('id')

  const { data: tenant } = await dbGet(c.env,
    'SELECT id FROM tenants WHERE id = ? AND is_deleted = 0 LIMIT 1', tenantId
  )
  if (!tenant) return c.json({ success: false, error: '고객사를 찾을 수 없습니다.' }, 404)

  const { error } = await dbRun(c.env,
    'UPDATE tenants SET is_deleted = 1, is_active = 0, updated_at = ? WHERE id = ?',
    nowISO(), tenantId
  )
  if (error) return c.json({ success: false, error: `삭제 실패: ${error}` }, 500)

  return c.json({ success: true, message: '고객사가 삭제되었습니다.' })
})

// ─────────────────────────────────────────
// POST /api/super/tenants/:id/reset-password
// ─────────────────────────────────────────
superRouter.post('/tenants/:id/reset-password', async (c) => {
  const tenantId = c.req.param('id')
  let body: { new_password?: string }
  try { body = await c.req.json() }
  catch { return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400) }

  const newPw = body.new_password
  if (!newPw || newPw.length < 8)
    return c.json({ success: false, error: '비밀번호는 8자 이상이어야 합니다.' }, 400)

  const hashed = await bcrypt.hash(newPw, SALT_ROUNDS)
  const { error } = await dbRun(c.env,
    'UPDATE tenants SET password = ?, is_temp_password = 1, login_fail_count = 0, login_locked_until = NULL, updated_at = ? WHERE id = ? AND is_deleted = 0',
    hashed, nowISO(), tenantId
  )
  if (error) return c.json({ success: false, error: `비밀번호 재설정 실패: ${error}` }, 500)

  return c.json({ success: true, message: '비밀번호가 재설정되었습니다.' })
})

// ─────────────────────────────────────────
// POST /api/super/tenants/:id/extend  (구독 1개월 연장)
// ─────────────────────────────────────────
superRouter.post('/tenants/:id/extend', async (c) => {
  const tenantId = c.req.param('id')

  const { data: tenant } = await dbGet<{ id: string; subscription_end_date: string | null }>(c.env,
    'SELECT id, subscription_end_date FROM tenants WHERE id = ? AND is_deleted = 0 LIMIT 1', tenantId
  )
  if (!tenant) return c.json({ success: false, error: '고객사를 찾을 수 없습니다.' }, 404)

  const base  = tenant.subscription_end_date
    ? new Date(tenant.subscription_end_date)
    : new Date()
  const newEnd = new Date(base)
  newEnd.setMonth(newEnd.getMonth() + 1)

  const { error } = await dbRun(c.env,
    'UPDATE tenants SET subscription_end_date = ?, subscription_status = ?, is_active = 1, updated_at = ? WHERE id = ?',
    newEnd.toISOString().slice(0, 10), 'active', nowISO(), tenantId
  )
  if (error) return c.json({ success: false, error: `연장 실패: ${error}` }, 500)

  return c.json({ success: true, message: '구독이 1개월 연장되었습니다.', new_end: newEnd.toISOString().slice(0, 10) })
})

// ─────────────────────────────────────────
// POST /api/super/tenants/:id/confirm-payment (입금확인+1개월)
// ─────────────────────────────────────────
superRouter.post('/tenants/:id/confirm-payment', async (c) => {
  const tenantId = c.req.param('id')
  let body: { memo?: string } = {}
  try { body = await c.req.json() } catch {}

  const { data: tenant } = await dbGet<{ id: string; subscription_end_date: string | null }>(c.env,
    'SELECT id, subscription_end_date FROM tenants WHERE id = ? AND is_deleted = 0 LIMIT 1', tenantId
  )
  if (!tenant) return c.json({ success: false, error: '고객사를 찾을 수 없습니다.' }, 404)

  const base  = tenant.subscription_end_date ? new Date(tenant.subscription_end_date) : new Date()
  const newEnd = new Date(base)
  newEnd.setMonth(newEnd.getMonth() + 1)

  const { error } = await dbRun(c.env,
    `UPDATE tenants SET
       subscription_end_date = ?, subscription_status = 'active',
       is_active = 1, payment_memo = ?, payment_requested_at = NULL, updated_at = ?
     WHERE id = ?`,
    newEnd.toISOString().slice(0, 10), body.memo || '입금 확인', nowISO(), tenantId
  )
  if (error) return c.json({ success: false, error: `입금 확인 처리 실패: ${error}` }, 500)

  return c.json({ success: true, message: '입금 확인 완료. 구독이 1개월 연장되었습니다.', new_end: newEnd.toISOString().slice(0, 10) })
})

// ─────────────────────────────────────────
// GET /api/super/plans
// ─────────────────────────────────────────
superRouter.get('/plans', async (c) => {
  const { data: plans, error } = await dbAll(c.env,
    'SELECT * FROM plans ORDER BY price ASC'
  )
  if (error) return c.json({ success: false, error: `요금제 조회 실패: ${error}` }, 500)
  return c.json({ success: true, data: plans || [] })
})

// ─────────────────────────────────────────
// PUT /api/super/plans/:id
// ─────────────────────────────────────────
superRouter.put('/plans/:id', async (c) => {
  const planId = c.req.param('id')
  let body: any
  try { body = await c.req.json() }
  catch { return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400) }

  const fields: string[] = []
  const values: unknown[] = []
  for (const key of ['price','faq_limit','chat_limit','description']) {
    if (body[key] !== undefined) { fields.push(`${key} = ?`); values.push(body[key]) }
  }
  if (!fields.length) return c.json({ success: false, error: '변경할 항목이 없습니다.' }, 400)

  fields.push('updated_at = ?'); values.push(nowISO())
  values.push(planId)

  const { error } = await dbRun(c.env, `UPDATE plans SET ${fields.join(', ')} WHERE id = ?`, ...values)
  if (error) return c.json({ success: false, error: `요금제 수정 실패: ${error}` }, 500)

  const { data: updated } = await dbGet(c.env, 'SELECT * FROM plans WHERE id = ? LIMIT 1', planId)
  return c.json({ success: true, data: updated })
})

// ─────────────────────────────────────────
// PUT /api/super/password  (슈퍼관리자 비밀번호 변경)
// ─────────────────────────────────────────
superRouter.put('/password', async (c) => {
  let body: { current_password?: string; new_password?: string }
  try { body = await c.req.json() }
  catch { return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400) }

  const { current_password, new_password } = body
  if (!current_password || !new_password)
    return c.json({ success: false, error: '현재/새 비밀번호를 모두 입력하세요.' }, 400)
  if (new_password.length < 8)
    return c.json({ success: false, error: '비밀번호는 8자 이상이어야 합니다.' }, 400)

  const adminId = c.get('tenantId') || c.get('jwtPayload' as any)?.sub
  const { data: admin } = await dbGet<{ id: string; password: string }>(c.env,
    'SELECT id, password FROM admins WHERE id = ? LIMIT 1', adminId
  )
  if (!admin) return c.json({ success: false, error: '관리자를 찾을 수 없습니다.' }, 404)

  const isValid = await bcrypt.compare(current_password, admin.password)
  if (!isValid) return c.json({ success: false, error: '현재 비밀번호가 올바르지 않습니다.' }, 400)

  const isSame = await bcrypt.compare(new_password, admin.password)
  if (isSame) return c.json({ success: false, error: '새 비밀번호는 현재 비밀번호와 달라야 합니다.' }, 400)

  const hashed = await bcrypt.hash(new_password, SALT_ROUNDS)
  await dbRun(c.env, 'UPDATE admins SET password = ?, updated_at = ? WHERE id = ?', hashed, nowISO(), admin.id)

  return c.json({ success: true, message: '비밀번호가 변경되었습니다.' })
})

// ─────────────────────────────────────────
// GET /api/super/platform-apis
// ─────────────────────────────────────────
superRouter.get('/platform-apis', async (c) => {
  const { data, error } = await dbAll(c.env, 'SELECT * FROM platform_apis ORDER BY created_at ASC')
  if (error) return c.json({ success: false, error }, 500)
  return c.json({ success: true, data: data || [] })
})

// ─────────────────────────────────────────
// POST /api/super/platform-apis
// ─────────────────────────────────────────
superRouter.post('/platform-apis', async (c) => {
  let body: any
  try { body = await c.req.json() }
  catch { return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400) }

  const { platform_name, display_name, api_endpoint = '', auth_type = 'api_key', description = '' } = body
  if (!platform_name || !display_name)
    return c.json({ success: false, error: '필수 항목을 입력하세요.' }, 400)

  const id = generateId()
  const { error } = await dbRun(c.env,
    'INSERT INTO platform_apis (id,platform_name,display_name,api_endpoint,auth_type,description) VALUES (?,?,?,?,?,?)',
    id, platform_name, display_name, api_endpoint, auth_type, description
  )
  if (error) return c.json({ success: false, error: `생성 실패: ${error}` }, 500)

  const { data: created } = await dbGet(c.env, 'SELECT * FROM platform_apis WHERE id = ? LIMIT 1', id)
  return c.json({ success: true, data: created }, 201)
})

// ─────────────────────────────────────────
// PUT /api/super/platform-apis/:id
// ─────────────────────────────────────────
superRouter.put('/platform-apis/:id', async (c) => {
  const apiId = c.req.param('id')
  let body: any
  try { body = await c.req.json() }
  catch { return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400) }

  const fields: string[] = []
  const values: unknown[] = []
  for (const key of ['display_name','api_endpoint','auth_type','description','is_active']) {
    if (body[key] !== undefined) {
      fields.push(`${key} = ?`)
      values.push(key === 'is_active' ? (body[key] ? 1 : 0) : body[key])
    }
  }
  if (!fields.length) return c.json({ success: false, error: '변경할 항목이 없습니다.' }, 400)

  fields.push('updated_at = ?'); values.push(nowISO())
  values.push(apiId)

  const { error } = await dbRun(c.env, `UPDATE platform_apis SET ${fields.join(', ')} WHERE id = ?`, ...values)
  if (error) return c.json({ success: false, error: `수정 실패: ${error}` }, 500)

  const { data: updated } = await dbGet(c.env, 'SELECT * FROM platform_apis WHERE id = ? LIMIT 1', apiId)
  return c.json({ success: true, data: updated })
})

// ─────────────────────────────────────────
// GET /api/super/payment-settings
// ─────────────────────────────────────────
superRouter.get('/payment-settings', async (c) => {
  const { data, error } = await dbGet(c.env,
    'SELECT * FROM payment_settings ORDER BY updated_at DESC LIMIT 1'
  )
  if (error) return c.json({ success: false, error }, 500)
  return c.json({ success: true, data: data || {} })
})

// ─────────────────────────────────────────
// PUT /api/super/payment-settings
// ─────────────────────────────────────────
superRouter.put('/payment-settings', async (c) => {
  let body: any
  try { body = await c.req.json() }
  catch { return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400) }

  const { bank_name = '', account_number = '', account_holder = '', payment_guide = '' } = body
  const now = nowISO()

  const { data: existing } = await dbGet(c.env, 'SELECT id FROM payment_settings LIMIT 1')
  if (existing) {
    await dbRun(c.env,
      'UPDATE payment_settings SET bank_name=?,account_number=?,account_holder=?,payment_guide=?,updated_at=? WHERE id=?',
      bank_name, account_number, account_holder, payment_guide, now, (existing as any).id
    )
  } else {
    await dbRun(c.env,
      'INSERT INTO payment_settings (id,bank_name,account_number,account_holder,payment_guide,updated_at) VALUES (?,?,?,?,?,?)',
      generateId(), bank_name, account_number, account_holder, payment_guide, now
    )
  }

  return c.json({ success: true, message: '결제 계좌 정보가 저장되었습니다.' })
})

// ─────────────────────────────────────────
// GET /api/super/check-expired  (만료된 구독 자동 처리)
// ─────────────────────────────────────────
superRouter.get('/check-expired', async (c) => {
  const today = new Date().toISOString().slice(0, 10)

  const { data: expired, error } = await dbAll<{ id: string; company_name: string }>(c.env,
    `SELECT id, company_name FROM tenants
     WHERE is_deleted = 0 AND is_active = 1
       AND subscription_end_date IS NOT NULL AND subscription_end_date < ?`,
    today
  )
  if (error) return c.json({ success: false, error }, 500)
  if (!expired || !expired.length)
    return c.json({ success: true, message: '만료된 구독 없음', processed: 0 })

  for (const t of expired) {
    await dbRun(c.env,
      "UPDATE tenants SET is_active = 0, subscription_status = 'expired', updated_at = ? WHERE id = ?",
      nowISO(), t.id
    )
  }

  return c.json({ success: true, message: `${expired.length}개 구독 만료 처리 완료`, processed: expired.length })
})

export default superRouter
