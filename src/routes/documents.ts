// =====================================================
// FAQ 문서 관리 라우터 (JWT 필요)
// POST   /api/documents/refine      - Gemini FAQ 자동 개선
// POST   /api/documents/embed       - 임베딩 + 저장 (레거시)
// POST   /api/documents             - FAQ 등록 (자동 임베딩 포함)
// GET    /api/documents             - 목록 조회
// PUT    /api/documents/:id         - 수정
// DELETE /api/documents/:id         - 소프트 삭제
// PUT    /api/documents/:id/toggle  - 활성/비활성 토글
//
// [Admin 전용 - /api/admin/documents 경로]
// POST   /api/admin/documents/refine      - FAQ AI 다듬기
// POST   /api/admin/documents/bulk-embed  - 일괄 임베딩
// =====================================================
import { Hono } from 'hono'
import { createSupabaseAdmin } from '../lib/supabase'
import { generateEmbedding, refineDocument } from '../services/gemini'
import { adminAuthMiddleware } from '../middleware/auth'
import { Bindings, Variables } from '../types'

const documents = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// 모든 라우트에 JWT 인증 적용
documents.use('*', adminAuthMiddleware)

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
// [1] FAQ AI 다듬기
// POST /api/documents/refine (레거시 경로)
// POST /api/admin/documents/refine (신규 경로)
// ─────────────────────────────────────────
async function handleRefine(c: any) {
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

  try {
    const refined = await refineDocument(question.trim(), answer.trim(), c.env)
    return c.json({
      success: true,
      data: {
        original: { question, answer },
        refined_question: refined.refined_question,
        refined_answer:   refined.refined_answer,
        is_ai_refined:
          refined.refined_question !== question ||
          refined.refined_answer !== answer,
      },
    })
  } catch (e: any) {
    console.error('[documents] refine error:', e)
    return c.json({ success: false, error: 'AI 개선 중 오류가 발생했습니다.' }, 500)
  }
}

documents.post('/refine', handleRefine)

// ─────────────────────────────────────────
// [2] 일괄 임베딩 (embedding IS NULL인 문서)
// POST /api/admin/documents/bulk-embed
// ─────────────────────────────────────────
documents.post('/bulk-embed', async (c) => {
  const tenantId = c.get('tenantId')!

  if (!isSupabaseConfigured(c.env)) {
    return c.json({
      success: true,
      data: { processed: 0, total: 0, failed: 0, message: 'Supabase가 설정되지 않아 스킵됩니다.' },
    })
  }

  const supabase = createSupabaseAdmin(c.env)

  // embedding IS NULL인 문서 조회
  const { data: docs, error: fetchErr } = await supabase
    .from('documents')
    .select('id, question, answer, original_question, original_answer, refined_question, refined_answer')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .is('embedding', null)
    .limit(100) // 최대 100개씩 처리

  if (fetchErr) {
    return c.json({ success: false, error: fetchErr.message }, 500)
  }

  const total     = docs?.length || 0
  let processed   = 0
  let failed      = 0

  for (const doc of (docs || [])) {
    // 임베딩 대상 텍스트: refined > original > question/answer
    const q = doc.refined_question || doc.original_question || doc.question || ''
    const a = doc.refined_answer   || doc.original_answer   || doc.answer   || ''
    const text = `${q}\n${a}`.trim()

    if (!text) { failed++; continue }

    try {
      const embedding = await generateEmbedding(text, c.env)

      const { error: updateErr } = await supabase
        .from('documents')
        .update({ embedding: `[${embedding.join(',')}]` })
        .eq('id', doc.id)
        .eq('tenant_id', tenantId)

      if (updateErr) {
        console.error('[documents] bulk-embed update error:', doc.id, updateErr.message)
        failed++
      } else {
        processed++
      }
    } catch (e) {
      console.error('[documents] bulk-embed embed error:', doc.id, e)
      failed++
    }

    // Rate limit 방지: 100ms 딜레이
    await new Promise(r => setTimeout(r, 100))
  }

  return c.json({
    success: true,
    data: {
      processed,
      total,
      failed,
      message: `${total}개 중 ${processed}개 임베딩 완료${failed > 0 ? `, ${failed}개 실패` : ''}`,
    },
  })
})

// ─────────────────────────────────────────
// [3] FAQ 등록 (자동 임베딩 포함)
// POST /api/documents
// Body: { question, answer, category? }
// ─────────────────────────────────────────
documents.post('/', async (c) => {
  const tenantId = c.get('tenantId')!

  let body: {
    question?: string
    answer?: string
    category?: string
    // 레거시 필드 호환
    original_question?: string
    original_answer?: string
    refined_question?: string
    refined_answer?: string
    is_ai_refined?: boolean
  }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400)
  }

  const question = body.question || body.refined_question || body.original_question || ''
  const answer   = body.answer   || body.refined_answer   || body.original_answer   || ''
  const category = body.category || '일반'

  if (!question.trim() || !answer.trim()) {
    return c.json({ success: false, error: '질문과 답변을 입력하세요.' }, 400)
  }

  if (!isSupabaseConfigured(c.env)) {
    // 로컬 fallback: ID만 반환
    return c.json({
      success: true,
      data: {
        id: `local-${Date.now()}`,
        question: question.trim(),
        answer: answer.trim(),
        category,
        message: 'FAQ가 등록되었습니다. (로컬 모드)',
      },
    })
  }

  const supabase = createSupabaseAdmin(c.env)

  // ─── 플랜 FAQ 개수 제한 체크 ───
  const { data: tenant } = await supabase
    .from('tenants')
    .select('plan')
    .eq('id', tenantId)
    .single()

  const planName = tenant?.plan || 'basic'
  const planLimits: Record<string, number> = { basic: 50, pro: 200, master: -1 }
  const faqLimit = planLimits[planName] ?? 50

  if (faqLimit !== -1) {
    const { count } = await supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .or('is_deleted.is.null,is_deleted.eq.false')

    if ((count || 0) >= faqLimit) {
      return c.json({
        success: false,
        error: `현재 플랜(${planName})의 FAQ 등록 한도(${faqLimit}개)에 도달했습니다.`,
      }, 403)
    }
  }

  // ─── DB 저장 ───
  const { data: doc, error: insertErr } = await supabase
    .from('documents')
    .insert({
      tenant_id:         tenantId,
      question:          question.trim(),
      answer:            answer.trim(),
      original_question: body.original_question || question.trim(),
      original_answer:   body.original_answer   || answer.trim(),
      refined_question:  body.refined_question  || null,
      refined_answer:    body.refined_answer    || null,
      category,
      is_active:         true,
      is_deleted:        false,
      is_ai_refined:     body.is_ai_refined ?? false,
    })
    .select('id')
    .single()

  if (insertErr) {
    return c.json({ success: false, error: `FAQ 저장 실패: ${insertErr.message}` }, 500)
  }

  // ─── 비동기 임베딩 (저장 성공 후, 실패해도 FAQ 등록은 유지) ───
  const docId = doc.id
  ;(async () => {
    try {
      const text = `${question.trim()}\n${answer.trim()}`
      const embedding = await generateEmbedding(text, c.env)
      await supabase
        .from('documents')
        .update({ embedding: `[${embedding.join(',')}]` })
        .eq('id', docId)
        .eq('tenant_id', tenantId)
    } catch (e) {
      console.error('[documents] async embedding error for doc:', docId, e)
    }
  })()

  return c.json({
    success: true,
    data: {
      id: docId,
      question: question.trim(),
      answer: answer.trim(),
      category,
      message: 'FAQ가 등록되었습니다. 임베딩이 백그라운드에서 처리됩니다.',
    },
  })
})

// ─────────────────────────────────────────
// [4] FAQ 임베딩 + 저장 (레거시)
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
  const question = body.refined_question || body.original_question || ''
  const answer   = body.refined_answer   || body.original_answer   || ''

  if (!question.trim() || !answer.trim()) {
    return c.json({ success: false, error: '질문과 답변을 입력하세요.' }, 400)
  }

  if (!isSupabaseConfigured(c.env)) {
    return c.json({
      success: true,
      data: { ids: [`local-${Date.now()}`], chunks: 1, message: '로컬 모드로 저장되었습니다.' },
    })
  }

  const supabase = createSupabaseAdmin(c.env)

  // 임베딩 생성
  let embedding: number[]
  try {
    const text = `${question}\n${answer}`
    embedding = await generateEmbedding(text, c.env)
  } catch (e) {
    console.error('[documents] embed error:', e)
    return c.json({ success: false, error: '임베딩 생성에 실패했습니다.' }, 500)
  }

  const { data: doc, error } = await supabase
    .from('documents')
    .insert({
      tenant_id:         tenantId,
      question:          question,
      answer:            answer,
      original_question: body.original_question,
      original_answer:   body.original_answer,
      refined_question:  body.refined_question,
      refined_answer:    body.refined_answer,
      embedding:         `[${embedding.join(',')}]`,
      category:          body.category || '일반',
      is_active:         true,
      is_deleted:        false,
      is_ai_refined:     body.is_ai_refined ?? false,
    })
    .select('id')
    .single()

  if (error) {
    return c.json({ success: false, error: `문서 저장 실패: ${error.message}` }, 500)
  }

  return c.json({
    success: true,
    data: { ids: [doc.id], chunks: 1, message: '저장되었습니다.' },
  })
})

// ─────────────────────────────────────────
// [5] FAQ 목록 조회
// GET /api/documents?page=1&limit=20&category=...
// ─────────────────────────────────────────
documents.get('/', async (c) => {
  const tenantId = c.get('tenantId')!

  if (!isSupabaseConfigured(c.env)) {
    return c.json({ success: true, data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 } })
  }

  const supabase = createSupabaseAdmin(c.env)
  const page     = parseInt(c.req.query('page')  || '1')
  const limit    = Math.min(parseInt(c.req.query('limit') || '20'), 100)
  const category = c.req.query('category')
  const search   = c.req.query('search')
  const offset   = (page - 1) * limit

  let query = supabase
    .from('documents')
    .select(
      'id, question, answer, original_question, original_answer, refined_question, refined_answer, category, is_active, is_ai_refined, created_at',
      { count: 'exact' }
    )
    .eq('tenant_id', tenantId)
    .or('is_deleted.is.null,is_deleted.eq.false')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (category) query = query.eq('category', category)
  if (search)   query = query.or(`question.ilike.%${search}%,answer.ilike.%${search}%`)

  const { data, count, error } = await query

  if (error) {
    return c.json({ success: false, error: error.message }, 500)
  }

  return c.json({
    success: true,
    data: {
      items:      data,
      total:      count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    },
  })
})

// ─────────────────────────────────────────
// [6] FAQ 수정
// PUT /api/documents/:id
// ─────────────────────────────────────────
documents.put('/:id', async (c) => {
  const tenantId = c.get('tenantId')!
  const docId    = c.req.param('id')

  let body: { question?: string; answer?: string; category?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400)
  }

  if (!isSupabaseConfigured(c.env)) {
    return c.json({ success: true, message: '수정되었습니다. (로컬 모드)' })
  }

  const supabase = createSupabaseAdmin(c.env)

  // 소유권 확인
  const { data: existing } = await supabase
    .from('documents')
    .select('id')
    .eq('id', docId)
    .eq('tenant_id', tenantId)
    .or('is_deleted.is.null,is_deleted.eq.false')
    .single()

  if (!existing) {
    return c.json({ success: false, error: '문서를 찾을 수 없습니다.' }, 404)
  }

  const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
  if (body.question !== undefined) { updateData.question = body.question; updateData.original_question = body.question }
  if (body.answer   !== undefined) { updateData.answer   = body.answer;   updateData.original_answer   = body.answer   }
  if (body.category !== undefined) updateData.category = body.category

  const { error } = await supabase
    .from('documents')
    .update(updateData)
    .eq('id', docId)
    .eq('tenant_id', tenantId)

  if (error) {
    return c.json({ success: false, error: error.message }, 500)
  }

  // 질문/답변 변경 시 임베딩 재생성 (비동기)
  if (body.question || body.answer) {
    const q = body.question || ''
    const a = body.answer   || ''
    ;(async () => {
      try {
        const embedding = await generateEmbedding(`${q}\n${a}`, c.env)
        await supabase
          .from('documents')
          .update({ embedding: `[${embedding.join(',')}]` })
          .eq('id', docId)
          .eq('tenant_id', tenantId)
      } catch (e) {
        console.error('[documents] re-embed error:', docId, e)
      }
    })()
  }

  return c.json({ success: true, message: '수정되었습니다.' })
})

// ─────────────────────────────────────────
// [7] FAQ 삭제 (소프트 삭제)
// DELETE /api/documents/:id
// ─────────────────────────────────────────
documents.delete('/:id', async (c) => {
  const tenantId = c.get('tenantId')!
  const docId    = c.req.param('id')

  if (!isSupabaseConfigured(c.env)) {
    return c.json({ success: true, message: '삭제되었습니다. (로컬 모드)' })
  }

  const supabase = createSupabaseAdmin(c.env)

  const { data: doc } = await supabase
    .from('documents')
    .select('id')
    .eq('id', docId)
    .eq('tenant_id', tenantId)
    .or('is_deleted.is.null,is_deleted.eq.false')
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
// [8] FAQ 활성/비활성 토글
// PUT /api/documents/:id/toggle
// ─────────────────────────────────────────
documents.put('/:id/toggle', async (c) => {
  const tenantId = c.get('tenantId')!
  const docId    = c.req.param('id')

  if (!isSupabaseConfigured(c.env)) {
    return c.json({ success: true, message: '상태가 변경되었습니다. (로컬 모드)' })
  }

  const supabase = createSupabaseAdmin(c.env)

  const { data: doc } = await supabase
    .from('documents')
    .select('id, is_active')
    .eq('id', docId)
    .eq('tenant_id', tenantId)
    .or('is_deleted.is.null,is_deleted.eq.false')
    .single()

  if (!doc) {
    return c.json({ success: false, error: '문서를 찾을 수 없습니다.' }, 404)
  }

  const { error } = await supabase
    .from('documents')
    .update({ is_active: !doc.is_active })
    .eq('id', docId)
    .eq('tenant_id', tenantId)

  if (error) {
    return c.json({ success: false, error: error.message }, 500)
  }

  return c.json({
    success: true,
    data: { is_active: !doc.is_active },
    message: `${!doc.is_active ? '활성화' : '비활성화'}되었습니다.`,
  })
})

export default documents
