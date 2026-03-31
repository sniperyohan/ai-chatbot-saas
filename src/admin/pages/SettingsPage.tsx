import React, { useState, useEffect, useRef } from 'react'
import { Bot, Palette, Globe, Loader2, Save, MessageCircle, Info, CheckCircle } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../hooks/useToast'
import ToastContainer from '../components/Toast'
import { S } from '../lib/ui'

const COLORS = ['#4F46E5','#10B981','#EF4444','#F59E0B','#8B5CF6','#06B6D4','#EC4899','#14B8A6','#F97316','#6366F1']
const LANGUAGES = [
  { v: 'ko', l: '🇰🇷 한국어' },
  { v: 'en', l: '🇺🇸 English' },
  { v: 'ja', l: '🇯🇵 日本語' },
]
const TONES = [
  { v: 'friendly',    l: '😊 친근함',     desc: '따뜻하고 친근한 말투' },
  { v: 'professional', l: '💼 전문적',    desc: '격식 있고 전문적인 말투' },
  { v: 'casual',      l: '🤙 캐주얼',     desc: '가볍고 편안한 말투' },
  { v: 'formal',      l: '🏛️ 공식적',    desc: '공적이고 정중한 말투' },
]

// 툴팁 컴포넌트
function Tooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: 0, top: 0 })

  const handleMouseEnter = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      setPos({ left: rect.left + 12, top: rect.top - 8 })
    }
    setVisible(true)
  }

  return (
    <div ref={ref} style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}>
      <button
        type="button"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setVisible(false)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px', display: 'flex', alignItems: 'center', marginLeft: '4px' }}
      >
        <Info size={13}/>
      </button>
      {visible && (
        <div style={{
          position: 'fixed',
          left: pos.left + 'px',
          top: pos.top + 'px',
          transform: 'translateY(-100%)',
          zIndex: 9999,
          background: '#1F2937',
          color: '#fff',
          padding: '8px 12px',
          borderRadius: '8px',
          fontSize: '12px',
          maxWidth: '240px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          lineHeight: 1.6,
          pointerEvents: 'none',
          whiteSpace: 'pre-wrap',
        }}>
          {text}
        </div>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const { tenant, updateTenant } = useAuth()
  const toast = useToast()
  const chatEndRef = useRef<HTMLDivElement>(null)

  const [botName, setBotName] = useState(tenant?.bot_name || 'AI상담봇')
  const [greeting, setGreeting] = useState(tenant?.greeting_message || '안녕하세요! 무엇을 도와드릴까요? 😊')
  const [color, setColor] = useState(tenant?.widget_color || '#4F46E5')
  const [customColor, setCustomColor] = useState(tenant?.widget_color || '#4F46E5')
  const [langs, setLangs] = useState<string[]>(['ko'])
  const [systemPrompt, setSystemPrompt] = useState('당신은 친절한 고객 상담 AI입니다. 고객의 질문에 정확하고 도움이 되는 답변을 제공하세요.')
  const [responseTone, setResponseTone] = useState('friendly')
  const [maxLength, setMaxLength] = useState(500)
  const [fallbackMsg, setFallbackMsg] = useState('죄송합니다. 해당 질문에 대한 답변을 찾지 못했습니다. 고객센터로 문의해 주세요.')
  const [showSources, setShowSources] = useState(true)
  const [autoEscalate, setAutoEscalate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // 미리보기
  const [chatInput, setChatInput] = useState('')
  const [chatHistory, setChatHistory] = useState<{role:'user'|'bot'; text:string}[]>([])

  useEffect(() => {
    api.getSettings().then(res => {
      const d = res.data
      if (d) {
        setBotName(d.bot_name || 'AI상담봇')
        setGreeting(d.greeting_message || '안녕하세요! 무엇을 도와드릴까요? 😊')
        setColor(d.widget_color || '#4F46E5')
        setCustomColor(d.widget_color || '#4F46E5')
        setLangs(d.supported_languages || ['ko'])
        setSystemPrompt(d.system_prompt || '당신은 친절한 고객 상담 AI입니다.')
        setResponseTone(d.response_tone || 'friendly')
        setMaxLength(d.max_response_length || 500)
        setFallbackMsg(d.fallback_message || '죄송합니다. 해당 질문에 대한 답변을 찾지 못했습니다.')
        setShowSources(d.show_sources !== undefined ? d.show_sources : true)
        setAutoEscalate(d.auto_escalate || false)
        setChatHistory([{ role: 'bot', text: d.greeting_message || '안녕하세요! 무엇을 도와드릴까요? 😊' }])
      }
    }).catch(() => {
      setChatHistory([{ role: 'bot', text: greeting }])
    })
  }, [])

  // 인사말 변경 시 미리보기 자동 반영
  useEffect(() => {
    setChatHistory(prev => {
      if (prev.length === 0) return [{ role: 'bot', text: greeting }]
      if (prev[0].role === 'bot') return [{ role: 'bot', text: greeting }, ...prev.slice(1)]
      return [{ role: 'bot', text: greeting }, ...prev]
    })
  }, [greeting])

  // 채팅 스크롤
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.saveSettings({
        bot_name: botName,
        greeting_message: greeting,
        widget_color: color,
        supported_languages: langs,
        system_prompt: systemPrompt,
        response_tone: responseTone,
        max_response_length: maxLength,
        fallback_message: fallbackMsg,
        show_sources: showSources,
        auto_escalate: autoEscalate,
      })
      updateTenant({ bot_name: botName, greeting_message: greeting, widget_color: color })
      setSaved(true)
      toast.success('챗봇 설정이 저장되었습니다! ✨')
      setTimeout(() => setSaved(false), 3000)
    } catch (e: any) {
      toast.error(e.message || '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const toggleLang = (v: string) => {
    setLangs(prev => {
      if (prev.includes(v)) {
        if (prev.length <= 1) return prev // 최소 1개 유지
        return prev.filter(l => l !== v)
      }
      return [...prev, v]
    })
  }

  const sendPreviewMsg = () => {
    if (!chatInput.trim()) return
    const userMsg = chatInput
    setChatInput('')
    setChatHistory(prev => [
      ...prev,
      { role: 'user', text: userMsg },
    ])
    // 봇 응답 시뮬레이션
    setTimeout(() => {
      setChatHistory(prev => [
        ...prev,
        { role: 'bot', text: `${userMsg}에 대한 답변입니다. (${TONES.find(t => t.v === responseTone)?.desc || ''} 말투로 응답합니다. 실제 봇은 AI로 응답합니다.)` }
      ])
    }, 600)
  }

  const activeColor = COLORS.includes(color) ? color : customColor

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast}/>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>챗봇 설정</h2>
        <button onClick={handleSave} disabled={saving} style={{
          ...S.btnPrimary,
          opacity: saving ? 0.7 : 1,
          background: saved ? '#059669' : 'var(--primary)',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          {saving
            ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }}/>저장 중...</>
            : saved
              ? <><CheckCircle size={16}/>저장됨</>
              : <><Save size={16}/>설정 저장</>
          }
        </button>
      </div>

      {/* 좌우 레이아웃 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', alignItems: 'start' }}>
        {/* Left - Settings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* 기본 정보 */}
          <div style={S.card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Bot size={18} color="var(--primary)"/>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>기본 정보</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* 봇 이름 */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ ...S.label, margin: 0 }}>봇 이름</label>
                  <Tooltip text="채팅창 상단에 표시되는 봇의 이름입니다.\n고객에게 보여지는 첫 인상입니다."/>
                </div>
                <input value={botName} onChange={e => setBotName(e.target.value)} style={S.input} placeholder="예: AI 고객센터" maxLength={30}/>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>{botName.length}/30자</p>
              </div>
              {/* 인사말 */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ ...S.label, margin: 0 }}>인사말</label>
                  <Tooltip text="챗봇이 처음 열릴 때 보내는 메시지입니다.\n고객 입장에서 친근하고 명확하게 작성하세요."/>
                </div>
                <textarea value={greeting} onChange={e => setGreeting(e.target.value)} style={{ ...S.textarea, height: '80px' }} placeholder="고객에게 보여질 인사말을 입력하세요." maxLength={200}/>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', textAlign: 'right' }}>{greeting.length}/200자</p>
              </div>
              {/* 답변 불가 메시지 */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ ...S.label, margin: 0 }}>답변 불가 메시지</label>
                  <Tooltip text="FAQ에 해당 답변이 없을 때 보내는 메시지입니다.\n고객센터 연락처를 포함하면 좋습니다."/>
                </div>
                <textarea value={fallbackMsg} onChange={e => setFallbackMsg(e.target.value)} style={{ ...S.textarea, height: '70px' }} placeholder="죄송합니다. 해당 질문에 대한 답변을 찾지 못했습니다." maxLength={200}/>
              </div>
            </div>
          </div>

          {/* AI 응답 설정 */}
          <div style={S.card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <span style={{ fontSize: '16px' }}>🤖</span>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>AI 응답 설정</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* 시스템 프롬프트 */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ ...S.label, margin: 0 }}>시스템 프롬프트</label>
                  <Tooltip text="AI의 역할과 행동 방식을 정의합니다.\n예: '당신은 스포츠 용품 전문점의 친절한 상담사입니다.'"/>
                </div>
                <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} style={{ ...S.textarea, height: '90px' }} placeholder="AI 봇의 역할을 정의하세요." maxLength={500}/>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', textAlign: 'right' }}>{systemPrompt.length}/500자</p>
              </div>
              {/* 응답 말투 */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ ...S.label, margin: 0 }}>응답 말투</label>
                  <Tooltip text="AI가 고객에게 답변할 때 사용하는 말투 스타일입니다."/>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {TONES.map(t => (
                    <button key={t.v} onClick={() => setResponseTone(t.v)} style={{
                      padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                      border: `2px solid ${responseTone === t.v ? 'var(--primary)' : 'var(--border)'}`,
                      background: responseTone === t.v ? 'rgba(79,70,229,0.07)' : 'var(--bg-secondary)',
                    }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: responseTone === t.v ? 'var(--primary)' : 'var(--text-primary)', marginBottom: '2px' }}>{t.l}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              {/* 최대 응답 길이 */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <label style={{ ...S.label, margin: 0 }}>최대 응답 길이</label>
                    <Tooltip text="한 번에 답변할 수 있는 최대 글자 수입니다.\n짧을수록 빠르게 응답하지만 내용이 부족할 수 있습니다."/>
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)' }}>{maxLength}자</span>
                </div>
                <input type="range" min={100} max={1000} step={50} value={maxLength} onChange={e => setMaxLength(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--primary)' }}/>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  <span>100자</span><span>1000자</span>
                </div>
              </div>
              {/* 토글 옵션들 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  { key: 'showSources', val: showSources, set: setShowSources, label: '출처 표시', tooltip: 'FAQ 답변 시 출처 문서를 함께 표시합니다.' },
                  { key: 'autoEscalate', val: autoEscalate, set: setAutoEscalate, label: '자동 상담원 연결', tooltip: '답변 불가 시 자동으로 상담원 연결 버튼을 표시합니다.' },
                ].map(item => (
                  <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{item.label}</span>
                      <Tooltip text={item.tooltip}/>
                    </div>
                    <div onClick={() => item.set(!item.val)} style={{
                      position: 'relative', width: '44px', height: '24px', borderRadius: '9999px', cursor: 'pointer',
                      background: item.val ? 'var(--primary)' : 'var(--border)', transition: 'background 0.2s',
                    }}>
                      <span style={{ position: 'absolute', top: '2px', left: '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'transform 0.2s', transform: item.val ? 'translateX(20px)' : 'translateX(0)' }}/>
                    </div>
                  </div>
                ))}
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
              <Tooltip text="고객이 어떤 언어로 질문해도 해당 언어로 답변합니다.\n최소 1개 이상 선택해야 합니다."/>
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

          {/* 저장 버튼 (하단) */}
          <button onClick={handleSave} disabled={saving} style={{ ...S.btnPrimary, width: '100%', opacity: saving ? 0.7 : 1, background: saved ? '#059669' : 'var(--primary)' }}>
            {saving
              ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }}/>저장 중...</>
              : saved
                ? <><CheckCircle size={16}/>저장 완료</>
                : <><Save size={16}/>설정 저장</>
            }
          </button>
        </div>

        {/* Right - 실시간 미리보기 */}
        <div style={{ position: 'sticky', top: '80px' }}>
          <div style={{ ...S.card }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
              💬 실시간 미리보기
            </h3>
            <div style={{ border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
              {/* Chat Header */}
              <div style={{ background: activeColor, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Bot size={20} color="#fff"/>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '14px', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{botName || 'AI상담봇'}</p>
                  <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.8)' }}>● 온라인</p>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: '6px', padding: '3px 8px', fontSize: '10px', color: '#fff', fontWeight: 600, flexShrink: 0 }}>
                  {TONES.find(t => t.v === responseTone)?.l || '😊 친근함'}
                </div>
              </div>
              {/* Messages */}
              <div style={{ height: '280px', overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', background: 'var(--bg-primary)' }}>
                {chatHistory.map((msg, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: '6px' }}>
                    {msg.role === 'bot' && (
                      <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: activeColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Bot size={13} color="#fff"/>
                      </div>
                    )}
                    <div style={{
                      maxWidth: '78%', padding: '9px 13px',
                      borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '2px 12px 12px 12px',
                      background: msg.role === 'user' ? activeColor : 'var(--bg-secondary)',
                      color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                      fontSize: '12px', lineHeight: 1.6,
                      border: msg.role === 'bot' ? '1px solid var(--border)' : 'none',
                    }}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef}/>
              </div>
              {/* Input */}
              <div style={{ padding: '12px 16px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px' }}>
                <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') sendPreviewMsg() }}
                  style={{ ...S.input, flex: 1, minHeight: '38px', fontSize: '12px' }}
                  placeholder="테스트 메시지 입력..."/>
                <button onClick={sendPreviewMsg} style={{ background: activeColor, border: 'none', borderRadius: '8px', padding: '8px 14px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', minHeight: '38px', flexShrink: 0 }}>
                  <MessageCircle size={16}/>
                </button>
              </div>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '10px' }}>
              ※ 미리보기에서는 실제 AI 응답이 작동하지 않습니다.
            </p>

            {/* 적용 현황 요약 */}
            <div style={{ marginTop: '14px', padding: '12px', background: 'var(--bg-primary)', borderRadius: '10px' }}>
              <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>현재 적용 설정</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {[
                  { k: '봇 이름', v: botName },
                  { k: '말투', v: TONES.find(t => t.v === responseTone)?.l || '-' },
                  { k: '지원 언어', v: langs.map(l => LANGUAGES.find(x => x.v === l)?.l.split(' ')[1] || l).join(', ') },
                  { k: '최대 응답', v: `${maxLength}자` },
                ].map(({ k, v }) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{k}</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
