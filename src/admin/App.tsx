import React, { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { SuperAuthProvider, useSuperAuth } from './context/SuperAuthContext'
import Layout from './components/Layout'

// 진입 페이지(로그인 등)는 즉시 로드 - 첫 화면이라 빠르게 보여야 함
import LoginPage from './pages/LoginPage'
import SuperLoginPage from './pages/SuperLoginPage'

// 나머지 페이지는 lazy 로딩 - 필요할 때 다운로드 (초기 번들 크기 감소)
const ChangePasswordPage = lazy(() => import('./pages/ChangePasswordPage'))
const OnboardingPage     = lazy(() => import('./pages/OnboardingPage'))
const DashboardPage      = lazy(() => import('./pages/DashboardPage'))
const FAQPage            = lazy(() => import('./pages/FAQPage'))
const LogsPage           = lazy(() => import('./pages/LogsPage'))
const ScenariosPage      = lazy(() => import('./pages/ScenariosPage'))
const SettingsPage       = lazy(() => import('./pages/SettingsPage'))
const InstallPage        = lazy(() => import('./pages/InstallPage'))
const AnalyticsPage      = lazy(() => import('./pages/AnalyticsPage'))
const SuperDashboardPage = lazy(() => import('./pages/SuperDashboardPage'))

// ─── 로딩 화면 (페이지 청크 다운로드 중 표시) ─────
function PageLoader() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh', flexDirection: 'column', gap: '12px'
    }}>
      <div style={{
        width: '40px', height: '40px', border: '3px solid var(--border)',
        borderTopColor: 'var(--primary)', borderRadius: '50%',
        animation: 'spin 0.8s linear infinite'
      }} />
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>로딩 중...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ─── 일반 어드민 인증 가드 ────────────────────────
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth()
  if (!token) return <Navigate to="/admin/login" replace />
  return <>{children}</>
}

// ─── 슈퍼어드민 인증 가드 ────────────────────────
function SuperPrivateRoute({ children }: { children: React.ReactNode }) {
  const { token } = useSuperAuth()
  if (!token) return <Navigate to="/super/login" replace />
  return <>{children}</>
}

// ─── 메인 앱 ─────────────────────────────────────
function AdminApp() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* ── 일반 어드민 ── */}
          <Route path="/admin/login" element={<LoginPage />} />
          <Route path="/admin/change-password" element={<ChangePasswordPage />} />
          <Route path="/admin/onboarding" element={
            <PrivateRoute><OnboardingPage /></PrivateRoute>
          } />
          <Route path="/admin/*" element={
            <PrivateRoute>
              <Layout>
                <Routes>
                  <Route path="dashboard" element={<DashboardPage />} />
                  <Route path="faq" element={<FAQPage />} />
                  <Route path="logs" element={<LogsPage />} />
                  <Route path="scenarios" element={<ScenariosPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="install" element={<InstallPage />} />
                  <Route path="analytics" element={<AnalyticsPage />} />
                  <Route path="categories" element={<Navigate to="/admin/faq" replace />} />

                  <Route path="*" element={<Navigate to="dashboard" replace />} />
                </Routes>
              </Layout>
            </PrivateRoute>
          } />

          {/* ── 슈퍼어드민 ── */}
          <Route path="/super/login" element={<SuperLoginPage />} />
          <Route path="/super/dashboard" element={
            <SuperPrivateRoute><SuperDashboardPage /></SuperPrivateRoute>
          } />
          <Route path="/super" element={<Navigate to="/super/login" replace />} />
          <Route path="/super/*" element={<Navigate to="/super/login" replace />} />

          {/* ── 기본 리다이렉트 ── */}
          <Route path="/" element={<Navigate to="/admin/login" replace />} />
          <Route path="*" element={<Navigate to="/admin/login" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <SuperAuthProvider>
        <AdminApp />
      </SuperAuthProvider>
    </AuthProvider>
  )
}
