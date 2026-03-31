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
import tenantRouter from './routes/tenant'

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

// 테넌트 자체 정보 + 시나리오 (JWT 필요)
app.route('/api/admin', tenantRouter)

// Admin SPA - index.html을 직접 반환 (SPA routing 지원)
const ADMIN_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AI 상담봇 관리자</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <script type="module" crossorigin src="/admin/assets/index-BcPc65Iu-v2.js"></script>
  <link rel="modulepreload" crossorigin href="/admin/assets/react-vendor-B7hvkJMs-v2.js">
  <link rel="modulepreload" crossorigin href="/admin/assets/lucide-vendor-Cx_2ViBV-v2.js">
  <link rel="modulepreload" crossorigin href="/admin/assets/recharts-vendor-C7OM07X2-v2.js">
  <link rel="stylesheet" crossorigin href="/admin/assets/index-MX6WQWWt.css">
</head>
<body>
  <div id="root"></div>
</body>
</html>`

app.get('/admin', (c) => c.redirect('/admin/login'))
app.get('/admin/*', (c) => {
  const path = c.req.path
  // 정적 에셋은 Cloudflare Pages가 서빙
  if (path.includes('/assets/')) return c.notFound()
  return c.html(ADMIN_HTML)
})

// favicon 처리
app.get('/favicon.ico', (c) => c.redirect('/favicon.svg', 301))
app.get('/favicon.svg', (c) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#4F46E5"/>
  <circle cx="12" cy="13" r="3" fill="white" opacity="0.9"/>
  <circle cx="20" cy="13" r="3" fill="white" opacity="0.9"/>
  <path d="M8 20 Q16 26 24 20" stroke="white" stroke-width="2" fill="none" stroke-linecap="round"/>
</svg>`
  return new Response(svg, {
    headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' }
  })
})

// Super Admin SPA - /super/* 경로도 동일한 SPA HTML 서빙
app.get('/super', (c) => c.redirect('/super/login'))
app.get('/super/*', (c) => {
  return c.html(ADMIN_HTML)
})

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
