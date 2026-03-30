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
      for (const s of res.data?.items || []) data[s.scenario_type] = s
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
    const kw = (newKeywords[type] || '').trim()
    if (!kw) return
    const s = scenarios[type]
    if ((s.trigger_keywords || []).includes(kw)) return
    update(type, 'trigger_keywords', [...(s.trigger_keywords || []), kw])
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
      if (s.id) {
        await api.updateScenario(s.id, s)
      } else {
        const res = await api.saveScenario(s)
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
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h3>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{desc}</p>
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
                    placeholder="키워드 입력 후 Enter 또는 추가"
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
