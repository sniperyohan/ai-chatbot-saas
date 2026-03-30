import React, { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, BookOpen, MessageSquare, GitBranch,
  Settings, Code2, Bot, Sun, Moon, ChevronDown, LogOut, KeyRound, User
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useDarkMode } from '../hooks/useDarkMode'
import { useToast } from '../hooks/useToast'
import ToastContainer from './Toast'
import ChangePasswordModal from './ChangePasswordModal'

const tabs = [
  { key: 'dashboard', label: '대시보드', icon: LayoutDashboard, path: '/admin/dashboard' },
  { key: 'faq',       label: 'FAQ 관리',  icon: BookOpen,         path: '/admin/faq' },
  { key: 'logs',      label: '대화 로그', icon: MessageSquare,    path: '/admin/logs' },
  { key: 'scenarios', label: '시나리오',  icon: GitBranch,        path: '/admin/scenarios' },
  { key: 'settings',  label: '봇 설정',   icon: Settings,         path: '/admin/settings' },
  { key: 'install',   label: '설치 코드', icon: Code2,            path: '/admin/install' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { tenant, logout } = useAuth()
  const { dark, toggle } = useDarkMode()
  const toast = useToast()
  const [dropOpen, setDropOpen] = useState(false)
  const [pwModal, setPwModal] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  const activeTab = tabs.find(t => location.pathname.startsWith(t.path))?.key || 'dashboard'

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleLogout = () => { logout(); navigate('/admin/login') }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 40,
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', height: '64px', gap: '12px' }}>
            {/* Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bot size={18} color="#fff"/>
              </div>
              <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)', display: 'none' }} className="sm-show">AI 상담봇</span>
            </div>

            {/* Tabs */}
            <nav style={{ flex: 1, overflowX: 'auto', scrollbarWidth: 'none' }} className="scrollbar-hide">
              <div style={{ display: 'flex', gap: '4px', minWidth: 'max-content' }}>
                {tabs.map(t => {
                  const Icon = t.icon
                  const active = activeTab === t.key
                  return (
                    <button key={t.key} onClick={() => navigate(t.path)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '8px 12px', borderRadius: '8px',
                        fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap',
                        border: 'none', cursor: 'pointer', minHeight: '44px',
                        background: active ? 'var(--primary)' : 'transparent',
                        color: active ? '#fff' : 'var(--text-secondary)',
                        transition: 'all 0.15s',
                        fontFamily: 'inherit',
                      }}
                      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--bg-primary)' }}
                      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      <Icon size={15}/>
                      <span>{t.label}</span>
                    </button>
                  )
                })}
              </div>
            </nav>

            {/* Right */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              {/* Dark mode */}
              <button onClick={toggle} style={{
                padding: '8px', borderRadius: '8px', background: 'none', border: 'none',
                cursor: 'pointer', color: 'var(--text-secondary)', minWidth: '44px', minHeight: '44px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {dark ? <Sun size={18}/> : <Moon size={18}/>}
              </button>

              {/* Profile */}
              <div style={{ position: 'relative' }} ref={dropRef}>
                <button onClick={() => setDropOpen(!dropOpen)} style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '8px 12px', borderRadius: '8px', background: 'none', border: 'none',
                  cursor: 'pointer', minHeight: '44px', fontFamily: 'inherit',
                }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <User size={14} color="#fff"/>
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tenant?.company_name || ''}
                  </span>
                  <ChevronDown size={13} color="var(--text-secondary)" style={{ transform: dropOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}/>
                </button>

                {dropOpen && (
                  <div style={{
                    position: 'absolute', right: 0, top: '100%', marginTop: '4px',
                    width: '220px', background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)', borderRadius: '12px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.12)',
                    overflow: 'hidden', animation: 'fadeIn 0.15s ease-out',
                    zIndex: 50,
                  }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>로그인 계정</p>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tenant?.email}</p>
                      <span style={{ display: 'inline-block', marginTop: '4px', padding: '2px 10px', borderRadius: '9999px', fontSize: '11px', fontWeight: 600, background: 'rgba(79,70,229,0.1)', color: 'var(--primary)', textTransform: 'capitalize' }}>
                        {tenant?.plan} 플랜
                      </span>
                    </div>
                    <button onClick={() => { setPwModal(true); setDropOpen(false) }} style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: '13px', color: 'var(--text-primary)', textAlign: 'left', fontFamily: 'inherit', minHeight: '44px',
                    }}>
                      <KeyRound size={15} color="var(--text-secondary)"/> 비밀번호 변경
                    </button>
                    <button onClick={handleLogout} style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: '13px', color: '#DC2626', textAlign: 'left', fontFamily: 'inherit', minHeight: '44px',
                    }}>
                      <LogOut size={15}/> 로그아웃
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 16px' }}>
        {children}
      </main>

      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast}/>
      <ChangePasswordModal open={pwModal} onClose={() => setPwModal(false)} toast={toast}/>
    </div>
  )
}
