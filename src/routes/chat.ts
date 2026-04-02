// =====================================================
// 챗봇 API 라우터 (RAG 기반)
// POST /api/chat         - 웹 위젯 (Authorization 필요)
// POST /api/chat/widget  - 임베드 위젯 (CORS 오픈, tenant_id 필수)
// POST /api/kakao/chat   - 카카오 챗봇
// POST /api/naver/chat   - 네이버 톡톡
// POST /api/messenger/chat - 메신저
// =====================================================
import { Hono } from 'hono'
import { processMessage } from '../services/rag'
import { Bindings, Variables } from '../types'

const chat = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// ─────────────────────────────────────────
// Supabase 설정 확인 헬퍼
// ─────────────────────────────────────────
function isSupabaseConfigured(env: Bindings): boolean {
  return (
    !!env.SUPABASE_URL &&
    !env.SUPABASE_URL.includes('your-project') &&
    !!env.SUPABASE_SERVICE_KEY &&
    !env.SUPABASE_SERVICE_KEY.includes('your_supabase')
  )
}

// ─────────────────────────────────────────
// 로컬 Fallback 처리 (Supabase 미연결 시)
// ─────────────────────────────────────────
// 로컬 키워드 응답 (Supabase 미연결 or local-test- ID)
function localKeywordReply(
  userMessage: string,
  startTime: number
): { answer: string; intent: string; isAnswered: boolean; responseTime: number } {
  const msg = userMessage.toLowerCase()
  let answer = '안녕하세요! 무엇을 도와드릴까요? 😊'
  let intent = 'OTHER'

  if (/^(안녕|hello|hi)/.test(msg)) {
    answer = '안녕하세요! 무엇을 도와드릴까요? 😊'
    intent = 'GREETING'
  } else if (/(배송|주문|택배)/.test(msg)) {
    answer = '배송 문의는 주문번호를 알려주시면 확인해드립니다.'
    intent = 'ORDER_INQUIRY'
  } else if (/(환불|취소|반품)/.test(msg)) {
    answer = '환불/취소는 고객센터(1234-5678)로 문의해주세요.'
    intent = 'COMPLAINT'
  } else {
    answer = '안녕하세요! 무엇이든 물어보세요. 😊'
    intent = 'OTHER'
  }

  return { answer, intent, isAnswered: intent !== 'OTHER', responseTime: Date.now() - startTime }
}

async function handleChatFallback(
  env: Bindings,
  tenantId: string,
  userMessage: string,
  channel: string,
  sessionId: string
): Promise<{ answer: string; intent: string; isAnswered: boolean; responseTime: number }> {
  const startTime = Date.now()

  // Supabase 미설정 or 로컬 테스트 ID → 키워드 응답
  if (!isSupabaseConfigured(env) || tenantId.startsWith('local-test-')) {
    return localKeywordReply(userMessage, startTime)
  }

  // Supabase 설정됨 → RAG 파이프라인
  return processMessage(tenantId, userMessage, channel, sessionId, {
    GEMINI_API_KEY: env.GEMINI_API_KEY,
    SUPABASE_URL: env.SUPABASE_URL,
    SUPABASE_SERVICE_KEY: env.SUPABASE_SERVICE_KEY,
  })
}

// ─────────────────────────────────────────
// [1] 웹 위젯
// POST /api/chat
// Body: { tenant_id, message, channel?, session_id? }
// ─────────────────────────────────────────
chat.post('/chat', async (c) => {
  let body: {
    tenant_id?: string
    message?: string
    channel?: string
    session_id?: string
  }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400)
  }

  const { tenant_id, message, channel = 'web' } = body
  const session_id = body.session_id || crypto.randomUUID()

  if (!tenant_id || !message?.trim()) {
    return c.json({ success: false, error: 'tenant_id와 message가 필요합니다.' }, 400)
  }

  try {
    const result = await handleChatFallback(
      c.env,
      tenant_id,
      message.trim(),
      channel,
      session_id
    )
    return c.json({
      success: true,
      answer: result.answer,
      intent: result.intent,
      isAnswered: result.isAnswered,
      responseTime: result.responseTime,
      session_id,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '처리 중 오류가 발생했습니다.'
    console.error('[chat] /api/chat error:', msg)
    return c.json({ success: false, answer: '죄송합니다. 잠시 후 다시 시도해주세요.', error: msg }, 500)
  }
})

// ─────────────────────────────────────────
// [2] 임베드 위젯 (CORS 오픈)
// POST /api/chat/widget
// OPTIONS preflight 처리
// ─────────────────────────────────────────
const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

chat.options('/chat/widget', (c) => {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
})

chat.post('/chat/widget', async (c) => {
  let body: {
    tenant_id?: string
    message?: string
    channel?: string
    session_id?: string
  }
  try {
    body = await c.req.json()
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: '잘못된 요청 형식입니다.' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    )
  }

  const { tenant_id, message, channel = 'web' } = body
  const session_id = body.session_id || crypto.randomUUID()

  if (!tenant_id || !message?.trim()) {
    return new Response(
      JSON.stringify({ success: false, error: 'tenant_id와 message가 필요합니다.' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    )
  }

  try {
    const result = await handleChatFallback(
      c.env,
      tenant_id,
      message.trim(),
      channel,
      session_id
    )
    return new Response(
      JSON.stringify({
        success: true,
        answer: result.answer,
        intent: result.intent,
        isAnswered: result.isAnswered,
        responseTime: result.responseTime,
        session_id,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    )
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '처리 중 오류가 발생했습니다.'
    console.error('[chat] /api/chat/widget error:', msg)
    return new Response(
      JSON.stringify({ success: false, answer: '죄송합니다. 잠시 후 다시 시도해주세요.' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    )
  }
})

// ─────────────────────────────────────────
// [3] 카카오 챗봇
// POST /api/kakao/chat
// ─────────────────────────────────────────
chat.post('/kakao/chat', async (c) => {
  let body: {
    userRequest?: { utterance?: string; user?: { id?: string } }
    bot?: { id?: string }
    tenant_id?: string
  }
  try {
    body = await c.req.json()
  } catch {
    return c.json(kakaoResponse('잠시 오류가 발생했습니다.'))
  }

  const userMessage = body.userRequest?.utterance?.trim() || ''
  const tenantId    = body.tenant_id || ''
  const sessionId   = `kakao_${body.userRequest?.user?.id || 'anon'}_${Date.now()}`

  if (!userMessage || !tenantId) {
    return c.json(kakaoResponse('메시지를 입력해주세요.'))
  }

  try {
    const result = await handleChatFallback(c.env, tenantId, userMessage, 'kakao', sessionId)
    return c.json(kakaoResponse(result.answer))
  } catch {
    return c.json(kakaoResponse('잠시만 기다려 주세요. 😊 담당자에게 연결 중입니다.'))
  }
})

function kakaoResponse(text: string) {
  return { version: '2.0', template: { outputs: [{ simpleText: { text } }] } }
}

// ─────────────────────────────────────────
// [4] 네이버 톡톡
// POST /api/naver/chat
// ─────────────────────────────────────────
chat.post('/naver/chat', async (c) => {
  let body: {
    event?: string
    user?: string
    textContent?: { text?: string }
    tenant_id?: string
    messageId?: string
  }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ success: false }, 400)
  }

  if (body.event === 'echo') return c.json({ success: true })

  const userMessage = body.textContent?.text?.trim() || ''
  const userId      = body.user || ''
  const tenantId    = body.tenant_id || ''
  const sessionId   = `naver_${userId}_${Date.now()}`

  if (!userMessage || !tenantId) {
    return c.json(naverResponse(userId, '메시지를 입력해주세요.'))
  }

  try {
    const result = await handleChatFallback(c.env, tenantId, userMessage, 'naver', sessionId)
    return c.json(naverResponse(userId, result.answer))
  } catch {
    return c.json(naverResponse(userId, '잠시 오류가 발생했습니다. 담당자에게 문의해주세요.'))
  }
})

function naverResponse(userId: string, text: string) {
  return { event: 'send', user: userId, textContent: { text } }
}

// ─────────────────────────────────────────
// [5] 메신저
// POST /api/messenger/chat
// ─────────────────────────────────────────
chat.post('/messenger/chat', async (c) => {
  let body: {
    entry?: {
      messaging?: {
        sender?: { id?: string }
        message?: { text?: string; mid?: string }
      }[]
    }[]
    tenant_id?: string
  }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400)
  }

  const tenantId   = body.tenant_id || ''
  const messaging  = body.entry?.[0]?.messaging?.[0]
  const userMessage = messaging?.message?.text?.trim() || ''
  const senderId   = messaging?.sender?.id || ''
  const sessionId  = `messenger_${senderId}_${Date.now()}`

  if (!userMessage || !tenantId) return c.json({ success: true })

  try {
    const result = await handleChatFallback(c.env, tenantId, userMessage, 'messenger', sessionId)
    return c.json({ recipient: { id: senderId }, message: { text: result.answer } })
  } catch {
    return c.json({ recipient: { id: senderId }, message: { text: '잠시 오류가 발생했습니다.' } })
  }
})

export default chat
