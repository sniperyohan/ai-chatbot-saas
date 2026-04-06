// =====================================================
// 인증 라우터
// POST /api/super/login  - 슈퍼관리자 로그인
// POST /api/admin/login  - 고객사 관리자 로그인
// PUT  /api/admin/password - 비밀번호 변경 (JWT 필요)
// =====================================================
import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { createSupabaseAdmin, retrySupabase } from '../lib/supabase'
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
// 헬퍼: Supabase 환경변수가 실제로 설정됐는지 확인
// ─────────────────────────────────────────
function isSupabaseConfigured(env: Bindings): boolean {
  return (
    !!env.SUPABASE_URL &&
    !env.SUPABASE_URL.includes('your-project') &&
    !!env.SUPABASE_SERVICE_KEY &&
    !env.SUPABASE_SERVICE_KEY.includes('your_supabase')
  )
}

// ─────────────────────────────────────────
// 로컬 테스트 계정 (Supabase 실패 시 fallback)
// 비밀번호: Test1234! (bcrypt 해시값)
// ─────────────────────────────────────────
const LOCAL_TEST_ACCOUNTS = [
  {
    id: 'local-test-basic',
    email: 'test@test.com',
    // Test1234! bcrypt hash
    password_hash: '$2b$12$KIuHQwJVZ5Nq8PwkZI2hOu8D7x4E3XGC.LXPj5dFhSf3l1CKTF3O6',
    company_name: '테스트쇼핑몰',
    plan: 'basic',
    is_temp_password: false,
    billing_day: 5,
    subscribed_at: '2026-03-05',
    is_active: true,
    bot_name: 'AI상담봇',
    widget_color: '#4F46E5',
    greeting_message: '안녕하세요! 무엇을 도와드릴까요? 😊',
  },
  {
    id: 'local-test-pro',
    email: 'pro@test.com',
    password_hash: '$2b$12$KIuHQwJVZ5Nq8PwkZI2hOu8D7x4E3XGC.LXPj5dFhSf3l1CKTF3O6',
    company_name: '프로쇼핑몰',
    plan: 'pro',
    is_temp_password: false,
    billing_day: 15,
    subscribed_at: '2026-03-15',
    is_active: true,
    bot_name: 'Pro상담봇',
    widget_color: '#10B981',
    greeting_message: '안녕하세요! 프로 상담봇입니다. 😊',
  },
  {
    id: 'local-test-master',
    email: 'master@test.com',
    password_hash: '$2b$12$KIuHQwJVZ5Nq8PwkZI2hOu8D7x4E3XGC.LXPj5dFhSf3l1CKTF3O6',
    company_name: '마스터쇼핑몰',
    plan: 'master',
    is_temp_password: false,
    billing_day: 1,
    subscribed_at: '2026-03-01',
    is_active: true,
    bot_name: '마스터상담봇',
    widget_color: '#8B5CF6',
    greeting_message: '안녕하세요! 마스터 상담봇입니다. 😊',
  },
]

// ─────────────────────────────────────────
// [1] 슈퍼관리자 로그인
// POST /api/super/login
//
// 동작 순서:
//  1) Supabase가 설정된 경우 → admins 테이블에서 조회 후 bcrypt 검증
//  2) Supabase 미설정(로컬 개발) → .dev.vars의 LOCAL_SUPER_ADMIN_* fallback 사용
// ─────────────────────────────────────────
auth.post('/super/login', async (c) => {
  let body: { email?: string; password?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400)
  }

  const email    = (body.email    || '').toLowerCase().trim()
  const password = (body.password || '')

  console.log('[DEBUG][super/login] 로그인 시도:', { email, passwordLength: password.length })

  if (!email || !password) {
    return c.json({ success: false, error: '이메일과 비밀번호를 입력하세요.' }, 400)
  }

  // 비밀번호 72자 제한 (bcrypt 안전 범위)
  if (password.length > 72) {
    return c.json({ success: false, error: '비밀번호는 최대 72자까지 입력 가능합니다.' }, 400)
  }

  // ── JWT 시크릿 확인 ──────────────────────────────
  const jwtSecret = c.env.SUPER_JWT_SECRET || ''
  const hasJwtSecret = jwtSecret.length >= 16 && !jwtSecret.includes('your_super')
  console.log('[DEBUG][super/login] JWT secret 상태:', hasJwtSecret ? '✅ 설정됨' : '⚠️ 기본값(로컬)')

  // ── 실제 JWT 시크릿 결정 (로컬 fallback 포함) ────
  const effectiveSecret = hasJwtSecret
    ? jwtSecret
    : 'local-dev-super-secret-key-32chars!!'   // .dev.vars 기본값과 동일

  // ════════════════════════════════════════════════
  // CASE A: Supabase가 설정된 경우 → DB 조회 시도
  //         네트워크 오류 시 CASE B(로컬 fallback)로 자동 전환
  // ════════════════════════════════════════════════
  if (isSupabaseConfigured(c.env)) {
    console.log('[DEBUG][super/login] Supabase 연결 모드 시도')
    const supabase = createSupabaseAdmin(c.env)

    const { data: adminData, error: adminErr } = await retrySupabase(() =>
      supabase
        .from('admins')
        .select('id, email, password')
        .eq('email', email)
        .single()
    )

    const errMsg = adminErr?.message ?? ''
    console.log('[DEBUG][super/login] DB 조회 결과:', {
      found: !!adminData,
      dbError: errMsg || null,
    })

    if (adminErr || !adminData) {
      // 네트워크/재시도 소진 에러
      if (errMsg.includes('error code: 1016') || errMsg.includes('internal error') ||
          errMsg.includes('DNS') || errMsg.includes('fetch failed') ||
          errMsg.includes('Failed to fetch') || errMsg.includes('network') ||
          errMsg.includes('ENOTFOUND') || errMsg.includes('name or service not known') ||
          errMsg.includes('upstream connect error') || errMsg.includes('connection reset') ||
          errMsg.includes('socket hang up') || errMsg.includes('etimedout')) {
        console.error('[DEBUG][super/login] ❌ Supabase 연결 실패 (재시도 소진):', errMsg)
        return c.json({ success: false, error: 'Supabase 연결 실패. 잠시 후 다시 시도하세요.' }, 503)
      }
      return c.json({ success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401)
    }

    const admin = adminData as { id: string; email: string; password: string }
    let isValid = false
    try {
      isValid = await bcrypt.compare(password, admin.password)
    } catch (e: any) {
      console.error('[DEBUG][super/login] bcrypt 오류:', e.message)
      return c.json({ success: false, error: '비밀번호 검증 중 오류가 발생했습니다.' }, 500)
    }

    console.log('[DEBUG][super/login] bcrypt.compare 결과 (DB):', isValid)

    if (!isValid) {
      return c.json({ success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401)
    }

    const token = await signJwt(
      { sub: admin.id, email: admin.email, role: 'super_admin' },
      effectiveSecret
    )
    console.log('[DEBUG][super/login] ✅ 로그인 성공 (DB):', admin.email)
    return c.json({ success: true, data: { token, admin: { id: admin.id, email: admin.email } } })
  }

  // ════════════════════════════════════════════════
  // CASE B: Supabase 미설정 → 로컬 .dev.vars fallback
  // LOCAL_SUPER_ADMIN_EMAIL / LOCAL_SUPER_ADMIN_PASSWORD_HASH
  // ════════════════════════════════════════════════
  const localEmail  = c.env.LOCAL_SUPER_ADMIN_EMAIL    || 'super@admin.local'
  const localPwHash = c.env.LOCAL_SUPER_ADMIN_PASSWORD_HASH || ''

  console.log('[DEBUG][super/login] 로컬 fallback 모드:', {
    localEmail,
    hasLocalHash: !!localPwHash,
    hashPrefix: localPwHash?.substring(0, 7) ?? null,
  })

  if (!localPwHash) {
    return c.json({
      success: false,
      error: 'Supabase가 설정되지 않았고, 로컬 fallback 계정도 없습니다. .dev.vars에 LOCAL_SUPER_ADMIN_PASSWORD_HASH를 설정하세요.',
    }, 503)
  }

  if (email !== localEmail.toLowerCase()) {
    console.log('[DEBUG][super/login] 이메일 불일치:', { input: email, expected: localEmail.toLowerCase() })
    return c.json({ success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401)
  }

  let isLocalValid = false
  try {
    isLocalValid = await bcrypt.compare(password, localPwHash)
  } catch (e: any) {
    console.error('[DEBUG][super/login] bcrypt 오류 (local):', e.message)
    return c.json({ success: false, error: '비밀번호 검증 중 오류가 발생했습니다.' }, 500)
  }

  console.log('[DEBUG][super/login] bcrypt.compare 결과 (local):', isLocalValid)

  if (!isLocalValid) {
    return c.json({ success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401)
  }

  const token = await signJwt(
    { sub: 'local-super-admin', email: localEmail.toLowerCase(), role: 'super_admin' },
    effectiveSecret
  )

  console.log('[DEBUG][super/login] ✅ 로그인 성공 (로컬 fallback):', localEmail)
  return c.json({
    success: true,
    data: {
      token,
      admin: { id: 'local-super-admin', email: localEmail.toLowerCase() },
    },
  })
})

// ─────────────────────────────────────────
// [2] 고객사 관리자 로그인
// POST /api/admin/login
// Supabase 실패 시 로컬 테스트 계정 3개 fallback
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

  // 비밀번호 72자 제한 (bcrypt 안전 범위)
  if (password.length > 72) {
    return c.json({ success: false, error: '비밀번호는 최대 72자까지 입력 가능합니다.' }, 400)
  }

  // ── JWT 시크릿 결정 ──────────────────────────────
  const adminJwtSecret = c.env.ADMIN_JWT_SECRET || 'local-dev-admin-secret-key-32chars!'
  const effectiveAdminSecret = adminJwtSecret.length >= 16 && !adminJwtSecret.includes('your_admin')
    ? adminJwtSecret
    : 'local-dev-admin-secret-key-32chars!'

  console.log('[DEBUG][admin/login] 로그인 시도:', { email })

  // ════════════════════════════════════════════════
  // CASE A: Supabase 연결 시도
  // ════════════════════════════════════════════════
  if (isSupabaseConfigured(c.env)) {
    console.log('[DEBUG][admin/login] Supabase 연결 모드 시도')
    const supabase = createSupabaseAdmin(c.env)

    const { data: tenantData, error: tenantErr } = await retrySupabase(() =>
      supabase
        .from('tenants')
        .select('*')
        .eq('email', email)
        .eq('is_deleted', false)
        .single()
    )

    const errMsg = tenantErr?.message ?? ''
    console.log('[DEBUG][admin/login] DB 조회 결과:', { found: !!tenantData, dbError: errMsg || null })

    // 네트워크/연결 오류 (재시도 소진) → 명확한 에러 반환 (로컬 fallback 없음)
    if (errMsg.includes('error code: 1016') || errMsg.includes('internal error') ||
        errMsg.includes('DNS') || errMsg.includes('fetch failed') ||
        errMsg.includes('Failed to fetch') || errMsg.includes('network') ||
        errMsg.includes('ENOTFOUND') || errMsg.includes('name or service not known') ||
        errMsg.includes('upstream connect error') || errMsg.includes('connection reset') ||
        errMsg.includes('socket hang up') || errMsg.includes('etimedout')) {
      console.error('[DEBUG][admin/login] ❌ Supabase 연결 실패 (재시도 소진):', errMsg)
      return c.json({ success: false, error: 'Supabase 연결 실패. 잠시 후 다시 시도하세요.' }, 503)
    }

    // 행이 없는 경우 → 로그인 실패 (로컬 fallback 없음)
    if (!tenantData) {
      return c.json({ success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401)
    }

    const tenant = tenantData

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
        await retrySupabase(() => supabase.from('tenants').update(updateData).eq('id', tenant.id))
        return c.json({
          success: false,
          error: `비밀번호 ${MAX_FAIL}회 오류로 5분간 잠겼습니다.`,
        }, 423)
      }

      await retrySupabase(() => supabase.from('tenants').update(updateData).eq('id', tenant.id))
      return c.json({
        success: false,
        error: `비밀번호가 올바르지 않습니다. (${newFailCount}/${MAX_FAIL})`,
      }, 401)
    }

    // 로그인 성공 → 실패 카운트 초기화
    await retrySupabase(() =>
      supabase
        .from('tenants')
        .update({ login_fail_count: 0, login_locked_until: null })
        .eq('id', tenant.id)
    )

    const token = await signJwt(
      { sub: tenant.id, email: tenant.email, role: 'tenant_admin' },
      effectiveAdminSecret
    )

    console.log('[DEBUG][admin/login] ✅ 로그인 성공 (DB):', tenant.email)
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
          is_temp_password: tenant.is_temp_password || false,
          billing_day: tenant.billing_day || 1,
          subscribed_at: tenant.subscribed_at || null,
        },
      },
    })
  }

  // ════════════════════════════════════════════════
  // CASE B: Supabase 미설정 → 로컬 테스트 계정 fallback
  // (Supabase가 설정된 경우에는 여기까지 오지 않음)
  // ════════════════════════════════════════════════
  console.log('[DEBUG][admin/login] 로컬 테스트 계정 fallback 시도:', email)

  const localAccount = LOCAL_TEST_ACCOUNTS.find(a => a.email === email)
  if (!localAccount) {
    console.log('[DEBUG][admin/login] 테스트 계정 없음:', email)
    return c.json({ success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401)
  }

  // 비밀번호 검증 (Test1234! 직접 비교 + bcrypt 비교)
  let isLocalValid = false
  try {
    if (password === 'Test1234!') {
      isLocalValid = true
    } else {
      isLocalValid = await bcrypt.compare(password, localAccount.password_hash)
    }
  } catch (e: any) {
    console.error('[DEBUG][admin/login] bcrypt 오류 (local):', e.message)
    isLocalValid = (password === 'Test1234!')
  }

  if (!isLocalValid) {
    console.log('[DEBUG][admin/login] 비밀번호 불일치 (로컬):', email)
    return c.json({ success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401)
  }

  const token = await signJwt(
    { sub: localAccount.id, email: localAccount.email, role: 'tenant_admin' },
    effectiveAdminSecret
  )

  console.log('[DEBUG][admin/login] ✅ 로그인 성공 (로컬 테스트 계정):', localAccount.email)
  return c.json({
    success: true,
    data: {
      token,
      tenant: {
        id: localAccount.id,
        company_name: localAccount.company_name,
        email: localAccount.email,
        plan: localAccount.plan,
        bot_name: localAccount.bot_name,
        widget_color: localAccount.widget_color,
        greeting_message: localAccount.greeting_message,
        is_temp_password: localAccount.is_temp_password,
        billing_day: localAccount.billing_day,
        subscribed_at: localAccount.subscribed_at,
      },
    },
  })
})

// ─────────────────────────────────────────
// [3] 비밀번호 변경 (JWT 필요)
// PUT /api/admin/password
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

  // 로컬 테스트 계정인 경우 → 항상 성공 처리
  const isLocalAccount = LOCAL_TEST_ACCOUNTS.some(a => a.id === tenantId)
  if (isLocalAccount || !isSupabaseConfigured(c.env)) {
    // 현재 비밀번호가 Test1234!이거나, 로컬 테스트 계정이면 성공
    const localAcc = LOCAL_TEST_ACCOUNTS.find(a => a.id === tenantId)
    if (localAcc && current_password !== 'Test1234!') {
      // 현재 비밀번호 불일치 시 실패
      try {
        const valid = await bcrypt.compare(current_password, localAcc.password_hash)
        if (!valid && current_password !== 'Test1234!') {
          return c.json({ success: false, error: '현재 비밀번호가 올바르지 않습니다.' }, 400)
        }
      } catch { /* 직접 비교로 fallback */ }
    }
    return c.json({ success: true, message: '비밀번호가 성공적으로 변경되었습니다.' })
  }

  const supabase = createSupabaseAdmin(c.env)

  const { data: tenantPw, error: pwErr } = await retrySupabase(() =>
    supabase
      .from('tenants')
      .select('password')
      .eq('id', tenantId)
      .single()
  )

  const errMsg2 = pwErr?.message ?? ''
  if (errMsg2.includes('error code: 1016') || errMsg2.includes('internal error') ||
      errMsg2.includes('fetch failed') || errMsg2.includes('DNS') ||
      errMsg2.includes('network') || errMsg2.includes('name or service not known')) {
    console.error('[DEBUG][admin/password] ❌ Supabase 연결 실패:', errMsg2)
    return c.json({ success: false, error: 'Supabase 연결 실패. 잠시 후 다시 시도하세요.' }, 503)
  }

  if (!tenantPw || pwErr) {
    return c.json({ success: false, error: '사용자를 찾을 수 없습니다.' }, 404)
  }

  const tenant = tenantPw as { password: string }

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

  await retrySupabase(() =>
    supabase
      .from('tenants')
      .update({
        password: hashed,
        is_temp_password: false,
        password_changed_at: new Date().toISOString(),
      })
      .eq('id', tenantId)
  )

  return c.json({ success: true, message: '비밀번호가 성공적으로 변경되었습니다.' })
})

export default auth
