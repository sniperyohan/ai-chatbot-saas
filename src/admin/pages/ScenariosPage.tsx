import React, { useState, useEffect } from 'react'
import { Plus, X, Save, Loader2, ToggleLeft, ToggleRight, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { api } from '../lib/api'
import { useToast } from '../hooks/useToast'
import ToastContainer from '../components/Toast'
import { S } from '../lib/ui'

// ─────────────────────────────────────────────
// 기본 시나리오 시드 (신규 가입자 초기 세팅용)
// 모달의 아이콘/색상 팔레트로도 활용
// ─────────────────────────────────────────────
const DEFAULT_SCENARIOS = [
  { type: 'greeting',    icon: '👋', title: '인사',           color: '#10B981', desc: '고객이 처음 대화를 시작할 때 응답합니다.' },
  { type: 'reservation', icon: '📅', title: '예약/상담 안내',    color: '#3B82F6', desc: '예약이나 상담 요청 시 안내합니다.' },
  { type: 'payment',     icon: '💳', title: '결제/환불 안내',    color: '#8B5CF6', desc: '결제 및 환불 관련 질문에 응답합니다.' },
  { type: 'guide',       icon: '📚', title: '이용 가이드',     color: '#F59E0B', desc: '서비스 이용 방법을 안내합니다.' },
  { type: 'inquiry',     icon: '🔍', title: '예매 내역 조회',    color: '#EC4899', desc: '예매 내역 확인 및 상태 조회 시 안내합니다.' },
  { type: 'abuse',       icon: '🛡️', title: '부적절한 표현 대응', color: '#EF4444', desc: '욕설/비속어 감지 시 정중한 안내 전송.' },
]

const ICON_PALETTE = ['💬','💡','🎯','📦','🛒','💰','🎁','📞','📧','⭐','🔔','🏷️','🎉','📋','🚀','💎','🔧','🎨']
const COLOR_PALETTE = ['#10B981','#3B82F6','#8B5CF6','#F59E0B','#EC4899','#EF4444','#06B6D4','#84CC16','#F97316','#6366F1']

interface Scenario {
  id?: string
  type: string
  name: string
  description: string
  icon: string
  color: string
  trigger_keywords: string[]
  response_template: string
  responses?: string[]   //
  image_url?: string
  is_active: boolean | number
  sort_order?: number
  _localKey: string  // React key (id || `new_${ts}`)
  _isNew?: boolean   // 미저장 신규 항목 표시
}

export default function ScenariosPage() {
  const toast = useToast()
  const [scenarios, setScenarios] = useState<Record<string, Scenario>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [newKeywords, setNewKeywords] = useState<Record<string, string>>({})
  const [planLimit, setPlanLimit] = useState<{ scenarios: number | null; responses: number | null }>({ scenarios: null, responses: null })
  const [planName, setPlanName] = useState<string>('basic')
  const [showAddModal, setShowAddModal] = useState(false)
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)


  useEffect(() => {
    loadScenarios()
  }, [])

  function loadScenarios() {
    setLoading(true)
    api.getScenarios().then(res => {
      const data: Record<string, Scenario> = {}
      const items = res.data?.items || (Array.isArray(res.data) ? res.data : [])

      for (const s of items) {
        let kws = s.trigger_keywords
        if (typeof kws === 'string') {
          try { kws = JSON.parse(kws) } catch { kws = [] }
        }
        const id = s.id
        if (!id) continue
        data[id] = {
          id,
          type: s.type || s.scenario_type || 'custom',
          name: s.name || '',
          description: s.description || '',
          icon: s.icon || '💬',
          color: s.color || '#10B981',
          trigger_keywords: kws || [],
          response_template: s.response_template || '',
          responses: Array.isArray(s.responses) && s.responses.length > 0
            ? s.responses
            : (s.response_template ? [s.response_template] : ['']),
          image_url: s.image_url || '',
          is_active: s.is_active ?? 1,
          sort_order: s.sort_order || 0,
          _localKey: id,
        }
      }

      // 플랜 한도 정보
      if (res.data?.plan) setPlanName(res.data.plan)
      if (res.data?.limit) setPlanLimit(res.data.limit)

      setScenarios(data)
    }).catch(() => {
      setScenarios({})
    }).finally(() => setLoading(false))
  }

    // 시나리오 순서 변경 (위/아래 화살표)
  const moveScenario = async (key: string, direction: 'up' | 'down') => {
    const sorted = Object.values(scenarios).sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    const idx = sorted.findIndex((s: any) => (s._localKey || s.id) === key)
    if (idx === -1) return
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= sorted.length) return

    const a: any = sorted[idx]
    const b: any = sorted[targetIdx]
    const aOrder = a.sort_order ?? 0
    const bOrder = b.sort_order ?? 0

    // UI 즉시 반영
    setScenarios(prev => {
      const next = { ...prev }
      const aKey = a._localKey || a.id
      const bKey = b._localKey || b.id
      if (next[aKey]) next[aKey] = { ...next[aKey], sort_order: bOrder }
      if (next[bKey]) next[bKey] = { ...next[bKey], sort_order: aOrder }
      return next
    })

    // DB 저장 (이미 저장된 시나리오만)
    try {
      if (a.id && !a._isNew) await api.updateScenario(a.id, { sort_order: bOrder })
      if (b.id && !b._isNew) await api.updateScenario(b.id, { sort_order: aOrder })
    } catch (err) {
      console.error('순서 변경 실패:', err)
    }
  }


  const update = (key: string, field: string, value: any) => {
    setScenarios(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }))
  }

  const addKeyword = (key: string) => {
    const raw = (newKeywords[key] || '').trim()
    if (!raw) return
    const inputs = raw.split(/[,\n]/).map(k => k.trim()).filter(k => k.length > 0)
    if (inputs.length === 0) return
    const s = scenarios[key]
    const existing = s.trigger_keywords || []
    const toAdd = inputs.filter(k => !existing.includes(k))
    if (toAdd.length === 0) {
      setNewKeywords(prev => ({ ...prev, [key]: '' }))
      return
    }
    update(key, 'trigger_keywords', [...existing, ...toAdd])
    setNewKeywords(prev => ({ ...prev, [key]: '' }))
  }

  const removeKeyword = (key: string, kw: string) => {
    const s = scenarios[key]
    update(key, 'trigger_keywords', (s.trigger_keywords || []).filter((k: string) => k !== kw))
  }

  const save = async (key: string) => {
    setSaving(key)
    try {
      const s = scenarios[key]
      const payload = {
        type: s.type || 'custom',
        scenario_type: s.type || 'custom',
        name: (s.name && s.name.trim()) || s.type || 'custom',
        description: s.description ?? '',
        icon: s.icon || '💬',
        color: s.color || '#10B981',
        trigger_keywords: s.trigger_keywords || [],
        response_template: s.response_template || '',
        responses: (s.responses || []).map(r => r.trim()).filter(r => r),
        image_url: s.image_url || '',
        is_active: s.is_active,
        sort_order: s.sort_order || 0,
      }

      if (s.id) {
        await api.updateScenario(s.id, payload)
      } else {
        const res = await api.saveScenario(payload)
        const newId = res.data?.id
        if (newId) {
          // 임시 키를 실제 id 키로 교체
          setScenarios(prev => {
            const next = { ...prev }
            const updated = { ...next[key], id: newId, _localKey: newId, _isNew: false }
            delete next[key]
            next[newId] = updated
            return next
          })
        }
      }
      toast.success('시나리오가 저장되었습니다.')
    } catch (e: any) {
      toast.error(e.message || '저장 실패')
    } finally {
      setSaving(null)
    }
  }

  const remove = async (key: string) => {
    const s = scenarios[key]
    if (!confirm(`'${s.name || s.type}' 시나리오를 삭제할까요?\n삭제하면 복구할 수 없습니다.`)) return

    setDeleting(key)
    try {
      if (s.id) {
        await api.deleteScenario(s.id)
      }
      setScenarios(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      toast.success('시나리오가 삭제되었습니다.')
    } catch (e: any) {
      toast.error(e.message || '삭제 실패')
    } finally {
      setDeleting(null)
    }
  }

  // 이미지 자동 리사이즈 (Canvas 사용)
  const resizeImage = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const MAX_WIDTH = 1040
      const MAX_HEIGHT = 520
      const QUALITY = 0.85

      // GIF는 애니메이션 보존을 위해 리사이즈 스킵
      if (file.type === 'image/gif') {
        resolve(file)
        return
      }

      const img = new Image()
      const reader = new FileReader()

      reader.onload = (e) => {
        img.src = e.target?.result as string
      }
      reader.onerror = () => reject(new Error('파일 읽기 실패'))

      img.onload = () => {
        let { width, height } = img

        // 비율 유지하면서 축소 (원본보다 작게만)
        if (width > MAX_WIDTH || height > MAX_HEIGHT) {
          const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas 컨텍스트 생성 실패'))
          return
        }

        // 부드러운 리사이즈
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, width, height)

        // PNG는 투명도 보존, 나머지는 JPG로 변환 (용량 절감)
        const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob)
            else reject(new Error('이미지 변환 실패'))
          },
          outputType,
          QUALITY
        )
      }
      img.onerror = () => reject(new Error('이미지 로드 실패'))

      reader.readAsDataURL(file)
    })
  }

  const handleImageUpload = async (key: string, file: File) => {
    // 파일 크기 체크 (원본 10MB까지 허용 - 어차피 리사이즈됨)
    if (file.size > 50 * 1024 * 1024) {
      alert('파일 크기는 50MB 이하여야 합니다.')

      return
    }
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드 가능합니다.')
      return
    }

    setUploadingKey(key)
    try {
      // 1. 클라이언트에서 자동 리사이즈 (1040x520, JPG 85%)
      const resizedBlob = await resizeImage(file)
      console.log(`[이미지 리사이즈] ${(file.size / 1024).toFixed(1)}KB → ${(resizedBlob.size / 1024).toFixed(1)}KB`)

      // 2. Blob을 File로 변환 (확장자는 jpg로 통일, GIF/PNG는 유지)
      const ext = file.type === 'image/gif' ? 'gif' : file.type === 'image/png' ? 'png' : 'jpg'
      const resizedFile = new File([resizedBlob], `image.${ext}`, { type: resizedBlob.type })

      // 3. R2에 업로드
      const res = await api.uploadImage(resizedFile)
      if (res.success && res.data?.url) {
        update(key, 'image_url', res.data.url)
      } else {
        alert(res.error || '업로드 실패')
      }
    } catch (e: any) {
      alert('업로드 실패: ' + (e?.message || '알 수 없는 오류'))
    } finally {
      setUploadingKey(null)
    }
  }

  const handleAddNew = (preset?: typeof DEFAULT_SCENARIOS[0]) => {
    const tempKey = `new_${Date.now()}`
    const newScenario: Scenario = {
      type: preset?.type || 'custom',
      name: preset?.title || '새 시나리오',
      description: preset?.desc || '',
      icon: preset?.icon || '💬',
      color: preset?.color || '#10B981',
      trigger_keywords: [],
      response_template: '',
      responses: [''],
      image_url: '',
      is_active: 1,
      sort_order: Object.keys(scenarios).length,
      _localKey: tempKey,
      _isNew: true,
    }
    setScenarios(prev => ({ ...prev, [tempKey]: newScenario }))
    setShowAddModal(false)
  }

  const list = Object.values(scenarios).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  const currentCount = list.length
  const limitReached = planLimit.scenarios !== null && currentCount >= planLimit.scenarios

  if (loading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
        {[1,2,3,4,5,6].map(i => (
          <div key={i} style={{ ...S.card, height: '300px', background: 'linear-gradient(90deg, var(--border) 25%, var(--bg-primary) 50%, var(--border) 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }}/>
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast}/>

      {/* 헤더: 제목 + 한도 표시 + 추가 버튼 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>시나리오 설정</h2>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>특정 키워드에 맞춤 응답을 설정합니다.</span>
          <span style={{
            fontSize: '12px', fontWeight: 600,
            padding: '4px 10px', borderRadius: '9999px',
            background: limitReached ? '#EF444420' : '#10B98120',
            color: limitReached ? '#EF4444' : '#10B981',
            border: `1px solid ${limitReached ? '#EF444440' : '#10B98140'}`,
          }}>
            {currentCount} / {planLimit.scenarios === null ? '∞' : planLimit.scenarios} 사용 중 ({planName.toUpperCase()})
          </span>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          disabled={limitReached}
          style={{
            ...S.btnPrimary,
            padding: '8px 16px',
            fontSize: '13px',
            opacity: limitReached ? 0.5 : 1,
            cursor: limitReached ? 'not-allowed' : 'pointer',
          }}
          title={limitReached ? '플랜 한도에 도달했습니다. 요금제를 업그레이드하세요.' : '새 시나리오 추가'}
        >
          <Plus size={14}/> 새 시나리오 추가
        </button>
      </div>

      {/* 시나리오가 없을 때 */}
      {list.length === 0 && (
        <div style={{ ...S.card, textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
          <p style={{ fontSize: '14px', marginBottom: '12px' }}>아직 등록된 시나리오가 없습니다.</p>
          <button onClick={() => setShowAddModal(true)} style={{ ...S.btnPrimary, padding: '8px 16px', fontSize: '13px' }}>
            <Plus size={14}/> 첫 시나리오 추가하기
          </button>
        </div>
      )}

      {/* 시나리오 카드 그리드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {list.map(s => {
          const key = s._localKey
          const isSaving = saving === key
          const isDeleting = deleting === key
          const color = s.color || '#10B981'
          const icon = s.icon || '💬'

          return (
            <div key={key} style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }}>
              {s._isNew && (
                <span style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px', background: '#F59E0B20', color: '#F59E0B' }}>
                  미저장
                </span>
              )}

              {/* Header: icon + name/desc + toggle */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                  <button
                    onClick={() => {
                      const idx = ICON_PALETTE.indexOf(icon)
                      const next = ICON_PALETTE[(idx + 1) % ICON_PALETTE.length]
                      update(key, 'icon', next)
                    }}
                    title="클릭하여 아이콘 변경"
                    style={{ width: '44px', height: '44px', borderRadius: '12px', background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', border: 'none', cursor: 'pointer' }}
                  >
                    {icon}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input
                      value={s.name ?? ''}
                      onChange={e => update(key, 'name', e.target.value)}
                      placeholder="시나리오 이름"
                      style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', background: 'transparent', border: '1px dashed var(--border)', borderRadius: '6px', padding: '4px 8px', width: '100%', outline: 'none' }}
                    />
                    <input
                      value={s.description ?? ''}
                      onChange={e => update(key, 'description', e.target.value)}
                      placeholder="간단한 설명"
                      style={{ fontSize: '12px', color: 'var(--text-secondary)', background: 'transparent', border: '1px dashed var(--border)', borderRadius: '6px', padding: '3px 8px', width: '100%', outline: 'none', marginTop: '6px' }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', height: '32px', marginTop: '-4px' }}>
                  <button
                    onClick={() => moveScenario(key, 'up')}
                    title="위로 이동"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: s.is_active ? color : 'var(--text-secondary)', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '32px' }}
                  >
                    <ArrowUp size={20} strokeWidth={2.5}/>
                  </button>
                  <button
                    onClick={() => moveScenario(key, 'down')}
                    title="아래로 이동"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: s.is_active ? color : 'var(--text-secondary)', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '32px' }}
                  >
                    <ArrowDown size={20} strokeWidth={2.5}/>
                  </button>
                  <button
                    onClick={() => update(key, 'is_active', s.is_active ? 0 : 1)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: s.is_active ? color : 'var(--text-secondary)', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '32px' }}
                  >
                    {s.is_active ? <ToggleRight size={28}/> : <ToggleLeft size={28}/>}
                  </button>
                </div>
              </div>

              {/* 색상 선택 */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {COLOR_PALETTE.map(c => (
                  <button
                    key={c}
                    onClick={() => update(key, 'color', c)}
                    title={c}
                    style={{
                      width: '20px', height: '20px', borderRadius: '50%',
                      background: c, border: c === color ? '2px solid var(--text-primary)' : '2px solid transparent',
                      cursor: 'pointer', padding: 0,
                    }}
                  />
                ))}
              </div>

              {/* Keywords */}
              <div>
                <label style={{ ...S.label, marginBottom: '8px' }}>트리거 키워드</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                  {(s.trigger_keywords || []).map((kw: string) => (
                    <span key={kw} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '9999px', background: `${color}15`, color, fontSize: '12px', fontWeight: 600, border: `1px solid ${color}40` }}>
                      {kw}
                      <button onClick={() => removeKeyword(key, kw)} style={{ background: 'none', border: 'none', cursor: 'pointer', color, padding: 0, display: 'flex', alignItems: 'center' }}>
                        <X size={12}/>
                      </button>
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    value={newKeywords[key] || ''}
                    onChange={e => setNewKeywords(prev => ({ ...prev, [key]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') addKeyword(key) }}
                    style={{ ...S.input, flex: 1, minHeight: '38px', fontSize: '13px' }}
                    placeholder="키워드 입력 (쉼표로 여러 개 가능)"
                  />
                  <button onClick={() => addKeyword(key)} style={{ ...S.btnSecondary, padding: '8px 14px', minHeight: '38px', fontSize: '13px' }}>
                    <Plus size={14}/>
                  </button>
                </div>
              </div>

              {/* Response Templates (multi) */}
              <div>
                <label style={{ ...S.label, marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>응답 템플릿</span>
                  <span style={{ fontSize: '11px', color: '#6B7280', fontWeight: 'normal' }}>
                    {(s.responses || []).length} / {planLimit.responses === null ? '∞' : planLimit.responses} (랜덤 발송)
                  </span>
                </label>

                {(s.responses && s.responses.length > 0 ? s.responses : ['']).map((resp, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                    <textarea
                      value={resp}
                      onChange={e => {
                        const arr = [...(s.responses || [''])]
                        arr[idx] = e.target.value
                        update(key, 'responses', arr)
                      }}
                      style={{ ...S.textarea, height: '90px', fontSize: '13px', flex: 1 }}
                      placeholder={`응답 ${idx + 1}`}
                    />
                    {(s.responses || []).length > 1 && (
                      <button
                        onClick={() => {
                          const arr = (s.responses || []).filter((_, i) => i !== idx)
                          update(key, 'responses', arr)
                        }}
                        style={{ ...S.btnSecondary, padding: '8px', color: '#EF4444', alignSelf: 'flex-start' }}
                        title="이 응답 삭제"
                      >
                        <Trash2 size={14}/>
                      </button>
                    )}
                  </div>
                ))}

                {(planLimit.responses === null || (s.responses || []).length < planLimit.responses) && (
                  <button
                    onClick={() => update(key, 'responses', [...(s.responses || []), ''])}
                    style={{ ...S.btnSecondary, fontSize: '12px', padding: '6px 12px', marginTop: '4px' }}
                  >
                    <Plus size={12}/> 응답 추가
                  </button>
                )}
              </div>
              {/* 🖼️ 이미지 업로드 (선택) - 카카오톡 basicCard */}
              <div style={{ marginTop: '12px', padding: '12px', background: '#F9FAFB', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#374151' }}>
                  🖼️ 이미지 <span style={{ color: '#9CA3AF', fontWeight: 400, fontSize: '11px' }}>(선택 · 카카오톡 이미지 카드)</span>
                </label>
                {!s.image_url ? (
                  <div
                    onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLDivElement).style.background = '#EEF2FF' }}
                    onDragLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'white' }}
                    onDrop={async (e) => {
                      e.preventDefault()
                      ;(e.currentTarget as HTMLDivElement).style.background = 'white'
                      const f = e.dataTransfer.files?.[0]
                      if (f) await handleImageUpload(key, f)
                    }}
                    style={{ border: '2px dashed #D1D5DB', borderRadius: '8px', padding: '20px', textAlign: 'center', background: 'white', cursor: 'pointer', transition: 'background 0.2s' }}
                    onClick={() => document.getElementById(`file-input-${key}`)?.click()}
                  >
                    <input
                      id={`file-input-${key}`}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                      style={{ display: 'none' }}
                      onChange={async (e) => {
                        const f = e.target.files?.[0]
                        if (f) await handleImageUpload(key, f)
                        e.target.value = ''
                      }}
                    />
                    {uploadingKey === key ? (
                      <div style={{ color: '#6366F1', fontSize: '13px' }}>
                        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: '4px' }} />
                        <p style={{ margin: 0 }}>업로드 중...</p>
                      </div>
                    ) : (
                      <div style={{ color: '#6B7280', fontSize: '13px' }}>
                        <p style={{ margin: '0 0 4px 0', fontWeight: 600 }}>📁 클릭 또는 드래그하여 업로드</p>
                        <p style={{ margin: 0, fontSize: '11px' }}>JPG, PNG, WEBP, GIF · 최대 50MB (자동 최적화)</p>
                        <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#6366F1', fontWeight: 600 }}>💡 권장 비율 2:1 (예: 1040×520)</p>

                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <img
                        src={s.image_url}
                        alt="미리보기"
                        style={{ maxWidth: '200px', maxHeight: '120px', borderRadius: '6px', border: '1px solid #E5E7EB', display: 'block' }}
                        onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3' }}
                      />
                      <button
                        onClick={() => update(key, 'image_url', '')}
                        style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', borderRadius: '50%', width: '24px', height: '24px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="이미지 제거"
                      >
                        ×
                      </button>
                    </div>
                    <p style={{ fontSize: '11px', color: '#6B7280', marginTop: '4px', margin: '4px 0 0 0' }}>
                      💡 답변과 함께 이미지 카드로 전송됩니다
                    </p>
                  </div>
                )}
              </div>


              {/* Buttons: Save + Delete */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => save(key)} disabled={isSaving || isDeleting}
                  style={{ ...S.btnPrimary, flex: 1, background: color, opacity: (isSaving || isDeleting) ? 0.7 : 1 }}>
                  {isSaving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }}/>저장 중...</> : <><Save size={14}/>저장</>}
                </button>
                <button onClick={() => remove(key)} disabled={isSaving || isDeleting}
                  style={{ ...S.btnSecondary, padding: '8px 14px', color: '#EF4444', opacity: (isSaving || isDeleting) ? 0.5 : 1 }}
                  title="시나리오 삭제">
                  {isDeleting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }}/> : <Trash2 size={14}/>}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* 시나리오 추가 모달 */}
      {showAddModal && (
        <div
          onClick={() => setShowAddModal(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ ...S.card, maxWidth: '600px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700 }}>새 시나리오 추가</h3>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <X size={20}/>
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              템플릿을 선택하거나 빈 시나리오로 시작하세요. 추가 후 키워드와 응답을 입력하고 저장하면 즉시 작동합니다.
            </p>

            {/* 템플릿 그리드 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '16px' }}>
              {DEFAULT_SCENARIOS.map(t => {
                // 이미 같은 type이 활성 상태로 존재하면 비활성화
                const alreadyExists = list.some(s => s.type === t.type && s.is_active)
                return (
                  <button
                    key={t.type}
                    onClick={() => !alreadyExists && handleAddNew(t)}
                    disabled={alreadyExists}
                    title={alreadyExists ? '이미 추가된 시나리오입니다' : `${t.title} 템플릿으로 시작`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '12px', borderRadius: '10px',
                      border: `1px solid ${t.color}40`,
                      background: alreadyExists ? 'var(--bg-secondary, #f5f5f5)' : `${t.color}10`,
                      cursor: alreadyExists ? 'not-allowed' : 'pointer',
                      opacity: alreadyExists ? 0.5 : 1,
                      textAlign: 'left',
                      position: 'relative',
                    }}
                  >
                    <span style={{ fontSize: '20px', filter: alreadyExists ? 'grayscale(1)' : 'none' }}>{t.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{t.title}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {alreadyExists ? '✓ 이미 추가됨' : t.desc}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            <button
              onClick={() => handleAddNew()}
              style={{ ...S.btnSecondary, width: '100%', padding: '12px', fontSize: '13px', borderStyle: 'dashed' }}
            >
              <Plus size={14}/> 빈 시나리오로 시작
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
