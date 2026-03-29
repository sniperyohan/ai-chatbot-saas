// =====================================================
// AES-256-GCM 암호화 유틸 (Web Crypto API - Cloudflare Workers 호환)
// =====================================================

const ALGO = 'AES-GCM'
const KEY_LEN = 256

/**
 * base64 hex 문자열로부터 CryptoKey 파생
 * ENCRYPTION_KEY 환경변수: 32바이트 hex 문자열 (64자) 권장
 */
async function deriveKey(rawKey: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(rawKey.slice(0, 32).padEnd(32, '0')),
    { name: 'AES-GCM', length: KEY_LEN },
    false,
    ['encrypt', 'decrypt']
  )
  return keyMaterial
}

/** 평문 → AES-256-GCM 암호화 → base64 (iv:ciphertext) */
export async function encrypt(plaintext: string, encKey: string): Promise<string> {
  const key = await deriveKey(encKey)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const enc = new TextEncoder()
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGO, iv },
    key,
    enc.encode(plaintext)
  )
  const ivBase64 = btoa(String.fromCharCode(...iv))
  const ctBase64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)))
  return `${ivBase64}:${ctBase64}`
}

/** base64 (iv:ciphertext) → AES-256-GCM 복호화 → 평문 */
export async function decrypt(encrypted: string, encKey: string): Promise<string> {
  const [ivBase64, ctBase64] = encrypted.split(':')
  if (!ivBase64 || !ctBase64) throw new Error('Invalid encrypted format')

  const key = await deriveKey(encKey)
  const iv = Uint8Array.from(atob(ivBase64), (c) => c.charCodeAt(0))
  const ciphertext = Uint8Array.from(atob(ctBase64), (c) => c.charCodeAt(0))

  const dec = new TextDecoder()
  const plaintext = await crypto.subtle.decrypt(
    { name: ALGO, iv },
    key,
    ciphertext
  )
  return dec.decode(plaintext)
}

/** 전화번호 마스킹: 010-1234-5678 → 010-****-5678 */
export function maskPhone(phone: string): string {
  return phone.replace(/(\d{3})-?(\d{3,4})-?(\d{4})/, '$1-****-$3')
}

/** 주문번호 마스킹: 마지막 4자리만 표시 */
export function maskOrderId(orderId: string): string {
  if (orderId.length <= 4) return '****'
  return '*'.repeat(orderId.length - 4) + orderId.slice(-4)
}

/** 입력값 sanitize (XSS 방지) - 태그 완전 제거 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim()
}
