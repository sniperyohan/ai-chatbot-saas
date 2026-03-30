import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2, Users, TrendingUp, MessageSquare,
  Plus, Search, RefreshCw, LogOut, ShieldCheck,
  ChevronLeft, ChevronRight, ToggleLeft, ToggleRight,
  Trash2, AlertCircle, X
} from 'lucide-react'
import { superApi } from '../lib/superApi'
import { useSuperAuth } from '../context/SuperAuthContext'
import CreateTenantModal from '../components/CreateTenantModal'
import { S } from '../lib/ui'

// ─── 타입 ─────────────────────────────────────────
interface Tenant {
  id: string
  company_name: string
  email: string
  plan: string
  is_active: boolean
  created_at: string
  bot_name?: string
}

interface DashboardStats {
  total_tenants: number
  active_tenants: number
  monthly_revenue: number
  total_chats: number
}

interface DeleteConfirm {
  id: string
  company_name: string
}

const PLAN_BADGE_COLOR: Record<string, { bg: string; color: string }> = {
  basic: { bg: 'rgba(107,114,128,0.12)', color: '#374151' },
  pro: { bg: 'rgba(59,130,246,0.12)', color: '#1D4ED8' },
  master: { bg: 'rgba(245,158,11,0.12)', color: '#B45309' },
}

// ─── 통계 카드 ────────────────────────────────────
function StatCard({ label, value, icon, color }: {
  label: string
  value: string | number
  icon: React.ReactNode
  color: string
}) {
  return (
    <div style={{
      ...S.card,
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
    }}>
      <div style={{
        width: '48px', height: '48px', borderRadius: '12px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: color, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>{label}</div>
        <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
      </div>
    </div>
  )
}

// ─── 메인 컴포넌트 ───────────────────────────────
export default function SuperDashboardPage() {
  const navigate = useNavigate()
  const { admin, logout } = useSuperAuth()

  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loadingList, setLoadingList] = useState(true)
  const [loadingStats, setLoadingStats] = useState(true)
  const [statsError, setStatsError] = useState('')

  // 모달 상태
  const [createModalOpen, setCreateModalOpen] = useState(false)

  // 삭제 확인 모달
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ─── 통계 로드 ──────────────────────────────────
  const loadStats = useCallback(async () => {
    setLoadingStats(true)
    setStatsError('')
    try {
      const res = await superApi.getDashboard()
      setStats(res.data)
    } catch (err: any) {
      setStatsError(err.message || '통계 로드 실패')
    } finally {
      setLoadingStats(false)
    }
  }, [])

  // ─── 고객사 목록 로드 ───────────────────────────
  const loadTenants = useCallback(async (p = page, s = search) => {
    setLoadingList(true)
    try {
      const res = await superApi.getTenants({ page: p, limit: 10, ...(s ? { search: s } : {}) })
      setTenants(res.data?.items || [])
      setTotal(res.data?.total || 0)
      setTotalPages(res.data?.totalPages || 1)
    } catch (err: any) {
      showToast(err.message || '목록 로드 실패', 'error')
    } finally {
      setLoadingList(false)
    }
  }, [page, search])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  useEffect(() => {
    loadTenants(page, search)
  }, [page, search])

  // ─── 검색 ───────────────────────────────────────
  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    setSearch(searchInput.trim())
  }

  // ─── 활성화 토글 ────────────────────────────────
  async function toggleActive(tenant: Tenant) {
    try {
      await superApi.updateTenant(tenant.id, { is_active: !tenant.is_active })
      setTenants(prev =>
        prev.map(t => t.id === tenant.id ? { ...t, is_active: !t.is_active } : t)
      )
      showToast(`${tenant.company_name} ${!tenant.is_active ? '활성화' : '비활성화'}되었습니다.`)
    } catch (err: any) {
      showToast(err.message || '상태 변경 실패', 'error')
    }
  }

  // ─── 삭제 ───────────────────────────────────────
  async function handleDelete() {
    if (!deleteConfirm) return
    setDeleting(true)
    try {
      await superApi.deleteTenant(deleteConfirm.id)
      showToast(`${deleteConfirm.company_name}이(가) 삭제되었습니다.`)
      setDeleteConfirm(null)
      loadTenants(page, search)
      loadStats()
    } catch (err: any) {
      showToast(err.message || '삭제 실패', 'error')
    } finally {
      setDeleting(false)
    }
  }

  // ─── 로그아웃 ───────────────────────────────────
  function handleLogout() {
    logout()
    navigate('/super/login', { replace: true })
  }

  // ─── 고객사 생성 성공 ────────────────────────────
  function handleCreated() {
    loadTenants(1, search)
    setPage(1)
    loadStats()
  }

  // ─── 날짜 포맷 ──────────────────────────────────
  function formatDate(iso: string) {
    const d = new Date(iso)
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  }

  // ─── 매출 포맷 ──────────────────────────────────
  function formatRevenue(n: number) {
    return `₩${n.toLocaleString('ko-KR')}`
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          상단 네비게이션
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        padding: '0 24px',
        height: '60px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ShieldCheck size={22} color="#4F46E5" />
          <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
            슈퍼관리자 콘솔
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {admin?.email}
          </span>
          <button
            onClick={handleLogout}
            style={{
              ...S.btnSecondary,
              padding: '8px 14px',
              minHeight: '36px',
              fontSize: '13px',
              gap: '6px',
            }}
          >
            <LogOut size={15} />
            로그아웃
          </button>
        </div>
      </header>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 20px' }}>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            통계 카드 4개
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
          marginBottom: '28px',
        }}>
          {loadingStats ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{
                ...S.card, height: '88px',
                background: 'linear-gradient(90deg, var(--bg-secondary) 25%, var(--border) 50%, var(--bg-secondary) 75%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.4s infinite',
              }} />
            ))
          ) : statsError ? (
            <div style={{
              gridColumn: '1 / -1',
              padding: '16px', borderRadius: '10px',
              background: '#FEF2F2', border: '1px solid #FECACA',
              color: '#991B1B', fontSize: '13px',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              <AlertCircle size={16} /> {statsError}
            </div>
          ) : (
            <>
              <StatCard
                label="전체 고객사"
                value={stats?.total_tenants ?? 0}
                icon={<Building2 size={22} color="#4F46E5" />}
                color="rgba(79,70,229,0.12)"
              />
              <StatCard
                label="활성 고객사"
                value={stats?.active_tenants ?? 0}
                icon={<Users size={22} color="#059669" />}
                color="rgba(5,150,105,0.12)"
              />
              <StatCard
                label="이번달 예상 매출"
                value={formatRevenue(stats?.monthly_revenue ?? 0)}
                icon={<TrendingUp size={22} color="#D97706" />}
                color="rgba(217,119,6,0.12)"
              />
              <StatCard
                label="총 대화 수"
                value={(stats?.total_chats ?? 0).toLocaleString()}
                icon={<MessageSquare size={22} color="#7C3AED" />}
                color="rgba(124,58,237,0.12)"
              />
            </>
          )}
        </div>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            고객사 목록 헤더
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div style={{
          ...S.card,
          padding: 0,
          overflow: 'hidden',
        }}>
          {/* 리스트 헤더 */}
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                고객사 목록
              </h2>
              <span style={{
                padding: '2px 10px', borderRadius: '20px',
                background: 'rgba(79,70,229,0.1)',
                color: '#4F46E5', fontSize: '12px', fontWeight: 600,
              }}>
                {total}개
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {/* 검색 */}
              <form onSubmit={handleSearch} style={{ display: 'flex', gap: '6px' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={15} style={{
                    position: 'absolute', left: '10px', top: '50%',
                    transform: 'translateY(-50%)', color: 'var(--text-secondary)',
                    pointerEvents: 'none',
                  }} />
                  <input
                    type="text"
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    placeholder="회사명 / 이메일 검색"
                    style={{
                      ...S.input,
                      minHeight: '38px',
                      paddingLeft: '32px',
                      width: '220px',
                      fontSize: '13px',
                    }}
                  />
                </div>
                <button type="submit" style={{ ...S.btnPrimary, minHeight: '38px', padding: '0 14px', fontSize: '13px' }}>
                  검색
                </button>
              </form>

              {/* 새로고침 */}
              <button
                onClick={() => { loadTenants(page, search); loadStats() }}
                style={{ ...S.btnSecondary, minHeight: '38px', padding: '0 12px', fontSize: '13px', gap: '6px' }}
              >
                <RefreshCw size={14} />
                새로고침
              </button>

              {/* 고객사 생성 버튼 */}
              <button
                onClick={() => setCreateModalOpen(true)}
                style={{ ...S.btnPrimary, minHeight: '38px', padding: '0 16px', fontSize: '13px', gap: '6px' }}
              >
                <Plus size={15} />
                고객사 생성
              </button>
            </div>
          </div>

          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              테이블
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-primary)' }}>
                  {['회사명', '이메일', '플랜', '상태', '생성일', '관리'].map(h => (
                    <th key={h} style={{
                      padding: '10px 16px',
                      textAlign: 'left',
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      whiteSpace: 'nowrap',
                      borderBottom: '1px solid var(--border)',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingList ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                          <div style={{
                            height: '14px', borderRadius: '6px',
                            background: 'linear-gradient(90deg, var(--border) 25%, var(--bg-primary) 50%, var(--border) 75%)',
                            backgroundSize: '200% 100%',
                            animation: 'shimmer 1.4s infinite',
                            width: j === 0 ? '120px' : j === 1 ? '160px' : '80px',
                          }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : tenants.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      <Building2 size={36} style={{ marginBottom: '12px', opacity: 0.3, display: 'block', margin: '0 auto 12px' }} />
                      {search ? '검색 결과가 없습니다.' : '등록된 고객사가 없습니다.'}
                    </td>
                  </tr>
                ) : (
                  tenants.map((tenant, idx) => {
                    const badgeStyle = PLAN_BADGE_COLOR[tenant.plan] || PLAN_BADGE_COLOR.basic
                    return (
                      <tr
                        key={tenant.id}
                        style={{
                          borderBottom: idx < tenants.length - 1 ? '1px solid var(--border)' : 'none',
                          background: idx % 2 === 0 ? 'var(--bg-secondary)' : 'transparent',
                          transition: 'background 0.1s',
                        }}
                      >
                        {/* 회사명 */}
                        <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {tenant.company_name}
                          </span>
                        </td>

                        {/* 이메일 */}
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>{tenant.email}</span>
                        </td>

                        {/* 플랜 */}
                        <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '3px 10px',
                            borderRadius: '20px',
                            fontSize: '12px',
                            fontWeight: 600,
                            background: badgeStyle.bg,
                            color: badgeStyle.color,
                          }}>
                            {tenant.plan.charAt(0).toUpperCase() + tenant.plan.slice(1)}
                          </span>
                        </td>

                        {/* 상태 */}
                        <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                          <button
                            onClick={() => toggleActive(tenant)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '4px 0',
                              fontSize: '12px',
                              fontWeight: 600,
                              color: tenant.is_active ? '#059669' : 'var(--text-secondary)',
                              fontFamily: 'inherit',
                            }}
                            title={tenant.is_active ? '클릭하여 비활성화' : '클릭하여 활성화'}
                          >
                            {tenant.is_active
                              ? <ToggleRight size={20} color="#059669" />
                              : <ToggleLeft size={20} color="#9CA3AF" />
                            }
                            {tenant.is_active ? '활성' : '비활성'}
                          </button>
                        </td>

                        {/* 생성일 */}
                        <td style={{ padding: '14px 16px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                          {formatDate(tenant.created_at)}
                        </td>

                        {/* 삭제 */}
                        <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                          <button
                            onClick={() => setDeleteConfirm({ id: tenant.id, company_name: tenant.company_name })}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: 'none',
                              border: '1px solid #FECACA',
                              borderRadius: '6px',
                              color: '#EF4444',
                              cursor: 'pointer',
                              padding: '5px 10px',
                              fontSize: '12px',
                              fontWeight: 600,
                              fontFamily: 'inherit',
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#FEF2F2')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                          >
                            <Trash2 size={13} />
                            삭제
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              페이지네이션
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {totalPages > 1 && (
            <div style={{
              padding: '14px 20px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px',
            }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                전체 {total}개 중 {((page - 1) * 10) + 1}–{Math.min(page * 10, total)}개 표시
              </span>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  style={{
                    ...S.btnSecondary,
                    minHeight: '34px', padding: '0 10px',
                    opacity: page === 1 ? 0.4 : 1,
                    cursor: page === 1 ? 'not-allowed' : 'pointer',
                  }}
                >
                  <ChevronLeft size={15} />
                </button>

                {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                  const p = i + 1
                  const isActive = p === page
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      style={{
                        minWidth: '34px', minHeight: '34px',
                        padding: '0 10px',
                        border: isActive ? 'none' : '1px solid var(--border)',
                        borderRadius: '8px',
                        background: isActive ? 'var(--primary)' : 'var(--bg-secondary)',
                        color: isActive ? '#fff' : 'var(--text-primary)',
                        fontSize: '13px',
                        fontWeight: isActive ? 700 : 400,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {p}
                    </button>
                  )
                })}

                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  style={{
                    ...S.btnSecondary,
                    minHeight: '34px', padding: '0 10px',
                    opacity: page === totalPages ? 0.4 : 1,
                    cursor: page === totalPages ? 'not-allowed' : 'pointer',
                  }}
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          고객사 생성 모달
          - open 시 phase='input', 모든 필드 초기화 (CreateTenantModal 내부 처리)
          - 생성 성공 후 onCreated로 목록 새로고침
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <CreateTenantModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={handleCreated}
      />

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          삭제 확인 모달
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {deleteConfirm && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setDeleteConfirm(null) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px', background: 'rgba(0,0,0,0.5)',
          }}
        >
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            width: '100%', maxWidth: '400px',
            padding: '24px',
            animation: 'fadeIn 0.2s ease-out',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '50%',
                background: '#FEF2F2',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <AlertCircle size={22} color="#EF4444" />
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  고객사 삭제
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                  이 작업은 되돌릴 수 없습니다.
                </p>
              </div>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}
              >
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-primary)', marginBottom: '20px', lineHeight: 1.6 }}>
              <strong>{deleteConfirm.company_name}</strong> 고객사를 삭제하시겠습니까?<br />
              모든 데이터(FAQ, 대화 로그 등)가 비활성화됩니다.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                style={{ ...S.btnSecondary, flex: 1, opacity: deleting ? 0.5 : 1 }}
              >
                취소
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{ ...S.btnDanger, flex: 1, opacity: deleting ? 0.8 : 1, cursor: deleting ? 'not-allowed' : 'pointer' }}
              >
                {deleting ? (
                  <><span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> 삭제 중...</>
                ) : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          Toast
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {toast && (
        <div style={{
          position: 'fixed', top: '20px', right: '20px', zIndex: 9999,
          padding: '12px 18px',
          borderRadius: '10px',
          background: toast.type === 'success' ? '#059669' : '#EF4444',
          color: '#fff',
          fontSize: '13px',
          fontWeight: 600,
          boxShadow: 'var(--shadow-lg)',
          animation: 'slideInRight 0.3s ease-out',
          maxWidth: '300px',
        }}>
          {toast.type === 'success' ? '✅ ' : '❌ '}{toast.msg}
        </div>
      )}
    </div>
  )
}
