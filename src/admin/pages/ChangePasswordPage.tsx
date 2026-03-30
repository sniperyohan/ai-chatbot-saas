import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, CheckCircle, Loader2, Lock } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { S } from '../lib/ui'

const checks = [
  { label: '8자 이상', test: (p: string) => p.length >= 8 },
  { label: '대문자 포함', test: (p: string) => /[A-Z]/.test(p) },
  { label: '소문자 포함', test: (p: string) => /[a-z]/.test(p) },
  { label: '숫자 포함', test: (p: string) => /[0-9]/.test(p) },
  { label: '특수문자 포함', test: (p: string) => /[!@#$%^&*(),.?":{}|<>]/.test(p) },
]

export default function ChangePasswordPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { tenant, logout } = useAuth()
  const isFirst = (location.state as any)?.first || false

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showC, setShowC] = useState(false)
  const [showN, setShowN] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const validations = checks.map(c => ({ ...c, pass: c.test(next) }))
  const allPass = validations.every(v => v.pass) && next === confirm

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!allPass) return
    setLoading(true); setError('')
    try {
      await api.changePassword(current, next)
      // 성공 후 자동 로그아웃
      setTimeout(() => { logout(); navigate('/admin/login') }, 1500)
      setError('✅ 비밀번호가 변경되었습니다. 다시 로그인해주세요.')
    } catch (err: any) {
      setError(err.message || '변경 실패')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ width: '100%', maxWidth: '460px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '20px', background: 'var(--primary)', marginBottom: '16px', boxShadow: '0 8px 24px rgba(79,70,229,0.3)' }}>
            <Lock size={28} color="#fff"/>
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
            {isFirst ? '임시 비밀번호 변경' : '비밀번호 변경'}
          </h1>
          {isFirst && <p style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '8px 16px', background: 'rgba(245,158,11,0.1)', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.3)' }}>
            ⚠️ 보안을 위해 임시 비밀번호를 변경해주세요.
          </p>}
        </div>

        <div style={{ ...S.card, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '32px' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <label style={S.label}>현재 비밀번호 {isFirst && <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>(임시 비밀번호)</span>}</label>
              <div style={{ position: 'relative' }}>
                <input type={showC ? 'text' : 'password'} value={current} onChange={e => setCurrent(e.target.value)}
                  style={{ ...S.input, paddingRight: '48px' }} placeholder="현재 비밀번호 입력"/>
                <button type="button" onClick={() => setShowC(!showC)}
                  style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>
                  {showC ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </div>

            <div>
              <label style={S.label}>새 비밀번호</label>
              <div style={{ position: 'relative' }}>
                <input type={showN ? 'text' : 'password'} value={next} onChange={e => setNext(e.target.value)}
                  style={{ ...S.input, paddingRight: '48px' }} placeholder="새 비밀번호 입력"/>
                <button type="button" onClick={() => setShowN(!showN)}
                  style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>
                  {showN ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
              {/* 실시간 유효성 검사 */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                {validations.map(v => (
                  <span key={v.label} style={{
                    fontSize: '11px', padding: '3px 10px', borderRadius: '9999px',
                    background: v.pass ? 'rgba(16,185,129,0.12)' : 'var(--bg-primary)',
                    color: v.pass ? '#059669' : 'var(--text-secondary)',
                    border: `1px solid ${v.pass ? '#6EE7B7' : 'var(--border)'}`,
                    fontWeight: 500, transition: 'all 0.15s',
                  }}>
                    {v.pass ? '✓' : '○'} {v.label}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label style={S.label}>새 비밀번호 확인</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                style={{ ...S.input, borderColor: confirm && confirm !== next ? '#EF4444' : 'var(--border)' }}
                placeholder="새 비밀번호 재입력"/>
              {confirm && next && confirm !== next && <p style={{ fontSize: '12px', color: '#EF4444', marginTop: '4px' }}>비밀번호가 일치하지 않습니다.</p>}
              {confirm && next && confirm === next && <p style={{ fontSize: '12px', color: '#059669', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle size={12}/>비밀번호가 일치합니다.</p>}
            </div>

            {error && (
              <div style={{ padding: '12px 16px', borderRadius: '8px', background: error.startsWith('✅') ? '#ECFDF5' : '#FEF2F2', border: `1px solid ${error.startsWith('✅') ? '#6EE7B7' : '#FECACA'}`, color: error.startsWith('✅') ? '#065F46' : '#991B1B', fontSize: '13px' }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading || !allPass}
              style={{ ...S.btnPrimary, width: '100%', opacity: loading || !allPass ? 0.5 : 1, cursor: loading || !allPass ? 'not-allowed' : 'pointer' }}>
              {loading ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }}/>변경 중...</> : '비밀번호 변경'}
            </button>

            {!isFirst && (
              <button type="button" onClick={() => navigate(-1)} style={{ ...S.btnSecondary, width: '100%' }}>
                취소
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
