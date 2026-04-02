// =====================================================
// JWT 서명/검증 유틸 (hono/jwt 기반 - Cloudflare Workers 호환)
// 토큰 유효기간: 24시간
// =====================================================
import { JwtPayload } from '../types'

const TOKEN_EXPIRES_IN = 24 * 60 * 60 // 24시간(초)

/** JWT 서명 생성 (hono/jwt sign 사용, HS256) */
export async function signJwt(
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
  secret: string
): Promise<string> {
  const { sign } = await import('hono/jwt')
  const now = Math.floor(Date.now() / 1000)
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + TOKEN_EXPIRES_IN,
  }
  return sign(fullPayload, secret, 'HS256')
}

/** JWT 검증 및 페이로드 반환 (hono/jwt verify 사용, HS256) */
export async function verifyJwt(
  token: string,
  secret: string
): Promise<JwtPayload> {
  const { verify } = await import('hono/jwt')
  const payload = await verify(token, secret, 'HS256') as JwtPayload

  // 만료 확인
  const now = Math.floor(Date.now() / 1000)
  if (payload.exp && payload.exp < now) {
    throw new Error('Token expired')
  }

  return payload
}
