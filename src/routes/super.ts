// =====================================================
// 슈퍼관리자 라우터 - Cloudflare D1 버전
// =====================================================
import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { dbGet, dbAll, dbRun, dbBatch, dbPaginate, generateId, nowISO } from '../lib/db'

import { superAuthMiddleware } from '../middleware/auth'
import { Bindings, Variables } from '../types'

const superRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>()

const SALT_ROUNDS = 12

const PLANS: Array<{ plan_name: string; price: number; faq_limit: number; chat_limit: number; description: string }> = [
  { plan_name: 'basic',  price: 99000,  faq_limit: 50,  chat_limit: 1000, description: 'FAQ 50개, 월 1,000회 답변' },
  { plan_name: 'pro',    price: 199000, faq_limit: 200, chat_limit: 5000, description: 'FAQ 200개, 월 5,000회 답변' },
  { plan_name: 'master', price: 399000, faq_limit: -1,  chat_limit: -1,   description: 'FAQ 무제한, 월 답변 무제한' },
]

// ── 공개 DB 초기화 엔드포인트 ────────────────────────
superRouter.post('/init-db-public', async (c) => {
  try {
    const stmts: string[] = [
      `CREATE TABLE IF NOT EXISTS super_admins (
        id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL, name TEXT DEFAULT '슈퍼관리자',
        created_at TEXT DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY, company_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL, phone TEXT DEFAULT '',
        password_hash TEXT NOT NULL, plan TEXT DEFAULT 'basic',
        is_active INTEGER DEFAULT 1, subscription_end_date TEXT,
        memo TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT, is_temp_password INTEGER DEFAULT 0)`,
      `CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, plan_name TEXT,
        price INTEGER DEFAULT 0, max_chatbots INTEGER DEFAULT 1,
        max_messages INTEGER DEFAULT 1000, faq_limit INTEGER DEFAULT 50,
        chat_limit INTEGER DEFAULT 1000, features TEXT,
        description TEXT, is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')), updated_at TEXT)`,
      `CREATE TABLE IF NOT EXISTS super_payment_settings (
        id TEXT PRIMARY KEY, bank_name TEXT DEFAULT '',
        account_number TEXT DEFAULT '', account_holder TEXT DEFAULT '',
        payment_guide TEXT DEFAULT '', updated_at TEXT)`,
      `CREATE TABLE IF NOT EXISTS super_platform_apis (
        id TEXT PRIMARY KEY, platform_name TEXT NOT NULL,
        display_name TEXT NOT NULL, api_endpoint TEXT DEFAULT '',
        auth_type TEXT DEFAULT 'api_key', description TEXT DEFAULT '',
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')), updated_at TEXT)`,
    ]
    for (const sql of stmts) {
      await dbRun(c.env, sql)
    }

    // 슈퍼관리자 계정 생성
    const existing = await dbGet(c.env, 'SELECT id FROM super_admins LIMIT 1')
    if (!existing.data) {
      const hash = await bcrypt.hash('Admin1234!', SALT_ROUNDS)
      await dbRun(c.env,
        'INSERT OR IGNORE INTO super_admins (id,email,password_hash,name) VALUES (?,?,?,?)',
        generateId(), 'angels1st@naver.com', hash, '슈퍼관리자')
    }

    // 플랜 초기 데이터
    for (const p of PLANS) {
      await dbRun(c.env,
        'INSERT OR IGNORE INTO plans (id,name,plan_name,price,faq_limit,chat_limit,description,is_active) VALUES (?,?,?,?,?,?,?,1)',
        generateId(), p.plan_name, p.plan_name, p.price, p.faq_limit, p.chat_limit, p.description)
    }

    return c.json({ success: true, message: 'DB 초기화 완료' })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ── 이하 인증 필요 ───────────────────────────────────
superRouter.use('/*', superAuthMiddleware)

// GET /api/super/dashboard
superRouter.get('/dashboard', async (c) => {
  try {
    const [tenantCount, activeCount, chatCount, docCount] = await Promise.all([
            dbGet(c.env, 'SELECT COUNT(*) as total FROM tenants'),
      dbGet(c.env, 'SELECT COUNT(*) as total FROM tenants WHERE is_active=1'),
      dbGet(c.env, 'SELECT COUNT(DISTINCT session_id) as total FROM chat_logs'),
      dbGet(c.env, 'SELECT COUNT(*) as total FROM documents'),

    ])

    const tenantsForRevenue = await dbAll(c.env, 'SELECT plan FROM tenants WHERE is_active=1')
    const priceMap: Record<string, number> = { basic: 99000, pro: 199000, master: 399000 }
    let totalRevenue = 0
    for (const t of (tenantsForRevenue.data || [])) {
      totalRevenue += priceMap[(t as any).plan] || 0
    }

    const planRows = await dbAll(c.env,
      'SELECT plan, COUNT(*) as cnt FROM tenants GROUP BY plan')
    const planStats: Record<string, number> = {}
    for (const r of (planRows.data || [])) {
      planStats[(r as any).plan] = (r as any).cnt
    }

    const recentTenants = await dbAll(c.env,
      'SELECT id,company_name,email,plan,is_active,created_at FROM tenants ORDER BY created_at DESC LIMIT 5')

    return c.json({
      success: true,
      data: {
        stats: {
          total_tenants:   tenantCount.data?.total   || 0,
          active_tenants:  activeCount.data?.total   || 0,
          total_chats:     chatCount.data?.total     || 0,
          total_documents: docCount.data?.total      || 0,
          monthly_revenue: totalRevenue,
        },
        planStats,
        recentTenants: recentTenants.data || [],
      }
    })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// GET /api/super/tenants
superRouter.get('/tenants', async (c) => {
  try {
    const page   = parseInt(c.req.query('page')  || '1')
    const limit  = parseInt(c.req.query('limit') || '20')
    const search = c.req.query('search') || ''
    const offset = (page - 1) * limit

    let query  = 'SELECT id,company_name,email,phone,plan,is_active,subscription_end_date,subscription_status,payment_requested_at,payment_memo,memo,created_at FROM tenants'

    let cntQ   = 'SELECT COUNT(*) as total FROM tenants'
    const args: unknown[] = []

    if (search) {
      const w = ' WHERE (company_name LIKE ? OR email LIKE ?)'
      query  += w; cntQ += w
      args.push(`%${search}%`, `%${search}%`)
    }

     query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    const listArgs = [...args, limit, offset]

    const [{ data: tenants }, { data: countRow }] = await Promise.all([
      dbAll(c.env, query, ...listArgs),
      dbGet(c.env, cntQ, ...args),
    ])

    return c.json({
      success: true,
      data: {
        items: tenants || [],
        total: countRow?.total || 0,
        page, limit, totalPages: Math.ceil((countRow?.total || 0) / limit),
      }
    })

  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// POST /api/super/tenants  (고객사 생성)
superRouter.post('/tenants', async (c) => {
  try {
    const body = await c.req.json() as any
    const { company_name, email, phone = '', plan = 'basic', memo = '' } = body

    if (!company_name || !email) {
      return c.json({ success: false, error: '회사명과 이메일은 필수입니다.' }, 400)
    }

    const existing = await dbGet(c.env, 'SELECT id FROM tenants WHERE email=?', email)
    if (existing.data) {
      return c.json({ success: false, error: '이미 등록된 이메일입니다.' }, 409)
    }

    const tempPw   = Math.random().toString(36).slice(2, 10) + 'A1!'
    const hash     = await bcrypt.hash(tempPw, SALT_ROUNDS)
    const tenantId = generateId()
    const now      = nowISO()
    const today    = new Date()
    const billingDay = today.getDate()
    const startDate  = today.toISOString().split('T')[0]
    const endDate    = new Date(today.getFullYear(), today.getMonth() + 1, billingDay).toISOString().split('T')[0]

    await dbRun(c.env,
      `INSERT INTO tenants
        (id,company_name,email,phone,password_hash,plan,is_active,memo,is_temp_password,
         billing_day,subscribed_at,subscription_start_date,subscription_end_date,created_at,updated_at)
       VALUES (?,?,?,?,?,?,1,?,1,?,?,?,?,?,?)`,
      tenantId, company_name, email, phone, hash, plan, memo,
      billingDay, startDate, startDate, endDate, now, now)

    return c.json({
      success: true,
      message: '고객사가 생성되었습니다.',
      data: { tenant_id: tenantId, temp_password: tempPw }
    })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// GET /api/super/tenants/:id
superRouter.get('/tenants/:id', async (c) => {
  try {
    const { data: tenant } = await dbGet(c.env,
            'SELECT id,company_name,email,phone,plan,is_active,subscription_end_date,subscription_status,payment_requested_at,payment_memo,memo,created_at FROM tenants WHERE id=?',

      c.req.param('id'))
    if (!tenant) return c.json({ success: false, error: '고객사를 찾을 수 없습니다.' }, 404)
    return c.json({ success: true, data: tenant })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// PUT /api/super/tenants/:id
superRouter.put('/tenants/:id', async (c) => {
  try {
    const id   = c.req.param('id')
    const body = await c.req.json() as any
    const { company_name, email, phone, plan, memo } = body

    const { data: tenant } = await dbGet(c.env, 'SELECT id FROM tenants WHERE id=?', id)
    if (!tenant) return c.json({ success: false, error: '고객사를 찾을 수 없습니다.' }, 404)

    await dbRun(c.env,
      'UPDATE tenants SET company_name=?,email=?,phone=?,plan=?,memo=?,updated_at=? WHERE id=?',
      company_name, email, phone, plan, memo, nowISO(), id)

    return c.json({ success: true, message: '고객사 정보가 수정되었습니다.' })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// DELETE /api/super/tenants/:id
superRouter.delete('/tenants/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const { data: tenant } = await dbGet(c.env, 'SELECT id FROM tenants WHERE id=?', id)
    if (!tenant) return c.json({ success: false, error: '고객사를 찾을 수 없습니다.' }, 404)
    await dbRun(c.env, 'DELETE FROM tenants WHERE id=?', id)
    return c.json({ success: true, message: '고객사가 삭제되었습니다.' })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// PUT /api/super/tenants/:id/status
superRouter.put('/tenants/:id/status', async (c) => {
  try {
    const id   = c.req.param('id')
    const { is_active } = await c.req.json() as any
    await dbRun(c.env, 'UPDATE tenants SET is_active=?,updated_at=? WHERE id=?',
      is_active ? 1 : 0, nowISO(), id)
    return c.json({ success: true, message: `고객사가 ${is_active ? '활성화' : '비활성화'}되었습니다.` })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// POST /api/super/tenants/:id/reset-password
superRouter.post('/tenants/:id/reset-password', async (c) => {
  try {
    const id = c.req.param('id')
    const { data: tenant } = await dbGet(c.env, 'SELECT id FROM tenants WHERE id=?', id)
    if (!tenant) return c.json({ success: false, error: '고객사를 찾을 수 없습니다.' }, 404)

    const newPw = Math.random().toString(36).slice(2, 10) + 'A1!'
    const hash  = await bcrypt.hash(newPw, SALT_ROUNDS)
    await dbRun(c.env,
      'UPDATE tenants SET password_hash=?,is_temp_password=1,updated_at=? WHERE id=?',
      hash, nowISO(), id)

    return c.json({
      success: true,
      message: '비밀번호가 재설정되었습니다.',
      data: { temp_password: newPw, email_sent: false }
    })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// POST /api/super/tenants/:id/extend  (구독 1개월 연장)
superRouter.post('/tenants/:id/extend', async (c) => {
  try {
    const id = c.req.param('id')
    const { data: tenant } = await dbGet(c.env,
      'SELECT id, subscription_end_date FROM tenants WHERE id=?', id)
    if (!tenant) return c.json({ success: false, error: '고객사를 찾을 수 없습니다.' }, 404)

    const base    = (tenant as any).subscription_end_date
      ? new Date((tenant as any).subscription_end_date)
      : new Date()
    base.setMonth(base.getMonth() + 1)
    const newDate = base.toISOString().slice(0, 10)

    await dbRun(c.env,
      'UPDATE tenants SET subscription_end_date=?,updated_at=? WHERE id=?',
      newDate, nowISO(), id)

    return c.json({ success: true, message: `구독이 ${newDate}까지 연장되었습니다.`, data: { subscription_end_date: newDate } })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// POST /api/super/tenants/:id/confirm-payment  (입금 확인)
superRouter.post('/tenants/:id/confirm-payment', async (c) => {
  try {
    const id = c.req.param('id')
    const { data: tenant } = await dbGet(c.env,
      'SELECT id, subscription_end_date FROM tenants WHERE id=?', id)
    if (!tenant) return c.json({ success: false, error: '고객사를 찾을 수 없습니다.' }, 404)

    const base    = (tenant as any).subscription_end_date
      ? new Date((tenant as any).subscription_end_date)
      : new Date()
    base.setMonth(base.getMonth() + 1)
    const newDate = base.toISOString().slice(0, 10)

    await dbRun(c.env,
      'UPDATE tenants SET is_active=1,subscription_end_date=?,subscription_status=?,payment_requested_at=NULL,payment_memo=NULL,updated_at=? WHERE id=?',
      newDate, 'active', nowISO(), id)


    return c.json({ success: true, message: `입금 확인 완료. 구독이 ${newDate}까지 연장되었습니다.` })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// PUT /api/super/tenants/:id/plan  (플랜 변경)
superRouter.put('/tenants/:id/plan', async (c) => {
  try {
    const id   = c.req.param('id')
    const { plan } = await c.req.json() as any
    if (!['basic','pro','master'].includes(plan)) {
      return c.json({ success: false, error: '유효하지 않은 플랜입니다.' }, 400)
    }
    await dbRun(c.env, 'UPDATE tenants SET plan=?,updated_at=? WHERE id=?', plan, nowISO(), id)
    return c.json({ success: true, message: `플랜이 ${plan}으로 변경되었습니다.` })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ── 플랜 관리 ────────────────────────────────────────
// GET /api/super/plans
superRouter.get('/plans', async (c) => {
  try {
    const { data } = await dbAll(c.env, 'SELECT * FROM plans ORDER BY price ASC')
    return c.json({ success: true, data: data || [] })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// PUT /api/super/plans/:id
superRouter.put('/plans/:id', async (c) => {
  try {
    const planId = c.req.param('id')
    const body   = await c.req.json() as any
    const { price, faq_limit, chat_limit } = body

    const { data: plan } = await dbGet(c.env, 'SELECT id FROM plans WHERE id=?', planId)
    if (!plan) return c.json({ success: false, error: '플랜을 찾을 수 없습니다.' }, 404)

    await dbRun(c.env,
      'UPDATE plans SET price=?,faq_limit=?,chat_limit=?,updated_at=? WHERE id=?',
      price, faq_limit, chat_limit, nowISO(), planId)

    const { data: updated } = await dbGet(c.env, 'SELECT * FROM plans WHERE id=?', planId)
    return c.json({ success: true, message: '플랜이 수정되었습니다.', data: updated })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ── 결제 설정 ────────────────────────────────────────
// GET /api/super/payment-settings
superRouter.get('/payment-settings', async (c) => {
  try {
    const { data } = await dbGet(c.env,
      'SELECT * FROM super_payment_settings ORDER BY updated_at DESC LIMIT 1')
    return c.json({ success: true, data: data || { bank_name:'', account_number:'', account_holder:'', payment_guide:'' } })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// PUT /api/super/payment-settings
superRouter.put('/payment-settings', async (c) => {
  try {
    const { bank_name, account_number, account_holder, payment_guide } = await c.req.json() as any
    const { data: existing } = await dbGet(c.env, 'SELECT id FROM super_payment_settings LIMIT 1')

    if (existing) {
      await dbRun(c.env,
        'UPDATE super_payment_settings SET bank_name=?,account_number=?,account_holder=?,payment_guide=?,updated_at=? WHERE id=?',
        bank_name, account_number, account_holder, payment_guide, nowISO(), (existing as any).id)
    } else {
      await dbRun(c.env,
        'INSERT INTO super_payment_settings (id,bank_name,account_number,account_holder,payment_guide,updated_at) VALUES (?,?,?,?,?,?)',
        generateId(), bank_name, account_number, account_holder, payment_guide, nowISO())
    }
    return c.json({ success: true, message: '결제 설정이 저장되었습니다.' })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ── API 플랫폼 관리 ──────────────────────────────────
// GET /api/super/platform-apis
superRouter.get('/platform-apis', async (c) => {
  try {
    const { data } = await dbAll(c.env,
      'SELECT * FROM super_platform_apis ORDER BY created_at ASC')
    return c.json({ success: true, data: data || [] })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// PUT /api/super/platform-apis/:id
superRouter.put('/platform-apis/:id', async (c) => {
  try {
    const apiId = c.req.param('id')
    const body  = await c.req.json() as any
    const { display_name, api_endpoint, auth_type, description, is_active } = body

    const { data: existing } = await dbGet(c.env,
      'SELECT id FROM super_platform_apis WHERE id=?', apiId)
    if (!existing) return c.json({ success: false, error: 'API를 찾을 수 없습니다.' }, 404)

    await dbRun(c.env,
      'UPDATE super_platform_apis SET display_name=?,api_endpoint=?,auth_type=?,description=?,is_active=?,updated_at=? WHERE id=?',
      display_name, api_endpoint, auth_type, description, is_active ? 1 : 0, nowISO(), apiId)

    return c.json({ success: true, message: 'API 플랫폼이 수정되었습니다.' })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ── 구독 만료 체크 ──────────────────────────────────
// GET /api/super/subscription-check
superRouter.get('/subscription-check', async (c) => {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const { data: expired } = await dbAll(c.env,
      'SELECT id,company_name,email,subscription_end_date FROM tenants WHERE is_active=1 AND subscription_end_date < ?',
      today)
    return c.json({ success: true, data: { expired_tenants: expired || [] } })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})
// PUT /api/super/tenants/:id/billing  (연간 결제 전환)
superRouter.put('/tenants/:id/billing', async (c) => {
  try {
    const id = c.req.param('id')
    const { billing_cycle } = await c.req.json() as any
    const { data: tenant } = await dbGet(c.env, 'SELECT id FROM tenants WHERE id=?', id)
    if (!tenant) return c.json({ success: false, error: '고객사를 찾을 수 없습니다.' }, 404)
    await dbRun(c.env, 'UPDATE tenants SET updated_at=? WHERE id=?', nowISO(), id)
    return c.json({ success: true, message: `결제 주기가 ${billing_cycle === 'yearly' ? '연간' : '월간'}으로 변경되었습니다.` })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// POST /api/super/change-password  (슈퍼관리자 비밀번호 변경)
superRouter.post('/change-password', async (c) => {
  try {
    const { current_password, new_password } = await c.req.json() as any
    const payload = c.get('jwtPayload') as any
    const superAdminId = payload?.sub

    const { data: admin } = await dbGet(c.env,
      'SELECT id, password_hash FROM super_admins WHERE id=?', superAdminId)
    if (!admin) return c.json({ success: false, error: '관리자를 찾을 수 없습니다.' }, 404)
    const ok = await bcrypt.compare(current_password, (admin as any).password_hash)
    if (!ok) return c.json({ success: false, error: '현재 비밀번호가 올바르지 않습니다.' }, 401)
    const hash = await bcrypt.hash(new_password, SALT_ROUNDS)
    await dbRun(c.env, 'UPDATE super_admins SET password_hash=? WHERE id=?', hash, superAdminId)
    return c.json({ success: true, message: '비밀번호가 변경되었습니다.' })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// POST /api/super/platform-apis  (플랫폼 API 추가)
superRouter.post('/platform-apis', async (c) => {
  try {
    const { platform_name, display_name, api_endpoint = '', auth_type = 'api_key', description = '' } = await c.req.json() as any
    if (!platform_name || !display_name) {
      return c.json({ success: false, error: '플랫폼명과 표시명은 필수입니다.' }, 400)
    }
    const id = generateId()
    await dbRun(c.env,
      'INSERT INTO super_platform_apis (id,platform_name,display_name,api_endpoint,auth_type,description,is_active) VALUES (?,?,?,?,?,?,1)',
      id, platform_name, display_name, api_endpoint, auth_type, description)
    return c.json({ success: true, message: '플랫폼이 추가되었습니다.', data: { id } })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

export default superRouter
