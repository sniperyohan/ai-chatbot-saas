// =====================================================
// RAG (Retrieval-Augmented Generation) 서비스
// - Supabase RPC match_documents 호출 (fetch 직접)
// - processMessage: 전체 RAG 파이프라인
// - Cloudflare Workers 호환 (node-fetch 금지)
// =====================================================
import { generateQueryEmbedding, generateAnswer } from './gemini'

const MATCH_THRESHOLD = 0.7
const MATCH_COUNT     = 3

// ─────────────────────────────────────────
// 타입
// ─────────────────────────────────────────
export interface MatchedDocument {
  id: string
  question: string
  answer: string
  category: string
  similarity: number
}

export interface ProcessMessageResult {
  answer: string
  intent: string
  isAnswered: boolean
  responseTime: number
}

// ─────────────────────────────────────────
// 1. 유사 문서 검색 (Supabase RPC - fetch 직접)
// ─────────────────────────────────────────
export async function searchSimilarDocuments(
  tenantId: string,
  queryEmbedding: number[],
  supabaseUrl: string,
  supabaseKey: string,
  limit: number = MATCH_COUNT
): Promise<MatchedDocument[]> {
  const url = `${supabaseUrl}/rest/v1/rpc/match_documents`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({
      query_embedding: queryEmbedding,
      match_tenant_id: tenantId,
      match_threshold: MATCH_THRESHOLD,
      match_count: limit,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error('[rag] searchSimilarDocuments error:', res.status, errText)
    return []
  }

  const docs = (await res.json()) as MatchedDocument[]
  return Array.isArray(docs) ? docs : []
}

// ─────────────────────────────────────────
// 2. 운영시간 체크 (KST)
// ─────────────────────────────────────────
function isWithinBusinessHours(businessHours: any): boolean {
  if (!businessHours || typeof businessHours !== 'object') return true

  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)

  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const dayKey   = dayNames[kst.getDay()]

  const dayConfig = businessHours[dayKey]
  if (!dayConfig || !dayConfig.enabled) return false

  const [startH, startM] = (dayConfig.start || '09:00').split(':').map(Number)
  const [endH,   endM]   = (dayConfig.end   || '18:00').split(':').map(Number)

  const nowMin   = kst.getHours() * 60 + kst.getMinutes()
  const startMin = startH * 60 + startM
  const endMin   = endH   * 60 + endM

  return nowMin >= startMin && nowMin < endMin
}

// ─────────────────────────────────────────
// 3. 의도 분류 (키워드 기반 - API 호출 없음)
// ─────────────────────────────────────────
function classifyIntent(
  userMessage: string,
  matchedDocs: MatchedDocument[]
): string {
  const msg = userMessage.toLowerCase()

  // 인사말
  if (/^(안녕|hello|hi|반가|처음|방가|ㅎㅇ|안뇽)/.test(msg)) return 'GREETING'

  // 주문/배송
  if (/(주문|배송|배달|운송장|택배|도착|출고|발송|언제|조회)/.test(msg)) return 'ORDER_INQUIRY'

  // 불만/환불
  if (/(환불|취소|불만|항의|화가|짜증|불편|이상|고장|환급|반품|교환)/.test(msg)) return 'COMPLAINT'

  // 결제
  if (/(결제|카드|계좌|이체|입금|영수증|세금계산서)/.test(msg)) return 'PAYMENT'

  // FAQ 매칭됨
  if (matchedDocs.length > 0) return 'FAQ_INQUIRY'

  return 'OTHER'
}

// ─────────────────────────────────────────
// 4. chat_logs 저장 (fetch 직접)
// ─────────────────────────────────────────
async function saveChatLog(
  supabaseUrl: string,
  supabaseKey: string,
  log: {
    tenant_id: string
    session_id: string
    user_message: string
    bot_response: string
    intent: string
    channel: string
    is_answered: boolean
    response_time: number
  }
): Promise<void> {
  try {
    // KST 타임스탬프
    const now = new Date()
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)

    await fetch(`${supabaseUrl}/rest/v1/chat_logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        ...log,
        created_at: kst.toISOString().replace('Z', '+09:00'),
      }),
    })
  } catch (e) {
    console.error('[rag] saveChatLog error:', e)
  }
}

// ─────────────────────────────────────────
// 5. 테넌트 봇 설정 조회 (fetch 직접)
// ─────────────────────────────────────────
async function getTenantSettings(
  tenantId: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<any | null> {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/tenants?id=eq.${tenantId}&is_deleted=eq.false&select=id,is_active,bot_name,greeting_message,fallback_message,system_prompt,response_tone,max_response_length,business_hours_enabled,business_hours,off_hours_message`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    )
    if (!res.ok) return null
    const rows = (await res.json()) as any[]
    return rows[0] || null
  } catch {
    return null
  }
}

// ─────────────────────────────────────────
// 6. 메인 RAG 파이프라인
// ─────────────────────────────────────────
export async function processMessage(
  tenantId: string,
  userMessage: string,
  channel: string,
  sessionId: string,
  env: {
    GEMINI_API_KEY: string
    SUPABASE_URL: string
    SUPABASE_SERVICE_KEY: string
  }
): Promise<ProcessMessageResult> {
  const startTime = Date.now()

  const supabaseUrl = env.SUPABASE_URL
  const supabaseKey = env.SUPABASE_SERVICE_KEY
  const fallbackResult = (answer: string): ProcessMessageResult => ({
    answer,
    intent: 'OTHER',
    isAnswered: false,
    responseTime: Date.now() - startTime,
  })

  // ── Step 1: 테넌트 설정 조회 ──────────────────────
  const tenant = await getTenantSettings(tenantId, supabaseUrl, supabaseKey)

  if (!tenant) {
    return fallbackResult('존재하지 않는 서비스입니다.')
  }
  if (!tenant.is_active) {
    return fallbackResult('현재 서비스가 중단된 상태입니다.')
  }

  const fallbackMsg = tenant.fallback_message || '죄송합니다. 잘 이해하지 못했습니다. 담당자에게 문의해주세요.'

  // ── Step 2: 운영시간 체크 ─────────────────────────
  if (tenant.business_hours_enabled) {
    const isOpen = isWithinBusinessHours(tenant.business_hours)
    if (!isOpen) {
      const offMsg = tenant.off_hours_message || '현재 운영시간이 아닙니다. 운영시간에 다시 문의해 주세요.'
      await saveChatLog(supabaseUrl, supabaseKey, {
        tenant_id: tenantId,
        session_id: sessionId,
        user_message: userMessage,
        bot_response: offMsg,
        intent: 'OTHER',
        channel,
        is_answered: false,
        response_time: Date.now() - startTime,
      })
      return { answer: offMsg, intent: 'OTHER', isAnswered: false, responseTime: Date.now() - startTime }
    }
  }

  try {
    // ── Step 3: 질문 벡터화 (RETRIEVAL_QUERY) ────────
    let queryEmbedding: number[]
    try {
      queryEmbedding = await generateQueryEmbedding(userMessage, env)
    } catch (e) {
      console.error('[rag] generateQueryEmbedding error:', e)
      // 임베딩 실패 시 컨텍스트 없이 답변 생성
      queryEmbedding = []
    }

    // ── Step 4: 유사 FAQ 검색 (threshold 0.7) ────────
    let matchedDocs: MatchedDocument[] = []
    if (queryEmbedding.length > 0) {
      try {
        matchedDocs = await searchSimilarDocuments(
          tenantId,
          queryEmbedding,
          supabaseUrl,
          supabaseKey,
          MATCH_COUNT
        )
      } catch (e) {
        console.error('[rag] searchSimilarDocuments error:', e)
      }
    }

    // ── Step 5: 컨텍스트 구성 (최대 3개) ─────────────
    const context = matchedDocs.length > 0
      ? matchedDocs
          .slice(0, 3)
          .map((doc, i) =>
            `[FAQ ${i + 1}]\n질문: ${doc.question}\n답변: ${doc.answer}`
          )
          .join('\n\n')
      : ''

    // ── Step 6: 최종 답변 생성 ────────────────────────
    const answer = await generateAnswer(userMessage, context, tenant, env)

    // ── Step 7: 의도 분류 (키워드 기반) ──────────────
    const intent = classifyIntent(userMessage, matchedDocs)

    const isAnswered = matchedDocs.length > 0 || answer.length > 0
    const responseTime = Date.now() - startTime

    // ── Step 8: chat_logs 저장 ────────────────────────
    await saveChatLog(supabaseUrl, supabaseKey, {
      tenant_id: tenantId,
      session_id: sessionId,
      user_message: userMessage,
      bot_response: answer,
      intent,
      channel,
      is_answered: isAnswered,
      response_time: responseTime,
    })

    return { answer, intent, isAnswered, responseTime }
  } catch (e) {
    console.error('[rag] processMessage error:', e)
    return fallbackResult(fallbackMsg)
  }
}
