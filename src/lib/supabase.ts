// =====================================================
// Supabase 클라이언트 팩토리
// Cloudflare Workers 환경 최적화:
//   - @supabase/supabase-js SDK 유지 (쿼리 빌더 편의성)
//   - global.fetch 완전 교체: SDK 추가 헤더 제거, cache:no-store 강제
//   - 프록시 URL 교체: Supabase 원본 → 리버스 프록시 경유
//   - retrySupabase: error code 1016 간헐적 오류 재시도
// =====================================================
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Bindings } from '../types'

// ─────────────────────────────────────────
// 프록시 설정
//   - 원본 Supabase 호스트를 프록시 호스트로 교체
//   - Host 헤더에 원본 호스트를 명시해 프록시가 올바른 백엔드로 포워딩
// ─────────────────────────────────────────
const SUPABASE_ORIGINAL_HOST = 'xbdpvd1xtrlgyjioubbr.supabase.co'
const SUPABASE_PROXY_ORIGIN  = 'https://supabase.chatbotai.co.kr'

function rewriteUrlToProxy(input: RequestInfo | URL): string {
  const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
  // 원본 호스트가 포함된 경우에만 교체
  if (urlStr.includes(SUPABASE_ORIGINAL_HOST)) {
    return urlStr.replace(`https://${SUPABASE_ORIGINAL_HOST}`, SUPABASE_PROXY_ORIGIN)
  }
  return urlStr
}

// ─────────────────────────────────────────
// Cloudflare Workers 전용 fetch 래퍼
//
// @supabase/supabase-js SDK는 기본적으로 아래 헤더를 자동 추가:
//   - x-client-info: supabase-js/x.x.x
//   - X-Supabase-Api-Version: 2024-01-01
// 이 헤더들이 Cloudflare Workers → Supabase 구간에서
// error code 1016 (연결 거부/프록시 오류)를 유발할 수 있음.
// custom fetch로 불필요한 헤더를 모두 제거하고 최소 헤더만 유지.
// 또한 URL을 프록시 호스트로 교체하고 Host 헤더를 원본으로 설정.
// ─────────────────────────────────────────
function makeSupabaseFetch(apiKey: string) {
  return (url: RequestInfo | URL, options: RequestInit = {}): Promise<Response> => {
    // ① URL을 프록시 호스트로 교체
    const proxyUrl = rewriteUrlToProxy(url)

    // ② SDK가 추가한 헤더 중 문제 유발 가능 헤더 제거
    const originalHeaders = new Headers(options.headers || {})
    const cleanHeaders = new Headers()

    // 허용 헤더 화이트리스트만 통과
    const ALLOWED_HEADERS = [
      'content-type',
      'apikey',
      'authorization',
      'prefer',
      'range',
      'accept',
      'accept-profile',
      'content-profile',
    ]
    for (const [key, value] of originalHeaders.entries()) {
      if (ALLOWED_HEADERS.includes(key.toLowerCase())) {
        cleanHeaders.set(key, value)
      }
    }

    // ③ apikey / Authorization 항상 보장
    if (!cleanHeaders.has('apikey')) cleanHeaders.set('apikey', apiKey)
    if (!cleanHeaders.has('authorization')) cleanHeaders.set('authorization', `Bearer ${apiKey}`)

    // ④ Host 헤더를 원본 Supabase 호스트로 설정 (프록시 포워딩용)
    cleanHeaders.set('host', SUPABASE_ORIGINAL_HOST)

    return fetch(proxyUrl, {
      ...options,
      headers: cleanHeaders,
      // @ts-ignore - Cloudflare Workers supports cache option
      cache: 'no-store',
      keepalive: false,
    })
  }
}

// 일반 요청용 (anon key)
export function createSupabaseClient(env: Bindings): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: makeSupabaseFetch(env.SUPABASE_ANON_KEY) },
  })
}

// 서비스 롤 (RLS 우회, 관리자 작업용)
export function createSupabaseAdmin(env: Bindings): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: makeSupabaseFetch(env.SUPABASE_SERVICE_KEY) },
  })
}

// ─────────────────────────────────────────
// retrySupabase: 간헐적 1016/네트워크 오류 재시도 래퍼
//   - maxRetries: 최대 재시도 횟수 (기본 3)
//   - delayMs:    재시도 간격 ms (기본 500)
//   - 최종 실패 시 { data: null, error } 반환
// ─────────────────────────────────────────
const RETRY_PATTERNS = [
  'error code: 1016',
  'internal error',
  'dns',
  'fetch failed',
  'failed to fetch',
  'network',
  'enotfound',
  'name or service not known',
  'upstream connect error',
  'connection reset',
  'etimedout',
  'socket hang up',
]

export const RETRY_ERRORS = RETRY_PATTERNS  // 하위 호환용 export

function isRetryableError(msg: string): boolean {
  const lower = msg.toLowerCase()
  return RETRY_PATTERNS.some(p => lower.includes(p))
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function retrySupabase<T>(
  fn: () => PromiseLike<{ data: T | null; error: { message: string } | null }>,
  maxRetries = 3,
  delayMs = 500,
): Promise<{ data: T | null; error: { message: string } | null }> {
  let lastResult: { data: T | null; error: { message: string } | null } = {
    data: null,
    error: { message: '알 수 없는 오류' },
  }

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const result = await fn()
      lastResult = result

      if (!result.error || !isRetryableError(result.error.message)) {
        return result   // 성공 또는 재시도 불필요 에러 → 즉시 반환
      }

      if (attempt <= maxRetries) {
        console.warn(`[retrySupabase] 재시도 ${attempt}/${maxRetries} — ${result.error.message}`)
        await sleep(delayMs)
      } else {
        console.error(`[retrySupabase] 최대 재시도 초과 (${maxRetries}회) — ${result.error.message}`)
      }
    } catch (e: any) {
      const msg = e?.message ?? String(e)
      lastResult = { data: null, error: { message: msg } }

      if (attempt <= maxRetries && isRetryableError(msg)) {
        console.warn(`[retrySupabase] 예외 재시도 ${attempt}/${maxRetries} — ${msg}`)
        await sleep(delayMs)
      } else {
        console.error(`[retrySupabase] 예외 재시도 불가 — ${msg}`)
        return lastResult
      }
    }
  }

  return lastResult
}
