// =====================================================
// Cloudflare D1 쿼리 헬퍼
// - Supabase 클라이언트를 완전히 대체
// - 모든 쿼리는 prepared statement 사용 (SQL injection 방지)
// - 결과는 { data, error } 형태로 통일
// =====================================================
import { Bindings } from '../types'

export type DbResult<T> = { data: T; error: null } | { data: null; error: string }

// ─── UUID 생성 (Workers 호환) ──────────────────────────
export function generateId(): string {
  return crypto.randomUUID()
}

// ─── now() ISO 문자열 ──────────────────────────────────
export function nowISO(): string {
  return new Date().toISOString()
}

// ─── DB 바인딩 가져오기 ────────────────────────────────
export function getDB(env: Bindings): D1Database {
  return env.DB
}

// ─── 단일 행 조회 ──────────────────────────────────────
export async function dbGet<T = Record<string, unknown>>(
  env: Bindings,
  sql: string,
  ...params: unknown[]
): Promise<DbResult<T | null>> {
  try {
    const result = await env.DB.prepare(sql).bind(...params).first<T>()
    return { data: result ?? null, error: null }
  } catch (e: any) {
    console.error('[D1 dbGet error]', sql, e?.message)
    return { data: null, error: e?.message ?? 'DB 오류' }
  }
}

// ─── 다중 행 조회 ──────────────────────────────────────
export async function dbAll<T = Record<string, unknown>>(
  env: Bindings,
  sql: string,
  ...params: unknown[]
): Promise<DbResult<T[]>> {
  try {
    const result = await env.DB.prepare(sql).bind(...params).all<T>()
    return { data: result.results ?? [], error: null }
  } catch (e: any) {
    console.error('[D1 dbAll error]', sql, e?.message)
    return { data: null, error: e?.message ?? 'DB 오류' }
  }
}

// ─── INSERT / UPDATE / DELETE ──────────────────────────
export async function dbRun(
  env: Bindings,
  sql: string,
  ...params: unknown[]
): Promise<DbResult<{ meta: D1Result['meta'] }>> {
  try {
    const result = await env.DB.prepare(sql).bind(...params).run()
    return { data: { meta: result.meta }, error: null }
  } catch (e: any) {
    console.error('[D1 dbRun error]', sql, e?.message)
    return { data: null, error: e?.message ?? 'DB 오류' }
  }
}

// ─── 트랜잭션 (batch) ──────────────────────────────────
export async function dbBatch(
  env: Bindings,
  statements: D1PreparedStatement[]
): Promise<DbResult<D1Result[]>> {
  try {
    const results = await env.DB.batch(statements)
    return { data: results, error: null }
  } catch (e: any) {
    console.error('[D1 dbBatch error]', e?.message)
    return { data: null, error: e?.message ?? 'DB 오류' }
  }
}

// ─── 페이지네이션 헬퍼 ────────────────────────────────
export async function dbPaginate<T = Record<string, unknown>>(
  env: Bindings,
  baseSql: string,
  countSql: string,
  params: unknown[],
  page: number,
  limit: number
): Promise<DbResult<{ items: T[]; total: number; page: number; totalPages: number }>> {
  try {
    const offset = (page - 1) * limit
    const [rowsRes, countRes] = await env.DB.batch([
      env.DB.prepare(`${baseSql} LIMIT ? OFFSET ?`).bind(...params, limit, offset),
      env.DB.prepare(countSql).bind(...params),
    ])
    const items = (rowsRes.results ?? []) as T[]
    const total = (countRes.results?.[0] as any)?.total ?? 0
    return {
      data: { items, total, page, totalPages: Math.ceil(total / limit) },
      error: null,
    }
  } catch (e: any) {
    console.error('[D1 dbPaginate error]', e?.message)
    return { data: null, error: e?.message ?? 'DB 오류' }
  }
}
