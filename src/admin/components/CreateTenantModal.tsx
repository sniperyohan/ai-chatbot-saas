import React, { useState, useEffect } from 'react'
import { Loader2, CheckCircle, Copy, Check, X } from 'lucide-react'
import { superApi } from '../lib/superApi'
import { S } from '../lib/ui'

// ─── 타입 ─────────────────────────────────────────
type Phase = 'input' | 'success'

interface FormState {
  company_name: string
  email: string
  plan: 'basic' | 'pro' | 'master'
}

interface SuccessState {
  company_name: string
  email: string
  plan: string
  tempPassword: string
  emailSent: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void  // 생성 성공 후 목록 새로고침
}

// ─── 초기값 상수 (절대 바뀌지 않음) ────────────────
const INIT_FORM: FormState = { company_name: '', email: '', plan: 'basic' }

const PLAN_LABELS: Record<string, string> = {
  basic: 'Basic (₩99,000/월 · FAQ 50개 · 1,000건)',
  pro:   'Pro (₩199,000/월 · FAQ 200개 · 5,000건)',
  master: 'Master (₩399,000/월 · 무제한)',
}

// ─── 컴포넌트 ────────────────────────────────────
export default function CreateTenantModal({ open, onClose, onCreated }: Props) {
  // ① phase는 반드시 'input'으로 시작
  const [phase, setPhase] = useState<Phase>('input')
  const [form, setForm] = useState<FormState>(INIT_FORM)
  const [errors, setErrors] = useState<Partial<FormState>>({})
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState('')
  const [success, setSuccess] = useState<SuccessState | null>(null)
  const [copied, setCopied] = useState(false)

  // ② 모달이 열릴 때마다 모든 상태를 초기화
  useEffect(() => {
    if (open) {
      setPhase('input')       // ← 반드시 'input'
      setForm(INIT_FORM)
      setErrors({})
      setLoading(false)
      setApiError('')
      setSuccess(null)
      setCopied(false)
    }
  }, [open])

  if (!open) return null

  // ─── 유효성 검사 ──────────────────────────────
  function validate(): boolean {
    const errs: Partial<FormState> = {}
    if (!form.company_name.trim() || form.company_name.trim().length < 2) {
      errs.company_name = '회사명은 2자 이상 입력하세요.'
    }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!form.email.trim() || !emailRe.test(form.email.trim())) {
      errs.email = '올바른 이메일 형식을 입력하세요.'
    }
    if (!form.plan) {
      errs.plan = '플랜을 선택하세요.'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  // ─── 생성하기 클릭 ────────────────────────────
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)
    setApiError('')

    try {
      const res = await superApi.createTenant({
        company_name: form.company_name.trim(),
        email: form.email.trim().toLowerCase(),
        plan: form.plan,
      })

      // ③ API 성공 후에만 success 상태로 전환
      setSuccess({
        company_name: res.data?.tenant?.company_name || form.company_name,
        email: res.data?.tenant?.email || form.email,
        plan: res.data?.tenant?.plan || form.plan,
        tempPassword: res.data?.temp_password || res.tempPassword || '(이메일로 발송됨)',
        emailSent: res.data?.email_sent ?? true,
      })
      setPhase('success')   // ← API 성공 이후에만 전환

    } catch (err: any) {
      setApiError(err.message || '고객사 생성에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  // ─── 확인 버튼 (성공 화면) ─────────────────────
  function handleConfirm() {
    onCreated()   // 목록 새로고침
    onClose()
  }

  // ─── 임시 비밀번호 복사 ───────────────────────
  function copyPassword() {
    if (!success?.tempPassword) return
    navigator.clipboard.writeText(success.tempPassword)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ─── 닫기 (입력 중) ──────────────────────────
  function handleClose() {
    if (phase === 'input') {
      onClose()
    } else {
      handleConfirm()
    }
  }

  // ══════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) handleClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px', backgroundColor: 'rgba(0,0,0,0.5)',
      }}
    >
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        width: '100%', maxWidth: '480px',
        maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        animation: 'fadeIn 0.2s ease-out',
        overflow: 'hidden',
      }}>
        {/* ── 헤더 ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--border)',
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            {phase === 'input' ? '고객사 생성' : '✅ 고객사 생성 완료'}
          </h3>
          <button
            onClick={handleClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '6px', display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* ── 바디 ── */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>

          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              1단계: 입력 폼
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {phase === 'input' && (
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

              {/* 회사명 */}
              <div>
                <label style={S.label}>
                  회사명 <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={form.company_name}
                  onChange={e => {
                    setForm(p => ({ ...p, company_name: e.target.value }))
                    if (errors.company_name) setErrors(p => ({ ...p, company_name: undefined }))
                  }}
                  style={{
                    ...S.input,
                    borderColor: errors.company_name ? '#EF4444' : 'var(--border)',
                  }}
                  placeholder="예: 홍길동 쇼핑몰"
                  disabled={loading}
                  autoFocus
                />
                {errors.company_name && (
                  <p style={{ fontSize: '12px', color: '#EF4444', marginTop: '4px' }}>
                    {errors.company_name}
                  </p>
                )}
              </div>

              {/* 이메일 */}
              <div>
                <label style={S.label}>
                  이메일 <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => {
                    setForm(p => ({ ...p, email: e.target.value }))
                    if (errors.email) setErrors(p => ({ ...p, email: undefined }))
                  }}
                  style={{
                    ...S.input,
                    borderColor: errors.email ? '#EF4444' : 'var(--border)',
                  }}
                  placeholder="admin@company.com"
                  disabled={loading}
                  autoComplete="off"
                />
                {errors.email && (
                  <p style={{ fontSize: '12px', color: '#EF4444', marginTop: '4px' }}>
                    {errors.email}
                  </p>
                )}
              </div>

              {/* 플랜 */}
              <div>
                <label style={S.label}>
                  플랜 <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <select
                  value={form.plan}
                  onChange={e => {
                    setForm(p => ({ ...p, plan: e.target.value as FormState['plan'] }))
                    if (errors.plan) setErrors(p => ({ ...p, plan: undefined }))
                  }}
                  style={{
                    ...S.select,
                    borderColor: errors.plan ? '#EF4444' : 'var(--border)',
                  }}
                  disabled={loading}
                >
                  <option value="basic">Basic · ₩99,000/월 · FAQ 50개 · 대화 1,000건</option>
                  <option value="pro">Pro · ₩199,000/월 · FAQ 200개 · 대화 5,000건</option>
                  <option value="master">Master · ₩399,000/월 · 전체 무제한</option>
                </select>
                {errors.plan && (
                  <p style={{ fontSize: '12px', color: '#EF4444', marginTop: '4px' }}>
                    {errors.plan}
                  </p>
                )}
                {/* 플랜 안내 뱃지 */}
                <div style={{ marginTop: '8px', padding: '10px 14px', borderRadius: '8px', background: 'var(--bg-primary)', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {form.plan === 'basic' && '📦 기본 플랜 — FAQ 최대 50개, 월 1,000건 대화'}
                  {form.plan === 'pro'   && '🚀 프로 플랜 — FAQ 최대 200개, 월 5,000건 대화 + 주문조회 연동'}
                  {form.plan === 'master' && '⭐ 마스터 플랜 — FAQ·대화 무제한, 전체 기능 사용 가능'}
                </div>
              </div>

              {/* API 에러 */}
              {apiError && (
                <div style={{
                  padding: '12px 16px', borderRadius: '8px',
                  background: '#FEF2F2', border: '1px solid #FECACA',
                  color: '#991B1B', fontSize: '13px',
                }}>
                  ⚠️ {apiError}
                </div>
              )}

              {/* 버튼 */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  style={{ ...S.btnSecondary, flex: 1, opacity: loading ? 0.5 : 1 }}
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{ ...S.btnPrimary, flex: 2, opacity: loading ? 0.8 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
                >
                  {loading
                    ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> 생성 중...</>
                    : '생성하기'
                  }
                </button>
              </div>
            </form>
          )}

          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              3단계: 성공 화면 (API 성공 후에만)
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {phase === 'success' && success && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* 성공 아이콘 */}
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: '64px', height: '64px', borderRadius: '50%',
                  background: 'rgba(16,185,129,0.12)', marginBottom: '14px',
                }}>
                  <CheckCircle size={36} color="#059669" />
                </div>
                <h4 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>
                  고객사가 생성되었습니다
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {success.company_name} 계정이 성공적으로 생성되었습니다.
                </p>
              </div>

              {/* 생성 정보 */}
              <div style={{
                background: 'var(--bg-primary)', borderRadius: '10px', padding: '16px',
                display: 'flex', flexDirection: 'column', gap: '10px',
              }}>
                {[
                  { label: '회사명', value: success.company_name },
                  { label: '이메일', value: success.email },
                  { label: '플랜', value: success.plan.charAt(0).toUpperCase() + success.plan.slice(1) },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', gap: '12px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)', minWidth: '60px', fontWeight: 600 }}>{label}</span>
                    <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{value}</span>
                  </div>
                ))}
              </div>

              {/* 임시 비밀번호 박스 */}
              <div style={{
                borderRadius: '10px', overflow: 'hidden',
                border: '1px solid rgba(245,158,11,0.4)',
              }}>
                <div style={{
                  padding: '10px 16px', background: 'rgba(245,158,11,0.1)',
                  fontSize: '12px', fontWeight: 700, color: '#B45309',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}>
                  🔑 임시 비밀번호
                </div>
                <div style={{
                  padding: '14px 16px',
                  background: 'var(--bg-secondary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
                }}>
                  <code style={{
                    fontSize: '18px', fontWeight: 700, letterSpacing: '2px',
                    color: 'var(--text-primary)', fontFamily: 'monospace',
                    userSelect: 'all',
                  }}>
                    {success.tempPassword}
                  </code>
                  <button
                    onClick={copyPassword}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '7px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600,
                      border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      background: copied ? '#059669' : 'var(--primary)',
                      color: '#fff', transition: 'background 0.2s', whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    {copied ? <><Check size={13} />복사됨!</> : <><Copy size={13} />복사</>}
                  </button>
                </div>
              </div>

              {/* 이메일 발송 안내 */}
              <div style={{
                padding: '12px 16px', borderRadius: '8px',
                background: success.emailSent ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)',
                border: `1px solid ${success.emailSent ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
                fontSize: '13px',
                color: success.emailSent ? '#065F46' : '#B45309',
              }}>
                {success.emailSent
                  ? '📧 임시 비밀번호가 이메일로 발송되었습니다. 고객사에 전달해 주세요.'
                  : '⚠️ 이메일 발송에 실패했습니다. 위 임시 비밀번호를 직접 전달해 주세요.'
                }
              </div>

              {/* 확인 버튼 */}
              <button
                onClick={handleConfirm}
                style={{ ...S.btnPrimary, width: '100%' }}
              >
                확인
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
