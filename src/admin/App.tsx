import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { SuperAuthProvider, useSuperAuth } from './context/SuperAuthContext'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import OnboardingPage from './pages/OnboardingPage'
import DashboardPage from './pages/DashboardPage'
import FAQPage from './pages/FAQPage'
import LogsPage from './pages/LogsPage'
import ScenariosPage from './pages/ScenariosPage'
import SettingsPage from './pages/SettingsPage'
import InstallPage from './pages/InstallPage'
import AnalyticsPage from './pages/AnalyticsPage'
import SuperLoginPage from './pages/SuperLoginPage'
import SuperDashboardPage from './pages/SuperDashboardPage'

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
