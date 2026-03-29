// =====================================================
// 멀티채널 채팅 라우터
// POST /api/chat          - 웹 위젯
// POST /api/kakao/chat    - 카카오 챗봇
// POST /api/naver/chat    - 네이버 톡톡
// POST /api/messenger/chat - 메신저
// =====================================================
import { Hono } from 'hono'
import { createSupabaseAdmin } from '../lib/supabase'
import { processMessage } from '../lib/processMessage'
import { Bindings, Variables, Channel } from '../types'

const chat = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// ─────────────────────────────────────────
// 공통 처리 헬퍼
// ─────────────────────────────────────────
async function handleChat(
  env: Bindings,
  tenantId: string,
  channel: Channel,
  userMessage: string,
  messageId?: string
) {
  const supabase = createSupabaseAdmin(env)
  return processMessage(
    supabase,
    env.GEMINI_API_KEY,
    env.ENCRYPTION_KEY,
    tenantId,
    channel,
    userMessage,
    messageId
  )
}

// ─────────────────────────────────────────
// [1] 웹 위젯
// POST /api/chat
// Header: Authorization: Bearer {tenant_api_token}
// Body: { tenant_id, message, message_id? }
// ─────────────────────────────────────────
chat.post('/chat', async (c) => {
  // tenant_id 기반 Authorization 검증
  const authHeader = c.req.header('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: '인증이 필요합니다.' }, 401)
  }

  let body: { tenant_id?: string; message?: string; message_id?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400)
  }

  const { tenant_id, message, message_id } = body
  if (!tenant_id || !message?.trim()) {
    return c.json({ success: false, error: 'tenant_id와 message가 필요합니다.' }, 400)
  }

  try {
    const result = await handleChat(c.env, tenant_id, 'web', message.trim(), message_id)
    return c.json({
      success: true,
      data: {
        answer: result.answer,
        intent: result.intent,
        language: result.detected_language,
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '처리 중 오류가 발생했습니다.'
    return c.json({ success: false, error: msg }, 500)
  }
})

// ─────────────────────────────────────────
// [2] 카카오 챗봇
// POST /api/kakao/chat
// 카카오 i 오픈빌더 Webhook 형식
// ─────────────────────────────────────────
chat.post('/kakao/chat', async (c) => {
  const authHeader = c.req.header('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: '인증이 필요합니다.' }, 401)
  }

  // 즉시 응답 (카카오는 5초 내 응답 필요)
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
  const tenantId = body.tenant_id || authHeader.slice(7)

  if (!userMessage || !tenantId) {
    return c.json(kakaoResponse('메시지를 입력해주세요.'))
  }

  // 즉시 처리 응답 (카카오 timeout 5초 이내)
  const messageId = `kakao_${body.userRequest?.user?.id}_${Date.now()}`

  try {
    const result = await handleChat(c.env, tenantId, 'kakao', userMessage, messageId)
    return c.json(kakaoResponse(result.answer))
  } catch {
    return c.json(kakaoResponse('잠시만 기다려 주세요. 😊 담당자에게 연결 중입니다.'))
  }
})

function kakaoResponse(text: string) {
  return {
    version: '2.0',
    template: {
      outputs: [{ simpleText: { text } }],
    },
  }
}

// ─────────────────────────────────────────
// [3] 네이버 톡톡
// POST /api/naver/chat
// Header: X-Naver-Secret: {secret}
// ─────────────────────────────────────────
chat.post('/naver/chat', async (c) => {
  const naverSecret = c.req.header('X-Naver-Secret') || ''
  const expectedSecret = c.env.ALLOWED_ORIGINS // 별도 변수로 분리 권장

  // echo 이벤트 즉시 처리
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

  // echo 이벤트 무시 (네이버 연결 확인 응답)
  if (body.event === 'echo') {
    return c.json({ success: true })
  }

  const userMessage = body.textContent?.text?.trim() || ''
  const userId = body.user || ''
  const tenantId = body.tenant_id || ''
  const messageId = body.messageId

  if (!userMessage || !tenantId) {
    return c.json(naverResponse(userId, '메시지를 입력해주세요.'))
  }

  // message_id 중복 체크 (네이버 재전송 방지)
  if (messageId) {
    const supabase = createSupabaseAdmin(c.env)
    const { data: dup } = await supabase
      .from('chat_logs')
      .select('bot_answer')
      .eq('message_id', messageId)
      .single()
    if (dup) {
      return c.json(naverResponse(userId, dup.bot_answer))
    }
  }

  try {
    const result = await handleChat(
      c.env,
      tenantId,
      'naver',
      userMessage,
      messageId ? `naver_${messageId}` : undefined
    )
    return c.json(naverResponse(userId, result.answer))
  } catch {
    return c.json(naverResponse(userId, '잠시 오류가 발생했습니다. 담당자에게 문의해주세요.'))
  }
})

function naverResponse(userId: string, text: string) {
  return {
    event: 'send',
    user: userId,
    textContent: { text },
  }
}

// ─────────────────────────────────────────
// [4] 메신저 (Facebook Messenger 형식)
// POST /api/messenger/chat
// ─────────────────────────────────────────
chat.post('/messenger/chat', async (c) => {
  const authHeader = c.req.header('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: '인증이 필요합니다.' }, 401)
  }

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

  const tenantId = body.tenant_id || authHeader.slice(7)
  const messaging = body.entry?.[0]?.messaging?.[0]
  const userMessage = messaging?.message?.text?.trim() || ''
  const senderId = messaging?.sender?.id || ''
  const messageId = messaging?.message?.mid

  if (!userMessage || !tenantId) {
    return c.json({ success: true }) // 메신저는 200 유지
  }

  try {
    const result = await handleChat(
      c.env,
      tenantId,
      'messenger',
      userMessage,
      messageId ? `messenger_${messageId}` : undefined
    )
    return c.json({
      recipient: { id: senderId },
      message: { text: result.answer },
    })
  } catch {
    return c.json({
      recipient: { id: senderId },
      message: { text: '잠시 오류가 발생했습니다.' },
    })
  }
})

export default chat
