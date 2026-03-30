import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Bot, Loader2 } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { S } from '../lib/ui'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) { setError('이메일과 비밀번호를 입력하세요.'); return }
    setLoading(true); setError('')
    try {
      const res = await api.login(email, password)
      login(res.data.token, res.data.tenant)
      if (res.data.tenant.is_temp_password) {
        navigate('/admin/change-password', { state: { first: true } })
      } else {
        const onboarded = localStorage.getItem(`onboarded_${res.data.tenant.id}`)
        navigate(onboarded ? '/admin/dashboard' : '/admin/onboarding')
      }
    } catch (e: any) {
      setError(e.message || '로그인 실패')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '20px', background: 'var(--primary)', marginBottom: '16px', boxShadow: '0 8px 24px rgba(79,70,229,0.3)' }}>
            <Bot size={32} color="#fff"/>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>AI 상담봇</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>관리자 로그인</p>
        </div>

        {/* Card */}
        <div style={{ ...S.card, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '32px' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={S.label}>이메일</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                style={S.input} placeholder="admin@example.com" autoComplete="email"/>
            </div>
            <div>
              <label style={S.label}>비밀번호</label>
              <div style={{ position: 'relative' }}>
                <input type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  style={{ ...S.input, paddingRight: '48px' }} placeholder="비밀번호 입력" autoComplete="current-password"/>
                <button type="button" onClick={() => setShow(!show)}
                  style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '8px', display: 'flex', alignItems: 'center' }}>
                  {show ? <EyeOff size={18}/> : <Eye size={18}/>}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ padding: '12px 16px', borderRadius: '8px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', fontSize: '13px' }}>
                {error.includes('잠겼습니다') || error.includes('잠금') ? '⏰ 5분 후 다시 시도해주세요.' : error}
              </div>
            )}

            <button type="submit" disabled={loading}
              style={{ ...S.btnPrimary, width: '100%', marginTop: '4px', opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }}/>로그인 중...</> : '로그인'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
