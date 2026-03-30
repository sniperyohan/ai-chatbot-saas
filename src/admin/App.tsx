import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
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

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth()
  if (!token) return <Navigate to="/admin/login" replace/>
  return <>{children}</>
}

function AdminApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/login" element={<LoginPage/>}/>
        <Route path="/admin/change-password" element={<ChangePasswordPage/>}/>
        <Route path="/admin/onboarding" element={
          <PrivateRoute><OnboardingPage/></PrivateRoute>
        }/>
        <Route path="/admin/*" element={
          <PrivateRoute>
            <Layout>
              <Routes>
                <Route path="dashboard" element={<DashboardPage/>}/>
                <Route path="faq" element={<FAQPage/>}/>
                <Route path="logs" element={<LogsPage/>}/>
                <Route path="scenarios" element={<ScenariosPage/>}/>
                <Route path="settings" element={<SettingsPage/>}/>
                <Route path="install" element={<InstallPage/>}/>
                <Route path="*" element={<Navigate to="dashboard" replace/>}/>
              </Routes>
            </Layout>
          </PrivateRoute>
        }/>
        <Route path="/" element={<Navigate to="/admin/login" replace/>}/>
        <Route path="*" element={<Navigate to="/admin/login" replace/>}/>
      </Routes>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AdminApp/>
    </AuthProvider>
  )
}
