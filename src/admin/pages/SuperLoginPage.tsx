import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { superApi } from '../lib/superApi'
import { useSuperAuth } from '../context/SuperAuthContext'
import { S } from '../lib/ui'

export default function SuperLoginPage() {
  const navigate = useNavigate()
  const { login } = useSuperAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password.trim()) {
      setError('이메일과 비밀번호를 입력하세요.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await superApi.login(email.trim(), password)
      // 백엔드 응답: { success: true, data: { token, admin: { id, email } } }
      const token = res.data?.token || res.token
      const adminInfo = res.data?.admin || res.admin
      if (!token || !adminInfo) throw new Error('로그인 응답이 올바르지 않습니다.')
      login(token, adminInfo)
      navigate('/super/dashboard', { replace: true })
    } catch (err: any) {
      setError(err.message || '로그인에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-primary)',
      padding: '24px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '36px 32px',
        boxShadow: 'var(--shadow-lg)',
      }}>
        {/* 로고 영역 */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '64px',
            height: '64px',
            background: 'rgba(79,70,229,0.12)',
            borderRadius: '16px',
            marginBottom: '16px',
          }}>
            <ShieldCheck size={32} color="#4F46E5" />
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            슈퍼관리자
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '6px' }}>
            AI 상담봇 SaaS 관리 콘솔
          </p>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div style={{
            padding: '12px 16px',
            borderRadius: '8px',
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            color: '#991B1B',
            fontSize: '13px',
            marginBottom: '20px',
          }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* 이메일 */}
          <div>
            <label style={S.label}>이메일</label>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError('') }}
              placeholder="super@admin.com"
              disabled={loading}
              autoFocus
              style={S.input}
            />
          </div>

          {/* 비밀번호 */}
          <div>
            <label style={S.label}>비밀번호</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                placeholder="비밀번호 입력"
                disabled={loading}
                style={{ ...S.input, paddingRight: '44px' }}
              />
              <button
                type="button"
                onClick={() => setShowPw(p => !p)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px',
                }}
              >
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* 로그인 버튼 */}
          <button
            type="submit"
            disabled={loading}
            style={{
              ...S.btnPrimary,
              width: '100%',
              opacity: loading ? 0.8 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: '4px',
            }}
          >
            {loading ? (
              <>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                로그인 중...
              </>
            ) : '로그인'}
          </button>
        </form>

        {/* 하단 안내 */}
        <p style={{
          textAlign: 'center',
          fontSize: '12px',
          color: 'var(--text-secondary)',
          marginTop: '24px',
        }}>
          슈퍼관리자 전용 페이지입니다
        </p>
      </div>
    </div>
  )
}
