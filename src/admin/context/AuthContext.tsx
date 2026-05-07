import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { api } from '../lib/api'
import { loadPlansFromDB } from '../lib/plans'


export interface TenantInfo {
  id: string
  company_name: string
  email: string
  plan: string
  bot_name: string
  widget_color: string
  greeting_message: string
  is_temp_password: boolean
  billing_day?: number
  subscribed_at?: string | null
  // 확장 필드 (GET /api/admin/me 에서 로드)
  faq_count?: number
  faq_limit?: number
  faq_pct?: number
  chat_count_today?: number
  chat_count_month?: number
  chat_count_total?: number
  monthly_amount?: number
  next_billing_date?: string
  days_until_billing?: number
  current_period_start?: string
  current_period_end?: string
}

interface AuthCtx {
  token: string | null
  tenant: TenantInfo | null
  login: (token: string, tenant: TenantInfo) => void
  logout: () => void
  updateTenant: (data: Partial<TenantInfo>) => void
}

const AuthContext = createContext<AuthCtx>({} as AuthCtx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('admin_token'))
  const [tenant, setTenant] = useState<TenantInfo | null>(() => {
    const s = localStorage.getItem('admin_tenant')
    return s ? JSON.parse(s) : null
  })

   // 🔥 페이지 로드/새로고침 시 토큰이 있으면 DB 플랜 동기화
   useEffect(() => {
     if (token) {
       loadPlansFromDB(api).catch(() => {})
     }
   }, [])

  const login = (t: string, info: TenantInfo) => {
    setToken(t)
    setTenant(info)
    localStorage.setItem('admin_token', t)
    localStorage.setItem('admin_tenant', JSON.stringify(info))

    loadPlansFromDB(api).catch(() => {})

   }

  const logout = () => {
    setToken(null)
    setTenant(null)
    localStorage.removeItem('admin_token')
    localStorage.removeItem('admin_tenant')
  }

  const updateTenant = (data: Partial<TenantInfo>) => {
    setTenant((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...data }
      localStorage.setItem('admin_tenant', JSON.stringify(next))
      return next
    })
  }

  return (
    <AuthContext.Provider value={{ token, tenant, login, logout, updateTenant }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
