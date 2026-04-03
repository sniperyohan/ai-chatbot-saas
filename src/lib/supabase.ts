// =====================================================
// Supabase 클라이언트 팩토리
// =====================================================
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Bindings } from '../types'

// Cloudflare Workers 환경에서 error code 1016 방지:
// - cache: 'no-store' → CDN/프록시 캐시 우회, 항상 오리진 연결
// - keepalive: false  → Workers의 짧은 생명주기에 맞게 연결 재사용 비활성화
const SUPABASE_FETCH_OPTIONS: RequestInit = {
  cache: 'no-store',
  keepalive: false,
}

// 일반 요청용 (anon key)
export function createSupabaseClient(env: Bindings): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: {
      fetch: (url, options = {}) =>
        fetch(url, { ...options, ...SUPABASE_FETCH_OPTIONS }),
    },
  })
}

// 서비스 롤 (RLS 우회, 관리자 작업용)
export function createSupabaseAdmin(env: Bindings): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: (url, options = {}) =>
        fetch(url, { ...options, ...SUPABASE_FETCH_OPTIONS }),
    },
  })
}

// ─────────────────────────────────────────
// retrySupabase: error code 1016 등 간헐적 오류에 대한 재시도 래퍼
//
// 사용법:
//   const { data, error } = await retrySupabase(() =>
//     supabase.from('tenants').select('*')
//   )
//
// - maxRetries: 최대 재시도 횟수 (기본 3회, 총 시도 = 1 + 3 = 4)
// - delayMs:    재시도 간격 ms (기본 500ms)
// - 재시도 대상: error code 1016, internal error, DNS, fetch failed 등
// - 최종 실패 시 마지막 { data, error } 반환 (에러 처리는 호출부에서)
// ─────────────────────────────────────────
export const RETRY_ERRORS = [
  'error code: 1016',
  'internal error',
  'DNS',
  'fetch failed',
  'Failed to fetch',
  'network',
  'ENOTFOUND',
  'Name or service not known',
  'upstream connect error',
  'connection reset',
]

function isRetryableError(msg: string): boolean {
  return RETRY_ERRORS.some(pattern => msg.toLowerCase().includes(pattern.toLowerCase()))
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

      // 성공 or 재시도 불필요한 에러 → 즉시 반환
      if (!result.error || !isRetryableError(result.error.message)) {
        return result
      }

      // 재시도 가능한 에러
      if (attempt <= maxRetries) {
        console.warn(
          `[retrySupabase] 재시도 ${attempt}/${maxRetries} — ${result.error.message}`
        )
        await sleep(delayMs)
      } else {
        console.error(
          `[retrySupabase] 최대 재시도 초과 (${maxRetries}회) — ${result.error.message}`
        )
      }
    } catch (e: any) {
      lastResult = { data: null, error: { message: e.message ?? String(e) } }

      if (attempt <= maxRetries && isRetryableError(e.message ?? '')) {
        console.warn(
          `[retrySupabase] 예외 재시도 ${attempt}/${maxRetries} — ${e.message}`
        )
        await sleep(delayMs)
      } else {
        console.error(
          `[retrySupabase] 예외 최대 재시도 초과 또는 재시도 불가 — ${e.message}`
        )
        return lastResult
      }
    }
  }

  return lastResult
}
