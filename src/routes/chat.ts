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
// RAG 파이프라인 (D1 버전)
// ─────────────────────────────────────────
async function handleChat(
  env: Bindings,
  tenantId: string,
  userMessage: string,
  channel: string,
  sessionId: string
): Promise<{ answer: string; intent: string; isAnswered: boolean; responseTime: number }> {
  if (!env.DB) {
    return {
      answer: '서비스가 아직 설정되지 않았습니다.',
      intent: 'OTHER', isAnswered: false, responseTime: 0,
    }
  }

  // 🔒 tenant 유효성 검증 (보안: 가짜 tenant_id로 API 비용 오남용 방지)
  if (!tenantId) {
    console.warn('[handleChat] empty tenant_id rejected')
    return {
      answer: '서비스 이용이 불가합니다. 관리자에게 문의해주세요.',
      intent: 'OTHER', isAnswered: false, responseTime: 0,
    }
  }

  const tenantCheck = await env.DB.prepare(
    'SELECT id, is_active FROM tenants WHERE id = ? AND (is_deleted IS NULL OR is_deleted = 0) LIMIT 1'
  ).bind(tenantId).first<{ id: string; is_active: number }>()

  if (!tenantCheck) {
    console.warn(`[handleChat] invalid tenant_id rejected: ${tenantId} (channel: ${channel})`)
    return {
      answer: '서비스 이용이 불가합니다. 관리자에게 문의해주세요.',
      intent: 'OTHER', isAnswered: false, responseTime: 0,
    }
  }

  if (tenantCheck.is_active !== 1) {
    console.warn(`[handleChat] inactive tenant: ${tenantId}`)
    return {
      answer: '서비스가 일시 중단되었습니다. 관리자에게 문의해주세요.',
      intent: 'OTHER', isAnswered: false, responseTime: 0,
    }
  }

  return processMessage(tenantId, userMessage, channel, sessionId, env)
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
    const result = await handleChat(
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
    const result = await handleChat(
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
  const tenantId    = c.req.query('tenant_id') || body.tenant_id || ''
  const sessionId   = `kakao_${body.userRequest?.user?.id || 'anon'}_${Date.now()}`

  if (!userMessage || !tenantId) {
    return c.json(kakaoResponse('메시지를 입력해주세요.'))
  }

  try {
    const result = await handleChat(c.env, tenantId, userMessage, 'kakao', sessionId)
    return c.json(kakaoResponse(result.answer, result.imageUrl))
  } catch {
    return c.json(kakaoResponse('잠시만 기다려 주세요. 😊 담당자에게 연결 중입니다.'))
  }
})

function kakaoResponse(text: string, imageUrl?: string) {
  if (imageUrl) {
    return {
      version: '2.0',
      template: {
        outputs: [{
          basicCard: {
            description: text,
            thumbnail: { imageUrl }
          }
        }]
      }
    }
  }
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
  const tenantId    = c.req.query('tenant_id') || body.tenant_id || ''
  const sessionId   = `naver_${userId}_${Date.now()}`

  if (!userMessage || !tenantId) {
    return c.json(naverResponse(userId, '메시지를 입력해주세요.'))
  }

  try {
    const result = await handleChat(c.env, tenantId, userMessage, 'naver', sessionId)
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
    const result = await handleChat(c.env, tenantId, userMessage, 'messenger', sessionId)
    return c.json({ recipient: { id: senderId }, message: { text: result.answer } })
  } catch {
    return c.json({ recipient: { id: senderId }, message: { text: '잠시 오류가 발생했습니다.' } })
  }
})

export default chat
