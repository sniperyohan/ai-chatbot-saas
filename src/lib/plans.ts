// =====================================================
// 백엔드 플랜 조회 헬퍼 (DB plans 테이블 사용 + 캐시 + 폴백)
// =====================================================
import { dbAll } from './db'
import { Bindings } from '../types'

// ─── 타입 정의 ─────────────────────────────────────
export interface DBPlan {
  id: string
  name: string          // 'basic' | 'pro' | 'master'
  price: number         // 월 요금 (원)
  faq_limit: number     // FAQ 한도 (-1 = 무제한)
  chat_limit: number    // 월 답변 한도 (-1 = 무제한)
  description?: string
  is_active?: number
}

// ─── 캐시 (5분간 메모리에 보관) ─────────────────────
let cache: { data: DBPlan[]; expiresAt: number } | null = null
const CACHE_DURATION = 5 * 60 * 1000  // 5분

// ─── 폴백: DB 장애 시 사용할 기본값 ─────────────────
const FALLBACK_PLANS: DBPlan[] = [
  { id: 'fallback-basic',  name: 'basic',  price: 99000,  faq_limit: 50,  chat_limit: 1000,  description: '기본 플랜' },
  { id: 'fallback-pro',    name: 'pro',    price: 199000, faq_limit: 200, chat_limit: 5000,  description: '주문조회 포함' },
  { id: 'fallback-master', name: 'master', price: 399000, faq_limit: -1,  chat_limit: -1,    description: '모든 기능 무제한' },
]

// ─── DB에서 모든 활성 플랜 조회 (캐시 적용) ─────────
export async function getAllPlans(env: Bindings): Promise<DBPlan[]> {
  const now = Date.now()
  // 캐시 유효하면 그대로 반환
  if (cache && cache.expiresAt > now) return cache.data

  try {
    const { data } = await dbAll(env, 'SELECT * FROM plans WHERE is_active=1 ORDER BY price ASC')
    const plans = (data && data.length > 0) ? (data as DBPlan[]) : FALLBACK_PLANS
    cache = { data: plans, expiresAt: now + CACHE_DURATION }
    return plans
  } catch (e) {
    console.error('[getAllPlans] DB error, using fallback:', e)
    return FALLBACK_PLANS
  }
}

// ─── 특정 플랜 1개 조회 ─────────────────────────────
export async function getPlanByName(env: Bindings, planName: string): Promise<DBPlan> {
  const plans = await getAllPlans(env)
  return plans.find(p => p.name === planName) || plans.find(p => p.name === 'basic') || FALLBACK_PLANS[0]
}

// ─── 자주 쓰는 헬퍼들 ───────────────────────────────
export async function getPlanPrice(env: Bindings, planName: string): Promise<number> {
  const plan = await getPlanByName(env, planName)
  return plan?.price || 99000
}

export async function getPlanFaqLimit(env: Bindings, planName: string): Promise<number> {
  const plan = await getPlanByName(env, planName)
  return plan?.faq_limit ?? 50
}

export async function getPlanChatLimit(env: Bindings, planName: string): Promise<number> {
  const plan = await getPlanByName(env, planName)
  return plan?.chat_limit ?? 1000
}

// ─── 캐시 무효화 (슈퍼관리자가 플랜 수정 시 호출) ───
export function invalidatePlansCache(): void {
  cache = null
}
