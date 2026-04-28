import React, { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, BookOpen, MessageSquare, GitBranch,
  Settings, Code2, Bot, Sun, Moon, ChevronDown, LogOut, KeyRound, User, AlertTriangle, BarChart2
} from 'lucide-react'

import { useAuth } from '../context/AuthContext'
import { useDarkMode } from '../hooks/useDarkMode'
import { useToast } from '../hooks/useToast'
import ToastContainer from './Toast'
import ChangePasswordModal from './ChangePasswordModal'
import { api } from '../lib/api'

const tabs = [
  { key: 'dashboard',  label: '대시보드',   icon: LayoutDashboard, path: '/admin/dashboard',  title: '대시보드' },
  { key: 'faq',        label: 'FAQ 관리',   icon: BookOpen,         path: '/admin/faq',         title: 'FAQ 관리' },
  { key: 'logs',       label: '대화 로그',  icon: MessageSquare,    path: '/admin/logs',        title: '대화 로그' },
  { key: 'analytics',  label: '분석',       icon: BarChart2,        path: '/admin/analytics',   title: '질문 TOP10 분석' },
  { key: 'scenarios',  label: '시나리오',   icon: GitBranch,        path: '/admin/scenarios',   title: '시나리오' },
  { key: 'settings',   label: '봇 설정',    icon: Settings,         path: '/admin/settings',    title: '챗봇 설정' },
  { key: 'install',    label: '위젯 가이드', icon: Code2,            path: '/admin/install',     title: '위젯 설치 가이드' },
]

const PLAN_LIMIT: Record<string, number> = { basic: 50, pro: 200, master: -1 }

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { tenant, logout, updateTenant } = useAuth()
  const { dark, toggle } = useDarkMode()
  const toast = useToast()
  const [dropOpen, setDropOpen] = useState(false)
  const [pwModal, setPwModal] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  const activeTab = tabs.find(t => location.pathname.startsWith(t.path))?.key || 'dashboard'
  const activeTabInfo = tabs.find(t => t.key === activeTab)

  // 탭 타이틀 동적 설정
  useEffect(() => {
    const companyName = tenant?.company_name || 'AI 상담봇'
    const tabTitle = activeTabInfo?.title || '대시보드'
    document.title = `${tabTitle} | ${companyName}`
  }, [activeTab, tenant?.company_name])

  // 확장 정보 로드 (faq_pct 등)
  useEffect(() => {
    if (!tenant) return
    api.getMe().then(res => {
      if (res.data) updateTenant(res.data)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleLogout = () => { logout(); navigate('/admin/login') }

  // 플랜 한도 경고 배너 계산 (master 제외)
  const isMaster = tenant?.plan === 'master'
  const faqPct = tenant?.faq_pct || 0
  const faqCount = tenant?.faq_count || 0
  const faqLimit = tenant?.faq_limit || PLAN_LIMIT[tenant?.plan || 'basic'] || 50
  const showWarning80 = !isMaster && faqPct >= 80 && faqPct < 100
  const showWarning100 = !isMaster && faqPct >= 100

  // 결제일 임박 경고 (D-7 이내)
  const daysUntil = tenant?.dday ?? tenant?.days_until_billing
  const showBillingWarning = !isMaster && daysUntil !== undefined && daysUntil <= 7

  const planLabel: Record<string, string> = { basic: 'Basic', pro: 'Pro', master: 'Master' }
  const planColor: Record<string, string> = { basic: '#3B82F6', pro: '#8B5CF6', master: '#F59E0B' }

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
            {/* Logo + 업체명 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, minWidth: 0, maxWidth: '200px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: tenant?.widget_color || 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Bot size={18} color="#fff"/>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}>
                  {tenant?.company_name || 'AI 상담봇'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  <span style={{ fontWeight: 600, color: planColor[tenant?.plan || 'basic'] }}>
                    {planLabel[tenant?.plan || 'basic']}
                  </span>
                  {' '}플랜
                </div>
              </div>
            </div>

            {/* Divider */}
            <div style={{ width: '1px', height: '32px', background: 'var(--border)', flexShrink: 0 }}/>

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

              {/* Profile 드롭다운 */}
              <div style={{ position: 'relative' }} ref={dropRef}>
                <button onClick={() => setDropOpen(!dropOpen)} style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '8px 12px', borderRadius: '8px', background: 'none', border: 'none',
                  cursor: 'pointer', minHeight: '44px', fontFamily: 'inherit',
                }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: tenant?.widget_color || 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <User size={14} color="#fff"/>
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tenant?.email || ''}
                  </span>
                  <ChevronDown size={13} color="var(--text-secondary)" style={{ transform: dropOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}/>
                </button>

                {dropOpen && (
                  <div style={{
                    position: 'absolute', right: 0, top: '100%', marginTop: '4px',
                    width: '240px', background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)', borderRadius: '12px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.12)',
                    overflow: 'hidden', animation: 'fadeIn 0.15s ease-out',
                    zIndex: 50,
                  }}>
                    {/* 계정 정보 */}
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: tenant?.widget_color || 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <User size={18} color="#fff"/>
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {tenant?.company_name || '회사명'}
                          </p>
                          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {tenant?.email}
                          </p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '9999px', fontSize: '11px', fontWeight: 700, background: `${planColor[tenant?.plan || 'basic']}20`, color: planColor[tenant?.plan || 'basic'] }}>
                          {planLabel[tenant?.plan || 'basic']} 플랜
                        </span>
                        {tenant?.days_until_billing !== undefined && !isMaster && (
                          <span style={{ fontSize: '11px', color: (daysUntil || 0) <= 3 ? '#DC2626' : 'var(--text-secondary)' }}>
                            결제 D-{tenant.days_until_billing}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* FAQ 사용량 */}
                    {!isMaster && faqLimit > 0 && (
                      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>FAQ 사용량</span>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: faqPct >= 100 ? '#DC2626' : faqPct >= 80 ? '#D97706' : 'var(--text-secondary)' }}>
                            {faqCount}/{faqLimit}
                          </span>
                        </div>
                        <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(faqPct, 100)}%`, background: faqPct >= 100 ? '#EF4444' : faqPct >= 80 ? '#F59E0B' : 'var(--primary)', borderRadius: '2px', transition: 'width 0.3s' }}/>
                        </div>
                      </div>
                    )}

                    {/* 메뉴 */}
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

      {/* 전역 플랜 한도 경고 배너 */}
      {showWarning100 && (
        <div style={{ background: '#FEF2F2', borderBottom: '1px solid #FECACA', padding: '10px 16px' }}>
          <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} color="#DC2626"/>
            <span style={{ fontSize: '13px', color: '#991B1B', fontWeight: 600 }}>
              🚫 FAQ 한도({faqLimit}개)에 도달했습니다. 새 FAQ를 등록하려면 플랜을 업그레이드해야 합니다.
            </span>
            <button
              onClick={() => navigate('/admin/dashboard')}
              style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: 600, color: '#DC2626', background: 'rgba(239,68,68,0.1)', border: '1px solid #FECACA', borderRadius: '6px', padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit', minHeight: '30px' }}
            >
              플랜 확인
            </button>
          </div>
        </div>
      )}
      {showWarning80 && !showWarning100 && (
        <div style={{ background: '#FEFCE8', borderBottom: '1px solid #FEF08A', padding: '10px 16px' }}>
          <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} color="#D97706"/>
            <span style={{ fontSize: '13px', color: '#854D0E', fontWeight: 600 }}>
              ⚠️ FAQ 한도의 {faqPct}%를 사용했습니다. ({faqCount}/{faqLimit}개) 한도 초과 전에 플랜을 업그레이드하세요.
            </span>
          </div>
        </div>
      )}
      {showBillingWarning && !showWarning100 && (
        <div style={{ background: '#FFF7ED', borderBottom: '1px solid #FED7AA', padding: '10px 16px' }}>
          <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} color="#D97706"/>
            <span style={{ fontSize: '13px', color: '#9A3412', fontWeight: 600 }}>
              💳 서비스 만료일({tenant?.subscription_end_date})까지 D-{daysUntil}일 남았습니다. 미리 입금해 주세요.
            </span>
          </div>
        </div>
      )}

      {/* Main */}
      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 16px' }}>
        {children}
      </main>

      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast}/>
      <ChangePasswordModal open={pwModal} onClose={() => setPwModal(false)} toast={toast}/>
    </div>
  )
}
