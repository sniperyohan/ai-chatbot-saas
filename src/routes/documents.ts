// =====================================================
// FAQ 문서 관리 라우터 (JWT 필요)
// POST   /api/documents/refine  - Gemini 자동 정리
// POST   /api/documents/embed   - 임베딩 + 저장
// DELETE /api/documents/:id     - 소프트 삭제
// GET    /api/documents         - 목록 조회
// =====================================================
import { Hono } from 'hono'
import { createSupabaseAdmin } from '../lib/supabase'
import { refineeFAQ, embedText } from '../lib/gemini'
import { adminAuthMiddleware } from '../middleware/auth'
import { Bindings, Variables } from '../types'

const documents = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// 모든 라우트에 JWT 인증 적용
documents.use('*', adminAuthMiddleware)

const CHUNK_SIZE = 500 // 500자 초과 시 청크 분할

// ─────────────────────────────────────────
// [1] FAQ 자동 정리 (Gemini)
// POST /api/documents/refine
// ─────────────────────────────────────────
documents.post('/refine', async (c) => {
  let body: { question?: string; answer?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400)
  }

  const { question, answer } = body
  if (!question?.trim() || !answer?.trim()) {
    return c.json({ success: false, error: '질문과 답변을 입력하세요.' }, 400)
  }

  const refined = await refineeFAQ(c.env.GEMINI_API_KEY, question.trim(), answer.trim())

  return c.json({
    success: true,
    data: {
      original: { question, answer },
      refined,
      is_ai_refined: refined.question !== question || refined.answer !== answer,
    },
  })
})

// ─────────────────────────────────────────
// [2] FAQ 임베딩 + 저장
// POST /api/documents/embed
// ─────────────────────────────────────────
documents.post('/embed', async (c) => {
  let body: {
    original_question?: string
    original_answer?: string
    refined_question?: string
    refined_answer?: string
    category?: string
    language?: string
    is_ai_refined?: boolean
  }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400)
  }

  const tenantId = c.get('tenantId')!
  const supabase = createSupabaseAdmin(c.env)

  // ─── 플랜 FAQ 개수 제한 체크 ───
  const { data: tenant } = await supabase
    .from('tenants')
    .select('plan')
    .eq('id', tenantId)
    .single()

  const planName = tenant?.plan || 'basic'

  const { data: planData } = await supabase
    .from('plans')
    .select('faq_limit')
    .eq('plan_name', planName)
    .single()

  const faqLimit = planData?.faq_limit ?? 50

  if (faqLimit !== -1) {
    const { count } = await supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false)

    if ((count || 0) >= faqLimit) {
      return c.json({
        success: false,
        error: `현재 플랜(${planName})의 FAQ 등록 한도(${faqLimit}개)에 도달했습니다.`,
      }, 403)
    }
  }

  const question = body.refined_question || body.original_question || ''
  const answer = body.refined_answer || body.original_answer || ''

  if (!question.trim() || !answer.trim()) {
    return c.json({ success: false, error: '질문과 답변을 입력하세요.' }, 400)
  }

  // content 구성
  const fullContent = `${question}\n${answer}`
  const savedIds: string[] = []

  // ─── 500자 초과 시 청크 분할 ───
  const chunks = splitIntoChunks(fullContent, CHUNK_SIZE)

  for (const chunk of chunks) {
    // 임베딩 생성
    let embedding: number[]
    try {
      embedding = await embedText(c.env.GEMINI_API_KEY, chunk)
    } catch (e) {
      return c.json({ success: false, error: '임베딩 생성에 실패했습니다.' }, 500)
    }

    const { data: doc, error } = await supabase
      .from('documents')
      .insert({
        tenant_id: tenantId,
        original_question: body.original_question,
        original_answer: body.original_answer,
        refined_question: body.refined_question,
        refined_answer: body.refined_answer,
        content: chunk,
        embedding: `[${embedding.join(',')}]`,
        category: body.category || '일반',
        language: body.language || 'ko',
        is_ai_refined: body.is_ai_refined ?? false,
      })
      .select('id')
      .single()

    if (error) {
      return c.json({ success: false, error: `문서 저장 실패: ${error.message}` }, 500)
    }

    savedIds.push(doc.id)
  }

  return c.json({
    success: true,
    data: {
      ids: savedIds,
      chunks: chunks.length,
      message: `${chunks.length}개 청크로 저장되었습니다.`,
    },
  })
})

// ─────────────────────────────────────────
// [3] FAQ 목록 조회
// GET /api/documents?page=1&limit=20&category=...
// ─────────────────────────────────────────
documents.get('/', async (c) => {
  const tenantId = c.get('tenantId')!
  const supabase = createSupabaseAdmin(c.env)

  const page = parseInt(c.req.query('page') || '1')
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100)
  const category = c.req.query('category')
  const language = c.req.query('language')

  const offset = (page - 1) * limit

  let query = supabase
    .from('documents')
    .select(
      'id, original_question, original_answer, refined_question, refined_answer, category, language, is_ai_refined, created_at',
      { count: 'exact' }
    )
    .eq('tenant_id', tenantId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (category) query = query.eq('category', category)
  if (language) query = query.eq('language', language)

  const { data, count, error } = await query

  if (error) {
    return c.json({ success: false, error: error.message }, 500)
  }

  return c.json({
    success: true,
    data: {
      items: data,
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    },
  })
})

// ─────────────────────────────────────────
// [4] FAQ 삭제 (소프트 삭제)
// DELETE /api/documents/:id
// ─────────────────────────────────────────
documents.delete('/:id', async (c) => {
  const tenantId = c.get('tenantId')!
  const docId = c.req.param('id')
  const supabase = createSupabaseAdmin(c.env)

  // 소유권 확인
  const { data: doc } = await supabase
    .from('documents')
    .select('id')
    .eq('id', docId)
    .eq('tenant_id', tenantId)
    .eq('is_deleted', false)
    .single()

  if (!doc) {
    return c.json({ success: false, error: '문서를 찾을 수 없습니다.' }, 404)
  }

  const { error } = await supabase
    .from('documents')
    .update({ is_deleted: true })
    .eq('id', docId)
    .eq('tenant_id', tenantId)

  if (error) {
    return c.json({ success: false, error: error.message }, 500)
  }

  return c.json({ success: true, message: '문서가 삭제되었습니다.' })
})

// ─────────────────────────────────────────
// 헬퍼: 텍스트 청크 분할
// ─────────────────────────────────────────
function splitIntoChunks(text: string, maxSize: number): string[] {
  if (text.length <= maxSize) return [text]

  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    let end = start + maxSize
    // 문장 경계 찾기 (마침표, 줄바꿈)
    if (end < text.length) {
      const breakPoint = text.lastIndexOf('\n', end)
      if (breakPoint > start + maxSize / 2) {
        end = breakPoint + 1
      }
    }
    chunks.push(text.slice(start, end).trim())
    start = end
  }

  return chunks.filter((c) => c.length > 0)
}

export default documents
