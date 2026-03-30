import React, { createContext, useContext, useState, ReactNode } from 'react'

interface SuperAdminInfo {
  id: string
  email: string
}

interface SuperAuthCtx {
  token: string | null
  admin: SuperAdminInfo | null
  login: (token: string, admin: SuperAdminInfo) => void
  logout: () => void
}

const SuperAuthContext = createContext<SuperAuthCtx>({} as SuperAuthCtx)

export function SuperAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem('super_token')
  )
  const [admin, setAdmin] = useState<SuperAdminInfo | null>(() => {
    const s = localStorage.getItem('super_admin')
    return s ? JSON.parse(s) : null
  })

  const login = (t: string, info: SuperAdminInfo) => {
    setToken(t)
    setAdmin(info)
    localStorage.setItem('super_token', t)
    localStorage.setItem('super_admin', JSON.stringify(info))
  }

  const logout = () => {
    setToken(null)
    setAdmin(null)
    localStorage.removeItem('super_token')
    localStorage.removeItem('super_admin')
  }

  return (
    <SuperAuthContext.Provider value={{ token, admin, login, logout }}>
      {children}
    </SuperAuthContext.Provider>
  )
}

export const useSuperAuth = () => useContext(SuperAuthContext)
