import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Bot, Code2, Check, Loader2, Copy } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { S } from '../lib/ui'

const steps = [
  { icon: BookOpen, title: 'FAQ 등록', desc: '자주 묻는 질문과 답변을 등록해 봇을 학습시킵니다.' },
  { icon: Bot, title: '봇 이름 설정', desc: '고객에게 보여질 봇의 이름과 인사말을 설정합니다.' },
  { icon: Code2, title: '설치 코드 복사', desc: '웹사이트에 설치할 코드를 복사하여 붙여넣기합니다.' },
]

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { tenant, updateTenant } = useAuth()
  const [step, setStep] = useState(0)
  const [botName, setBotName] = useState(tenant?.bot_name || 'AI상담봇')
  const [greeting, setGreeting] = useState(tenant?.greeting_message || '안녕하세요! 무엇을 도와드릴까요? 😊')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  const tenantId = tenant?.id || 'YOUR_TENANT_ID'
  const installCode = `<script src="https://your-domain.pages.dev/widget.js" data-tenant="${tenantId}" defer></script>`

  const handleNext = async () => {
    if (step === 1) {
      // 봇 설정 저장
      setSaving(true)
      try {
        await api.updateTenant({ bot_name: botName, greeting_message: greeting })
        updateTenant({ bot_name: botName, greeting_message: greeting })
      } catch {}
      setSaving(false)
    }
    if (step < steps.length - 1) {
      setStep(s => s + 1)
    } else {
      // 온보딩 완료
      localStorage.setItem(`onboarded_${tenant?.id}`, '1')
      navigate('/admin/dashboard')
    }
  }

  const copyCode = () => {
    navigator.clipboard.writeText(installCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '580px' }}>
        {/* Progress */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0', marginBottom: '24px' }}>
            {steps.map((s, i) => (
              <React.Fragment key={i}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: i < step ? '#059669' : i === step ? 'var(--primary)' : 'var(--border)',
                    color: '#fff', fontSize: '14px', fontWeight: 700, transition: 'all 0.3s',
                  }}>
                    {i < step ? <Check size={18}/> : i + 1}
                  </div>
                  <span style={{ fontSize: '11px', color: i === step ? 'var(--primary)' : 'var(--text-secondary)', fontWeight: i === step ? 600 : 400, whiteSpace: 'nowrap' }}>{s.title}</span>
                </div>
                {i < steps.length - 1 && (
                  <div style={{ width: '80px', height: '2px', background: i < step ? '#059669' : 'var(--border)', margin: '0 4px', marginBottom: '24px', transition: 'background 0.3s' }}/>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Card */}
        <div style={{ ...S.card, boxShadow: '0 8px 32px rgba(0,0,0,0.1)', padding: '40px' }}>
          {/* Step 0 - FAQ */}
          {step === 0 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ display: 'inline-flex', width: '72px', height: '72px', borderRadius: '20px', background: 'rgba(79,70,229,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
                <BookOpen size={36} color="var(--primary)"/>
              </div>
              <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>FAQ를 등록해보세요</h2>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '28px', lineHeight: 1.7 }}>
                자주 묻는 질문과 답변을 등록하면 AI가 학습하여<br/>고객 질문에 자동으로 답변합니다.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'left', background: 'var(--bg-primary)', borderRadius: '12px', padding: '16px', marginBottom: '24px' }}>
                {['배송은 얼마나 걸리나요?', '교환/반품은 어떻게 하나요?', '결제 방법을 알려주세요.'].map(q => (
                  <div key={q} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Check size={16} color="#059669"/>
                    <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{q}</span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>지금 바로 등록하거나 대시보드에서 나중에 등록할 수 있습니다.</p>
            </div>
          )}

          {/* Step 1 - Bot Settings */}
          {step === 1 && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                <div style={{ display: 'inline-flex', width: '72px', height: '72px', borderRadius: '20px', background: 'rgba(79,70,229,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <Bot size={36} color="var(--primary)"/>
                </div>
                <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>봇 이름을 설정하세요</h2>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>고객에게 보여질 봇의 이름과 인사말입니다.</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={S.label}>봇 이름</label>
                  <input value={botName} onChange={e => setBotName(e.target.value)} style={S.input} placeholder="예: AI 고객센터, 쇼핑봇"/>
                </div>
                <div>
                  <label style={S.label}>인사말</label>
                  <textarea value={greeting} onChange={e => setGreeting(e.target.value)}
                    style={{ ...S.textarea, height: '80px' }} placeholder="고객에게 보여질 인사말을 입력하세요."/>
                </div>
                {/* Preview */}
                <div style={{ background: 'var(--bg-primary)', borderRadius: '12px', padding: '16px' }}>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '10px', fontWeight: 600 }}>미리보기</p>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Bot size={18} color="#fff"/>
                    </div>
                    <div>
                      <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>{botName || 'AI상담봇'}</p>
                      <div style={{ background: 'var(--bg-secondary)', borderRadius: '0 12px 12px 12px', padding: '10px 14px', fontSize: '13px', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                        {greeting || '안녕하세요! 무엇을 도와드릴까요? 😊'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2 - Install Code */}
          {step === 2 && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                <div style={{ display: 'inline-flex', width: '72px', height: '72px', borderRadius: '20px', background: 'rgba(79,70,229,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <Code2 size={36} color="var(--primary)"/>
                </div>
                <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>설치 코드를 복사하세요</h2>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>아래 코드를 웹사이트 {'<body>'} 태그 안에 붙여넣으세요.</p>
              </div>
              <div style={{ position: 'relative', background: '#1E1E2E', borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
                <pre style={{ fontSize: '12px', color: '#CDD6F4', overflowX: 'auto', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{installCode}</pre>
                <button onClick={copyCode} style={{
                  position: 'absolute', top: '12px', right: '12px',
                  background: copied ? '#059669' : 'rgba(255,255,255,0.1)', border: 'none',
                  borderRadius: '6px', padding: '6px 12px', color: '#fff', fontSize: '12px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'inherit',
                }}>
                  {copied ? <><Check size={12}/>복사됨!</> : <><Copy size={12}/>복사</>}
                </button>
              </div>
              <div style={{ background: 'rgba(16,185,129,0.1)', borderRadius: '10px', padding: '14px 16px', border: '1px solid rgba(16,185,129,0.3)' }}>
                <p style={{ fontSize: '13px', color: '#059669', fontWeight: 600, marginBottom: '4px' }}>🎉 설정 완료!</p>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>이제 대시보드에서 대화를 모니터링하고 FAQ를 관리할 수 있습니다.</p>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '32px' }}>
            {step === 0 && (
              <button onClick={() => { localStorage.setItem(`onboarded_${tenant?.id}`, '1'); navigate('/admin/faq') }}
                style={{ ...S.btnSecondary, flex: 1 }}>FAQ 지금 등록하기</button>
            )}
            <button onClick={handleNext} disabled={saving}
              style={{ ...S.btnPrimary, flex: step === 0 ? 1 : 'none', minWidth: step > 0 ? '100%' : 'auto', opacity: saving ? 0.7 : 1 }}>
              {saving ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }}/>저장 중...</> : step === steps.length - 1 ? '대시보드로 이동 →' : '다음 단계 →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
