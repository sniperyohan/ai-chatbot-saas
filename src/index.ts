// =====================================================
// AI 상담봇 SaaS - 메인 엔트리포인트
// Hono + Cloudflare Pages
// =====================================================
import { Hono } from 'hono'
import { createCorsMiddleware, securityHeadersMiddleware } from './middleware/security'
import { Bindings, Variables } from './types'

// 라우터 임포트
import authRouter from './routes/auth'
import chatRouter from './routes/chat'
import documentsRouter from './routes/documents'
import statsRouter from './routes/stats'
import superRouter from './routes/super'
import integrationRouter from './routes/integration'

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// ─────────────────────────────────────────
// 글로벌 미들웨어
// ─────────────────────────────────────────

// CORS (ALLOWED_ORIGINS 환경변수 기반)
app.use('*', async (c, next) => {
  const corsMiddleware = createCorsMiddleware(c.env.ALLOWED_ORIGINS || '*')
  return corsMiddleware(c, next)
})

// 보안 헤더
app.use('*', securityHeadersMiddleware)

// ─────────────────────────────────────────
// 헬스체크
// ─────────────────────────────────────────
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'AI 상담봇 SaaS API',
  })
})

// ─────────────────────────────────────────
// API 라우터 마운트
// ─────────────────────────────────────────

// 인증 (로그인 / 비밀번호 변경)
app.route('/api', authRouter)

// 채팅 (웹/카카오/네이버/메신저)
app.route('/api', chatRouter)

// FAQ 문서 관리 (JWT 필요)
app.route('/api/documents', documentsRouter)

// 통계 / 로그 (JWT 필요)
app.route('/api/admin', statsRouter)

// 슈퍼관리자 (슈퍼 JWT 필요)
app.route('/api/super', superRouter)

// API 연동 + 주문 조회 (JWT 필요)
app.route('/api/admin', integrationRouter)
app.route('/api', integrationRouter)

// ─────────────────────────────────────────
// 404 핸들러
// ─────────────────────────────────────────
app.notFound((c) => {
  return c.json({ success: false, error: '요청한 API를 찾을 수 없습니다.' }, 404)
})

// 전역 에러 핸들러
app.onError((err, c) => {
  console.error('Unhandled error:', err)
  return c.json(
    { success: false, error: '서버 내부 오류가 발생했습니다.' },
    500
  )
})

export default app
