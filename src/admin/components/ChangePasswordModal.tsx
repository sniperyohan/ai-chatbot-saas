import React, { useState } from 'react'
import { Eye, EyeOff, Loader2, Check } from 'lucide-react'
import Modal from './Modal'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { S } from '../lib/ui'

const checks = [
  { label: '8자 이상', test: (p: string) => p.length >= 8 },
  { label: '대문자 포함', test: (p: string) => /[A-Z]/.test(p) },
  { label: '소문자 포함', test: (p: string) => /[a-z]/.test(p) },
  { label: '숫자 포함', test: (p: string) => /[0-9]/.test(p) },
  { label: '특수문자 포함', test: (p: string) => /[!@#$%^&*(),.?":{}|<>]/.test(p) },
]

interface Props {
  open: boolean
  onClose: () => void
  toast: any
  // 강제 변경 모드 (임시 비밀번호)
  forceChange?: boolean
}

export default function ChangePasswordModal({ open, onClose, toast, forceChange = false }: Props) {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showC, setShowC] = useState(false)
  const [showN, setShowN] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const validations = checks.map(c => ({ ...c, pass: c.test(next) }))
  const allPass = validations.every(v => v.pass) && next === confirm && next !== current && current.length > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!allPass) return
    setLoading(true)
    try {
      await api.changePassword(current, next)
      setSuccess(true)
      toast.success('비밀번호가 변경되었습니다. 다시 로그인해 주세요.')
      // 3초 후 로그아웃 + 로그인 페이지 이동
      setTimeout(() => {
        logout()
        navigate('/admin/login')
      }, 2000)
    } catch (err: any) {
      toast.error(err.message || '변경 실패')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (forceChange) return // 강제 변경 모드에서는 닫기 불가
    setCurrent(''); setNext(''); setConfirm('')
    setSuccess(false)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={forceChange ? '🔑 임시 비밀번호 변경 (필수)' : '🔑 비밀번호 변경'}
      size="sm"
      hideClose={forceChange}
    >
      {success ? (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(5,150,105,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Check size={28} color="#059669"/>
          </div>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>비밀번호 변경 완료!</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>곧 로그인 페이지로 이동합니다...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {forceChange && (
            <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', fontSize: '13px', color: '#92400E', lineHeight: 1.6 }}>
              ⚠️ 임시 비밀번호로 로그인하셨습니다. 보안을 위해 비밀번호를 변경해 주세요.
            </div>
          )}

          {/* Current */}
          <div>
            <label style={S.label}>현재 비밀번호 {forceChange && <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>(임시: Test1234!)</span>}</label>
            <div style={{ position: 'relative' }}>
              <input type={showC ? 'text' : 'password'} value={current} onChange={e => setCurrent(e.target.value)}
                style={{ ...S.input, paddingRight: '44px' }} placeholder="현재 비밀번호"/>
              <button type="button" onClick={() => setShowC(!showC)}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '6px', display: 'flex', alignItems: 'center' }}>
                {showC ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>
          </div>

          {/* New */}
          <div>
            <label style={S.label}>새 비밀번호</label>
            <div style={{ position: 'relative' }}>
              <input type={showN ? 'text' : 'password'} value={next} onChange={e => setNext(e.target.value)}
                style={{ ...S.input, paddingRight: '44px' }} placeholder="새 비밀번호"/>
              <button type="button" onClick={() => setShowN(!showN)}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '6px', display: 'flex', alignItems: 'center' }}>
                {showN ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>
            {/* 실시간 유효성 */}
            {next && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                {validations.map(v => (
                  <span key={v.label} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '9999px', background: v.pass ? 'rgba(16,185,129,0.15)' : 'var(--bg-primary)', color: v.pass ? '#059669' : 'var(--text-secondary)', border: `1px solid ${v.pass ? '#6EE7B7' : 'var(--border)'}`, fontWeight: 500 }}>
                    {v.pass ? '✓' : '○'} {v.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Confirm */}
          <div>
            <label style={S.label}>새 비밀번호 확인</label>
            <div style={{ position: 'relative' }}>
              <input type={showConfirm ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)}
                style={{ ...S.input, paddingRight: '44px', borderColor: confirm && confirm !== next ? '#EF4444' : 'var(--border)' }}
                placeholder="새 비밀번호 재입력"/>
              <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '6px', display: 'flex', alignItems: 'center' }}>
                {showConfirm ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>
            {confirm && confirm !== next && <p style={{ fontSize: '12px', color: '#EF4444', marginTop: '4px' }}>비밀번호가 일치하지 않습니다.</p>}
            {confirm && confirm === next && next.length > 0 && <p style={{ fontSize: '12px', color: '#059669', marginTop: '4px' }}>✓ 비밀번호가 일치합니다.</p>}
          </div>

          {next && current && next === current && (
            <p style={{ fontSize: '12px', color: '#EF4444' }}>새 비밀번호는 현재 비밀번호와 달라야 합니다.</p>
          )}

          <button type="submit" disabled={loading || !allPass} style={{ ...S.btnPrimary, width: '100%', opacity: loading || !allPass ? 0.5 : 1, cursor: loading || !allPass ? 'not-allowed' : 'pointer' }}>
            {loading ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }}/> 변경 중...</> : '비밀번호 변경'}
          </button>
        </form>
      )}
    </Modal>
  )
}
