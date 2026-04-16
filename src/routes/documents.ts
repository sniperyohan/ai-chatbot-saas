// =====================================================
// FAQ 문서 관리 라우터 - Cloudflare D1 버전
// POST   /api/documents/refine      - Gemini FAQ 자동 개선
// POST   /api/documents/embed       - 임베딩 + 저장 (레거시)
// POST   /api/documents             - FAQ 등록
// GET    /api/documents             - 목록 조회
// PUT    /api/documents/:id         - 수정
// DELETE /api/documents/:id         - 소프트 삭제
// PUT    /api/documents/:id/toggle  - 활성/비활성 토글
// POST   /api/admin/documents/refine     - FAQ AI 다듬기
// POST   /api/admin/documents/bulk-embed - 일괄 임베딩
// =====================================================
import { Hono } from 'hono'
import { dbGet, dbAll, dbRun, generateId, nowISO } from '../lib/db'
import { generateEmbedding, refineDocument } from '../services/gemini'
import { adminAuthMiddleware } from '../middleware/auth'
import { Bindings, Variables } from '../types'

const documents = new Hono<{ Bindings: Bindings; Variables: Variables }>()
documents.use('*', adminAuthMiddleware)

// 플랜별 FAQ 한도
const PLAN_LIMIT: Record<string, number> = { basic: 50, pro: 200, master: -1 }

// ─────────────────────────────────────────
// [1] FAQ AI 다듬기
// POST /api/documents/refine
// POST /api/admin/documents/refine
// ─────────────────────────────────────────
async function handleRefine(c: any) {
  let body: { question?: string; answer?: string }
  try { body = await c.req.json() }
  catch { return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400) }

  const { question, answer } = body
  if (!question?.trim() || !answer?.trim())
    return c.json({ success: false, error: '질문과 답변을 입력하세요.' }, 400)

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

  const { data: docs, error: fetchErr } = await dbAll<{
    id: string; question: string; answer: string
    original_question: string; original_answer: string
    refined_question: string; refined_answer: string
  }>(c.env,
    `SELECT id, question, answer, original_question, original_answer, refined_question, refined_answer
     FROM documents WHERE tenant_id = ? AND is_active = 1 AND is_deleted = 0 AND embedding IS NULL LIMIT 100`,
    tenantId
  )

  if (fetchErr) return c.json({ success: false, error: fetchErr }, 500)

  const total    = docs?.length || 0
  let processed  = 0
  let failed     = 0

  for (const doc of (docs || [])) {
    const q    = doc.refined_question || doc.original_question || doc.question || ''
    const a    = doc.refined_answer   || doc.original_answer   || doc.answer   || ''
    const text = `${q}\n${a}`.trim()

    if (!text) { failed++; continue }

    try {
      const embedding = await generateEmbedding(text, c.env)
      const { error: updateErr } = await dbRun(c.env,
        'UPDATE documents SET embedding = ?, updated_at = ? WHERE id = ? AND tenant_id = ?',
        JSON.stringify(embedding), nowISO(), doc.id, tenantId
      )
      if (updateErr) { failed++ } else { processed++ }
    } catch (e) {
      console.error('[documents] bulk-embed error:', doc.id, e)
      failed++
    }

    await new Promise(r => setTimeout(r, 100))
  }

  return c.json({
    success: true,
    data: {
      processed, total, failed,
      message: `${total}개 중 ${processed}개 임베딩 완료${failed > 0 ? `, ${failed}개 실패` : ''}`,
    },
  })
})

// ─────────────────────────────────────────
// [3] FAQ 등록
// POST /api/documents
// ─────────────────────────────────────────
documents.post('/', async (c) => {
  const tenantId = c.get('tenantId')!

  let body: {
    question?: string; answer?: string; category?: string
    original_question?: string; original_answer?: string
    refined_question?: string; refined_answer?: string
    is_ai_refined?: boolean
  }
  try { body = await c.req.json() }
  catch { return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400) }

  const question = body.question || body.refined_question || body.original_question || ''
  const answer   = body.answer   || body.refined_answer   || body.original_answer   || ''
  const category = body.category || '일반'

  if (!question.trim() || !answer.trim())
    return c.json({ success: false, error: '질문과 답변을 입력하세요.' }, 400)

  // 플랜 FAQ 한도 체크
  const { data: tenantRow } = await dbGet<{ plan: string }>(c.env,
    'SELECT plan FROM tenants WHERE id = ? LIMIT 1', tenantId
  )
  const planName = tenantRow?.plan || 'basic'
  const faqLimit = PLAN_LIMIT[planName] ?? 50

  if (faqLimit !== -1) {
    const { data: cntRow } = await dbGet<{ cnt: number }>(c.env,
      'SELECT COUNT(*) as cnt FROM documents WHERE tenant_id = ? AND is_deleted = 0 AND is_active = 1', tenantId
    )
    if ((cntRow?.cnt || 0) >= faqLimit) {
      return c.json({
        success: false,
        error: `현재 플랜(${planName})의 FAQ 등록 한도(${faqLimit}개)에 도달했습니다.`,
      }, 403)
    }
  }

  const docId = generateId()
  const now   = nowISO()

  const { error: insertErr } = await dbRun(c.env,
    `INSERT INTO documents
      (id, tenant_id, question, answer, original_question, original_answer,
       refined_question, refined_answer, content, category, language,
       is_active, is_deleted, is_ai_refined, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,1,0,?,?,?)`,
    docId, tenantId,
    question.trim(), answer.trim(),
    body.original_question || question.trim(),
    body.original_answer   || answer.trim(),
    body.refined_question  || null,
    body.refined_answer    || null,
    `${question.trim()}\n${answer.trim()}`,
    category, 'ko',
    body.is_ai_refined ? 1 : 0,
    now, now
  )

  if (insertErr) return c.json({ success: false, error: `FAQ 저장 실패: ${insertErr}` }, 500)

  // 비동기 임베딩 (저장 성공 후, 실패해도 FAQ 등록은 유지)
  ;(async () => {
    try {
      const text      = `${question.trim()}\n${answer.trim()}`
      const embedding = await generateEmbedding(text, c.env)
      await dbRun(c.env,
        'UPDATE documents SET embedding = ?, updated_at = ? WHERE id = ? AND tenant_id = ?',
        JSON.stringify(embedding), nowISO(), docId, tenantId
      )
    } catch (e) {
      console.error('[documents] async embedding error for doc:', docId, e)
    }
  })()

  return c.json({
    success: true,
    data: {
      id: docId, question: question.trim(), answer: answer.trim(), category,
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
    original_question?: string; original_answer?: string
    refined_question?: string; refined_answer?: string
    category?: string; language?: string; is_ai_refined?: boolean
  }
  try { body = await c.req.json() }
  catch { return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400) }

  const tenantId = c.get('tenantId')!
  const question = body.refined_question || body.original_question || ''
  const answer   = body.refined_answer   || body.original_answer   || ''

  if (!question.trim() || !answer.trim())
    return c.json({ success: false, error: '질문과 답변을 입력하세요.' }, 400)

  let embedding: number[]
  try {
    embedding = await generateEmbedding(`${question}\n${answer}`, c.env)
  } catch (e) {
    console.error('[documents] embed error:', e)
    return c.json({ success: false, error: '임베딩 생성에 실패했습니다.' }, 500)
  }

  const docId = generateId()
  const now   = nowISO()

  const { error } = await dbRun(c.env,
    `INSERT INTO documents
      (id, tenant_id, question, answer, original_question, original_answer,
       refined_question, refined_answer, content, category, language,
       is_active, is_deleted, is_ai_refined, embedding, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,1,0,?,?,?,?)`,
    docId, tenantId,
    question, answer,
    body.original_question || null, body.original_answer || null,
    body.refined_question  || null, body.refined_answer  || null,
    `${question}\n${answer}`,
    body.category || '일반', body.language || 'ko',
    body.is_ai_refined ? 1 : 0,
    JSON.stringify(embedding), now, now
  )

  if (error) return c.json({ success: false, error: `문서 저장 실패: ${error}` }, 500)

  return c.json({ success: true, data: { ids: [docId], chunks: 1, message: '저장되었습니다.' } })
})

// ─────────────────────────────────────────
// [5] FAQ 목록 조회
// GET /api/documents?page=1&limit=20&category=...
// ─────────────────────────────────────────
documents.get('/', async (c) => {
  const tenantId = c.get('tenantId')!
  const page     = Math.max(1, parseInt(c.req.query('page')  || '1'))
  const limit    = Math.min(100, parseInt(c.req.query('limit') || '20'))
  const category = c.req.query('category') || ''
  const search   = c.req.query('search')   || ''
  const offset   = (page - 1) * limit

  const conditions: string[] = ['tenant_id = ?', 'is_deleted = 0']
  const params: unknown[] = [tenantId]

  if (category) { conditions.push('category = ?');           params.push(category) }
  if (search)   { conditions.push('(question LIKE ? OR answer LIKE ?)'); params.push(`%${search}%`, `%${search}%`) }

  const where = `WHERE ${conditions.join(' AND ')}`

  const [rowsRes, countRes] = await Promise.all([
    dbAll<{
      id: string; question: string; answer: string
      original_question: string; original_answer: string
      refined_question: string; refined_answer: string
      category: string; is_active: number; is_ai_refined: number; created_at: string
    }>(c.env,
      `SELECT id, question, answer, original_question, original_answer,
              refined_question, refined_answer, category, is_active, is_ai_refined, created_at
       FROM documents ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      ...params, limit, offset
    ),
    dbGet<{ total: number }>(c.env,
      `SELECT COUNT(*) as total FROM documents ${where}`, ...params
    ),
  ])

  if (rowsRes.error) return c.json({ success: false, error: rowsRes.error }, 500)

  return c.json({
    success: true,
    data: {
      items:      rowsRes.data || [],
      total:      countRes.data?.total || 0,
      page,
      limit,
      totalPages: Math.ceil((countRes.data?.total || 0) / limit),
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
  try { body = await c.req.json() }
  catch { return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400) }

  // 소유권 확인
  const { data: existing } = await dbGet<{ id: string }>(c.env,
    'SELECT id FROM documents WHERE id = ? AND tenant_id = ? AND is_deleted = 0 LIMIT 1',
    docId, tenantId
  )
  if (!existing) return c.json({ success: false, error: '문서를 찾을 수 없습니다.' }, 404)

  const fields: string[]  = []
  const values: unknown[] = []

  if (body.question !== undefined) {
    fields.push('question = ?', 'original_question = ?')
    values.push(body.question, body.question)
  }
  if (body.answer !== undefined) {
    fields.push('answer = ?', 'original_answer = ?')
    values.push(body.answer, body.answer)
  }
  if (body.category !== undefined) {
    fields.push('category = ?')
    values.push(body.category)
  }

  if (!fields.length) return c.json({ success: true, message: '변경 없음' })

  fields.push('updated_at = ?'); values.push(nowISO())
  values.push(docId, tenantId)

  const { error } = await dbRun(c.env,
    `UPDATE documents SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`, ...values
  )
  if (error) return c.json({ success: false, error }, 500)

  // 질문/답변 변경 시 임베딩 재생성 (비동기)
  if (body.question || body.answer) {
    const q = body.question || ''
    const a = body.answer   || ''
    ;(async () => {
      try {
        const embedding = await generateEmbedding(`${q}\n${a}`, c.env)
        await dbRun(c.env,
          'UPDATE documents SET embedding = ?, updated_at = ? WHERE id = ? AND tenant_id = ?',
          JSON.stringify(embedding), nowISO(), docId, tenantId
        )
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

  const { data: doc } = await dbGet<{ id: string }>(c.env,
    'SELECT id FROM documents WHERE id = ? AND tenant_id = ? AND is_deleted = 0 LIMIT 1',
    docId, tenantId
  )
  if (!doc) return c.json({ success: false, error: '문서를 찾을 수 없습니다.' }, 404)

  const { error } = await dbRun(c.env,
    'UPDATE documents SET is_deleted = 1, updated_at = ? WHERE id = ? AND tenant_id = ?',
    nowISO(), docId, tenantId
  )
  if (error) return c.json({ success: false, error }, 500)

  return c.json({ success: true, message: '문서가 삭제되었습니다.' })
})

// ─────────────────────────────────────────
// [8] FAQ 활성/비활성 토글
// PUT /api/documents/:id/toggle
// ─────────────────────────────────────────
documents.put('/:id/toggle', async (c) => {
  const tenantId = c.get('tenantId')!
  const docId    = c.req.param('id')

  const { data: doc } = await dbGet<{ id: string; is_active: number }>(c.env,
    'SELECT id, is_active FROM documents WHERE id = ? AND tenant_id = ? AND is_deleted = 0 LIMIT 1',
    docId, tenantId
  )
  if (!doc) return c.json({ success: false, error: '문서를 찾을 수 없습니다.' }, 404)

  const newActive = doc.is_active ? 0 : 1
  const { error } = await dbRun(c.env,
    'UPDATE documents SET is_active = ?, updated_at = ? WHERE id = ? AND tenant_id = ?',
    newActive, nowISO(), docId, tenantId
  )
  if (error) return c.json({ success: false, error }, 500)

  return c.json({
    success: true,
    data: { is_active: !!newActive },
    message: `${newActive ? '활성화' : '비활성화'}되었습니다.`,
  })
})

export default documents
