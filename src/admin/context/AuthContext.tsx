import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface TenantInfo {
  id: string
  company_name: string
  email: string
  plan: string
  bot_name: string
  widget_color: string
  greeting_message: string
  is_temp_password: boolean
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

  const login = (t: string, info: TenantInfo) => {
    setToken(t)
    setTenant(info)
    localStorage.setItem('admin_token', t)
    localStorage.setItem('admin_tenant', JSON.stringify(info))
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
