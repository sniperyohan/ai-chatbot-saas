// =====================================================
// JWT 인증 미들웨어
// /api/super/* → SUPER_JWT_SECRET (role: super_admin)
// /api/admin/* → ADMIN_JWT_SECRET (role: tenant_admin)
// =====================================================
import { Context, Next } from 'hono'
import { verifyJwt } from '../lib/jwt'
import { Bindings, Variables } from '../types'

type Env = { Bindings: Bindings; Variables: Variables }

/** 슈퍼관리자 전용 미들웨어 */
export async function superAuthMiddleware(c: Context<Env>, next: Next) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ success: false, error: '인증 토큰이 필요합니다.' }, 401)
  }
  const token = authHeader.slice(7)
  try {
    const payload = await verifyJwt(token, c.env.SUPER_JWT_SECRET)
    if (payload.role !== 'super_admin') {
      return c.json({ success: false, error: '권한이 없습니다.' }, 403)
    }
    c.set('jwtPayload', payload)
    c.set('role', payload.role)
    await next()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '인증 실패'
    const isExpired = msg === 'Token expired'
    return c.json(
      { success: false, error: isExpired ? '토큰이 만료되었습니다.' : '유효하지 않은 토큰입니다.' },
      401
    )
  }
}

/** 테넌트(고객사) 관리자 전용 미들웨어 */
export async function adminAuthMiddleware(c: Context<Env>, next: Next) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ success: false, error: '인증 토큰이 필요합니다.' }, 401)
  }
  const token = authHeader.slice(7)
  try {
    const payload = await verifyJwt(token, c.env.ADMIN_JWT_SECRET)
    if (payload.role !== 'tenant_admin') {
      return c.json({ success: false, error: '권한이 없습니다.' }, 403)
    }
    c.set('jwtPayload', payload)
    c.set('tenantId', payload.sub)
    c.set('tenantEmail', payload.email)
    c.set('role', payload.role)
    await next()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '인증 실패'
    const isExpired = msg === 'Token expired'
    return c.json(
      { success: false, error: isExpired ? '토큰이 만료되었습니다.' : '유효하지 않은 토큰입니다.' },
      401
    )
  }
}
