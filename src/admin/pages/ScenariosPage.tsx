import React, { useState, useEffect } from 'react'
import { GitBranch, Plus, X, Save, Loader2, ToggleLeft, ToggleRight } from 'lucide-react'
import { api } from '../lib/api'
import { useToast } from '../hooks/useToast'
import ToastContainer from '../components/Toast'
import { S } from '../lib/ui'

const SCENARIO_TYPES = [
  { type: 'greeting',    icon: '👋', title: '인사',         color: '#10B981', desc: '고객이 처음 대화를 시작할 때 응답합니다.' },
  { type: 'reservation', icon: '📅', title: '예약/상담 안내', color: '#3B82F6', desc: '예약이나 상담 요청 시 안내합니다.' },
  { type: 'payment',     icon: '💳', title: '결제/환불 안내', color: '#8B5CF6', desc: '결제 및 환불 관련 질문에 응답합니다.' },
  { type: 'guide',       icon: '📚', title: '이용 가이드',   color: '#F59E0B', desc: '서비스 이용 방법을 안내합니다.' },
  { type: 'inquiry',     icon: '🔍', title: '예매 내역 조회', color: '#EC4899', desc: '예매 내역 확인 및 상태 조회 시 안내합니다.' },
]

export default function ScenariosPage() {
  const toast = useToast()
  const [scenarios, setScenarios] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string|null>(null)
  const [newKeywords, setNewKeywords] = useState<Record<string, string>>({})

  useEffect(() => {
    api.getScenarios().then(res => {
      const data: Record<string, any> = {}
      const items = res.data?.items || (Array.isArray(res.data) ? res.data : [])
      for (const s of items) {
        const key = s.scenario_type || s.type
        if (key) {
          let kws = s.trigger_keywords
          if (typeof kws === 'string') { try { kws = JSON.parse(kws) } catch { kws = [] } }
          data[key] = { ...s, scenario_type: key, trigger_keywords: kws || [] }
        }
      }
      // 없는 타입은 기본값으로 초기화
      for (const t of SCENARIO_TYPES) {
        if (!data[t.type]) {
          data[t.type] = { scenario_type: t.type, trigger_keywords: [], response_template: '', language: 'ko', is_active: true }
        }
      }
      setScenarios(data)
    }).catch(() => {
      const data: Record<string, any> = {}
      for (const t of SCENARIO_TYPES) data[t.type] = { scenario_type: t.type, trigger_keywords: [], response_template: '', language: 'ko', is_active: true }
      setScenarios(data)
    }).finally(() => setLoading(false))
  }, [])

  const update = (type: string, field: string, value: any) => {
    setScenarios(prev => ({ ...prev, [type]: { ...prev[type], [field]: value } }))
  }

  const addKeyword = (type: string) => {
    const raw = (newKeywords[type] || '').trim()
    if (!raw) return
    // 쉼표(,) 또는 줄바꿈(\n)으로 여러 키워드 한 번에 추가
    const inputs = raw.split(/[,\n]/).map(k => k.trim()).filter(k => k.length > 0)
    if (inputs.length === 0) return
    const s = scenarios[type]
    const existing = s.trigger_keywords || []
    // 중복 제거 후 추가
    const toAdd = inputs.filter(k => !existing.includes(k))
    if (toAdd.length === 0) {
      setNewKeywords(prev => ({ ...prev, [type]: '' }))
      return
    }
    update(type, 'trigger_keywords', [...existing, ...toAdd])
    setNewKeywords(prev => ({ ...prev, [type]: '' }))
  }

  const removeKeyword = (type: string, kw: string) => {
    const s = scenarios[type]
    update(type, 'trigger_keywords', (s.trigger_keywords || []).filter((k: string) => k !== kw))
  }

  const save = async (type: string) => {
    setSaving(type)
    try {
      const s = scenarios[type]
      const meta = SCENARIO_TYPES.find(t => t.type === type)
      // type 필드를 명시적으로 추가 (DB 기본값 'custom' 회피)
      const payload = {
        ...s,
        type,
        scenario_type: type,
        name: (s.name && s.name.trim()) || meta?.title || type,
        description: (s.description ?? '') || meta?.desc || '',
        icon: s.icon || meta?.icon || '💬',
        color: s.color || meta?.color || '#10B981',
      }
      if (s.id) {
        await api.updateScenario(s.id, payload)
      } else {
        const res = await api.saveScenario(payload)
        update(type, 'id', res.data?.id)
      }
      toast.success('시나리오가 저장되었습니다.')
    } catch (e: any) {
      toast.error(e.message || '저장 실패')
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
        {SCENARIO_TYPES.map(t => (
          <div key={t.type} style={{ ...S.card, height: '300px', background: 'linear-gradient(90deg, var(--border) 25%, var(--bg-primary) 50%, var(--border) 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }}/>
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast}/>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>시나리오 설정</h2>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>특정 키워드에 맞춤 응답을 설정합니다.</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {SCENARIO_TYPES.map(({ type, icon, title, color, desc }) => {
          const s = scenarios[type] || {}
          const isSaving = saving === type

          return (
            <div key={type} style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>{icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ position: 'relative' }}>
                      <input
                        value={s.name ?? ''}
                        onChange={e => update(type, 'name', e.target.value)}
                        placeholder={title}
                        title="클릭하여 카드 이름 편집"
                        style={{
                          fontSize: '15px',
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          background: 'transparent',
                          border: '1px dashed var(--border)',
                          borderRadius: '6px',
                          padding: '4px 28px 4px 8px',
                          width: '100%',
                          outline: 'none',
                          cursor: 'text',
                          transition: 'all 0.15s',
                        }}
                        onFocus={e => {
                          e.currentTarget.style.borderColor = 'var(--primary, #3B82F6)'
                          e.currentTarget.style.borderStyle = 'solid'
                          e.currentTarget.style.background = 'var(--bg-primary, #fff)'
                        }}
                        onBlur={e => {
                          e.currentTarget.style.borderColor = 'var(--border)'
                          e.currentTarget.style.borderStyle = 'dashed'
                          e.currentTarget.style.background = 'transparent'
                        }}
                        onMouseEnter={e => {
                          if (document.activeElement !== e.currentTarget) {
                            e.currentTarget.style.background = 'rgba(0,0,0,0.03)'
                          }
                        }}
                        onMouseLeave={e => {
                          if (document.activeElement !== e.currentTarget) {
                            e.currentTarget.style.background = 'transparent'
                          }
                        }}
                      />
                      <span style={{
                        position: 'absolute',
                        right: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        fontSize: '12px',
                        opacity: 0.5,
                        pointerEvents: 'none',
                      }}>✏️</span>
                    </div>

                    <div style={{ position: 'relative', marginTop: '6px' }}>
                      <input
                        value={s.description ?? ''}
                        onChange={e => update(type, 'description', e.target.value)}
                        placeholder={desc}
                        title="클릭하여 설명 편집"
                        style={{
                          fontSize: '12px',
                          color: 'var(--text-secondary)',
                          background: 'transparent',
                          border: '1px dashed var(--border)',
                          borderRadius: '6px',
                          padding: '3px 28px 3px 8px',
                          width: '100%',
                          outline: 'none',
                          cursor: 'text',
                          transition: 'all 0.15s',
                        }}
                        onFocus={e => {
                          e.currentTarget.style.borderColor = 'var(--primary, #3B82F6)'
                          e.currentTarget.style.borderStyle = 'solid'
                          e.currentTarget.style.background = 'var(--bg-primary, #fff)'
                        }}
                        onBlur={e => {
                          e.currentTarget.style.borderColor = 'var(--border)'
                          e.currentTarget.style.borderStyle = 'dashed'
                          e.currentTarget.style.background = 'transparent'
                        }}
                        onMouseEnter={e => {
                          if (document.activeElement !== e.currentTarget) {
                            e.currentTarget.style.background = 'rgba(0,0,0,0.03)'
                          }
                        }}
                        onMouseLeave={e => {
                          if (document.activeElement !== e.currentTarget) {
                            e.currentTarget.style.background = 'transparent'
                          }
                        }}
                      />
                      <span style={{
                        position: 'absolute',
                        right: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        fontSize: '11px',
                        opacity: 0.5,
                        pointerEvents: 'none',
                      }}>✏️</span>
                    </div>
                  </div>
                </div>
                {/* Toggle */}
                <button onClick={() => update(type, 'is_active', !s.is_active)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: s.is_active ? color : 'var(--text-secondary)', padding: '4px' }}>
                  {s.is_active ? <ToggleRight size={28}/> : <ToggleLeft size={28}/>}
                </button>
              </div>

              {/* Keywords */}
              <div>
                <label style={{ ...S.label, marginBottom: '8px' }}>트리거 키워드</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                  {(s.trigger_keywords || []).map((kw: string) => (
                    <span key={kw} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '9999px', background: `${color}15`, color, fontSize: '12px', fontWeight: 600, border: `1px solid ${color}40` }}>
                      {kw}
                      <button onClick={() => removeKeyword(type, kw)} style={{ background: 'none', border: 'none', cursor: 'pointer', color, padding: '0', display: 'flex', alignItems: 'center' }}>
                        <X size={12}/>
                      </button>
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    value={newKeywords[type] || ''}
                    onChange={e => setNewKeywords(prev => ({ ...prev, [type]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') addKeyword(type) }}
                    style={{ ...S.input, flex: 1, minHeight: '38px', fontSize: '13px' }}
                    placeholder="키워드 입력 (쉼표로 여러 개 입력 가능)"

                  />
                  <button onClick={() => addKeyword(type)} style={{ ...S.btnSecondary, padding: '8px 14px', minHeight: '38px', fontSize: '13px' }}>
                    <Plus size={14}/>
                  </button>
                </div>
              </div>

              {/* Template */}
              <div>
                <label style={{ ...S.label, marginBottom: '6px' }}>응답 템플릿</label>
                <textarea
                  value={s.response_template || ''}
                  onChange={e => update(type, 'response_template', e.target.value)}
                  style={{ ...S.textarea, height: '90px', fontSize: '13px' }}
                  placeholder={`${title} 시나리오에서 사용할 응답을 입력하세요.`}
                />
              </div>

              {/* Save */}
              <button onClick={() => save(type)} disabled={isSaving}
                style={{ ...S.btnPrimary, width: '100%', background: color, opacity: isSaving ? 0.7 : 1 }}>
                {isSaving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }}/>저장 중...</> : <><Save size={14}/>저장</>}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
