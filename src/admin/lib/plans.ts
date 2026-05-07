// 플랜 종류 정의
export type PlanType = 'basic' | 'pro' | 'master'

// 플랜 상세 정보
export interface PlanInfo {
  label: string          // 표시 이름 (예: 'Basic')
  price: number          // 월 요금 (원)
  faqLimit: number       // FAQ 등록 한도 (-1 = 무제한)
  monthlyAnswers: number // 월 답변 한도 (-1 = 무제한)
  scenarioLimit: number  // 시나리오 한도 (-1 = 무제한)
  responseLimit: number  // 응답 템플릿 한도 (-1 = 무제한)


  color: string          // 메인 색상
  bgColor: string        // 배경 색상 (옅은 톤)
  emoji: string          // 이모지 아이콘
  description: string    // 짧은 설명
}

// 플랜 통합 정의 ⭐ 여기서만 가격/한도/색상 관리
export const PLANS: Record<PlanType, PlanInfo> = {
  basic: {
    label: 'Basic',
    price: 99000,
    faqLimit: 50,
    monthlyAnswers: 1000,
    scenarioLimit: 10,
    responseLimit: 1,

    color: '#3B82F6',

    bgColor: 'rgba(59,130,246,0.12)',
    emoji: '📦',
    description: '기본 플랜',
  },
  pro: {
    label: 'Pro',
    price: 199000,
    faqLimit: 200,
    monthlyAnswers: 5000,
    scenarioLimit: 30,
    responseLimit: 5,

    color: '#8B5CF6',

    bgColor: 'rgba(139,92,246,0.12)',
    emoji: '🚀',
    description: '주문조회 포함',
  },
  master: {
    label: 'Master',
    price: 399000,
    faqLimit: -1,
    monthlyAnswers: -1,
    scenarioLimit: -1,
    responseLimit: -1,

    color: '#F59E0B',
    bgColor: 'rgba(245,158,11,0.12)',
    emoji: '⭐',
    description: '모든 기능 무제한',
  },
}

// ===== 헬퍼 함수들 =====

// 플랜 정보 가져오기 (잘못된 값이면 basic으로 폴백)
export const getPlan = (plan?: string | null): PlanInfo => {
  return PLANS[(plan as PlanType)] || PLANS.basic
}

// 가격 포맷 (예: ₩99,000)
export const formatPrice = (plan?: string | null): string => {
  return `₩${getPlan(plan).price.toLocaleString()}`
}

// 한도 표시 (예: "50개" 또는 "무제한")
export const formatLimit = (limit: number): string => {
  return limit === -1 ? '무제한' : `${limit}개`
}

// 월 답변 횟수 표시 (예: "1,000회" 또는 "무제한")
export const formatAnswers = (count: number): string => {
  return count === -1 ? '무제한' : `${count.toLocaleString()}회`
}

// 한 줄 요약 (드롭다운 옵션용)
// 예: "Basic · ₩99,000/월 · FAQ 50개 · 월 1,000회 답변"
export const getPlanSummary = (plan: PlanType): string => {
  const p = PLANS[plan]
  return `${p.label} · ${formatPrice(plan)}/월 · FAQ ${formatLimit(p.faqLimit)} · 월 ${formatAnswers(p.monthlyAnswers)} 답변`
}

// 상세 설명 (선택된 플랜 안내용)
// 예: "📦 기본 플랜 — FAQ 최대 50개, 월 1,000회 답변"
export const getPlanDetail = (plan: PlanType): string => {
  const p = PLANS[plan]
  const limitText = p.faqLimit === -1 ? 'FAQ 무제한' : `FAQ 최대 ${p.faqLimit}개`
  const answerText = p.monthlyAnswers === -1 ? '월 답변 무제한' : `월 ${p.monthlyAnswers.toLocaleString()}회 답변`
  return `${p.emoji} ${p.description} — ${limitText}, ${answerText}`
}

// Master 플랜 여부 (자주 쓰는 체크라 헬퍼로)
export const isMasterPlan = (plan?: string | null): boolean => {
  return plan === 'master'
}
// =====================================================
// 동적 플랜 로드 (DB 데이터로 PLANS 덮어쓰기)
// =====================================================
// 백엔드 plans 테이블의 실제 값으로 가격/한도를 갱신
// 색상, 이모지 등은 위 PLANS 객체의 값을 유지

interface DBPlan {
  name: string
  price: number
  faq_limit: number
  chat_limit: number
  description?: string
}

let plansLoaded = false

export async function loadPlansFromDB(api: any): Promise<void> {
  try {
    const res = await api.getPlans()
    if (!res.success || !Array.isArray(res.data)) return

    res.data.forEach((dbPlan: DBPlan) => {
      const key = dbPlan.name as PlanType
      if (PLANS[key]) {
        PLANS[key].price = dbPlan.price
        PLANS[key].faqLimit = dbPlan.faq_limit
        PLANS[key].monthlyAnswers = dbPlan.chat_limit
        PLANS[key].scenarioLimit = dbPlan.max_chatbots
        PLANS[key].responseLimit = dbPlan.response_limit

        // label, color, emoji, description은 코드 값 유지
      }
    })
    plansLoaded = true
    console.log('[plans] DB 동기화 완료', PLANS)
  } catch (e) {
    console.warn('[plans] DB 로드 실패, 기본값 사용:', e)
  }
}

export const isPlansLoaded = (): boolean => plansLoaded
