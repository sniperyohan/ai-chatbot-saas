import React, { useState, useEffect } from 'react'
import { Bot, Palette, Globe, Loader2, Save, MessageCircle } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../hooks/useToast'
import ToastContainer from '../components/Toast'
import { S } from '../lib/ui'

const COLORS = ['#4F46E5','#10B981','#EF4444','#F59E0B','#8B5CF6','#06B6D4','#EC4899','#14B8A6','#F97316','#6366F1']
const LANGUAGES = [
  { v: 'ko', l: '한국어' },
  { v: 'en', l: 'English' },
  { v: 'ja', l: '日本語' },
]

export default function SettingsPage() {
  const { tenant, updateTenant } = useAuth()
  const toast = useToast()

  const [botName, setBotName] = useState(tenant?.bot_name || 'AI상담봇')
  const [greeting, setGreeting] = useState(tenant?.greeting_message || '안녕하세요! 무엇을 도와드릴까요? 😊')
  const [color, setColor] = useState(tenant?.widget_color || '#4F46E5')
  const [customColor, setCustomColor] = useState(tenant?.widget_color || '#4F46E5')
  const [langs, setLangs] = useState<string[]>(['ko'])
  const [saving, setSaving] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatHistory, setChatHistory] = useState<{role:'user'|'bot'; text:string}[]>([
    { role: 'bot', text: greeting }
  ])

  useEffect(() => {
    api.getTenant().then(res => {
      const d = res.data
      if (d) {
        setBotName(d.bot_name || 'AI상담봇')
        setGreeting(d.greeting_message || '안녕하세요! 무엇을 도와드릴까요? 😊')
        setColor(d.widget_color || '#4F46E5')
        setCustomColor(d.widget_color || '#4F46E5')
        setLangs(d.supported_languages || ['ko'])
        setChatHistory([{ role: 'bot', text: d.greeting_message || '안녕하세요! 무엇을 도와드릴까요? 😊' }])
      }
    }).catch(() => {})
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.updateTenant({ bot_name: botName, greeting_message: greeting, widget_color: color, supported_languages: langs })
      updateTenant({ bot_name: botName, greeting_message: greeting, widget_color: color })
      toast.success('봇 설정이 저장되었습니다!')
      setChatHistory([{ role: 'bot', text: greeting }])
    } catch (e: any) {
      toast.error(e.message || '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const toggleLang = (v: string) => {
    setLangs(prev => prev.includes(v) ? prev.filter(l => l !== v) : [...prev, v])
  }

  const sendPreviewMsg = () => {
    if (!chatInput.trim()) return
    setChatHistory(prev => [
      ...prev,
      { role: 'user', text: chatInput },
      { role: 'bot', text: '이것은 미리보기입니다. 실제 봇은 AI로 응답합니다. 😊' }
    ])
    setChatInput('')
  }

  const activeColor = COLORS.includes(color) ? color : customColor

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast}/>

      <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>봇 설정</h2>

      {/* 좌우 레이아웃 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', alignItems: 'start' }}>
        {/* Left - Settings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* 봇 이름 */}
          <div style={S.card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Bot size={18} color="var(--primary)"/>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>기본 정보</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={S.label}>봇 이름</label>
                <input value={botName} onChange={e => setBotName(e.target.value)} style={S.input} placeholder="예: AI 고객센터"/>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>채팅창 상단에 표시되는 이름입니다.</p>
              </div>
              <div>
                <label style={S.label}>인사말</label>
                <textarea value={greeting} onChange={e => setGreeting(e.target.value)} style={{ ...S.textarea, height: '80px' }} placeholder="고객에게 보여질 인사말을 입력하세요."/>
              </div>
            </div>
          </div>

          {/* 위젯 색상 */}
          <div style={S.card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Palette size={18} color="var(--primary)"/>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>위젯 색상</h3>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
              {COLORS.map(c => (
                <button key={c} onClick={() => { setColor(c); setCustomColor(c) }}
                  style={{ width: '36px', height: '36px', borderRadius: '50%', background: c, border: `3px solid ${color === c ? '#fff' : 'transparent'}`, outline: color === c ? `2px solid ${c}` : 'none', cursor: 'pointer', transition: 'all 0.15s' }}/>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>직접 입력:</label>
              <input type="color" value={customColor} onChange={e => { setCustomColor(e.target.value); setColor(e.target.value) }}
                style={{ width: '44px', height: '36px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', cursor: 'pointer', padding: '2px' }}/>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{color.toUpperCase()}</span>
            </div>
          </div>

          {/* 지원 언어 */}
          <div style={S.card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Globe size={18} color="var(--primary)"/>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>지원 언어</h3>
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {LANGUAGES.map(({ v, l }) => (
                <button key={v} onClick={() => toggleLang(v)} style={{
                  padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', minHeight: '40px', fontFamily: 'inherit',
                  border: `2px solid ${langs.includes(v) ? 'var(--primary)' : 'var(--border)'}`,
                  background: langs.includes(v) ? 'rgba(79,70,229,0.08)' : 'var(--bg-secondary)',
                  color: langs.includes(v) ? 'var(--primary)' : 'var(--text-secondary)',
                }}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <button onClick={handleSave} disabled={saving} style={{ ...S.btnPrimary, width: '100%', opacity: saving ? 0.7 : 1 }}>
            {saving ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }}/>저장 중...</> : <><Save size={16}/>설정 저장</>}
          </button>
        </div>

        {/* Right - Live Preview */}
        <div style={{ position: 'sticky', top: '80px' }}>
          <div style={{ ...S.card }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>실시간 미리보기</h3>
            {/* Chat Widget */}
            <div style={{ border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
              {/* Header */}
              <div style={{ background: activeColor, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Bot size={18} color="#fff"/>
                </div>
                <div>
                  <p style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>{botName || 'AI상담봇'}</p>
                  <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.8)' }}>● 온라인</p>
                </div>
              </div>
              {/* Messages */}
              <div style={{ height: '240px', overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--bg-primary)' }}>
                {chatHistory.map((msg, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    {msg.role === 'bot' && (
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: activeColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: '8px' }}>
                        <Bot size={14} color="#fff"/>
                      </div>
                    )}
                    <div style={{
                      maxWidth: '75%', padding: '10px 14px', borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '2px 12px 12px 12px',
                      background: msg.role === 'user' ? activeColor : 'var(--bg-secondary)',
                      color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                      fontSize: '13px', lineHeight: 1.5,
                      border: msg.role === 'bot' ? '1px solid var(--border)' : 'none',
                    }}>
                      {msg.text}
                    </div>
                  </div>
                ))}
              </div>
              {/* Input */}
              <div style={{ padding: '12px 16px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px' }}>
                <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendPreviewMsg() }}
                  style={{ ...S.input, flex: 1, minHeight: '38px', fontSize: '13px' }} placeholder="메시지를 입력하세요..."/>
                <button onClick={sendPreviewMsg} style={{ background: activeColor, border: 'none', borderRadius: '8px', padding: '8px 14px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', minHeight: '38px' }}>
                  <MessageCircle size={16}/>
                </button>
              </div>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '10px' }}>※ 미리보기에서는 실제 AI 응답이 작동하지 않습니다.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
