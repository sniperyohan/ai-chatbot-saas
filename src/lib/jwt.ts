// =====================================================
// JWT 서명/검증 유틸 (Web Crypto API - Cloudflare Workers 호환)
// =====================================================
import { JwtPayload } from '../types'

const ALGO = { name: 'HMAC', hash: 'SHA-256' }
const TOKEN_EXPIRES_IN = 24 * 60 * 60 // 24시간(초)

function base64urlEncode(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64urlDecode(str: string): string {
  const pad = str.length % 4
  const padded = pad ? str + '='.repeat(4 - pad) : str
  return atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
}

async function getKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  return crypto.subtle.importKey('raw', enc.encode(secret), ALGO, false, [
    'sign',
    'verify',
  ])
}

/** JWT 서명 생성 */
export async function signJwt(
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
  secret: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + TOKEN_EXPIRES_IN,
  }

  const header = base64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64urlEncode(JSON.stringify(fullPayload))
  const signingInput = `${header}.${body}`

  const key = await getKey(secret)
  const enc = new TextEncoder()
  const signature = await crypto.subtle.sign(ALGO, key, enc.encode(signingInput))
  const sigBase64 = base64urlEncode(
    String.fromCharCode(...new Uint8Array(signature))
  )

  return `${signingInput}.${sigBase64}`
}

/** JWT 검증 및 페이로드 반환 */
export async function verifyJwt(
  token: string,
  secret: string
): Promise<JwtPayload> {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Invalid token format')

  const [header, body, sig] = parts
  const signingInput = `${header}.${body}`

  const key = await getKey(secret)
  const enc = new TextEncoder()
  const sigBytes = Uint8Array.from(atob(sig.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
    c.charCodeAt(0)
  )
  const valid = await crypto.subtle.verify(ALGO, key, sigBytes, enc.encode(signingInput))
  if (!valid) throw new Error('Invalid signature')

  const payload = JSON.parse(base64urlDecode(body)) as JwtPayload
  const now = Math.floor(Date.now() / 1000)
  if (payload.exp && payload.exp < now) throw new Error('Token expired')

  return payload
}
