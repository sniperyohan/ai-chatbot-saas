// =====================================================
// Supabase 클라이언트 팩토리
// =====================================================
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Bindings } from '../types'

// 일반 요청용 (anon key)
export function createSupabaseClient(env: Bindings): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
}

// 서비스 롤 (RLS 우회, 관리자 작업용)
export function createSupabaseAdmin(env: Bindings): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
