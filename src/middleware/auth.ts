// =====================================================
// JWT 인증 미들웨어 (hono/jwt 내장 미들웨어 사용)
// /api/super/* → SUPER_JWT_SECRET (role: super_admin)
// /api/admin/* → ADMIN_JWT_SECRET (role: tenant_admin)
// 토큰 유효기간: 24시간
// =====================================================
import { Context, Next } from 'hono'
import { jwt } from 'hono/jwt'
import { Bindings, Variables } from '../types'

type Env = { Bindings: Bindings; Variables: Variables }

// ─────────────────────────────────────────
// 로컬 fallback JWT 시크릿
// ─────────────────────────────────────────
const LOCAL_SUPER_SECRET = 'local-dev-super-secret-key-32chars!!'
const LOCAL_ADMIN_SECRET = 'local-dev-admin-secret-key-32chars!'

/** 슈퍼관리자 전용 미들웨어 (SUPER_JWT_SECRET) */
export async function superAuthMiddleware(c: Context<Env>, next: Next) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ success: false, error: '인증 토큰이 필요합니다.' }, 401)
  }
  const token = authHeader.slice(7)

  const secret = (() => {
    const s = c.env?.SUPER_JWT_SECRET || ''
    return s.length >= 16 && !s.includes('your_super') ? s : LOCAL_SUPER_SECRET
  })()

  try {
    // hono/jwt의 verify 함수 사용 (JWK 없음, HS256 HMAC)
    const { verify } = await import('hono/jwt')
    const payload = await verify(token, secret, 'HS256') as Record<string, unknown>

    // 만료 확인
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && typeof payload.exp === 'number' && payload.exp < now) {
      return c.json({ success: false, error: '토큰이 만료되었습니다.' }, 401)
    }

    if (payload.role !== 'super_admin') {
      return c.json({ success: false, error: '권한이 없습니다.' }, 403)
    }

    c.set('jwtPayload', payload as any)
    c.set('role', 'super_admin')
    await next()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    const isExpired = msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('exp')
    return c.json(
      { success: false, error: isExpired ? '토큰이 만료되었습니다.' : '유효하지 않은 토큰입니다.' },
      401
    )
  }
}

/** 테넌트(고객사) 관리자 전용 미들웨어 (ADMIN_JWT_SECRET) */
export async function adminAuthMiddleware(c: Context<Env>, next: Next) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ success: false, error: '인증 토큰이 필요합니다.' }, 401)
  }
  const token = authHeader.slice(7)

  const secret = (() => {
    const s = c.env?.ADMIN_JWT_SECRET || ''
    return s.length >= 16 && !s.includes('your_admin') ? s : LOCAL_ADMIN_SECRET
  })()

  try {
    // hono/jwt의 verify 함수 사용 (JWK 없음, HS256 HMAC)
    const { verify } = await import('hono/jwt')
    const payload = await verify(token, secret, 'HS256') as Record<string, unknown>

    // 만료 확인
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && typeof payload.exp === 'number' && payload.exp < now) {
      return c.json({ success: false, error: '토큰이 만료되었습니다.' }, 401)
    }

    if (payload.role !== 'tenant_admin') {
      return c.json({ success: false, error: '권한이 없습니다.' }, 403)
    }

    const tenantId = typeof payload.sub === 'string' ? payload.sub : ''
    const tenantEmail = typeof payload.email === 'string' ? payload.email : ''

    c.set('jwtPayload', payload as any)
    c.set('tenantId', tenantId)
    c.set('tenantEmail', tenantEmail)
    c.set('role', 'tenant_admin')
    await next()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    const isExpired = msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('exp')
    return c.json(
      { success: false, error: isExpired ? '토큰이 만료되었습니다.' : '유효하지 않은 토큰입니다.' },
      401
    )
  }
}

/** hono/jwt 미들웨어 팩토리 (슈퍼관리자용) - 직접 use() 등록에 사용 가능 */
export function createSuperJwtMiddleware(secret: string) {
  return jwt({ secret, alg: 'HS256' })
}

/** hono/jwt 미들웨어 팩토리 (테넌트 관리자용) - 직접 use() 등록에 사용 가능 */
export function createAdminJwtMiddleware(secret: string) {
  return jwt({ secret, alg: 'HS256' })
}
