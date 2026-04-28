// =====================================================
// Google Gemini 2.0 Flash & text-embedding-004 클라이언트
// =====================================================
import { Intent } from '../types'

const GEMINI_API_BASE = 'https://gateway.ai.cloudflare.com/v1/4d630c2b8828c3d9c6d9d69a33e66b33/gemini-open/google-ai-studio/v1beta'
const EMBED_MODEL = 'models/gemini-embedding-001'
const CHAT_MODEL = 'models/gemini-2.0-flash'

// ─────────────────────────────────────────
// 1. 텍스트 생성 (Gemini 2.0 Flash)
// ─────────────────────────────────────────
export async function generateText(
  apiKey: string,
  prompt: string,
  timeoutMs = 15000
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(
      `${GEMINI_API_BASE}/${CHAT_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
        }),
      }
    )
    if (!res.ok) throw new Error(`Gemini API error: ${res.status}`)
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
    }
    return json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
  } finally {
    clearTimeout(timer)
  }
}

// ─────────────────────────────────────────
// 2. 텍스트 임베딩 (text-embedding-004, 768차원)
// ─────────────────────────────────────────
export async function embedText(
  apiKey: string,
  text: string
): Promise<number[]> {
  const res = await fetch(
    `${GEMINI_API_BASE}/${EMBED_MODEL}:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EMBED_MODEL,
        content: { parts: [{ text }] },
        taskType: 'RETRIEVAL_DOCUMENT',
        outputDimensionality: 768,
      }),
    }
  )
  if (!res.ok) throw new Error(`Embedding API error: ${res.status}`)
  const json = (await res.json()) as {
    embedding?: { values?: number[] }
  }
  const values = json.embedding?.values
  if (!values || values.length === 0)
    throw new Error('임베딩 차원 오류: 768차원이 아닙니다.')
  return values
}

// ─────────────────────────────────────────
// 3. 쿼리 임베딩 (검색용 taskType 분리)
// ─────────────────────────────────────────
export async function embedQuery(
  apiKey: string,
  text: string
): Promise<number[]> {
  const res = await fetch(
    `${GEMINI_API_BASE}/${EMBED_MODEL}:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EMBED_MODEL,
        content: { parts: [{ text }] },
        taskType: 'RETRIEVAL_QUERY',
        outputDimensionality: 768,
      }),
    }
  )
  if (!res.ok) throw new Error(`Embedding API error: ${res.status}`)
  const json = (await res.json()) as {
    embedding?: { values?: number[] }
  }
  return json.embedding?.values ?? []
}

// ─────────────────────────────────────────
// 4. 언어 감지 (ko / en / ja)
// ─────────────────────────────────────────
export async function detectLanguage(
  apiKey: string,
  text: string
): Promise<string> {
  const prompt = `다음 텍스트의 언어를 감지하세요. 반드시 "ko", "en", "ja" 중 하나만 반환하세요 (다른 텍스트 없이).
텍스트: "${text.slice(0, 200)}"`
  try {
    const result = await generateText(apiKey, prompt, 5000)
    const lang = result.toLowerCase().trim()
    if (['ko', 'en', 'ja'].includes(lang)) return lang
    return 'ko'
  } catch {
    return 'ko'
  }
}

// ─────────────────────────────────────────
// 5. 의도 분류
// ─────────────────────────────────────────
const VALID_INTENTS: Intent[] = [
  'FAQ_INQUIRY', 'RESERVATION', 'PAYMENT',
  'COMPLAINT', 'GREETING', 'ORDER_INQUIRY', 'OTHER',
]

export async function classifyIntent(
  apiKey: string,
  text: string
): Promise<Intent> {
  const prompt = `다음 고객 메시지의 의도를 분류하세요.
반드시 다음 중 하나만 반환하세요 (다른 텍스트 없이):
FAQ_INQUIRY, RESERVATION, PAYMENT, COMPLAINT, GREETING, ORDER_INQUIRY, OTHER

- ORDER_INQUIRY: 주문, 배송, 주문번호, 배송조회, 운송장 관련
- GREETING: 안녕, 안녕하세요, 반가워요, 처음 등 인사
- FAQ_INQUIRY: 일반 질문, 사용법, 정책, 환불 등
- RESERVATION: 예약, 예매, 일정 관련
- PAYMENT: 결제, 카드, 환불, 취소 결제 관련
- COMPLAINT: 불만, 불편, 항의 관련
- OTHER: 분류 불가

메시지: "${text.slice(0, 300)}"`

  try {
    const result = await generateText(apiKey, prompt, 5000)
    const intent = result.trim().toUpperCase() as Intent
    if (VALID_INTENTS.includes(intent)) return intent
    return 'FAQ_INQUIRY'
  } catch {
    return 'FAQ_INQUIRY'
  }
}

// ─────────────────────────────────────────
// 6. FAQ 자동 정리 (10초 타임아웃)
// ─────────────────────────────────────────
export async function refineeFAQ(
  apiKey: string,
  question: string,
  answer: string
): Promise<{ question: string; answer: string }> {
  const prompt = `다음 FAQ를 자연스럽게 정리해줘. JSON으로만 반환:
{"question":"정리된 질문","answer":"정리된 답변"}
원본 질문: ${question}
원본 답변: ${answer}`

  try {
    const result = await generateText(apiKey, prompt, 10000)
    // JSON 파싱 (마크다운 코드블록 제거)
    const cleaned = result.replace(/```json\n?/gi, '').replace(/```\n?/gi, '').trim()
    const parsed = JSON.parse(cleaned)
    if (parsed.question && parsed.answer) {
      return { question: parsed.question, answer: parsed.answer }
    }
    throw new Error('Invalid JSON structure')
  } catch {
    // 폴백: 원본 반환
    return { question, answer }
  }
}

// ─────────────────────────────────────────
// 7. RAG 기반 답변 생성
// ─────────────────────────────────────────
export async function generateRAGAnswer(
  apiKey: string,
  botName: string,
  context: string,
  userMessage: string,
  language: string
): Promise<string> {
  const langGuide =
    language === 'en'
      ? 'Please respond in English.'
      : language === 'ja'
      ? '日本語で回答してください。'
      : '한국어로 답변하세요.'

  const prompt = `당신은 ${botName}입니다. ${langGuide}
아래 참고자료를 바탕으로 친절하고 간결하게 답변하세요.
자료에 없는 내용은 '담당자에게 문의해주세요'라고 안내하세요.

[참고자료]
${context}

[고객 질문]
${userMessage}`

  return generateText(apiKey, prompt, 10000)
}
