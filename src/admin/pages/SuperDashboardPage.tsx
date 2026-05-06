// v2
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2, Users, TrendingUp, MessageSquare,
  Plus, Search, RefreshCw, LogOut, ShieldCheck,
  ChevronLeft, ChevronRight, AlertCircle, X,
  Key, ChevronDown, Layers, Globe, Lock, Eye, EyeOff,
  Check, Copy
} from 'lucide-react'
import { superApi } from '../lib/superApi'
import { useSuperAuth } from '../context/SuperAuthContext'
import CreateTenantModal from '../components/CreateTenantModal'
import { S } from '../lib/ui'

// ════════════════════════════════════════════════════════
// 타입 정의
// ════════════════════════════════════════════════════════
interface Tenant {
  id: string
  company_name: string
  email: string
  plan: string
  is_active: boolean
  created_at: string
  bot_name?: string
  subscription_start_date?: string | null
  subscription_end_date?: string | null
  subscription_status?: 'active' | 'pending' | 'expired'
  payment_requested_at?: string | null
  payment_memo?: string | null
}

interface DashboardStats {
  total_tenants: number
  active_tenants: number
  monthly_revenue: number
  total_chats: number
}

interface PlanData {
  id: string
  plan_name: string
  price: number
  faq_limit: number
  chat_limit: number
}

interface PlatformApi {
  id: string
  platform_name: string
  display_name: string
  api_endpoint: string
  auth_type: string
  description: string
  is_active: boolean
  created_at: string
}

// ════════════════════════════════════════════════════════
// 상수
// ════════════════════════════════════════════════════════
const PLAN_BADGE: Record<string, { bg: string; color: string }> = {
  basic:  { bg: 'rgba(107,114,128,0.12)', color: '#374151' },
  pro:    { bg: 'rgba(59,130,246,0.12)',  color: '#1D4ED8' },
  master: { bg: 'rgba(245,158,11,0.12)',  color: '#B45309' },
}
const PLAN_LABELS: Record<string, string> = {
  basic: 'Basic · ₩99,000/월 · FAQ 50개 · 월 1,000회 답변',
  pro:   'Pro · ₩199,000/월 · FAQ 200개 · 월 5,000회 답변',
  master:'Master · ₩399,000/월 · FAQ 무제한 · 월 답변 무제한',
}
const PLAN_PRICE: Record<string, number> = { basic: 99000, pro: 199000, master: 399000 }

// D-day 계산: 양수=남은 일수, 음수=만료됨, null=날짜없음
function calcDday(endDateStr: string | null | undefined): number | null {
  if (!endDateStr) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const end = new Date(endDateStr); end.setHours(0, 0, 0, 0)
  return Math.floor((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function formatDateKo(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`
}

function DdayBadge({ endDate }: { endDate: string | null | undefined }) {
  const dday = calcDday(endDate)
  if (dday === null) return <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>—</span>
  if (dday < 0) return (
    <span style={{ color: '#EF4444', fontWeight: 700, fontSize: '12px', background: '#FEF2F2', padding: '2px 8px', borderRadius: '12px' }}>만료</span>
  )
  if (dday === 0) return (
    <span style={{ color: '#EF4444', fontWeight: 700, fontSize: '12px', background: '#FEF2F2', padding: '2px 8px', borderRadius: '12px' }}>D-0</span>
  )
  if (dday <= 7) return (
    <span style={{ color: '#D97706', fontWeight: 700, fontSize: '12px', background: 'rgba(245,158,11,0.12)', padding: '2px 8px', borderRadius: '12px' }}>D-{dday}</span>
  )
  return (
    <span style={{ color: '#059669', fontWeight: 700, fontSize: '12px', background: 'rgba(5,150,105,0.1)', padding: '2px 8px', borderRadius: '12px' }}>D-{dday}</span>
  )
}

function PaymentStatusBadge({ status, requestedAt }: { status?: string; requestedAt?: string | null }) {
  if (status === 'pending' || requestedAt) return (
    <span style={{ color: '#D97706', fontWeight: 600, fontSize: '12px', background: 'rgba(245,158,11,0.12)', padding: '2px 8px', borderRadius: '12px' }}>입금 대기</span>
  )
  if (status === 'expired') return (
    <span style={{ color: '#EF4444', fontWeight: 600, fontSize: '12px', background: '#FEF2F2', padding: '2px 8px', borderRadius: '12px' }}>만료</span>
  )
  return (
    <span style={{ color: '#059669', fontWeight: 600, fontSize: '12px', background: 'rgba(5,150,105,0.1)', padding: '2px 8px', borderRadius: '12px' }}>입금 확인</span>
  )
}

// ════════════════════════════════════════════════════════
// 공통 UI 컴포넌트
// ════════════════════════════════════════════════════════

/** 스피너 */
function Spinner({ size = 14, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <span style={{
      display: 'inline-block',
      width: `${size}px`, height: `${size}px`,
      border: `2px solid ${color}33`,
      borderTopColor: color,
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
      flexShrink: 0,
    }} />
  )
}

/** Toast */
function Toast({ msg, type }: { msg: string; type: 'success' | 'error' }) {
  return (
    <div style={{
      position: 'fixed', top: '20px', right: '20px', zIndex: 9999,
      padding: '12px 18px', borderRadius: '10px',
      background: type === 'success' ? '#059669' : '#EF4444',
      color: '#fff', fontSize: '13px', fontWeight: 600,
      boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      animation: 'slideInRight 0.3s ease-out',
      maxWidth: '320px', display: 'flex', alignItems: 'center', gap: '8px',
    }}>
      {type === 'success' ? <Check size={15} /> : <AlertCircle size={15} />}
      {msg}
    </div>
  )
}

/** 통계 카드 */
function StatCard({ label, value, icon, color }: {
  label: string; value: string | number; icon: React.ReactNode; color: string
}) {
  return (
    <div style={{ ...S.card, display: 'flex', alignItems: 'center', gap: '16px' }}>
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

/** 모달 래퍼 */
function ModalWrap({ onClose, children, maxWidth = 480 }: {
  onClose: () => void; children: React.ReactNode; maxWidth?: number
}) {
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
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
        width: '100%', maxWidth: `${maxWidth}px`,
        maxHeight: '92vh', overflowY: 'auto',
        animation: 'fadeIn 0.2s ease-out',
      }}>
        {children}
      </div>
    </div>
  )
}

/** 모달 헤더 */
function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '20px 24px 16px',
      borderBottom: '1px solid var(--border)',
    }}>
      <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
        {title}
      </h3>
      <button onClick={onClose} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--text-secondary)', display: 'flex', padding: '4px',
        borderRadius: '6px',
      }}>
        <X size={18} />
      </button>
    </div>
  )
}

/** 인풋 래퍼 */
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={{ ...S.label }}>
        {label}{required && <span style={{ color: '#EF4444', marginLeft: '2px' }}>*</span>}
      </label>
      {children}
    </div>
  )
}

/** 에러 메시지 박스 */
function ErrBox({ msg }: { msg: string }) {
  if (!msg) return null
  return (
    <div style={{
      padding: '10px 14px', borderRadius: '8px',
      background: '#FEF2F2', border: '1px solid #FECACA',
      color: '#991B1B', fontSize: '13px', marginBottom: '14px',
      display: 'flex', alignItems: 'center', gap: '8px',
    }}>
      <AlertCircle size={15} /> {msg}
    </div>
  )
}

// ════════════════════════════════════════════════════════
// [모달1] 플랜 변경 모달
// ════════════════════════════════════════════════════════
function PlanChangeModal({ tenant, onClose, onSuccess }: {
  tenant: Tenant
  onClose: () => void
  onSuccess: (msg: string) => void
}) {
  const [plan, setPlan] = useState(tenant.plan)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function handleSubmit() {
    if (plan === tenant.plan) { onClose(); return }
    setLoading(true); setErr('')
    try {
      await superApi.updateTenantPlan(tenant.id, plan)
      onSuccess(`${tenant.company_name}의 플랜이 ${plan.toUpperCase()}으로 변경되었습니다.`)
      onClose()
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalWrap onClose={onClose} maxWidth={420}>
      <ModalHeader title="플랜 변경" onClose={onClose} />
      <div style={{ padding: '20px 24px 24px' }}>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', marginTop: 0 }}>
          <strong style={{ color: 'var(--text-primary)' }}>{tenant.company_name}</strong>의 플랜을 변경합니다.
        </p>
        <ErrBox msg={err} />
        <Field label="플랜 선택" required>
          {(['basic', 'pro', 'master'] as const).map(p => (
            <div
              key={p}
              onClick={() => setPlan(p)}
              style={{
                padding: '12px 16px',
                border: `2px solid ${plan === p ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: '10px',
                marginBottom: '8px',
                cursor: 'pointer',
                background: plan === p ? 'rgba(79,70,229,0.06)' : 'var(--bg-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                {PLAN_LABELS[p]}
              </span>
              {plan === p && <Check size={16} color="var(--primary)" />}
            </div>
          ))}
        </Field>
        <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
          <button onClick={onClose} disabled={loading} style={{ ...S.btnSecondary, flex: 1 }}>취소</button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{ ...S.btnPrimary, flex: 1, opacity: loading ? 0.8 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? <><Spinner /> 변경 중...</> : '변경하기'}
          </button>
        </div>
      </div>
    </ModalWrap>
  )
}

// ════════════════════════════════════════════════════════
// [모달2] 비밀번호 초기화 모달
// ════════════════════════════════════════════════════════
function ResetPasswordModal({ tenant, onClose, onSuccess }: {
  tenant: Tenant
  onClose: () => void
  onSuccess: (msg: string) => void
}) {
  const [phase, setPhase] = useState<'confirm' | 'done'>('confirm')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [tempPw, setTempPw] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleReset() {
    setLoading(true); setErr('')
    try {
      const res = await superApi.resetTenantPassword(tenant.id)
      setTempPw((res as any)?.data?.temp_password || (res as any)?.temp_password || '')
      setEmailSent(res.data?.email_sent || false)
      setPhase('done')
      onSuccess(`${tenant.company_name}의 비밀번호가 초기화되었습니다.`)
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  function copyPw() {
    navigator.clipboard.writeText(tempPw).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (phase === 'done') {
    return (
      <ModalWrap onClose={onClose} maxWidth={420}>
        <ModalHeader title="비밀번호 초기화 완료" onClose={onClose} />
        <div style={{ padding: '20px 24px 24px' }}>
          <div style={{
            background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.3)',
            borderRadius: '10px', padding: '16px', marginBottom: '16px',
          }}>
            <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#065F46', fontWeight: 600 }}>
              ✅ 임시 비밀번호가 생성되었습니다.
            </p>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: '#fff', border: '1px solid var(--border)',
              borderRadius: '8px', padding: '10px 12px',
            }}>
              <code style={{ flex: 1, fontSize: '16px', fontWeight: 700, letterSpacing: '2px', color: '#1F2937' }}>
                {tempPw}
              </code>
              <button
                onClick={copyPw}
                style={{
                  background: copied ? '#059669' : 'var(--primary)',
                  color: '#fff', border: 'none', borderRadius: '6px',
                  padding: '6px 10px', cursor: 'pointer', fontSize: '12px',
                  display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'inherit',
                }}
              >
                {copied ? <><Check size={13} /> 복사됨</> : <><Copy size={13} /> 복사</>}
              </button>
            </div>
          </div>
          <p style={{
            fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 16px',
            padding: '10px 12px', background: 'var(--bg-primary)', borderRadius: '8px',
            lineHeight: 1.6,
          }}>
        🔑 위 임시 비밀번호를 고객사에 직접 전달해 주세요.

          </p>
          <button onClick={onClose} style={{ ...S.btnPrimary, width: '100%' }}>확인</button>
        </div>
      </ModalWrap>
    )
  }

  return (
    <ModalWrap onClose={onClose} maxWidth={400}>
      <ModalHeader title="비밀번호 초기화" onClose={onClose} />
      <div style={{ padding: '20px 24px 24px' }}>
        <div style={{
          display: 'flex', gap: '12px', alignItems: 'flex-start',
          marginBottom: '16px',
        }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '50%',
            background: 'rgba(245,158,11,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Key size={20} color="#D97706" />
          </div>
          <p style={{ fontSize: '14px', color: 'var(--text-primary)', margin: 0, lineHeight: 1.6 }}>
            <strong>{tenant.company_name}</strong>의 비밀번호를 초기화하시겠습니까?<br />
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              새 임시 비밀번호가 생성됩니다. 고객사에 직접 전달해 주세요.
            </span>
          </p>
        </div>
        <ErrBox msg={err} />
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onClose} disabled={loading} style={{ ...S.btnSecondary, flex: 1 }}>취소</button>
          <button
            onClick={handleReset}
            disabled={loading}
            style={{
              ...S.btnPrimary,
              flex: 1,
              background: '#D97706',
              opacity: loading ? 0.8 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? <><Spinner /> 초기화 중...</> : '초기화하기'}
          </button>
        </div>
      </div>
    </ModalWrap>
  )
}

// ════════════════════════════════════════════════════════
// [모달3] 삭제 확인 모달
// ════════════════════════════════════════════════════════
function DeleteModal({ tenant, onClose, onSuccess }: {
  tenant: Tenant
  onClose: () => void
  onSuccess: (msg: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function handleDelete() {
    setLoading(true); setErr('')
    try {
      await superApi.deleteTenant(tenant.id)
      onSuccess(`${tenant.company_name}이(가) 삭제되었습니다.`)
      onClose()
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalWrap onClose={onClose} maxWidth={400}>
      <div style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '50%', background: '#FEF2F2',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <AlertCircle size={22} color="#EF4444" />
          </div>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              고객사 삭제
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '3px', marginBottom: 0 }}>
              이 작업은 되돌릴 수 없습니다.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}
          >
            <X size={18} />
          </button>
        </div>
        <p style={{ fontSize: '14px', color: 'var(--text-primary)', marginBottom: '16px', lineHeight: 1.6 }}>
          <strong>{tenant.company_name}</strong> 고객사를 삭제하시겠습니까?<br />
          모든 데이터(FAQ, 대화 로그 등)가 비활성화됩니다.
        </p>
        <ErrBox msg={err} />
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onClose} disabled={loading} style={{ ...S.btnSecondary, flex: 1 }}>취소</button>
          <button
            onClick={handleDelete}
            disabled={loading}
            style={{ ...S.btnDanger, flex: 1, opacity: loading ? 0.8 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? <><Spinner /> 삭제 중...</> : '삭제'}
          </button>
        </div>
      </div>
    </ModalWrap>
  )
}

// ════════════════════════════════════════════════════════
// [모달4] 플랜 수정 모달
// ════════════════════════════════════════════════════════
function EditPlanModal({ plan, onClose, onSuccess }: {
  plan: PlanData
  onClose: () => void
  onSuccess: (msg: string) => void
}) {
  const [price, setPrice] = useState(String(plan.price))
  const [faqLimit, setFaqLimit] = useState(String(plan.faq_limit))
  const [chatLimit, setChatLimit] = useState(String(plan.chat_limit))
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function handleSubmit() {
    const priceNum = parseInt(price)
    const faqNum = parseInt(faqLimit)
    const chatNum = parseInt(chatLimit)
    if (isNaN(priceNum) || priceNum < 0) { setErr('올바른 가격을 입력하세요.'); return }
    if (isNaN(faqNum)) { setErr('FAQ 한도를 입력하세요. (-1 = 무제한)'); return }
    if (isNaN(chatNum)) { setErr('대화 한도를 입력하세요. (-1 = 무제한)'); return }

    setLoading(true); setErr('')
    try {
      await superApi.updatePlan(plan.id, { price: priceNum, faq_limit: faqNum, chat_limit: chatNum })
      onSuccess(`${plan.plan_name.toUpperCase()} 플랜이 수정되었습니다.`)
      onClose()
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    ...S.input, minHeight: '40px', fontSize: '14px',
  }

  return (
    <ModalWrap onClose={onClose} maxWidth={420}>
      <ModalHeader title={`${plan.plan_name.toUpperCase()} 플랜 수정`} onClose={onClose} />
      <div style={{ padding: '20px 24px 24px' }}>
        <ErrBox msg={err} />
        <Field label="가격 (원)" required>
          <input type="number" value={price} onChange={e => setPrice(e.target.value)} style={inputStyle} min={0} />
        </Field>
        <Field label="FAQ 한도 (-1 = 무제한)" required>
          <input type="number" value={faqLimit} onChange={e => setFaqLimit(e.target.value)} style={inputStyle} />
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>-1 입력 시 무제한</p>
        </Field>
        <Field label="월 답변 한도 (-1 = 무제한)" required>
          <input type="number" value={chatLimit} onChange={e => setChatLimit(e.target.value)} style={inputStyle} />
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>-1 입력 시 무제한</p>
        </Field>
        <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
          <button onClick={onClose} disabled={loading} style={{ ...S.btnSecondary, flex: 1 }}>취소</button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{ ...S.btnPrimary, flex: 1, opacity: loading ? 0.8 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? <><Spinner /> 저장 중...</> : '저장'}
          </button>
        </div>
      </div>
    </ModalWrap>
  )
}

// ════════════════════════════════════════════════════════
// [모달5] 플랫폼 추가/수정 모달
// ════════════════════════════════════════════════════════
function PlatformModal({ platform, onClose, onSuccess }: {
  platform?: PlatformApi
  onClose: () => void
  onSuccess: (msg: string) => void
}) {
  const isEdit = !!platform
  const [form, setForm] = useState({
    platform_name: platform?.platform_name || '',
    display_name: platform?.display_name || '',
    api_endpoint: platform?.api_endpoint || '',
    auth_type: platform?.auth_type || 'bearer',
    description: platform?.description || '',
  })
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  function update(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit() {
    if (!form.platform_name.trim()) { setErr('플랫폼명을 입력하세요.'); return }
    if (!form.display_name.trim()) { setErr('표시명을 입력하세요.'); return }
    setLoading(true); setErr('')
    try {
      if (isEdit && platform) {
        await superApi.updatePlatformApi(platform.id, {
          display_name: form.display_name,
          api_endpoint: form.api_endpoint,
          auth_type: form.auth_type,
          description: form.description,
        })
        onSuccess(`${form.display_name} 플랫폼이 수정되었습니다.`)
      } else {
        await superApi.createPlatformApi(form)
        onSuccess(`${form.display_name} 플랫폼이 추가되었습니다.`)
      }
      onClose()
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = { ...S.input, minHeight: '40px', fontSize: '14px' }

  return (
    <ModalWrap onClose={onClose} maxWidth={480}>
      <ModalHeader title={isEdit ? '플랫폼 수정' : '새 플랫폼 추가'} onClose={onClose} />
      <div style={{ padding: '20px 24px 24px' }}>
        <ErrBox msg={err} />
        {!isEdit && (
          <Field label="플랫폼명 (영문, 소문자)" required>
            <input
              value={form.platform_name}
              onChange={e => update('platform_name', e.target.value)}
              placeholder="예: kakao, naver, coupang"
              style={inputStyle}
            />
          </Field>
        )}
        <Field label="표시명" required>
          <input
            value={form.display_name}
            onChange={e => update('display_name', e.target.value)}
            placeholder="예: 카카오 채널"
            style={inputStyle}
          />
        </Field>
        <Field label="API 엔드포인트">
          <input
            value={form.api_endpoint}
            onChange={e => update('api_endpoint', e.target.value)}
            placeholder="https://api.example.com/v1"
            style={inputStyle}
          />
        </Field>
        <Field label="인증 방식">
          <select value={form.auth_type} onChange={e => update('auth_type', e.target.value)} style={{ ...S.select, minHeight: '40px', fontSize: '14px' }}>
            <option value="bearer">Bearer Token</option>
            <option value="oauth2">OAuth 2.0</option>
            <option value="api_key">API Key</option>
            <option value="basic">Basic Auth</option>
          </select>
        </Field>
        <Field label="설명">
          <textarea
            value={form.description}
            onChange={e => update('description', e.target.value)}
            rows={2}
            placeholder="플랫폼 설명"
            style={{ ...S.textarea, fontSize: '14px' }}
          />
        </Field>
        <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
          <button onClick={onClose} disabled={loading} style={{ ...S.btnSecondary, flex: 1 }}>취소</button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{ ...S.btnPrimary, flex: 1, opacity: loading ? 0.8 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? <><Spinner /> 저장 중...</> : isEdit ? '저장' : '추가'}
          </button>
        </div>
      </div>
    </ModalWrap>
  )
}

// ════════════════════════════════════════════════════════
// [모달6] 비밀번호 변경 모달
// ════════════════════════════════════════════════════════
function ChangePasswordModal({ onClose, onLogout }: {
  onClose: () => void
  onLogout: () => void
}) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [show, setShow] = useState({ current: false, next: false, confirm: false })
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  function update(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }
  function toggleShow(k: string) { setShow(s => ({ ...s, [k]: !s[k as keyof typeof s] })) }

  const pwValid = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/.test(form.next)
  const rules = [
    { label: '8자 이상', ok: form.next.length >= 8 },
    { label: '대문자 포함', ok: /[A-Z]/.test(form.next) },
    { label: '소문자 포함', ok: /[a-z]/.test(form.next) },
    { label: '숫자 포함', ok: /\d/.test(form.next) },
    { label: '특수문자 포함', ok: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(form.next) },
  ]

  async function handleSubmit() {
    if (!form.current) { setErr('현재 비밀번호를 입력하세요.'); return }
    if (!pwValid) { setErr('새 비밀번호가 규칙을 만족하지 않습니다.'); return }
    if (form.next !== form.confirm) { setErr('새 비밀번호 확인이 일치하지 않습니다.'); return }
    setLoading(true); setErr('')
    try {
      await superApi.changePassword(form.current, form.next)
      setDone(true)
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <ModalWrap onClose={onClose} maxWidth={400}>
        <div style={{ padding: '32px 24px', textAlign: 'center' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '50%',
            background: 'rgba(5,150,105,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <Check size={26} color="#059669" />
          </div>
          <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px', color: 'var(--text-primary)' }}>
            비밀번호 변경 완료
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
            보안을 위해 자동으로 로그아웃됩니다.
          </p>
          <button onClick={onLogout} style={{ ...S.btnPrimary, width: '100%' }}>
            로그아웃
          </button>
        </div>
      </ModalWrap>
    )
  }

  return (
    <ModalWrap onClose={onClose} maxWidth={440}>
      <ModalHeader title="비밀번호 변경" onClose={onClose} />
      <div style={{ padding: '20px 24px 24px' }}>
        <ErrBox msg={err} />

        {(['current', 'next', 'confirm'] as const).map(key => (
          <Field
            key={key}
            label={key === 'current' ? '현재 비밀번호' : key === 'next' ? '새 비밀번호' : '새 비밀번호 확인'}
            required
          >
            <div style={{ position: 'relative' }}>
              <input
                type={show[key] ? 'text' : 'password'}
                value={form[key]}
                onChange={e => update(key, e.target.value)}
                style={{ ...S.input, minHeight: '42px', paddingRight: '42px' }}
              />
              <button
                type="button"
                onClick={() => toggleShow(key)}
                style={{
                  position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)',
                  display: 'flex', alignItems: 'center',
                }}
              >
                {show[key] ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>
        ))}

        {/* 비밀번호 규칙 */}
        {form.next && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: '6px',
            }}>
              {rules.map(r => (
                <span key={r.label} style={{
                  padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                  background: r.ok ? 'rgba(5,150,105,0.1)' : 'rgba(107,114,128,0.1)',
                  color: r.ok ? '#065F46' : '#6B7280',
                  display: 'flex', alignItems: 'center', gap: '3px',
                }}>
                  {r.ok ? <Check size={10} /> : null}
                  {r.label}
                </span>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
          <button onClick={onClose} disabled={loading} style={{ ...S.btnSecondary, flex: 1 }}>취소</button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{ ...S.btnPrimary, flex: 1, opacity: loading ? 0.8 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? <><Spinner /> 변경 중...</> : '변경하기'}
          </button>
        </div>
      </div>
    </ModalWrap>
  )
}

// ════════════════════════════════════════════════════════
// 관리 드롭다운 메뉴 (position:fixed — 테이블 overflow 잘림 방지)
// ════════════════════════════════════════════════════════
function ActionMenu({ tenant, onPlan, onStatus, onResetPw, onDelete, onExtend, onConfirmPayment, onYearlyBilling }: {
  tenant: Tenant
  onPlan: () => void
  onStatus: () => void
  onResetPw: () => void
  onDelete: () => void
  onExtend: () => void
  onConfirmPayment: () => void
  onYearlyBilling: () => void
}) {
  const [open, setOpen] = useState(false)
  // fixed 위치 좌표 (버튼 bottom 기준)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // 외부 클릭 시 닫힘
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        menuRef.current && !menuRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClick)
    }
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // 스크롤 시 닫힘
  useEffect(() => {
    if (!open) return
    function handleScroll() { setOpen(false) }
    window.addEventListener('scroll', handleScroll, true)
    return () => window.removeEventListener('scroll', handleScroll, true)
  }, [open])

  function handleToggle() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setMenuPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      })
    }
    setOpen(o => !o)
  }

  const menuItems = [
    {
      label: '플랜 변경',
      color: '#1D4ED8',
      bg: 'rgba(59,130,246,0.06)',
      hoverBg: 'rgba(59,130,246,0.1)',
      onClick: () => { setOpen(false); onPlan() },
    },
    {
      label: tenant.is_active ? '비활성화' : '활성화',
      color: tenant.is_active ? '#6B7280' : '#059669',
      bg: tenant.is_active ? 'rgba(107,114,128,0.06)' : 'rgba(5,150,105,0.06)',
      hoverBg: tenant.is_active ? 'rgba(107,114,128,0.12)' : 'rgba(5,150,105,0.12)',
      onClick: () => { setOpen(false); onStatus() },
    },
    {
      label: '1개월 연장',
      color: '#7C3AED',
      bg: 'rgba(124,58,237,0.06)',
      hoverBg: 'rgba(124,58,237,0.12)',
      onClick: () => { setOpen(false); onExtend() },
    },
    {
      label: '입금 확인',
      color: '#059669',
      bg: 'rgba(5,150,105,0.06)',
      hoverBg: 'rgba(5,150,105,0.12)',
      onClick: () => { setOpen(false); onConfirmPayment() },
    },
    {
      label: '연간 결제 전환',
      color: '#0284C7',
      bg: 'rgba(2,132,199,0.06)',
      hoverBg: 'rgba(2,132,199,0.12)',
      onClick: () => { setOpen(false); onYearlyBilling() },
    },
    {
      label: '비밀번호 초기화',
      color: '#D97706',
      bg: 'rgba(245,158,11,0.06)',
      hoverBg: 'rgba(245,158,11,0.12)',
      onClick: () => { setOpen(false); onResetPw() },
    },
    {
      label: '삭제',
      color: '#EF4444',
      bg: 'rgba(239,68,68,0.06)',
      hoverBg: 'rgba(239,68,68,0.12)',
      onClick: () => { setOpen(false); onDelete() },
    },
  ]

  return (
    <div style={{ display: 'inline-block' }}>
      <button
        ref={btnRef}
        onClick={handleToggle}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          background: open ? 'var(--primary)' : 'var(--bg-primary)',
          color: open ? '#fff' : 'var(--text-primary)',
          border: '1px solid var(--border)',
          borderRadius: '7px', padding: '5px 10px',
          fontSize: '12px', fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => {
          if (!open) {
            e.currentTarget.style.background = 'rgba(79,70,229,0.08)'
            e.currentTarget.style.borderColor = 'var(--primary)'
          }
        }}
        onMouseLeave={e => {
          if (!open) {
            e.currentTarget.style.background = 'var(--bg-primary)'
            e.currentTarget.style.borderColor = 'var(--border)'
          }
        }}
      >
        관리
        <ChevronDown size={12} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: `${menuPos.top}px`,
            right: `${menuPos.right}px`,
            zIndex: 9999,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            minWidth: '148px',
            overflow: 'hidden',
            animation: 'fadeIn 0.15s ease-out',
          }}
        >
          {menuItems.map((item, i) => (
            <button
              key={i}
              onClick={item.onClick}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '10px 16px',
                background: item.bg,
                border: 'none',
                borderBottom: i < menuItems.length - 1 ? '1px solid var(--border)' : 'none',
                color: item.color,
                fontSize: '13px', fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = item.hoverBg}
              onMouseLeave={e => e.currentTarget.style.background = item.bg}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════
// 탭: 고객사 목록
// ════════════════════════════════════════════════════════

// [모달5] 구독 연장 확인 모달
function ExtendModal({ tenant, onClose, onSuccess }: {
  tenant: Tenant; onClose: () => void; onSuccess: (msg: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  async function handleExtend() {
    setLoading(true); setErr('')
    try {
      const res = await superApi.extendTenantSubscription(tenant.id)
      onSuccess(`${tenant.company_name} 구독이 1개월 연장되었습니다. (만료일: ${res.data?.subscription_end_date || ''})`)
      onClose()
    } catch (e: any) { setErr(e.message) }
    finally { setLoading(false) }
  }
  return (
    <ModalWrap onClose={onClose} maxWidth={400}>
      <ModalHeader title="구독 1개월 연장" onClose={onClose} />
      <div style={{ padding: '20px 24px 24px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(124,58,237,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: '20px' }}>📅</span>
          </div>
          <p style={{ fontSize: '14px', color: 'var(--text-primary)', margin: 0, lineHeight: 1.6 }}>
            <strong>{tenant.company_name}</strong>의 구독을 1개월 연장합니다.<br />
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              현재 만료일: {formatDateKo(tenant.subscription_end_date)}
            </span>
          </p>
        </div>
        <ErrBox msg={err} />
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onClose} disabled={loading} style={{ ...S.btnSecondary, flex: 1 }}>취소</button>
          <button onClick={handleExtend} disabled={loading} style={{ ...S.btnPrimary, flex: 1, background: '#7C3AED', opacity: loading ? 0.8 : 1 }}>
            {loading ? <><Spinner /> 연장 중...</> : '1개월 연장'}
          </button>
        </div>
      </div>
    </ModalWrap>
  )
}

// [모달5-b] 연간 결제 전환 확인 모달
function YearlyBillingModal({ tenant, onClose, onSuccess }: {
  tenant: Tenant; onClose: () => void; onSuccess: (msg: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  // 오늘 + 1년 날짜 계산 (표시용)
  const today = new Date()
  const nextYear = new Date(today)
  nextYear.setFullYear(nextYear.getFullYear() + 1)
  const nextBillingStr = nextYear.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })

  async function handleConvert() {
    setLoading(true); setErr('')
    try {
      await superApi.convertToYearlyBilling(tenant.id)
      onSuccess('연간 결제로 전환되었습니다.')
      onClose()
    } catch (e: any) { setErr(e.message) }
    finally { setLoading(false) }
  }

  return (
    <ModalWrap onClose={onClose} maxWidth={440}>
      <ModalHeader title="연간 결제 전환" onClose={onClose} />
      <div style={{ padding: '20px 24px 24px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '50%',
            background: 'rgba(2,132,199,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <span style={{ fontSize: '20px' }}>📅</span>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '14px', color: 'var(--text-primary)', margin: '0 0 8px', lineHeight: 1.6 }}>
              <strong>{tenant.company_name}</strong>을(를) 연간 결제로 전환합니다.
            </p>
            <div style={{
              background: 'rgba(2,132,199,0.06)',
              border: '1px solid rgba(2,132,199,0.2)',
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: '13px',
              color: 'var(--text-secondary)',
              lineHeight: 1.7,
            }}>
              <div>• <strong style={{ color: 'var(--text-primary)' }}>다음 결제일</strong>: {nextBillingStr}</div>
              <div>• <strong style={{ color: 'var(--text-primary)' }}>구독 기간</strong>: 오늘부터 1년</div>
              <div style={{ marginTop: '6px', fontSize: '12px', color: '#D97706' }}>
                ⚠️ 전환 후 되돌릴 수 없습니다.
              </div>
            </div>
          </div>
        </div>
        <ErrBox msg={err} />
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onClose} disabled={loading} style={{ ...S.btnSecondary, flex: 1 }}>취소</button>
          <button
            onClick={handleConvert}
            disabled={loading}
            style={{ ...S.btnPrimary, flex: 1, background: '#0284C7', opacity: loading ? 0.8 : 1 }}
          >
            {loading ? <><Spinner /> 전환 중...</> : '연간 결제 전환'}
          </button>
        </div>
      </div>
    </ModalWrap>
  )
}

// [모달6] 입금 확인 모달
function ConfirmPaymentModal({ tenant, onClose, onSuccess }: {
  tenant: Tenant; onClose: () => void; onSuccess: (msg: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  async function handleConfirm() {
    setLoading(true); setErr('')
    try {
      const res = await superApi.confirmTenantPayment(tenant.id)
      onSuccess(`${tenant.company_name} 입금 확인 및 1개월 연장 완료 (만료일: ${res.data?.subscription_end_date || ''})`)
      onClose()
    } catch (e: any) { setErr(e.message) }
    finally { setLoading(false) }
  }
  return (
    <ModalWrap onClose={onClose} maxWidth={400}>
      <ModalHeader title="입금 확인" onClose={onClose} />
      <div style={{ padding: '20px 24px 24px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(5,150,105,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: '20px' }}>✅</span>
          </div>
          <p style={{ fontSize: '14px', color: 'var(--text-primary)', margin: 0, lineHeight: 1.6 }}>
            <strong>{tenant.company_name}</strong>의 입금을 확인하고<br />구독을 1개월 연장합니다.
            {tenant.payment_memo && (
              <><br /><span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>💰 입금자명: {tenant.payment_memo}</span></>
            )}
            {tenant.payment_requested_at && (
              <><br /><span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>📅 입금 요청: {formatDateKo(tenant.payment_requested_at)}</span></>
            )}
          </p>

        </div>
        <ErrBox msg={err} />
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onClose} disabled={loading} style={{ ...S.btnSecondary, flex: 1 }}>취소</button>
          <button onClick={handleConfirm} disabled={loading} style={{ ...S.btnPrimary, flex: 1, background: '#059669', opacity: loading ? 0.8 : 1 }}>
            {loading ? <><Spinner /> 처리 중...</> : '입금 확인 완료'}
          </button>
        </div>
      </div>
    </ModalWrap>
  )
}

function TenantsTab({ onShowToast }: { onShowToast: (msg: string, type: 'success' | 'error') => void }) {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [planFilter, setPlanFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)

  // 액션 모달 상태
  const [planModal, setPlanModal] = useState<Tenant | null>(null)
  const [resetPwModal, setResetPwModal] = useState<Tenant | null>(null)
  const [deleteModal, setDeleteModal] = useState<Tenant | null>(null)
  const [extendModal, setExtendModal] = useState<Tenant | null>(null)
  const [confirmPayModal, setConfirmPayModal] = useState<Tenant | null>(null)
  const [yearlyBillingModal, setYearlyBillingModal] = useState<Tenant | null>(null)

  const loadTenants = useCallback(async (p = 1, s = '', plan = '', status = '') => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = { page: p, limit: 10 }
      if (s) params.search = s
      if (plan) params.plan = plan
      if (status) params.status = status
      const res = await superApi.getTenants(params)
      setTenants(res.data?.items || [])
      setTotal(res.data?.total || 0)
      setTotalPages(res.data?.totalPages || 1)
    } catch (err: any) {
      onShowToast(err.message || '목록 로드 실패', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTenants(page, search, planFilter, statusFilter)
  }, [page, search, planFilter, statusFilter])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const s = searchInput.trim()
    setPage(1); setSearch(s)
  }

  function handleFilterChange(plan: string, status: string) {
    setPlanFilter(plan); setStatusFilter(status); setPage(1)
  }

  async function handleStatusToggle(tenant: Tenant) {
    try {
      await superApi.updateTenantStatus(tenant.id, !tenant.is_active)
      onShowToast(`${tenant.company_name}이(가) ${!tenant.is_active ? '활성화' : '비활성화'}되었습니다.`)
      loadTenants(page, search, planFilter, statusFilter)
    } catch (e: any) {
      onShowToast(e.message || '상태 변경 실패', 'error')
    }
  }

  function formatDate(iso: string) {
    const d = new Date(iso)
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  }

  const filterSelectStyle: React.CSSProperties = {
    padding: '7px 10px',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    fontSize: '13px',
    outline: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    height: '38px',
  }

  return (
    <div>
      <div style={{
        ...S.card, padding: 0, overflow: 'hidden',
      }}>
        {/* 헤더 */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '10px',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              고객사 목록
            </h2>
            <span style={{
              padding: '2px 10px', borderRadius: '20px',
              background: 'rgba(79,70,229,0.1)', color: '#4F46E5',
              fontSize: '12px', fontWeight: 600,
            }}>
              {total}개
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* 검색 */}
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: '6px' }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{
                  position: 'absolute', left: '10px', top: '50%',
                  transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none',
                }} />
                <input
                  type="text"
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  placeholder="회사명 / 이메일"
                  style={{ ...S.input, minHeight: '38px', paddingLeft: '30px', width: '180px', fontSize: '13px' }}
                />
              </div>
              <button type="submit" style={{ ...S.btnPrimary, minHeight: '38px', padding: '0 12px', fontSize: '13px' }}>
                검색
              </button>
            </form>

            {/* 플랜 필터 */}
            <select
              value={planFilter}
              onChange={e => handleFilterChange(e.target.value, statusFilter)}
              style={filterSelectStyle}
            >
              <option value="">전체 플랜</option>
              <option value="basic">Basic</option>
              <option value="pro">Pro</option>
              <option value="master">Master</option>
            </select>

            {/* 상태 필터 */}
            <select
              value={statusFilter}
              onChange={e => handleFilterChange(planFilter, e.target.value)}
              style={filterSelectStyle}
            >
              <option value="">전체 상태</option>
              <option value="active">활성</option>
              <option value="inactive">비활성</option>
            </select>

            {/* 새로고침 */}
            <button
              onClick={() => loadTenants(page, search, planFilter, statusFilter)}
              style={{ ...S.btnSecondary, minHeight: '38px', padding: '0 10px', fontSize: '13px', gap: '5px' }}
            >
              <RefreshCw size={13} />
            </button>

            {/* 고객사 생성 */}
            <button
              onClick={() => setCreateOpen(true)}
              style={{ ...S.btnPrimary, minHeight: '38px', padding: '0 14px', fontSize: '13px', gap: '5px' }}
            >
              <Plus size={14} />
              고객사 생성
            </button>
          </div>
        </div>

        {/* 테이블 */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-primary)' }}>
                {['회사명', '이메일', '플랜', '상태', '구독 시작일', '만료일', 'D-day', '결제 상태', '생성일', '관리'].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: 'left', fontWeight: 600,
                    color: 'var(--text-secondary)', whiteSpace: 'nowrap',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{
                          height: '14px', borderRadius: '6px',
                          background: 'linear-gradient(90deg, var(--border) 25%, var(--bg-primary) 50%, var(--border) 75%)',
                          backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite',
                          width: j === 0 ? '120px' : j === 1 ? '160px' : '80px',
                        }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : tenants.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <Building2 size={36} style={{ marginBottom: '12px', opacity: 0.3, display: 'block', margin: '0 auto 12px' }} />
                    {search || planFilter || statusFilter ? '검색/필터 결과가 없습니다.' : '등록된 고객사가 없습니다.'}
                  </td>
                </tr>
              ) : (
                tenants.map((tenant, idx) => {
                  const badge = PLAN_BADGE[tenant.plan] || PLAN_BADGE.basic
                  return (
                    <tr
                      key={tenant.id}
                      style={{
                        borderBottom: idx < tenants.length - 1 ? '1px solid var(--border)' : 'none',
                        background: idx % 2 === 0 ? 'var(--bg-secondary)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '14px 16px', whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {tenant.company_name}
                      </td>
                      <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>
                        {tenant.email}
                      </td>
                      <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-block', padding: '3px 10px', borderRadius: '20px',
                          fontSize: '12px', fontWeight: 600, background: badge.bg, color: badge.color,
                        }}>
                          {tenant.plan.charAt(0).toUpperCase() + tenant.plan.slice(1)}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '5px',
                          padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                          background: tenant.is_active ? 'rgba(5,150,105,0.1)' : 'rgba(107,114,128,0.1)',
                          color: tenant.is_active ? '#059669' : '#6B7280',
                        }}>
                          <span style={{
                            width: '6px', height: '6px', borderRadius: '50%',
                            background: tenant.is_active ? '#059669' : '#9CA3AF',
                          }} />
                          {tenant.is_active ? '활성' : '비활성'}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                        {formatDateKo(tenant.subscription_start_date)}
                      </td>
                      <td style={{ padding: '14px 16px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                        {formatDateKo(tenant.subscription_end_date)}
                      </td>
                      <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                        <DdayBadge endDate={tenant.subscription_end_date} />
                      </td>
                      <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                        <PaymentStatusBadge status={tenant.subscription_status} requestedAt={tenant.payment_requested_at} />
                      </td>
                      <td style={{ padding: '14px 16px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                        {formatDate(tenant.created_at)}
                      </td>
                      <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                        <ActionMenu
                          tenant={tenant}
                          onPlan={() => setPlanModal(tenant)}
                          onStatus={() => handleStatusToggle(tenant)}
                          onResetPw={() => setResetPwModal(tenant)}
                          onDelete={() => setDeleteModal(tenant)}
                          onExtend={() => setExtendModal(tenant)}
                          onConfirmPayment={() => setConfirmPayModal(tenant)}
                          onYearlyBilling={() => setYearlyBillingModal(tenant)}
                        />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div style={{
            padding: '14px 20px', borderTop: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px',
          }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              전체 {total}개 중 {((page - 1) * 10) + 1}–{Math.min(page * 10, total)}개 표시
            </span>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{ ...S.btnSecondary, minHeight: '34px', padding: '0 10px', opacity: page === 1 ? 0.4 : 1 }}
              >
                <ChevronLeft size={15} />
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                const isActive = i + 1 === page
                return (
                  <button
                    key={i}
                    onClick={() => setPage(i + 1)}
                    style={{
                      minWidth: '34px', minHeight: '34px', padding: '0 10px',
                      border: isActive ? 'none' : '1px solid var(--border)',
                      borderRadius: '8px',
                      background: isActive ? 'var(--primary)' : 'var(--bg-secondary)',
                      color: isActive ? '#fff' : 'var(--text-primary)',
                      fontSize: '13px', fontWeight: isActive ? 700 : 400,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >{i + 1}</button>
                )
              })}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{ ...S.btnSecondary, minHeight: '34px', padding: '0 10px', opacity: page === totalPages ? 0.4 : 1 }}
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 모달들 */}
      <CreateTenantModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => { loadTenants(1, search, planFilter, statusFilter); setPage(1) }}
      />
      {planModal && (
        <PlanChangeModal
          tenant={planModal}
          onClose={() => setPlanModal(null)}
          onSuccess={msg => { onShowToast(msg); loadTenants(page, search, planFilter, statusFilter); setPlanModal(null) }}
        />
      )}
      {resetPwModal && (
        <ResetPasswordModal
          tenant={resetPwModal}
          onClose={() => setResetPwModal(null)}
          onSuccess={msg => { onShowToast(msg) }}
        />
      )}
      {deleteModal && (
        <DeleteModal
          tenant={deleteModal}
          onClose={() => setDeleteModal(null)}
          onSuccess={msg => { onShowToast(msg); loadTenants(page, search, planFilter, statusFilter); setDeleteModal(null) }}
        />
      )}
      {extendModal && (
        <ExtendModal
          tenant={extendModal}
          onClose={() => setExtendModal(null)}
          onSuccess={msg => { onShowToast(msg, 'success'); loadTenants(page, search, planFilter, statusFilter); setExtendModal(null) }}
        />
      )}
      {confirmPayModal && (
        <ConfirmPaymentModal
          tenant={confirmPayModal}
          onClose={() => setConfirmPayModal(null)}
          onSuccess={msg => { onShowToast(msg, 'success'); loadTenants(page, search, planFilter, statusFilter); setConfirmPayModal(null) }}
        />
      )}
      {yearlyBillingModal && (
        <YearlyBillingModal
          tenant={yearlyBillingModal}
          onClose={() => setYearlyBillingModal(null)}
          onSuccess={msg => { onShowToast(msg, 'success'); loadTenants(page, search, planFilter, statusFilter); setYearlyBillingModal(null) }}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════
// 탭: 플랜 관리
// ════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════
// 탭: 미납 현황
// ════════════════════════════════════════════════════════
function UnpaidTab({ onShowToast }: { onShowToast: (msg: string, type: 'success' | 'error') => void }) {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmPayModal, setConfirmPayModal] = useState<Tenant | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // 전체 목록 가져와서 만료 7일 이내 또는 만료된 것만 필터
      const res = await superApi.getTenants({ page: 1, limit: 100 })
      const all: Tenant[] = res.data?.items || []
      const filtered = all.filter(t => {
        const dday = calcDday(t.subscription_end_date)
        return dday !== null && dday <= 7
      })
      setTenants(filtered)
    } catch (e: any) {
      onShowToast(e.message || '데이터 로드 실패', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [])

  // 요약 통계
  const imminent = tenants.filter(t => { const d = calcDday(t.subscription_end_date); return d !== null && d >= 0 && d <= 7 })
  const expired = tenants.filter(t => { const d = calcDday(t.subscription_end_date); return d !== null && d < 0 })
  const monthlyRevenue = tenants
    .filter(t => t.is_active)
    .reduce((sum, t) => sum + (PLAN_PRICE[t.plan] || 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 요약 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <div style={{ ...S.card, borderLeft: '4px solid #F59E0B' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>만료 임박 (7일 이내)</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#D97706' }}>{loading ? '—' : imminent.length}<span style={{ fontSize: '14px', fontWeight: 400, marginLeft: '4px' }}>건</span></div>
        </div>
        <div style={{ ...S.card, borderLeft: '4px solid #EF4444' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>이미 만료</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#EF4444' }}>{loading ? '—' : expired.length}<span style={{ fontSize: '14px', fontWeight: 400, marginLeft: '4px' }}>건</span></div>
        </div>
        <div style={{ ...S.card, borderLeft: '4px solid #059669' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>이번 달 예상 수익</div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#059669' }}>{loading ? '—' : `₩${monthlyRevenue.toLocaleString()}`}</div>
        </div>
      </div>

      {/* 미납 테이블 */}
      <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            만료 임박 / 미납 고객사
          </h2>
          <button
            onClick={loadData}
            style={{ ...S.btnSecondary, minHeight: '36px', padding: '0 12px', fontSize: '13px', gap: '5px' }}
          >
            <RefreshCw size={13} /> 새로고침
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-primary)' }}>
                {['업체명', '플랜', '만료일', 'D-day', '결제 상태', '월 요금', '입금 확인'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ height: '12px', borderRadius: '6px', background: 'linear-gradient(90deg, var(--border) 25%, var(--bg-primary) 50%, var(--border) 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite', width: '80px' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : tenants.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <Check size={36} style={{ opacity: 0.3, display: 'block', margin: '0 auto 12px' }} />
                    만료 임박 고객사가 없습니다. 🎉
                  </td>
                </tr>
              ) : tenants.map((t, idx) => {
                const badge = PLAN_BADGE[t.plan] || PLAN_BADGE.basic
                const dday = calcDday(t.subscription_end_date)
                return (
                  <tr key={t.id} style={{ borderBottom: idx < tenants.length - 1 ? '1px solid var(--border)' : 'none', background: dday !== null && dday < 0 ? '#FFF7F7' : idx % 2 === 0 ? 'var(--bg-secondary)' : 'transparent' }}>
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--text-primary)' }}>{t.company_name}</td>
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, background: badge.bg, color: badge.color }}>
                        {t.plan.charAt(0).toUpperCase() + t.plan.slice(1)}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{formatDateKo(t.subscription_end_date)}</td>
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}><DdayBadge endDate={t.subscription_end_date} /></td>
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                      <PaymentStatusBadge status={t.subscription_status} requestedAt={t.payment_requested_at} />
                    </td>
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--text-primary)' }}>
                      ₩{(PLAN_PRICE[t.plan] || 0).toLocaleString()}
                    </td>
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                      <button
                        onClick={() => setConfirmPayModal(t)}
                        style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: '7px', padding: '6px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        입금 확인
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {confirmPayModal && (
        <ConfirmPaymentModal
          tenant={confirmPayModal}
          onClose={() => setConfirmPayModal(null)}
          onSuccess={msg => { onShowToast(msg, 'success'); loadData(); setConfirmPayModal(null) }}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════
// 탭: 결제 설정
// ════════════════════════════════════════════════════════
function PaymentSettingsTab({ onShowToast }: { onShowToast: (msg: string, type: 'success' | 'error') => void }) {
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountHolder, setAccountHolder] = useState('')
  const [paymentGuide, setPaymentGuide] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    superApi.getPaymentSettings()
      .then(res => {
        const d = res.data || {}
        setBankName(d.bank_name || '')
        setAccountNumber(d.account_number || '')
        setAccountHolder(d.account_holder || '')
        setPaymentGuide(d.payment_guide || '')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    if (!bankName.trim() || !accountNumber.trim() || !accountHolder.trim()) {
      onShowToast('은행명, 계좌번호, 예금주는 필수입니다.', 'error'); return
    }
    setSaving(true)
    try {
      await superApi.updatePaymentSettings({ bank_name: bankName.trim(), account_number: accountNumber.trim(), account_holder: accountHolder.trim(), payment_guide: paymentGuide.trim() })
      onShowToast('저장되었습니다.', 'success')
    } catch (e: any) {
      onShowToast(e.message || '저장 실패', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: '560px' }}>
      <div style={S.card}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '20px', marginTop: 0 }}>
          💳 입금 계좌 설정
        </h2>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {[1,2,3,4].map(i => <div key={i} style={{ height: '44px', borderRadius: '8px', background: 'var(--border)', animation: 'shimmer 1.4s infinite' }} />)}
          </div>
        ) : (
          <>
            <Field label="은행명" required>
              <input
                type="text"
                value={bankName}
                onChange={e => setBankName(e.target.value)}
                placeholder="예: 국민은행"
                style={S.input}
              />
            </Field>
            <Field label="계좌번호" required>
              <input
                type="text"
                value={accountNumber}
                onChange={e => setAccountNumber(e.target.value)}
                placeholder="예: 123-456-789012"
                style={S.input}
              />
            </Field>
            <Field label="예금주" required>
              <input
                type="text"
                value={accountHolder}
                onChange={e => setAccountHolder(e.target.value)}
                placeholder="예: 홍길동"
                style={S.input}
              />
            </Field>
            <Field label="입금 안내 메시지">
              <textarea
                value={paymentGuide}
                onChange={e => setPaymentGuide(e.target.value)}
                placeholder="입금 후 입금했어요 버튼을 눌러주세요. 확인 후 1시간 이내 처리됩니다."
                rows={4}
                style={{ ...S.textarea }}
              />
            </Field>

            {/* 미리보기 */}
            {(bankName || accountNumber) && (
              <div style={{ padding: '14px 16px', background: 'rgba(79,70,229,0.05)', border: '1px solid rgba(79,70,229,0.2)', borderRadius: '10px', marginBottom: '16px' }}>
                <p style={{ fontSize: '12px', fontWeight: 700, color: '#4F46E5', margin: '0 0 8px' }}>📋 미리보기</p>
                <p style={{ fontSize: '13px', color: 'var(--text-primary)', margin: '0 0 4px' }}>
                  <strong>{bankName}</strong> {accountNumber} ({accountHolder})
                </p>
                {paymentGuide && <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>{paymentGuide}</p>}
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              style={{ ...S.btnPrimary, width: '100%', opacity: saving ? 0.8 : 1 }}
            >
              {saving ? <><Spinner /> 저장 중...</> : '저장하기'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function PlansTab({ onShowToast }: { onShowToast: (msg: string, type: 'success' | 'error') => void }) {
  const [plans, setPlans] = useState<PlanData[]>([])
  const [loading, setLoading] = useState(true)
  const [editPlan, setEditPlan] = useState<PlanData | null>(null)

  const loadPlans = useCallback(async () => {
    setLoading(true)
    try {
      const res = await superApi.getPlans()
      setPlans(res.data || [])
    } catch (e: any) {
      onShowToast(e.message || '플랜 로드 실패', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadPlans() }, [])

  function formatLimit(n: number) { return n === -1 ? '무제한' : n.toLocaleString() }

  const PLAN_INFO: Record<string, { icon: string; color: string; bg: string; desc: string }> = {
    basic:  { icon: '📦', color: '#374151', bg: 'rgba(107,114,128,0.06)', desc: 'FAQ 기반 기본 응답' },
    pro:    { icon: '🚀', color: '#1D4ED8', bg: 'rgba(59,130,246,0.06)',  desc: '주문조회 연동 포함' },
    master: { icon: '⭐', color: '#B45309', bg: 'rgba(245,158,11,0.06)',  desc: '모든 기능 무제한' },
  }

  if (loading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ ...S.card, height: '200px', animation: 'shimmer 1.4s infinite' }} />
        ))}
      </div>
    )
  }

  return (
    <div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '16px',
      }}>
        {plans.map(plan => {
          const info = PLAN_INFO[plan.plan_name] || PLAN_INFO.basic
          return (
            <div key={plan.id} style={{
              ...S.card,
              background: info.bg,
              border: `1px solid var(--border)`,
              position: 'relative',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div>
                  <span style={{ fontSize: '22px', marginRight: '8px' }}>{info.icon}</span>
                  <span style={{ fontSize: '18px', fontWeight: 800, color: info.color }}>
                    {plan.plan_name.toUpperCase()}
                  </span>
                </div>
                <button
                  onClick={() => setEditPlan(plan)}
                  style={{
                    background: 'var(--primary)', color: '#fff', border: 'none',
                    borderRadius: '7px', padding: '5px 12px', fontSize: '12px',
                    fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  수정
                </button>
              </div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>
                ₩{plan.price.toLocaleString()}
                <span style={{ fontSize: '14px', fontWeight: 400, color: 'var(--text-secondary)' }}>/월</span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 14px' }}>{info.desc}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {[
                  { label: 'FAQ 한도', value: formatLimit(plan.faq_limit) },
                  { label: '월 답변 한도', value: formatLimit(plan.chat_limit) },
                ].map(row => (
                  <div key={row.label} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '7px 12px',
                    background: 'var(--bg-secondary)', borderRadius: '8px',
                    fontSize: '13px',
                  }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{row.label}</span>
                    <span style={{ fontWeight: 700, color: info.color }}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {editPlan && (
        <EditPlanModal
          plan={editPlan}
          onClose={() => setEditPlan(null)}
          onSuccess={msg => { onShowToast(msg); loadPlans(); setEditPlan(null) }}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════
// 탭: API 플랫폼 관리
// ════════════════════════════════════════════════════════
function PlatformsTab({ onShowToast }: { onShowToast: (msg: string, type: 'success' | 'error') => void }) {
  const [platforms, setPlatforms] = useState<PlatformApi[]>([])
  const [loading, setLoading] = useState(true)
  const [addModal, setAddModal] = useState(false)
  const [editModal, setEditModal] = useState<PlatformApi | null>(null)

  const loadPlatforms = useCallback(async () => {
    setLoading(true)
    try {
      const res = await superApi.getPlatformApis()
      setPlatforms(res.data || [])
    } catch (e: any) {
      onShowToast(e.message || '플랫폼 로드 실패', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadPlatforms() }, [])

  async function handleToggle(p: PlatformApi) {
    try {
      await superApi.updatePlatformApi(p.id, { is_active: !p.is_active })
      onShowToast(`${p.display_name}이(가) ${!p.is_active ? '활성화' : '비활성화'}되었습니다.`)
      loadPlatforms()
    } catch (e: any) {
      onShowToast(e.message || '상태 변경 실패', 'error')
    }
  }

  const AUTH_LABELS: Record<string, string> = {
    bearer: 'Bearer Token', oauth2: 'OAuth 2.0', api_key: 'API Key', basic: 'Basic Auth',
  }

  return (
    <div>
      <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            API 플랫폼 목록 (샘플)
          </h2>
          <button
            onClick={() => setAddModal(true)}
            style={{ ...S.btnPrimary, minHeight: '38px', padding: '0 14px', fontSize: '13px', gap: '5px' }}
          >
            <Plus size={14} />
            플랫폼 추가
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-primary)' }}>
                {['플랫폼명', '표시명', 'API 엔드포인트', '인증방식', '설명', '상태', '액션'].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: 'left', fontWeight: 600,
                    color: 'var(--text-secondary)', whiteSpace: 'nowrap',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{
                          height: '12px', borderRadius: '6px',
                          background: 'linear-gradient(90deg, var(--border) 25%, var(--bg-primary) 50%, var(--border) 75%)',
                          backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite',
                          width: '80px',
                        }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : platforms.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <Globe size={36} style={{ opacity: 0.3, display: 'block', margin: '0 auto 12px' }} />
                    등록된 플랫폼이 없습니다.
                  </td>
                </tr>
              ) : (
                platforms.map((p, idx) => (
                  <tr
                    key={p.id}
                    style={{
                      borderBottom: idx < platforms.length - 1 ? '1px solid var(--border)' : 'none',
                      background: idx % 2 === 0 ? 'var(--bg-secondary)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                      {p.platform_name}
                    </td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>{p.display_name}</td>
                    <td style={{ padding: '12px 16px', maxWidth: '200px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                        {p.api_endpoint || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        padding: '2px 8px', borderRadius: '12px',
                        background: 'rgba(79,70,229,0.1)', color: '#4F46E5',
                        fontSize: '11px', fontWeight: 600,
                      }}>
                        <Lock size={10} />
                        {AUTH_LABELS[p.auth_type] || p.auth_type}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', maxWidth: '160px' }}>
                      <span style={{ fontSize: '12px' }}>{p.description || '—'}</span>
                    </td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                        padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                        background: p.is_active ? 'rgba(5,150,105,0.1)' : 'rgba(107,114,128,0.1)',
                        color: p.is_active ? '#059669' : '#6B7280',
                      }}>
                        <span style={{
                          width: '6px', height: '6px', borderRadius: '50%',
                          background: p.is_active ? '#059669' : '#9CA3AF',
                        }} />
                        {p.is_active ? '활성' : '비활성'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => handleToggle(p)}
                          style={{
                            background: p.is_active ? 'rgba(107,114,128,0.1)' : 'rgba(5,150,105,0.1)',
                            color: p.is_active ? '#6B7280' : '#059669',
                            border: 'none', borderRadius: '6px',
                            padding: '5px 10px', cursor: 'pointer',
                            fontSize: '12px', fontWeight: 600, fontFamily: 'inherit',
                          }}
                        >
                          {p.is_active ? '비활성화' : '활성화'}
                        </button>
                        <button
                          onClick={() => setEditModal(p)}
                          style={{
                            background: 'rgba(79,70,229,0.1)', color: '#4F46E5',
                            border: 'none', borderRadius: '6px',
                            padding: '5px 10px', cursor: 'pointer',
                            fontSize: '12px', fontWeight: 600, fontFamily: 'inherit',
                          }}
                        >
                          수정
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {addModal && (
        <PlatformModal
          onClose={() => setAddModal(false)}
          onSuccess={msg => { onShowToast(msg); loadPlatforms(); setAddModal(false) }}
        />
      )}
      {editModal && (
        <PlatformModal
          platform={editModal}
          onClose={() => setEditModal(null)}
          onSuccess={msg => { onShowToast(msg); loadPlatforms(); setEditModal(null) }}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════
// 메인 컴포넌트
// ════════════════════════════════════════════════════════
export default function SuperDashboardPage() {
  const navigate = useNavigate()
  const { admin, logout } = useSuperAuth()

  const [activeTab, setActiveTab] = useState<'tenants' | 'unpaid' | 'plans' | 'platforms' | 'payment'>('tenants')
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loadingStats, setLoadingStats] = useState(true)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // 헤더 드롭다운
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)
  const [changePwModal, setChangePwModal] = useState(false)
  const headerMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function h(e: MouseEvent) {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setHeaderMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const loadStats = useCallback(async () => {
    setLoadingStats(true)
    try {
      const res = await superApi.getDashboard()
      setStats(res.data?.stats || res.data)
    } catch {
      // 통계 실패 무시
    } finally {
      setLoadingStats(false)
    }
  }, [])

  useEffect(() => { loadStats() }, [])

  function handleLogout() {
    logout()
    navigate('/super/login', { replace: true })
  }

  function formatRevenue(n: number) { return `₩${n.toLocaleString('ko-KR')}` }

  const TABS = [
    { key: 'tenants',   label: '고객사 관리',  icon: <Building2 size={16} /> },
    { key: 'unpaid',    label: '미납 현황',    icon: <AlertCircle size={16} /> },
    { key: 'plans',     label: '플랜 관리',    icon: <Layers size={16} /> },
    { key: 'platforms', label: 'API 플랫폼',   icon: <Globe size={16} /> },
    { key: 'payment',   label: '결제 설정',    icon: <Key size={16} /> },
  ] as const

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>

      {/* ═══════════════════════════════════════════════
          상단 헤더
      ═══════════════════════════════════════════════ */}
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
          {/* 이메일 + 드롭다운 */}
          <div ref={headerMenuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setHeaderMenuOpen(o => !o)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                background: 'none', border: '1px solid var(--border)',
                borderRadius: '8px', padding: '6px 12px',
                cursor: 'pointer', color: 'var(--text-primary)',
                fontSize: '13px', fontFamily: 'inherit',
              }}
            >
              <span>{admin?.email}</span>
              <ChevronDown size={13} />
            </button>
            {headerMenuOpen && (
              <div style={{
                position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 200,
                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                borderRadius: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
                minWidth: '160px', overflow: 'hidden',
                animation: 'fadeIn 0.15s ease-out',
              }}>
                <button
                  onClick={() => { setHeaderMenuOpen(false); setChangePwModal(true) }}
                  style={{
                    display: 'flex', width: '100%', alignItems: 'center', gap: '8px',
                    padding: '11px 16px', background: 'none', border: 'none',
                    cursor: 'pointer', color: 'var(--text-primary)',
                    fontSize: '13px', fontWeight: 600, fontFamily: 'inherit',
                    textAlign: 'left',
                    borderBottom: '1px solid var(--border)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-primary)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <Lock size={14} />
                  비밀번호 변경
                </button>
                <button
                  onClick={() => { setHeaderMenuOpen(false); handleLogout() }}
                  style={{
                    display: 'flex', width: '100%', alignItems: 'center', gap: '8px',
                    padding: '11px 16px', background: 'none', border: 'none',
                    cursor: 'pointer', color: '#EF4444',
                    fontSize: '13px', fontWeight: 600, fontFamily: 'inherit',
                    textAlign: 'left',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#FEF2F2'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <LogOut size={14} />
                  로그아웃
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 20px' }}>

        {/* ═══════════════════════════════════════════════
            통계 카드
        ═══════════════════════════════════════════════ */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '16px',
          marginBottom: '28px',
        }}>
          {loadingStats ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{
                ...S.card, height: '88px',
                background: 'linear-gradient(90deg, var(--bg-secondary) 25%, var(--border) 50%, var(--bg-secondary) 75%)',
                backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite',
              }} />
            ))
          ) : (
            <>
              <StatCard label="전체 고객사" value={stats?.total_tenants ?? 0}
                icon={<Building2 size={22} color="#4F46E5" />} color="rgba(79,70,229,0.12)" />
              <StatCard label="활성 고객사" value={stats?.active_tenants ?? 0}
                icon={<Users size={22} color="#059669" />} color="rgba(5,150,105,0.12)" />
              <StatCard label="이번달 예상 매출" value={formatRevenue(stats?.monthly_revenue ?? 0)}
                icon={<TrendingUp size={22} color="#D97706" />} color="rgba(217,119,6,0.12)" />
              <StatCard label="총 대화 수" value={(stats?.total_chats ?? 0).toLocaleString()}
                icon={<MessageSquare size={22} color="#7C3AED" />} color="rgba(124,58,237,0.12)" />
            </>
          )}
        </div>

        {/* ═══════════════════════════════════════════════
            탭 네비게이션
        ═══════════════════════════════════════════════ */}
        <div style={{
          display: 'flex', gap: '4px',
          borderBottom: '2px solid var(--border)',
          marginBottom: '20px',
        }}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '7px',
                  padding: '10px 18px',
                  background: 'none', border: 'none',
                  borderBottom: isActive ? '2px solid var(--primary)' : '2px solid transparent',
                  marginBottom: '-2px',
                  color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                  fontSize: '14px', fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all 0.15s',
                }}
              >
                {tab.icon}
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* ═══════════════════════════════════════════════
            탭 콘텐츠
        ═══════════════════════════════════════════════ */}
        {activeTab === 'tenants' && <TenantsTab onShowToast={showToast} />}
        {activeTab === 'unpaid' && <UnpaidTab onShowToast={showToast} />}
        {activeTab === 'plans' && <PlansTab onShowToast={showToast} />}
        {activeTab === 'platforms' && <PlatformsTab onShowToast={showToast} />}
        {activeTab === 'payment' && <PaymentSettingsTab onShowToast={showToast} />}
      </main>

      {/* ═══════════════════════════════════════════════
          비밀번호 변경 모달
      ═══════════════════════════════════════════════ */}
      {changePwModal && (
        <ChangePasswordModal
          onClose={() => setChangePwModal(false)}
          onLogout={handleLogout}
        />
      )}

      {/* ═══════════════════════════════════════════════
          토스트
      ═══════════════════════════════════════════════ */}
      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
