// =====================================================
// RAG (Retrieval-Augmented Generation) 서비스 - D1 버전
// - D1에서 FAQ 문서 검색 (embedding 유사도 계산)
// - processMessage: 전체 RAG 파이프라인
// - Cloudflare Workers 호환 (node-fetch 금지)
// =====================================================
import { generateQueryEmbedding, generateAnswer, classifyScenario } from './gemini'
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
  imageUrl?: string
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
      id: string; question: string; answer: string; category: string; embedding: string; image_url: string | null
    }>(env,
      `SELECT id, question, answer, category, embedding, image_url
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
        console.log('[RAG DEBUG] question:', doc.question, '| similarity:', doc.similarity)
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
    // ── Step 1-1: 시나리오 매칭 (점수 기반 + AI 분류기) ──
    // - 단일 우위: 즉시 응답 (Gemini 호출 없음)
    // - 동점/근접: AI 분류기로 의도 판단 (응답 생성 X, 분류만)
    // - AI가 "해당없음" 판단 시 FAQ 단계로 진행
    let scenarioMatched = false
    try {
      const sqlResult = await dbAll<{
        id: string; trigger_keywords: string; response_template: string; type: string; name: string; description: string
      }>(env,
        `SELECT id, trigger_keywords, response_template, type, name, description, image_url FROM scenarios WHERE tenant_id = ? AND is_active = 1 AND response_template != '' ORDER BY sort_order ASC, created_at ASC`,
        tenantId
      )
      const scenarioRows = sqlResult.data

      if (scenarioRows && scenarioRows.length > 0) {
        const msgLower = userMessage.toLowerCase()
        const plan = String((tenant && (tenant as any).plan) || 'basic').toLowerCase()

        // 1) 모든 시나리오에 대해 점수 계산
        const scored = scenarioRows.map(sc => {
          let keywords: string[] = []
          try { keywords = JSON.parse(sc.trigger_keywords) } catch {}
          const matchedKeywords = keywords.filter(kw => kw && msgLower.includes(kw.toLowerCase()))
          return { sc, score: matchedKeywords.length, matchedKeywords }
        }).filter(s => s.score > 0)
          .sort((a, b) => b.score - a.score)

        if (scored.length > 0) {
          const top = scored[0]
          const second = scored[1]
const ambiguous = scored.length >= 2

          let chosen = top.sc

          if (ambiguous) {
            // 2) AI 분류기 호출 (시나리오 번호만 반환)
            console.log('[rag] ambiguous scenarios, calling classifier:', scored.slice(0, 3).map(s => `${s.sc.name}(${s.score})`).join(', '))
            try {
              const candidates = scored.slice(0, 3)
              const optionsText = candidates.map((s, i) =>
                `${i + 1}. ${s.sc.name}${s.sc.description ? ` - ${s.sc.description}` : ''}`
              ).join('\n')

              const classifyPrompt = `다음 시나리오 중 사용자 질문이 가장 잘 맞는 번호 하나만 답하세요. 어느 것도 해당하지 않으면 0을 답하세요. 숫자만 답하고 다른 말은 하지 마세요.

${optionsText}
0. 위 항목 모두 해당 없음

사용자 질문: "${userMessage}"
답변(숫자만):`

              const CLASSIFY_TIMEOUT_MS = 3000
              const classifyTimeout = new Promise<string>((_, reject) =>
                setTimeout(() => reject(new Error('classifier timeout')), CLASSIFY_TIMEOUT_MS)
              )
              const classifyResult = await Promise.race([
              classifyScenario(classifyPrompt, env),
                classifyTimeout
              ])

              const numMatch = String(classifyResult).match(/\d/)
              const choice = numMatch ? parseInt(numMatch[0], 10) : -1

              if (choice === 0) {
                console.log('[rag] classifier: no match, fallback to FAQ')
                scenarioMatched = false
              } else if (choice >= 1 && choice <= candidates.length) {
                chosen = candidates[choice - 1].sc
                console.log('[rag] classifier chose:', chosen.name)
                scenarioMatched = true
              } else {
                console.log('[rag] classifier invalid response, using top match')
                scenarioMatched = true
              }
            } catch (classifyErr) {
              console.log('[rag] classifier failed, using top match:', classifyErr)
              scenarioMatched = true
            }
          } else {
            scenarioMatched = true
          }

          if (scenarioMatched) {
            let responses: string[] = []
            try {
              const parsed = JSON.parse(chosen.response_template)
              responses = Array.isArray(parsed) ? parsed.filter(r => r && typeof r === 'string') : [chosen.response_template]
            } catch {
              responses = [chosen.response_template]
            }
            if (responses.length === 0) responses = [chosen.response_template]

            const answer = plan === 'basic'
              ? responses[0]
              : responses[Math.floor(Math.random() * responses.length)]

            saveChatLog(env, {
              tenant_id: tenantId,
              session_id: sessionId,
              user_message: userMessage,
              bot_response: answer,
              intent: chosen.type || 'SCENARIO',
              channel,
              is_answered: true,
              response_time: Date.now() - startTime
            }).catch(err => console.error('[rag] saveChatLog error:', err))

            return { answer, intent: chosen.type || 'SCENARIO', isAnswered: true, responseTime: Date.now() - startTime, imageUrl: chosen.image_url || undefined }
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
          id: string; question: string; answer: string; category: string; embedding: string; image_url: string | null
        }>(env,
          `SELECT id, question, answer, category, embedding, image_url
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

          // ── Step 5.5: 고유사도 FAQ 직접 반환 (Gemini 호출 회피)
    const HIGH_CONFIDENCE_THRESHOLD = 0.70
    if (finalDocs.length > 0 && finalDocs[0].similarity >= HIGH_CONFIDENCE_THRESHOLD) {
      console.log('[rag] high confidence FAQ match:', finalDocs[0].similarity.toFixed(4), '→ direct return')
      const answer = finalDocs[0].answer
      saveChatLog(env, {
        tenant_id: tenantId,
        session_id: sessionId,
        user_message: userMessage,
        bot_response: answer,
        intent: 'FAQ_DIRECT',
        channel,
        is_answered: true,
        response_time: Date.now() - startTime
      }).catch(err => console.error('[rag] saveChatLog error:', err))
      return { answer, intent: 'FAQ_DIRECT', isAnswered: true, responseTime: Date.now() - startTime, imageUrl: finalDocs[0].image_url || undefined }
    }

        // ── Step 6: 최종 답변 생성 (4초 타임아웃) ─────────
    const GEMINI_TIMEOUT_MS = 4000
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
      await saveChatLog(env, {
        tenant_id: tenantId, session_id: sessionId,
        user_message: userMessage, bot_response: fallbackMsg,
        intent: 'OTHER', channel, is_answered: false,
        response_time: Date.now() - startTime,
      })
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
