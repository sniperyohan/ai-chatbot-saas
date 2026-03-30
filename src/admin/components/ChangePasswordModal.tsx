import React, { useState } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import Modal from './Modal'
import { api } from '../lib/api'
import { S } from '../lib/ui'

const checks = [
  { label: '8자 이상', test: (p: string) => p.length >= 8 },
  { label: '대문자 포함', test: (p: string) => /[A-Z]/.test(p) },
  { label: '소문자 포함', test: (p: string) => /[a-z]/.test(p) },
  { label: '숫자 포함', test: (p: string) => /[0-9]/.test(p) },
  { label: '특수문자 포함', test: (p: string) => /[!@#$%^&*(),.?":{}|<>]/.test(p) },
]

export default function ChangePasswordModal({ open, onClose, toast }: { open: boolean; onClose: () => void; toast: any }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showC, setShowC] = useState(false)
  const [showN, setShowN] = useState(false)
  const [loading, setLoading] = useState(false)

  const validations = checks.map(c => ({ ...c, pass: c.test(next) }))
  const allPass = validations.every(v => v.pass) && next === confirm && next !== current

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!allPass) return
    setLoading(true)
    try {
      await api.changePassword(current, next)
      toast.success('비밀번호가 변경되었습니다.')
      setCurrent(''); setNext(''); setConfirm('')
      onClose()
    } catch (err: any) {
      toast.error(err.message || '변경 실패')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="🔑 비밀번호 변경" size="sm">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Current */}
        <div>
          <label style={S.label}>현재 비밀번호</label>
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
          {/* Validations */}
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
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
            style={{ ...S.input, borderColor: confirm && confirm !== next ? '#EF4444' : 'var(--border)' }} placeholder="새 비밀번호 재입력"/>
          {confirm && confirm !== next && <p style={{ fontSize: '12px', color: '#EF4444', marginTop: '4px' }}>비밀번호가 일치하지 않습니다.</p>}
        </div>

        <button type="submit" disabled={loading || !allPass} style={{ ...S.btnPrimary, width: '100%', opacity: loading || !allPass ? 0.5 : 1, cursor: loading || !allPass ? 'not-allowed' : 'pointer' }}>
          {loading ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }}/> 변경 중...</> : '비밀번호 변경'}
        </button>
      </form>
    </Modal>
  )
}
