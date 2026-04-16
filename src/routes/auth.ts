// =====================================================
// 인증 라우터 - Cloudflare D1 버전
// POST /api/super/login    - 슈퍼관리자 로그인
// POST /api/admin/login    - 고객사 관리자 로그인
// PUT  /api/admin/password - 비밀번호 변경 (JWT 필요)
// =====================================================
import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { dbGet, dbRun, generateId, nowISO } from '../lib/db'
import { signJwt } from '../lib/jwt'
import { adminAuthMiddleware } from '../middleware/auth'
import { Bindings, Variables } from '../types'

const auth = new Hono<{ Bindings: Bindings; Variables: Variables }>()

const LOCK_DURATION_MS = 5 * 60 * 1000  // 5분
const MAX_FAIL         = 5
const SALT_ROUNDS      = 12

function validatePassword(pw: string): boolean {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/.test(pw)
}

// ─────────────────────────────────────────
// D1 설정 확인 (DB 바인딩 존재 여부)
// ─────────────────────────────────────────
function isD1Configured(env: Bindings): boolean {
  return !!env.DB
}

// ─────────────────────────────────────────
// [1] 슈퍼관리자 로그인
// POST /api/super/login
// 순서: D1 admins 테이블 → 로컬 fallback (D1 미설정 시)
// ─────────────────────────────────────────
auth.post('/super/login', async (c) => {
  let body: { email?: string; password?: string }
  try { body = await c.req.json() }
  catch { return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400) }

  const email    = (body.email    || '').toLowerCase().trim()
  const password = (body.password || '')

  if (!email || !password)
    return c.json({ success: false, error: '이메일과 비밀번호를 입력하세요.' }, 400)
  if (password.length > 72)
    return c.json({ success: false, error: '비밀번호는 최대 72자까지 입력 가능합니다.' }, 400)

  const jwtSecret = c.env.SUPER_JWT_SECRET || 'local-dev-super-secret-key-32chars!!'
  const effectiveSecret = jwtSecret.length >= 16 ? jwtSecret : 'local-dev-super-secret-key-32chars!!'

  // ── CASE A: D1 사용 ──────────────────────────────────
  if (isD1Configured(c.env)) {
    const { data: admin, error: dbErr } = await dbGet<{
      id: string; email: string; password: string; is_active: number
    }>(c.env, 'SELECT id, email, password, is_active FROM admins WHERE email = ? LIMIT 1', email)

    if (dbErr) {
      console.error('[super/login] D1 오류:', dbErr)
      return c.json({ success: false, error: 'DB 오류가 발생했습니다.' }, 500)
    }
    if (!admin)
      return c.json({ success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401)
    if (!admin.is_active)
      return c.json({ success: false, error: '비활성화된 계정입니다.' }, 403)

    const isValid = await bcrypt.compare(password, admin.password)
    if (!isValid)
      return c.json({ success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401)

    // 마지막 로그인 시간 업데이트
    await dbRun(c.env, 'UPDATE admins SET last_login_at = ? WHERE id = ?', nowISO(), admin.id)

    const token = await signJwt({ sub: admin.id, email: admin.email, role: 'super_admin' }, effectiveSecret)
    return c.json({ success: true, data: { token, admin: { id: admin.id, email: admin.email } } })
  }

  // ── CASE B: D1 미설정 → 로컬 fallback ────────────────
  const localEmail  = c.env.LOCAL_SUPER_ADMIN_EMAIL    || 'super@admin.local'
  const localPwHash = c.env.LOCAL_SUPER_ADMIN_PASSWORD_HASH || ''

  if (!localPwHash)
    return c.json({ success: false, error: 'DB가 설정되지 않았습니다. Cloudflare D1을 연결해주세요.' }, 503)
  if (email !== localEmail.toLowerCase())
    return c.json({ success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401)

  const isLocalValid = await bcrypt.compare(password, localPwHash)
  if (!isLocalValid)
    return c.json({ success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401)

  const token = await signJwt(
    { sub: 'local-super-admin', email: localEmail.toLowerCase(), role: 'super_admin' },
    effectiveSecret
  )
  return c.json({ success: true, data: { token, admin: { id: 'local-super-admin', email: localEmail.toLowerCase() } } })
})

// ─────────────────────────────────────────
// [2] 고객사 관리자 로그인
// POST /api/admin/login
// D1 tenants 테이블에서 조회 + 계정잠금 처리
// ─────────────────────────────────────────
auth.post('/admin/login', async (c) => {
  let body: { email?: string; password?: string }
  try { body = await c.req.json() }
  catch { return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400) }

  const email    = (body.email    || '').toLowerCase().trim()
  const password = body.password  || ''

  if (!email || !password)
    return c.json({ success: false, error: '이메일과 비밀번호를 입력하세요.' }, 400)
  if (password.length > 72)
    return c.json({ success: false, error: '비밀번호는 최대 72자까지 입력 가능합니다.' }, 400)

  const adminJwtSecret    = c.env.ADMIN_JWT_SECRET || 'local-dev-admin-secret-key-32chars!'
  const effectiveAdminSecret = adminJwtSecret.length >= 16 ? adminJwtSecret : 'local-dev-admin-secret-key-32chars!'

  if (!isD1Configured(c.env))
    return c.json({ success: false, error: 'DB가 설정되지 않았습니다. Cloudflare D1을 연결해주세요.' }, 503)

  // D1 tenants 조회
  const { data: tenant, error: dbErr } = await dbGet<{
    id: string; email: string; password: string; company_name: string
    plan: string; bot_name: string; widget_color: string; greeting_message: string
    is_active: number; is_deleted: number; is_temp_password: number
    login_fail_count: number; login_locked_until: string | null
    billing_day: number; subscribed_at: string | null
    faq_limit: number; chat_limit: number
  }>(c.env,
    `SELECT id, email, password, company_name, plan, bot_name, widget_color,
            greeting_message, is_active, is_deleted, is_temp_password,
            login_fail_count, login_locked_until, billing_day, subscribed_at,
            faq_limit, chat_limit
     FROM tenants WHERE email = ? AND is_deleted = 0 LIMIT 1`,
    email
  )

  if (dbErr) {
    console.error('[admin/login] D1 오류:', dbErr)
    return c.json({ success: false, error: 'DB 오류가 발생했습니다.' }, 500)
  }
  if (!tenant)
    return c.json({ success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401)
  if (!tenant.is_active)
    return c.json({ success: false, error: '비활성화된 계정입니다. 관리자에게 문의하세요.' }, 403)

  // 계정 잠금 확인
  if (tenant.login_locked_until) {
    const lockedUntil = new Date(tenant.login_locked_until).getTime()
    if (Date.now() < lockedUntil) {
      const remainSec = Math.ceil((lockedUntil - Date.now()) / 1000)
      return c.json({ success: false, error: `로그인이 잠겼습니다. ${remainSec}초 후 다시 시도하세요.` }, 423)
    }
  }

  // 비밀번호 검증
  const isValid = await bcrypt.compare(password, tenant.password)

  if (!isValid) {
    const newFailCount = (tenant.login_fail_count || 0) + 1
    if (newFailCount >= MAX_FAIL) {
      const lockedUntil = new Date(Date.now() + LOCK_DURATION_MS).toISOString()
      await dbRun(c.env,
        'UPDATE tenants SET login_fail_count = 0, login_locked_until = ?, updated_at = ? WHERE id = ?',
        lockedUntil, nowISO(), tenant.id
      )
      return c.json({ success: false, error: `비밀번호 ${MAX_FAIL}회 오류로 5분간 잠겼습니다.` }, 423)
    }
    await dbRun(c.env,
      'UPDATE tenants SET login_fail_count = ?, updated_at = ? WHERE id = ?',
      newFailCount, nowISO(), tenant.id
    )
    return c.json({ success: false, error: `비밀번호가 올바르지 않습니다. (${newFailCount}/${MAX_FAIL})` }, 401)
  }

  // 로그인 성공 → 실패 카운트 초기화
  await dbRun(c.env,
    'UPDATE tenants SET login_fail_count = 0, login_locked_until = NULL, updated_at = ? WHERE id = ?',
    nowISO(), tenant.id
  )

  const token = await signJwt(
    { sub: tenant.id, email: tenant.email, role: 'tenant_admin' },
    effectiveAdminSecret
  )

  return c.json({
    success: true,
    data: {
      token,
      tenant: {
        id:               tenant.id,
        company_name:     tenant.company_name,
        email:            tenant.email,
        plan:             tenant.plan,
        bot_name:         tenant.bot_name,
        widget_color:     tenant.widget_color,
        greeting_message: tenant.greeting_message,
        is_temp_password: !!tenant.is_temp_password,
        billing_day:      tenant.billing_day || 1,
        subscribed_at:    tenant.subscribed_at || null,
        faq_limit:        tenant.faq_limit,
        chat_limit:       tenant.chat_limit,
      },
    },
  })
})

// ─────────────────────────────────────────
// [3] 비밀번호 변경
// PUT /api/admin/password
// ─────────────────────────────────────────
auth.put('/admin/password', adminAuthMiddleware, async (c) => {
  let body: { current_password?: string; new_password?: string }
  try { body = await c.req.json() }
  catch { return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400) }

  const { current_password, new_password } = body
  if (!current_password || !new_password)
    return c.json({ success: false, error: '현재/새 비밀번호를 모두 입력하세요.' }, 400)
  if (!validatePassword(new_password))
    return c.json({ success: false, error: '새 비밀번호는 8자 이상이며 영대소문자, 숫자, 특수문자를 포함해야 합니다.' }, 400)

  const tenantId = c.get('tenantId')!

  const { data: tenant, error: dbErr } = await dbGet<{ id: string; password: string }>(
    c.env,
    'SELECT id, password FROM tenants WHERE id = ? LIMIT 1',
    tenantId
  )
  if (dbErr || !tenant)
    return c.json({ success: false, error: '사용자를 찾을 수 없습니다.' }, 404)

  const isCurrentValid = await bcrypt.compare(current_password, tenant.password)
  if (!isCurrentValid)
    return c.json({ success: false, error: '현재 비밀번호가 올바르지 않습니다.' }, 400)

  const isSame = await bcrypt.compare(new_password, tenant.password)
  if (isSame)
    return c.json({ success: false, error: '새 비밀번호는 현재 비밀번호와 달라야 합니다.' }, 400)

  const hashed = await bcrypt.hash(new_password, SALT_ROUNDS)
  await dbRun(c.env,
    'UPDATE tenants SET password = ?, is_temp_password = 0, password_changed_at = ?, updated_at = ? WHERE id = ?',
    hashed, nowISO(), nowISO(), tenantId
  )

  return c.json({ success: true, message: '비밀번호가 성공적으로 변경되었습니다.' })
})

export default auth
