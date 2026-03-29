// =====================================================
// processMessage - AI 상담봇 핵심 처리 함수
// =====================================================
import { SupabaseClient } from '@supabase/supabase-js'
import {
  detectLanguage,
  classifyIntent,
  embedQuery,
  generateRAGAnswer,
} from './gemini'
import { handleOrderInquiry, lookupOrder, formatOrderResult } from './orderLookup'
import { Channel, Intent, ProcessMessageResult } from '../types'

const MIN_SIMILARITY = 0.7
const TOP_K = 3

// KST 타임존 오프셋 (UTC+9)
function nowKST(): string {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().replace('Z', '+09:00')
}

export async function processMessage(
  supabase: SupabaseClient,
  geminiKey: string,
  encKey: string,
  tenantId: string,
  channel: Channel,
  userMessage: string,
  messageId?: string
): Promise<ProcessMessageResult> {
  // ─── Step 1: Tenant 조회 및 활성 상태 확인 ───
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id, is_active, bot_name, greeting_message, supported_languages')
    .eq('id', tenantId)
    .eq('is_deleted', false)
    .single()

  if (tenantError || !tenant) {
    throw new Error('존재하지 않는 서비스입니다.')
  }
  if (!tenant.is_active) {
    throw new Error('현재 서비스가 중단된 상태입니다.')
  }

  // ─── Step 2: message_id 중복 체크 ───
  if (messageId) {
    const { data: dup } = await supabase
      .from('chat_logs')
      .select('id')
      .eq('message_id', messageId)
      .single()
    if (dup) {
      // 이미 처리된 메시지 → 기존 답변 반환
      const { data: existing } = await supabase
        .from('chat_logs')
        .select('bot_answer, detected_language, intent')
        .eq('message_id', messageId)
        .single()
      if (existing) {
        return {
          answer: existing.bot_answer,
          intent: existing.intent as Intent,
          detected_language: existing.detected_language,
          channel,
        }
      }
    }
  }

  // ─── Step 3: 언어 감지 ───
  const detectedLang = await detectLanguage(geminiKey, userMessage)

  // ─── Step 4: 의도 분류 ───
  const intent = await classifyIntent(geminiKey, userMessage)

  let botAnswer = ''

  // ─── Step 5: GREETING ───
  if (intent === 'GREETING') {
    botAnswer = tenant.greeting_message || '안녕하세요! 무엇을 도와드릴까요? 😊'
  }
  // ─── Step 6: ORDER_INQUIRY ───
  else if (intent === 'ORDER_INQUIRY') {
    botAnswer = await handleOrderInquiry(supabase, encKey, tenantId, channel)
  }
  // ─── Step 7: RAG 검색 (나머지 의도) ───
  else {
    botAnswer = await ragSearch(supabase, geminiKey, tenantId, userMessage, tenant.bot_name, detectedLang)
  }

  // ─── Step 9: chat_logs 저장 (KST) ───
  await supabase.from('chat_logs').insert({
    tenant_id: tenantId,
    message_id: messageId || null,
    channel,
    user_message: userMessage,
    bot_answer: botAnswer,
    detected_language: detectedLang,
    intent,
    created_at: nowKST(),
  })

  // ─── Step 10: 채널별 응답 반환 ───
  return { answer: botAnswer, intent, detected_language: detectedLang, channel }
}

/** RAG 검색 + 답변 생성 */
async function ragSearch(
  supabase: SupabaseClient,
  geminiKey: string,
  tenantId: string,
  userMessage: string,
  botName: string,
  language: string
): Promise<string> {
  // 쿼리 임베딩
  let queryEmbedding: number[]
  try {
    queryEmbedding = await embedQuery(geminiKey, userMessage)
  } catch {
    return '잠시 오류가 발생했습니다. 담당자에게 문의해주세요.'
  }

  // pgvector 코사인 유사도 검색
  const { data: docs, error } = await supabase.rpc('match_documents', {
    query_embedding: queryEmbedding,
    match_tenant_id: tenantId,
    match_threshold: MIN_SIMILARITY,
    match_count: TOP_K,
  })

  if (error) {
    console.error('RAG search error:', error)
    return '담당자에게 문의해주세요.'
  }

  if (!docs || docs.length === 0) {
    return '담당자에게 문의해주세요.'
  }

  // 컨텍스트 구성
  const context = docs
    .map((doc: { content: string; similarity: number }, i: number) =>
      `[${i + 1}] ${doc.content}`
    )
    .join('\n\n')

  // Gemini로 답변 생성
  try {
    return await generateRAGAnswer(geminiKey, botName, context, userMessage, language)
  } catch {
    return '담당자에게 문의해주세요.'
  }
}

/** 주문 조회 후속 처리 (queryType / queryValue 파악 후 호출) */
export async function processOrderLookup(
  supabase: SupabaseClient,
  encKey: string,
  tenantId: string,
  channel: Channel,
  queryType: 'order_id' | 'phone',
  queryValue: string
): Promise<string> {
  const result = await lookupOrder(supabase, encKey, {
    tenantId,
    queryType,
    queryValue,
    channel,
  })
  return formatOrderResult(result)
}
