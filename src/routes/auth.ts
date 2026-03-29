// =====================================================
// 인증 라우터
// POST /api/super/login  - 슈퍼관리자 로그인
// POST /api/admin/login  - 고객사 관리자 로그인
// PUT  /api/admin/password - 비밀번호 변경 (JWT 필요)
// =====================================================
import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { createSupabaseAdmin } from '../lib/supabase'
import { signJwt } from '../lib/jwt'
import { adminAuthMiddleware } from '../middleware/auth'
import { Bindings, Variables } from '../types'

const auth = new Hono<{ Bindings: Bindings; Variables: Variables }>()

const LOCK_DURATION_MS = 5 * 60 * 1000  // 5분
const MAX_FAIL = 5
const SALT_ROUNDS = 12

/** 비밀번호 규칙: 8자 이상, 영대소문자+숫자+특수문자 */
function validatePassword(pw: string): boolean {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/.test(pw)
}

// ─────────────────────────────────────────
// [1] 슈퍼관리자 로그인
// ─────────────────────────────────────────
auth.post('/super/login', async (c) => {
  let body: { email?: string; password?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400)
  }

  const email = (body.email || '').toLowerCase().trim()
  const password = body.password || ''

  if (!email || !password) {
    return c.json({ success: false, error: '이메일과 비밀번호를 입력하세요.' }, 400)
  }

  const supabase = createSupabaseAdmin(c.env)

  // 슈퍼관리자 조회
  const { data: admin, error } = await supabase
    .from('admins')
    .select('*')
    .eq('email', email)
    .single()

  if (error || !admin) {
    return c.json({ success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401)
  }

  // 비밀번호 검증
  const isValid = await bcrypt.compare(password, admin.password)
  if (!isValid) {
    return c.json({ success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401)
  }

  const token = await signJwt(
    { sub: admin.id, email: admin.email, role: 'super_admin' },
    c.env.SUPER_JWT_SECRET
  )

  return c.json({
    success: true,
    data: {
      token,
      admin: { id: admin.id, email: admin.email },
    },
  })
})

// ─────────────────────────────────────────
// [2] 고객사 관리자 로그인
// ─────────────────────────────────────────
auth.post('/admin/login', async (c) => {
  let body: { email?: string; password?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400)
  }

  const email = (body.email || '').toLowerCase().trim()
  const password = body.password || ''

  if (!email || !password) {
    return c.json({ success: false, error: '이메일과 비밀번호를 입력하세요.' }, 400)
  }

  const supabase = createSupabaseAdmin(c.env)

  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('email', email)
    .eq('is_deleted', false)
    .single()

  if (error || !tenant) {
    return c.json({ success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401)
  }

  // 계정 활성화 확인
  if (!tenant.is_active) {
    return c.json({ success: false, error: '비활성화된 계정입니다. 관리자에게 문의하세요.' }, 403)
  }

  // 잠금 확인
  if (tenant.login_locked_until) {
    const lockedUntil = new Date(tenant.login_locked_until).getTime()
    if (Date.now() < lockedUntil) {
      const remainSec = Math.ceil((lockedUntil - Date.now()) / 1000)
      return c.json({
        success: false,
        error: `로그인이 잠겼습니다. ${remainSec}초 후 다시 시도하세요.`,
      }, 423)
    }
  }

  // 비밀번호 검증
  const isValid = await bcrypt.compare(password, tenant.password)

  if (!isValid) {
    const newFailCount = (tenant.login_fail_count || 0) + 1
    const updateData: Record<string, unknown> = { login_fail_count: newFailCount }

    if (newFailCount >= MAX_FAIL) {
      updateData.login_locked_until = new Date(Date.now() + LOCK_DURATION_MS).toISOString()
      updateData.login_fail_count = 0
      await supabase.from('tenants').update(updateData).eq('id', tenant.id)
      return c.json({
        success: false,
        error: `비밀번호 ${MAX_FAIL}회 오류로 5분간 잠겼습니다.`,
      }, 423)
    }

    await supabase.from('tenants').update(updateData).eq('id', tenant.id)
    return c.json({
      success: false,
      error: `비밀번호가 올바르지 않습니다. (${newFailCount}/${MAX_FAIL})`,
    }, 401)
  }

  // 로그인 성공 → 실패 카운트 초기화
  await supabase
    .from('tenants')
    .update({ login_fail_count: 0, login_locked_until: null })
    .eq('id', tenant.id)

  const token = await signJwt(
    { sub: tenant.id, email: tenant.email, role: 'tenant_admin' },
    c.env.ADMIN_JWT_SECRET
  )

  return c.json({
    success: true,
    data: {
      token,
      tenant: {
        id: tenant.id,
        company_name: tenant.company_name,
        email: tenant.email,
        plan: tenant.plan,
        bot_name: tenant.bot_name,
        widget_color: tenant.widget_color,
        greeting_message: tenant.greeting_message,
        is_temp_password: tenant.is_temp_password,
      },
    },
  })
})

// ─────────────────────────────────────────
// [3] 비밀번호 변경 (JWT 필요)
// ─────────────────────────────────────────
auth.put('/admin/password', adminAuthMiddleware, async (c) => {
  let body: { current_password?: string; new_password?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400)
  }

  const { current_password, new_password } = body
  if (!current_password || !new_password) {
    return c.json({ success: false, error: '현재/새 비밀번호를 모두 입력하세요.' }, 400)
  }

  if (!validatePassword(new_password)) {
    return c.json({
      success: false,
      error: '새 비밀번호는 8자 이상이며 영대소문자, 숫자, 특수문자를 포함해야 합니다.',
    }, 400)
  }

  const tenantId = c.get('tenantId')!
  const supabase = createSupabaseAdmin(c.env)

  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('password')
    .eq('id', tenantId)
    .single()

  if (error || !tenant) {
    return c.json({ success: false, error: '사용자를 찾을 수 없습니다.' }, 404)
  }

  // 현재 비밀번호 검증
  const isCurrentValid = await bcrypt.compare(current_password, tenant.password)
  if (!isCurrentValid) {
    return c.json({ success: false, error: '현재 비밀번호가 올바르지 않습니다.' }, 400)
  }

  // 새 비밀번호 ≠ 현재 비밀번호
  const isSame = await bcrypt.compare(new_password, tenant.password)
  if (isSame) {
    return c.json({ success: false, error: '새 비밀번호는 현재 비밀번호와 달라야 합니다.' }, 400)
  }

  const hashed = await bcrypt.hash(new_password, SALT_ROUNDS)

  await supabase
    .from('tenants')
    .update({
      password: hashed,
      is_temp_password: false,
      password_changed_at: new Date().toISOString(),
    })
    .eq('id', tenantId)

  return c.json({ success: true, message: '비밀번호가 성공적으로 변경되었습니다.' })
})

export default auth
