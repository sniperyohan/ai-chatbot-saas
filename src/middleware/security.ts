// =====================================================
// 보안 미들웨어 (CORS + 입력값 Sanitize)
// =====================================================
import { cors } from 'hono/cors'
import { Context, Next } from 'hono'
import { Bindings, Variables } from '../types'
import { sanitizeInput } from '../lib/crypto'

type Env = { Bindings: Bindings; Variables: Variables }

/** CORS 미들웨어 팩토리 (ALLOWED_ORIGINS 환경변수 기반) */
export function createCorsMiddleware(allowedOrigins: string) {
  const origins = allowedOrigins
    ? allowedOrigins.split(',').map((o) => o.trim())
    : ['*']

  return cors({
    origin: (origin) => {
      if (origins.includes('*')) return '*'
      if (origins.includes(origin)) return origin
      return null
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Naver-Secret'],
    exposeHeaders: ['Content-Length'],
    maxAge: 86400,
    credentials: true,
  })
}

/** JSON Body Sanitize 미들웨어 */
export async function sanitizeMiddleware(c: Context<Env>, next: Next) {
  const ct = c.req.header('Content-Type') || ''
  if (ct.includes('application/json')) {
    try {
      const raw = await c.req.text()
      if (raw) {
        // JSON 파싱 후 문자열 필드 sanitize
        const parsed = JSON.parse(raw)
        const sanitized = deepSanitize(parsed)
        // 원본 요청을 새 값으로 대체
        ;(c.req as unknown as { _sanitizedBody: unknown })._sanitizedBody =
          sanitized
      }
    } catch {
      // 파싱 실패 시 패스 (하위 핸들러에서 처리)
    }
  }
  await next()
}

function deepSanitize(obj: unknown): unknown {
  if (typeof obj === 'string') return sanitizeInput(obj)
  if (Array.isArray(obj)) return obj.map(deepSanitize)
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
        k,
        deepSanitize(v),
      ])
    )
  }
  return obj
}

/** 보안 헤더 미들웨어 */
export async function securityHeadersMiddleware(c: Context<Env>, next: Next) {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('X-XSS-Protection', '1; mode=block')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
}
