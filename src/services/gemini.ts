// =====================================================
// Gemini AI 서비스
// - gemini-embedding-001 (768차원) ← text-embedding-004 폐기됨(2026-01-14)
// - gemini-1.5-flash (답변 생성, FAQ 개선)
// - Cloudflare Workers fetch API 전용 (node-fetch 금지)
// =====================================================

const GEMINI_API_BASE = 'https://gateway.ai.cloudflare.com/v1/4d630c2b8828c3d9c6d9d69a33e66b33/gemini-open/google-ai-studio/v1beta'
const EMBED_MODEL     = 'models/gemini-embedding-001'   // ⚠️ text-embedding-004 폐기됨
const CHAT_MODEL = 'models/gemini-2.5-flash'
const EMBED_DIM       = 768

// ─────────────────────────────────────────
// 공통: fetch with timeout (Cloudflare Workers)
// ─────────────────────────────────────────
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 15000
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// ─────────────────────────────────────────
// 1. 문서 임베딩 생성 (RETRIEVAL_DOCUMENT)
//    FAQ 저장 시 사용
// ─────────────────────────────────────────
export async function generateEmbedding(
  text: string,
  env: { GEMINI_API_KEY: string }
): Promise<number[]> {
  const apiKey = env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.')

  const res = await fetchWithTimeout(
    `${GEMINI_API_BASE}/${EMBED_MODEL}:embedContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        model: EMBED_MODEL,
        content: { parts: [{ text }] },
        taskType: 'RETRIEVAL_DOCUMENT',
      }),
    },
    20000
  )

  if (!res.ok) {
    const errBody = await res.text()
    console.error('[gemini] generateEmbedding error:', res.status, errBody)
    throw new Error(`Gemini Embedding API error: ${res.status} - ${errBody}`)
  }

  const json = (await res.json()) as { embedding?: { values?: number[] } }
  const values = json.embedding?.values
  if (!values || values.length === 0) {
    throw new Error('임베딩 값이 비어 있습니다.')
  }
  return values
}

// ─────────────────────────────────────────
// 2. 쿼리 임베딩 생성 (RETRIEVAL_QUERY)
//    검색 질문 벡터화 시 사용
// ─────────────────────────────────────────
export async function generateQueryEmbedding(
  text: string,
  env: { GEMINI_API_KEY: string }
): Promise<number[]> {
  const apiKey = env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.')

  const res = await fetchWithTimeout(
    `${GEMINI_API_BASE}/${EMBED_MODEL}:embedContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        model: EMBED_MODEL,
        content: { parts: [{ text }] },
        taskType: 'RETRIEVAL_QUERY',
      }),
    },
    15000
  )

  if (!res.ok) {
    const errBody = await res.text()
    console.error('[gemini] generateQueryEmbedding error:', res.status, errBody)
    throw new Error(`Gemini Query Embedding API error: ${res.status}`)
  }

  const json = (await res.json()) as { embedding?: { values?: number[] } }
  const values = json.embedding?.values
  if (!values || values.length === 0) {
    throw new Error('쿼리 임베딩 값이 비어 있습니다.')
  }
  return values
}

// ─────────────────────────────────────────
// 3. 최종 답변 생성 (gemini-1.5-flash)
//    context 있으면 FAQ 기반, 없으면 일반 답변
// ─────────────────────────────────────────
export async function generateAnswer(
  question: string,
  context: string,
  botSettings: {
    bot_name?: string
    system_prompt?: string
    response_tone?: string
    max_response_length?: number
    fallback_message?: string
    greeting_message?: string
  } | null,
  env: { GEMINI_API_KEY: string }
): Promise<string> {
  const apiKey = env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.')

  const botName      = botSettings?.bot_name || 'AI 상담봇'
  const tone         = botSettings?.response_tone || 'friendly'
  const maxLen       = botSettings?.max_response_length || 800
  const fallbackMsg  = botSettings?.fallback_message || '죄송합니다. 잘 이해하지 못했습니다. 담당자에게 문의해주세요.'
  const systemPrompt = botSettings?.system_prompt || ''

  const toneGuide =
    tone === 'professional'
      ? '전문적이고 정중한 어조로'
      : tone === 'casual'
      ? '편안하고 친근한 어조로'
      : '친절하고 따뜻한 어조로'

  let prompt: string
  if (context && context.trim().length > 0) {
    // FAQ 기반 답변
    prompt = `당신은 ${botName}입니다.
${systemPrompt ? `\n운영 지침: ${systemPrompt}\n` : ''}
아래 FAQ 참고자료를 바탕으로 고객 질문에 ${toneGuide} 한국어로 답변하세요.
참고자료에 없는 내용은 "담당자에게 문의해주세요"라고 안내하세요.
답변은 ${maxLen}자 이내로 작성하세요.

[FAQ 참고자료]
${context}

[고객 질문]
${question}

[답변]`
  } else {
    // 일반 답변 (FAQ 없음)
    prompt = `당신은 ${botName}입니다.
${systemPrompt ? `\n운영 지침: ${systemPrompt}\n` : ''}
고객의 질문에 ${toneGuide} 한국어로 답변하세요.
답변은 ${maxLen}자 이내로 작성하세요.
정확한 정보가 없으면 다음 안내 문구로 응답하세요: "${fallbackMsg}"

[고객 질문]
${question}

[답변]`
  }

  const res = await fetchWithTimeout(
    `${GEMINI_API_BASE}/${CHAT_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: Math.min(maxLen * 5, 4096),
          topP: 0.8,
          topK: 40,
        },
      }),
    },
    20000
  )

  if (!res.ok) {
    const errBody = await res.text()
    console.error('[gemini] generateAnswer error:', res.status, errBody)
    return fallbackMsg
  }

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const answer = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
  return answer || fallbackMsg
}

// ─────────────────────────────────────────
// ─────────────────────────────────────────
// 5. 유사 질문 생성 (임베딩 품질 향상)
// ─────────────────────────────────────────
export async function generateSimilarQuestions(
  question: string,
  answer: string,
  env: { GEMINI_API_KEY: string }
): Promise<string[]> {
  const apiKey = env.GEMINI_API_KEY
  if (!apiKey) return []

  try {
    const res = await fetchWithTimeout(
      `${GEMINI_API_BASE}/${CHAT_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `다음 FAQ 질문과 동일한 의미의 짧은 한국어 질문 5개를 JSON 문자열 배열로만 출력하세요.
FAQ 질문: ${question}

출력 형식 예시(이 형식만 허용):
["질문1", "질문2", "질문3", "질문4", "질문5"]

주의: 객체({})가 아닌 문자열 배열만 출력, 마크다운 없이 JSON만 출력` }]
          }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 500 },
        }),
      },
      10000
    )
    if (!res.ok) return []
    const json = await res.json() as any
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text || ''
    // 마크다운 코드블록 제거 후 JSON 파싱
    const clean = text.replace(/```json/g, '').replace(/```/g, '').trim()
    const match = clean.match(/\[.*\]/s)
    if (!match) return []
    try { return JSON.parse(match[0]) as string[] } catch { return [] }
  } catch {
    return []
  }
}

// 4. FAQ 자동 개선 (refine)
//    한국어로 자연스럽게 다듬기
// ─────────────────────────────────────────
export async function refineDocument(
  question: string,
  answer: string,
  env: { GEMINI_API_KEY: string }
): Promise<{ refined_question: string; refined_answer: string }> {
  const apiKey = env.GEMINI_API_KEY
  if (!apiKey) {
    return { refined_question: question, refined_answer: answer }
  }

  const prompt = `다음 FAQ를 고객 서비스에 적합하게 자연스럽고 명확한 한국어로 개선해주세요.
반드시 다음 JSON 형식으로만 반환하세요 (다른 텍스트 없이):
{"refined_question":"개선된 질문","refined_answer":"개선된 답변"}

원본 질문: ${question}
원본 답변: ${answer}`

  try {
    const res = await fetchWithTimeout(
      `${GEMINI_API_BASE}/${CHAT_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
        }),
      },
      15000
    )

    if (!res.ok) {
      console.error('[gemini] refineDocument error:', res.status)
      return { refined_question: question, refined_answer: answer }
    }

    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
    }
    const raw = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''

    // JSON 파싱 (마크다운 코드블록 제거)
    const cleaned = raw
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .trim()

    const parsed = JSON.parse(cleaned)
    if (parsed.refined_question && parsed.refined_answer) {
      return {
        refined_question: parsed.refined_question,
        refined_answer:   parsed.refined_answer,
      }
    }
    throw new Error('Invalid JSON structure')
  } catch (e) {
    console.error('[gemini] refineDocument parse error:', e)
    return { refined_question: question, refined_answer: answer }
  }
}
