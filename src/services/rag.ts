// =====================================================
// RAG (Retrieval-Augmented Generation) 서비스 - D1 버전
// - D1에서 FAQ 문서 검색 (embedding 유사도 계산)
// - processMessage: 전체 RAG 파이프라인
// - Cloudflare Workers 호환 (node-fetch 금지)
// =====================================================
import { generateQueryEmbedding, generateAnswer } from './gemini'
import { dbGet, dbAll, dbRun, generateId } from '../lib/db'
import { Bindings } from '../types'

const MATCH_THRESHOLD = 0.3
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
// 1. 코사인 유사도 계산
// ─────────────────────────────────────────
function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

// ─────────────────────────────────────────
// 2. D1에서 유사 문서 검색
// ─────────────────────────────────────────
export async function searchSimilarDocuments(
  tenantId: string,
  queryEmbedding: number[],
  env: Bindings,
  limit: number = MATCH_COUNT
): Promise<MatchedDocument[]> {
  try {
    // 임베딩이 있는 활성 FAQ 전체 조회
    const { data: docs } = await dbAll<{
      id: string; question: string; answer: string; category: string; embedding: string
    }>(env,
      `SELECT id, question, answer, category, embedding
       FROM documents
       WHERE tenant_id = ? AND is_active = 1 AND is_deleted = 0 AND embedding IS NOT NULL
       LIMIT 500`,
      tenantId
    )

    if (!docs || docs.length === 0) return []

    // 코사인 유사도 계산 후 정렬
    const scored = docs
      .map(doc => {
        let docEmbedding: number[] = []
        try { docEmbedding = JSON.parse(doc.embedding) } catch {}
        const similarity = cosineSimilarity(queryEmbedding, docEmbedding)
        return { ...doc, similarity }
      })
      .filter(doc => {
        return doc.similarity >= MATCH_THRESHOLD
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)

    return scored.map(({ id, question, answer, category, similarity }) => ({
      id, question, answer, category, similarity,
    }))
  } catch (e) {
    console.error('[rag] searchSimilarDocuments D1 error:', e)
    return []
  }
}

// ─────────────────────────────────────────
// 3. 운영시간 체크 (KST)
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
// 4. 의도 분류 (키워드 기반)
// ─────────────────────────────────────────
function classifyIntent(
  userMessage: string,
  matchedDocs: MatchedDocument[]
): string {
  const msg = userMessage.toLowerCase()
  if (/^(안녕|hello|hi|반가|처음|방가|ㅎㅇ|안뇽)/.test(msg)) return 'GREETING'
  if (/(주문|배송|배달|운송장|택배|도착|출고|발송|언제|조회)/.test(msg)) return 'ORDER_INQUIRY'
  if (/(환불|취소|불만|항의|화가|짜증|불편|이상|고장|환급|반품|교환)/.test(msg)) return 'COMPLAINT'
  if (/(결제|카드|계좌|이체|입금|영수증|세금계산서)/.test(msg)) return 'PAYMENT'
  if (matchedDocs.length > 0) return 'FAQ_INQUIRY'
  return 'OTHER'
}

// ─────────────────────────────────────────
// 5. chat_logs D1 저장
// ─────────────────────────────────────────
async function saveChatLog(
  env: Bindings,
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
        await dbRun(env,
      `INSERT INTO chat_logs
        (id, tenant_id, session_id, user_message, bot_answer,
         channel, intent, detected_language, response_time_ms, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      generateId(), log.tenant_id, log.session_id,
      log.user_message, log.bot_response,
      log.channel, log.intent, 'ko',
      log.response_time, new Date().toISOString()
    )

  } catch (e) {
    console.error('[rag] saveChatLog D1 error:', e)
  }
}

// ─────────────────────────────────────────
// 6. 테넌트 봇 설정 조회 (D1)
// ─────────────────────────────────────────
async function getTenantSettings(tenantId: string, env: Bindings): Promise<any | null> {
  try {
    const { data } = await dbGet<{
      id: string; is_active: number; bot_name: string; greeting_message: string
      fallback_message: string; system_prompt: string; response_tone: string
      max_response_length: number; business_hours_enabled: number
      business_hours: string; off_hours_message: string
        }>(env,
      `SELECT id, is_active, plan, bot_name, greeting_message, fallback_message,
              system_prompt, response_tone, max_response_length,
              business_hours_enabled, business_hours, off_hours_message
       FROM tenants WHERE id = ? AND is_deleted = 0 LIMIT 1`,
      tenantId
    )

    if (!data) return null

    // JSON 파싱
    let businessHours: any = {}
    try { businessHours = JSON.parse(data.business_hours || '{}') } catch {}

    return {
      ...data,
      is_active: !!data.is_active,
      business_hours_enabled: !!data.business_hours_enabled,
      business_hours: businessHours,
    }
  } catch (e) {
    console.error('[rag] getTenantSettings D1 error:', e)
    return null
  }
}

// ─────────────────────────────────────────
// 7. 메인 RAG 파이프라인 (D1 버전)
// ─────────────────────────────────────────
export async function processMessage(
  tenantId: string,
  userMessage: string,
  channel: string,
  sessionId: string,
  env: Bindings
): Promise<ProcessMessageResult> {
  const startTime = Date.now()

  const fallbackResult = (answer: string): ProcessMessageResult => ({
    answer,
    intent: 'OTHER',
    isAnswered: false,
    responseTime: Date.now() - startTime,
  })

  // ── Step 1: 테넌트 설정 조회 ──────────────────────
  const tenant = await getTenantSettings(tenantId, env)

  if (!tenant) return fallbackResult('존재하지 않는 서비스입니다.')
  if (!tenant.is_active) return fallbackResult('현재 서비스가 중단된 상태입니다.')

  const fallbackMsg = tenant.fallback_message || '죄송합니다. 잘 이해하지 못했습니다. 담당자에게 문의해주세요.'


    // ── Step 1-1: 시나리오 매칭 (키워드 일치시 즉시 반환 - Gemini API 호출 없음) ──
  // - 정렬: sort_order ASC (낮을수록 우선), 같으면 created_at ASC
  // - 응답: BASIC = 첫 번째만, PRO/MASTER = 랜덤 응답 (응답이 배열일 경우)
  try {
    const { data: scenarioRows } = await dbAll<{
      id: string; trigger_keywords: string; response_template: string; type: string
    }>(env,
      `SELECT id, trigger_keywords, response_template, type FROM scenarios WHERE tenant_id = ? AND is_active = 1 AND response_template != '' ORDER BY sort_order ASC, created_at ASC`,
      tenantId
    )
    if (scenarioRows && scenarioRows.length > 0) {
      const msgLower = userMessage.toLowerCase()
      const plan = String((tenant && (tenant as any).plan) || 'basic').toLowerCase()

           for (const sc of scenarioRows) {
        let keywords: string[] = []
        try { keywords = JSON.parse(sc.trigger_keywords) } catch {}
        const matched = keywords.some(kw => kw && msgLower.includes(kw.toLowerCase()))
        if (matched) {
          // 응답 템플릿 파싱: JSON 배열이면 배열로, 아니면 단일 텍스트로
          let responses: string[] = []
          try {
            const parsed = JSON.parse(sc.response_template)
            responses = Array.isArray(parsed) ? parsed.filter(r => r && typeof r === 'string') : [sc.response_template]
          } catch {
            responses = [sc.response_template]
          }
          if (responses.length === 0) responses = [sc.response_template]

          // 요금제별 응답 선택: BASIC = 첫 번째, PRO/MASTER = 랜덤
          let answer: string
          if (plan === 'basic') {
            answer = responses[0]
          } else {
            answer = responses[Math.floor(Math.random() * responses.length)]
          }

          await saveChatLog(env, {
            tenant_id: tenantId,
            session_id: sessionId,
            user_message: userMessage,
            bot_response: answer,
            intent: sc.type || 'SCENARIO',
            channel,
            is_answered: true,
            response_time: Date.now() - startTime
          })
          return { answer, intent: sc.type || 'SCENARIO', isAnswered: true, responseTime: Date.now() - startTime }

        }
      }
    }
  } catch (e) {
    console.error('[rag] scenario match error:', e)
  }


  // ── Step 2: 운영시간 체크 ─────────────────────────
  if (tenant.business_hours_enabled) {
    const isOpen = isWithinBusinessHours(tenant.business_hours)
    if (!isOpen) {
      const offMsg = tenant.off_hours_message || '현재 운영시간이 아닙니다. 운영시간에 다시 문의해 주세요.'
      await saveChatLog(env, {
        tenant_id: tenantId, session_id: sessionId,
        user_message: userMessage, bot_response: offMsg,
        intent: 'OTHER', channel, is_answered: false,
        response_time: Date.now() - startTime,
      })
      return { answer: offMsg, intent: 'OTHER', isAnswered: false, responseTime: Date.now() - startTime }
    }
  }

  try {
    // ── Step 3: 질문 벡터화 ────────────────────────────
    let queryEmbedding: number[] = []
    try {
      queryEmbedding = await generateQueryEmbedding(userMessage, env)
    } catch (e) {
      console.error('[rag] generateQueryEmbedding error:', e)
    }

    // ── Step 4: 유사 FAQ 검색 ─────────────────────────
    let matchedDocs: MatchedDocument[] = []
    if (queryEmbedding.length > 0) { /* debug: threshold disabled */
      try {
        matchedDocs = await searchSimilarDocuments(tenantId, queryEmbedding, env, MATCH_COUNT)
      } catch (e) {
        console.error('[rag] searchSimilarDocuments error:', e)
      }
    }

    // ── Step 4.5: 매칭 실패 시 상위 FAQ fallback ──────
    let finalDocs = matchedDocs
    if (matchedDocs.length === 0 && queryEmbedding.length > 0) {
      try {
        // 임계값 없이 유사도 상위 3개 가져오기
        const { data: allDocs } = await dbAll<{
          id: string; question: string; answer: string; category: string; embedding: string
        }>(env,
          `SELECT id, question, answer, category, embedding
           FROM documents
           WHERE tenant_id = ? AND is_active = 1 AND is_deleted = 0 AND embedding IS NOT NULL
           LIMIT 500`,
          tenantId
        )
        if (allDocs && allDocs.length > 0) {
          finalDocs = allDocs
            .map(doc => {
              let emb: number[] = []
              try { emb = JSON.parse(doc.embedding) } catch {}
              return { ...doc, similarity: cosineSimilarity(queryEmbedding, emb) }
            })
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 3)
        }
      } catch (e) {
        console.error('[rag] fallback context error:', e)
      }
    }

    // ── Step 5: 컨텍스트 구성 ─────────────────────────
    const context = finalDocs.length > 0
      ? finalDocs
          .slice(0, 3)
          .map((doc, i) => `[FAQ ${i + 1}]\n질문: ${doc.question}\n답변: ${doc.answer}`)
          .join('\n\n')
      : ''

        // ── Step 6: 최종 답변 생성 (1.5초 타임아웃) ─────────
    const GEMINI_TIMEOUT_MS = 1500
    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini timeout')), GEMINI_TIMEOUT_MS)
    )
    let answer: string
    try {
      answer = await Promise.race([
        generateAnswer(userMessage, context, tenant, env),
        timeoutPromise
      ])
    } catch (timeoutErr) {
      console.error('[rag] Gemini timeout/error:', timeoutErr)
      // 타임아웃 시 즉시 fallback 메시지 반환
      saveChatLog(env, {
        tenant_id: tenantId, session_id: sessionId,
        user_message: userMessage, bot_response: fallbackMsg,
        intent: 'OTHER', channel, is_answered: false,
        response_time: Date.now() - startTime,
      }).catch(err => console.error('[rag] saveChatLog error:', err))
      return { answer: fallbackMsg, intent: 'OTHER', isAnswered: false, responseTime: Date.now() - startTime }
    }

    // ── Step 7: 의도 분류 ─────────────────────────────
    const intent = classifyIntent(userMessage, matchedDocs)

    const isAnswered    = matchedDocs.length > 0 || answer.length > 0
    const responseTime  = Date.now() - startTime

    // ── Step 8: chat_logs 저장 ────────────────────────
    await saveChatLog(env, {
      tenant_id: tenantId, session_id: sessionId,
      user_message: userMessage, bot_response: answer,
      intent, channel, is_answered: isAnswered, response_time: responseTime,
    })

    return { answer, intent, isAnswered, responseTime }
  } catch (e) {
    console.error('[rag] processMessage error:', e)
    return fallbackResult(fallbackMsg)
  }
}
