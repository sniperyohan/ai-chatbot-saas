import React, { useState, useEffect, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'
import {
  Upload, Download, Save, Trash2, Pencil, X, Check, Loader2,
  AlertTriangle, BookOpen, Search, ToggleLeft, ToggleRight,
  Sparkles, Info, FileSpreadsheet, Eye, Tag, Plus, GripVertical
} from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../hooks/useToast'
import ToastContainer from '../components/Toast'
import Modal from '../components/Modal'
import Badge from '../components/Badge'
import EmptyState from '../components/EmptyState'
import { SkeletonTable } from '../components/Skeleton'
import { S } from '../lib/ui'

const DEFAULT_CATEGORIES = ['일반', '배송', '결제', '교환반품', '기타']
const PLAN_LIMIT: Record<string, number> = { basic: 50, pro: 200, master: -1 }

// ─── 툴팁 컴포넌트 ───────────────────────────────────
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
    <div ref={ref} style={{ display: 'inline-flex', alignItems: 'center' }}>
      <button type="button" onMouseEnter={handleMouseEnter} onMouseLeave={() => setVisible(false)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px', display: 'flex', alignItems: 'center', marginLeft: '4px' }}>
        <Info size={13} />
      </button>
      {visible && (
        <div style={{
          position: 'fixed', left: pos.left + 'px', top: pos.top + 'px',
          transform: 'translateY(-100%)', zIndex: 9999, background: '#1F2937', color: '#fff',
          padding: '8px 12px', borderRadius: '8px', fontSize: '12px', maxWidth: '260px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)', lineHeight: 1.6, pointerEvents: 'none',
        }}>
          {text}
        </div>
      )}
    </div>
  )
}

// ─── 엑셀 프리뷰 행 타입 ────────────────────────────
interface ExcelRow {
  question: string
  answer: string
  category: string
  rowNum: number
  hasError: boolean
  errorMsg: string
}

// ─── 카테고리 관리 컴포넌트 (FAQ 탭 내부용) ───────
interface CategoryItem {
  id: string
  name: string
  sort_order: number
  is_active: number
  created_at: string
}

function CategoryManager() {
  const toast = useToast()
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const fetchCategories = async () => {
    setLoading(true)
    try {
      const res = await api.getCategories()
      if (res.success) setCategories(res.data || [])
    } catch {
      toast.error('카테고리를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchCategories() }, [])

  const handleAdd = async () => {
    const name = newName.trim()
    if (!name) return
    setAdding(true)
    try {
      const res = await api.addCategory({ name })
      if (res.success) {
        toast.success(`'${name}' 카테고리가 추가되었습니다.`)
        setNewName('')
        await fetchCategories()
      } else {
        toast.error(res.error || '추가에 실패했습니다.')
      }
    } catch {
      toast.error('추가 중 오류가 발생했습니다.')
    } finally {
      setAdding(false)
    }
  }

  const handleEdit = (cat: CategoryItem) => {
    setEditId(cat.id); setEditName(cat.name)
  }

  const handleEditSave = async (id: string) => {
    const name = editName.trim()
    if (!name) return
    setSaving(true)
    try {
      const res = await api.updateCategory(id, { name })
      if (res.success) {
        toast.success('카테고리가 수정되었습니다.')
        setEditId(null)
        await fetchCategories()
      } else {
        toast.error(res.error || '수정에 실패했습니다.')
      }
    } catch {
      toast.error('수정 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await api.deleteCategory(id)
      if (res.success) {
        toast.success('카테고리가 삭제되었습니다.')
        setDeleteConfirmId(null)
        await fetchCategories()
      } else {
        toast.error(res.error || '삭제에 실패했습니다.')
      }
    } catch {
      toast.error('삭제 중 오류가 발생했습니다.')
    }
  }

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <Tag size={20} color="var(--primary)" />
          <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            카테고리 관리
          </h3>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
          FAQ를 분류할 카테고리를 관리합니다. 삭제 시 해당 카테고리를 사용 중인 FAQ가 없어야 합니다.
        </p>
      </div>

      {/* 카테고리 추가 */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px' }}>새 카테고리 추가</p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="카테고리 이름 입력 (예: 배송, 결제, 환불)"
            style={{ flex: 1, padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'inherit', outline: 'none' }}
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newName.trim()}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', borderRadius: '8px', background: 'var(--primary)', color: '#fff', border: 'none', cursor: adding ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit', opacity: adding || !newName.trim() ? 0.6 : 1 }}
          >
            <Plus size={16} />
            {adding ? '추가 중...' : '추가'}
          </button>
        </div>
      </div>

      {/* 카테고리 목록 */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>카테고리 목록</span>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>총 {categories.length}개</span>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px' }}>불러오는 중...</div>
        ) : categories.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px' }}>
            카테고리가 없습니다. 위에서 추가해보세요!
          </div>
        ) : (
          categories.map((cat, idx) => (
            <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderBottom: idx < categories.length - 1 ? '1px solid var(--border)' : 'none', background: 'var(--bg-secondary)' }}>
              <GripVertical size={16} color="var(--text-secondary)" style={{ flexShrink: 0, cursor: 'grab' }} />

              {editId === cat.id ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleEditSave(cat.id)
                    if (e.key === 'Escape') setEditId(null)
                  }}
                  style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--primary)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'inherit', outline: 'none' }}
                />
              ) : (
                <span style={{ flex: 1, fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>{cat.name}</span>
              )}

              <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                {editId === cat.id ? (
                  <>
                    <button onClick={() => handleEditSave(cat.id)} disabled={saving}
                      style={{ padding: '6px 12px', borderRadius: '6px', background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600, fontFamily: 'inherit' }}>저장</button>
                    <button onClick={() => setEditId(null)}
                      style={{ padding: '6px 12px', borderRadius: '6px', background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>취소</button>
                  </>
                ) : deleteConfirmId === cat.id ? (
                  <>
                    <span style={{ fontSize: '12px', color: '#DC2626', fontWeight: 600, marginRight: '4px' }}>삭제할까요?</span>
                    <button onClick={() => handleDelete(cat.id)}
                      style={{ padding: '6px 12px', borderRadius: '6px', background: '#DC2626', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600, fontFamily: 'inherit' }}>확인</button>
                    <button onClick={() => setDeleteConfirmId(null)}
                      style={{ padding: '6px 12px', borderRadius: '6px', background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>취소</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => handleEdit(cat)}
                      style={{ padding: '6px 8px', borderRadius: '6px', background: 'none', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => setDeleteConfirmId(cat.id)}
                      style={{ padding: '6px 8px', borderRadius: '6px', background: 'none', border: '1px solid #FECACA', cursor: 'pointer', color: '#DC2626', display: 'flex', alignItems: 'center' }}>
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default function FAQPage() {
  const { tenant } = useAuth()
  const toast = useToast()
  const [activeTab, setActiveTab] = useState<'faq' | 'category'>('faq')

  // ── 단일 FAQ 등록 ──
  const [aiToggle, setAiToggle] = useState(true)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [category, setCategory] = useState('일반')
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES)
  const [saving, setSaving] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [refined, setRefined] = useState<{ question: string; answer: string } | null>(null)
  const [editRefined, setEditRefined] = useState<{ question: string; answer: string } | null>(null)
  const [confirmClose, setConfirmClose] = useState(false)

  // ── 엑셀 업로드 ──
  const [excelRows, setExcelRows] = useState<ExcelRow[]>([])
  const [excelFileName, setExcelFileName] = useState('')
  const [dragging, setDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ saved: number; skipped: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── FAQ 목록 ──
  const [docs, setDocs] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filterCat, setFilterCat] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [loadingList, setLoadingList] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [editData, setEditData] = useState<{ question: string; answer: string }>({ question: '', answer: '' })
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const limit = PLAN_LIMIT[tenant?.plan || 'basic'] || 50
  const pct = limit === -1 ? 0 : Math.round((total / limit) * 100)
  const barColor = pct >= 100 ? '#EF4444' : pct >= 80 ? '#F59E0B' : '#4F46E5'

  const fetchDocs = useCallback(async () => {
    setLoadingList(true)
    try {
      const params: any = { page, limit: 20 }
      if (filterCat) params.category = filterCat
      if (searchQuery.trim()) params.search = searchQuery.trim()
      const res = await api.getDocuments(params)
      setDocs(res.data?.items || [])
      setTotal(res.data?.total || 0)
    } catch { /* ignore */ }
    setLoadingList(false)
  }, [page, filterCat, searchQuery])

  useEffect(() => {
    // 카테고리 목록 로딩
    api.getCategories().then((res: any) => {
      const items = Array.isArray(res.data) ? res.data : (res.data?.items || [])
      if (items.length > 0) {
        const names = ['일반', ...items.map((i: any) => i.name).filter((n: string) => n !== '일반')]
        setCategories(names)
      }
    }).catch(() => {})
  }, [])

  useEffect(() => { fetchDocs() }, [fetchDocs])

  const searchTimeout = useRef<any>(null)
  const handleSearch = (v: string) => {
    setSearchQuery(v)
    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => { setPage(1) }, 400)
  }

  // ── 단일 FAQ 저장 ──
  const handleSave = async () => {
    if (question.trim().length < 2) { toast.error('질문은 2자 이상 입력하세요.'); return }
    if (answer.trim().length < 10) { toast.error('답변은 10자 이상 입력하세요.'); return }
    setSaving(true)
    try {
      if (aiToggle) {
        const res = await api.refineDocument(question, answer)
        setRefined({ question: res.data.refined_question, answer: res.data.refined_answer })
        setEditRefined({ question: res.data.refined_question, answer: res.data.refined_answer })
        setPreviewOpen(true)
      } else {
        await embedAndSave({ question, answer }, false)
      }
    } catch (e: any) { toast.error(e.message || '저장 실패') }
    finally { setSaving(false) }
  }

  const embedAndSave = async (q: { question: string; answer: string }, isAi: boolean) => {
    await api.embedDocument({
      original_question: question, original_answer: answer,
      refined_question: q.question, refined_answer: q.answer,
      content: `${q.question}\n${q.answer}`,
      category, language: 'ko', is_ai_refined: isAi,
    })
    toast.success('FAQ가 저장되었습니다! ✨')
    setQuestion(''); setAnswer(''); setPreviewOpen(false); setRefined(null)
    fetchDocs()
  }

  const handlePreviewSave = async () => {
    if (!editRefined) return
    setSaving(true)
    try { await embedAndSave(editRefined, true) }
    catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  // ── 엑셀 템플릿 다운로드 ──
  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new()
    const headerRow = ['질문', '답변', '카테고리']
    const sampleData = [
      ['배송은 얼마나 걸리나요?', '일반적으로 주문 후 2~3 영업일 내에 배송됩니다. 제주 및 도서 지역은 추가로 1~2일이 더 소요됩니다.', '배송'],
      ['환불 신청은 어떻게 하나요?', '마이페이지 > 주문 내역 > 환불 신청 버튼을 클릭하시면 됩니다. 구매 후 7일 이내에만 신청 가능합니다.', '교환반품'],
      ['결제 수단은 어떤 것이 있나요?', '신용카드, 체크카드, 실시간 계좌이체, 카카오페이, 네이버페이, 무통장입금을 지원합니다.', '결제'],
    ]
    const wsData = [headerRow, ...sampleData]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    ws['!cols'] = [{ wch: 40 }, { wch: 70 }, { wch: 15 }]
    XLSX.utils.book_append_sheet(wb, ws, 'FAQ 템플릿')
    XLSX.writeFile(wb, 'FAQ_업로드_템플릿.xlsx')
    toast.success('템플릿 파일이 다운로드되었습니다.')
  }

  // ── 엑셀 파싱 ──
  const parseExcel = (file: File) => {
    if (file.size > 10 * 1024 * 1024) { toast.error('파일 크기는 10MB 이하여야 합니다.'); return }
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'xlsx' && ext !== 'xls') {
      toast.error('엑셀(.xlsx, .xls) 파일만 업로드 가능합니다.')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rawRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

        let startIdx = 0
        if (rawRows.length > 0) {
          const firstRow = rawRows[0]
          const firstCell = String(firstRow[0] || '').toLowerCase().trim()
          if (firstCell === '질문' || firstCell === 'question') startIdx = 1
        }

        const rows: ExcelRow[] = rawRows.slice(startIdx, startIdx + 500).map((row, idx) => {
          const q = String(row[0] || '').trim()
          const a = String(row[1] || '').trim()
          const cat = String(row[2] || '').trim() || '일반'
          const hasError = !q || !a
          const errorMsg = !q && !a ? '질문과 답변 모두 비어있음' : !q ? '질문이 비어있음' : '답변이 비어있음'
          return { question: q, answer: a, category: cat, rowNum: startIdx + idx + 2, hasError, errorMsg }
        }).filter(r => r.question || r.answer)

        if (rows.length === 0) {
          toast.error('파싱된 데이터가 없습니다. 엑셀 형식을 확인하세요.')
          return
        }

        setExcelRows(rows)
        setExcelFileName(file.name)
        setImportResult(null)
        toast.success(`${rows.length}개 행이 인식되었습니다. 아래에서 확인 후 가져오기를 클릭하세요.`)
      } catch {
        toast.error('엑셀 파일 파싱에 실패했습니다. 올바른 형식인지 확인하세요.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) parseExcel(file)
  }

  const handleImport = async () => {
    const validRows = excelRows.filter(r => !r.hasError)
    if (validRows.length === 0) { toast.error('유효한 FAQ가 없습니다.'); return }

    setImporting(true)
    try {
      const res = await api.uploadFaqExcel(
        validRows.map(r => ({ question: r.question, answer: r.answer, category: r.category }))
      )
      const { saved, skipped } = res.data
      setImportResult({ saved, skipped })
      toast.success(res.data.message || `${saved}개 저장 완료!`)
      setExcelRows([])
      setExcelFileName('')
      fetchDocs()
    } catch (e: any) {
      toast.error(e.message || '가져오기 실패')
    } finally {
      setImporting(false)
    }
  }

  const handleToggle = async (doc: any) => {
    setTogglingId(doc.id)
    try {
      await api.toggleDocument(doc.id, !doc.is_active)
      setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, is_active: !d.is_active } : d))
      toast.success(doc.is_active ? 'FAQ가 비활성화되었습니다.' : 'FAQ가 활성화되었습니다.')
    } catch (e: any) { toast.error(e.message || '변경 실패') }
    finally { setTogglingId(null) }
  }

  const startEdit = (doc: any) => {
    setEditId(doc.id)
    setEditData({ question: doc.refined_question || doc.original_question || '', answer: doc.refined_answer || doc.original_answer || '' })
  }

  const saveEdit = async (id: string) => {
    try {
      await api.deleteDocument(id)
      await api.embedDocument({
        original_question: editData.question, original_answer: editData.answer,
        refined_question: editData.question, refined_answer: editData.answer,
        content: `${editData.question}\n${editData.answer}`, category, language: 'ko',
      })
      toast.success('수정되었습니다.')
      setEditId(null); fetchDocs()
    } catch (e: any) { toast.error(e.message) }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.deleteDocument(id)
      toast.success('삭제되었습니다.')
      fetchDocs()
    } catch (e: any) { toast.error(e.message) }
    setDeleteConfirm(null)
  }

  const errorCount = excelRows.filter(r => r.hasError).length
  const validCount = excelRows.filter(r => !r.hasError).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* ── 탭 바 ── */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '2px solid var(--border)' }}>
        <button
          onClick={() => setActiveTab('faq')}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '10px 18px', background: 'none', border: 'none',
            borderBottom: activeTab === 'faq' ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: '-2px', cursor: 'pointer',
            fontSize: '14px', fontWeight: 600, fontFamily: 'inherit',
            color: activeTab === 'faq' ? 'var(--primary)' : 'var(--text-secondary)',
            transition: 'all 0.15s',
          }}
        >
          <BookOpen size={15} />
          FAQ 관리
        </button>
        <button
          onClick={() => setActiveTab('category')}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '10px 18px', background: 'none', border: 'none',
            borderBottom: activeTab === 'category' ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: '-2px', cursor: 'pointer',
            fontSize: '14px', fontWeight: 600, fontFamily: 'inherit',
            color: activeTab === 'category' ? 'var(--primary)' : 'var(--text-secondary)',
            transition: 'all 0.15s',
          }}
        >
          <Tag size={15} />
          카테고리 관리
        </button>
      </div>

      {/* ── 탭 콘텐츠 ── */}
      {activeTab === 'category' ? (
        <CategoryManager />
      ) : (
        <>
          {/* ── 헤더 ── */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>FAQ 관리</h2>
              <span style={{
                fontSize: '13px', fontWeight: 600, padding: '4px 12px', borderRadius: '9999px',
                background: pct >= 100 ? 'rgba(239,68,68,0.1)' : pct >= 80 ? 'rgba(245,158,11,0.1)' : 'rgba(79,70,229,0.1)',
                color: pct >= 100 ? '#DC2626' : pct >= 80 ? '#D97706' : 'var(--primary)',
              }}>
                {limit === -1 ? `${total}개 (무제한)` : `${total} / ${limit}개`}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>AI 자동정리</span>
              <div onClick={() => setAiToggle(!aiToggle)} style={{
                position: 'relative', width: '44px', height: '24px', borderRadius: '9999px', cursor: 'pointer',
                background: aiToggle ? 'var(--primary)' : 'var(--border)', transition: 'background 0.2s',
              }}>
                <span style={{ position: 'absolute', top: '2px', left: '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'transform 0.2s', transform: aiToggle ? 'translateX(20px)' : 'translateX(0)' }} />
              </div>
              <Sparkles size={16} color={aiToggle ? 'var(--primary)' : 'var(--text-secondary)'} />
            </div>
          </div>

          {/* ── 플랜 한도 프로그레스 바 ── */}
          {limit !== -1 && (
            <div style={{ ...S.card, padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>플랜 한도 사용량</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: barColor }}>{pct}% ({total}/{limit}개)</span>
              </div>
              <div style={{ height: '10px', background: 'var(--bg-primary)', borderRadius: '5px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: barColor, borderRadius: '5px', transition: 'width 0.5s ease' }} />
              </div>
              {pct >= 100 && (
                <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px' }}>
                  <AlertTriangle size={15} color="#DC2626" />
                  <p style={{ fontSize: '13px', color: '#991B1B', fontWeight: 600 }}>FAQ 한도 초과! 플랜을 업그레이드해야 새 FAQ를 추가할 수 있습니다.</p>
                </div>
              )}
              {pct >= 80 && pct < 100 && (
                <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: '#FEFCE8', border: '1px solid #FEF08A', borderRadius: '8px' }}>
                  <AlertTriangle size={15} color="#D97706" />
                  <p style={{ fontSize: '13px', color: '#854D0E', fontWeight: 600 }}>한도의 80% 이상 사용했습니다. 곧 업그레이드가 필요할 수 있습니다.</p>
                </div>
              )}
            </div>
          )}

          {/* ── 단일 FAQ 등록 폼 ── */}
          <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>새 FAQ 등록</h3>
            <div>
              <label style={S.label}>질문 <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>(2~500자)</span></label>
              <textarea value={question} onChange={e => setQuestion(e.target.value)} maxLength={500}
                style={{ ...S.textarea, height: '72px' }} placeholder="고객이 자주 묻는 질문을 입력하세요." />
              <p style={{ fontSize: '11px', textAlign: 'right', color: 'var(--text-secondary)', marginTop: '4px' }}>{question.length}/500</p>
            </div>
            <div>
              <label style={S.label}>답변 <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>(10~3000자)</span></label>
              <textarea value={answer} onChange={e => setAnswer(e.target.value)} maxLength={3000}
                style={{ ...S.textarea, height: '100px' }} placeholder="답변을 입력하세요." />
              <p style={{ fontSize: '11px', textAlign: 'right', color: 'var(--text-secondary)', marginTop: '4px' }}>{answer.length}/3000</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '140px' }}>
                <label style={S.label}>카테고리</label>
                <select value={category} onChange={e => setCategory(e.target.value)} style={S.select}>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <button onClick={handleSave} disabled={saving || pct >= 100}
              style={{ ...S.btnPrimary, opacity: saving || pct >= 100 ? 0.5 : 1, cursor: saving || pct >= 100 ? 'not-allowed' : 'pointer', alignSelf: 'flex-start' }}>
              {saving ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />처리 중...</> : <><Save size={16} />저장{aiToggle ? ' (AI 정리 후 미리보기)' : ''}</>}
            </button>
          </div>

          {/* ── 엑셀 업로드 섹션 ── */}
          <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileSpreadsheet size={18} color="var(--primary)" />
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>엑셀 일괄 업로드</h3>
                <Tooltip text="엑셀 A열에 질문, B열에 답변, C열에 카테고리를 입력 후 업로드하세요. 템플릿을 다운로드하면 더 편리합니다. 한번에 최대 500개까지 업로드 가능합니다." />
              </div>
              <button
                onClick={handleDownloadTemplate}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#059669', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: '38px' }}
              >
                <Download size={14} />
                템플릿 다운로드
              </button>
            </div>

            <div style={{ background: 'rgba(79,70,229,0.05)', border: '1px solid rgba(79,70,229,0.15)', borderRadius: '10px', padding: '12px 16px' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '6px' }}>📋 엑셀 형식 안내</p>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {[
                  { col: 'A열 (필수)', desc: '질문', color: '#4F46E5' },
                  { col: 'B열 (필수)', desc: '답변', color: '#4F46E5' },
                  { col: 'C열 (선택)', desc: '카테고리 (없으면 "일반" 자동 설정)', color: '#6B7280' },
                ].map(item => (
                  <div key={item.col} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: item.color, background: `${item.color}15`, padding: '2px 8px', borderRadius: '4px' }}>{item.col}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{item.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${dragging ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: '12px', padding: '36px', textAlign: 'center', cursor: 'pointer',
                background: dragging ? 'rgba(79,70,229,0.04)' : 'var(--bg-primary)',
                transition: 'all 0.2s',
              }}
            >
              <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) { parseExcel(f); e.target.value = '' } }} />
              <FileSpreadsheet size={36} color={dragging ? 'var(--primary)' : 'var(--text-secondary)'} style={{ display: 'block', margin: '0 auto 12px' }} />
              <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px', fontSize: '15px' }}>
                {excelFileName ? `📄 ${excelFileName}` : '엑셀 파일을 드래그하거나 클릭하여 업로드'}
              </p>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                .xlsx, .xls · 최대 10MB · 최대 500개
              </p>
            </div>

            {excelRows.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Eye size={15} color="var(--primary)" />
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>미리보기</span>
                  </div>
                  <span style={{ fontSize: '13px', padding: '3px 10px', borderRadius: '9999px', background: 'rgba(5,150,105,0.1)', color: '#059669', fontWeight: 600 }}>
                    ✓ 정상 {validCount}개
                  </span>
                  {errorCount > 0 && (
                    <span style={{ fontSize: '13px', padding: '3px 10px', borderRadius: '9999px', background: 'rgba(220,38,38,0.1)', color: '#DC2626', fontWeight: 600 }}>
                      ⚠ 오류 {errorCount}개
                    </span>
                  )}
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>총 {excelRows.length}행 인식</span>
                </div>

                {errorCount > 0 && (
                  <div style={{ padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertTriangle size={14} color="#DC2626" />
                    <span style={{ fontSize: '13px', color: '#991B1B', fontWeight: 600 }}>
                      빨간색으로 표시된 {errorCount}개 행은 질문 또는 답변이 비어있어 가져오기에서 제외됩니다.
                    </span>
                  </div>
                )}

                <div style={{ overflowX: 'auto', maxHeight: '320px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '10px' }}>
                  <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', minWidth: '500px' }}>
                    <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 1 }}>
                      <tr>
                        {['행', '질문', '답변', '카테고리', '상태'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {excelRows.map((row, i) => (
                        <tr key={i} style={{ background: row.hasError ? 'rgba(239,68,68,0.04)' : 'transparent', borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px 12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>#{row.rowNum}</td>
                          <td style={{ padding: '8px 12px', maxWidth: '200px' }}>
                            {row.question ? (
                              <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>{row.question}</span>
                            ) : (
                              <span style={{ color: '#DC2626', fontStyle: 'italic' }}>비어있음</span>
                            )}
                          </td>
                          <td style={{ padding: '8px 12px', maxWidth: '280px' }}>
                            {row.answer ? (
                              <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{row.answer}</span>
                            ) : (
                              <span style={{ color: '#DC2626', fontStyle: 'italic' }}>비어있음</span>
                            )}
                          </td>
                          <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                            <Badge variant="gray">{row.category || '일반'}</Badge>
                          </td>
                          <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                            {row.hasError ? (
                              <span style={{ fontSize: '11px', color: '#DC2626', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <AlertTriangle size={11} />{row.errorMsg}
                              </span>
                            ) : (
                              <span style={{ fontSize: '11px', color: '#059669', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Check size={11} />정상
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    onClick={handleImport}
                    disabled={importing || validCount === 0 || pct >= 100}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '10px 20px', background: validCount > 0 && pct < 100 ? 'var(--primary)' : '#9CA3AF',
                      color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
                      cursor: importing || validCount === 0 || pct >= 100 ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit', minHeight: '42px',
                    }}
                  >
                    {importing ? (
                      <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />가져오는 중...</>
                    ) : (
                      <><Upload size={16} />{validCount}개 FAQ 가져오기</>
                    )}
                  </button>
                  <button
                    onClick={() => { setExcelRows([]); setExcelFileName(''); setImportResult(null) }}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', minHeight: '42px' }}
                  >
                    <X size={14} />초기화
                  </button>
                  {errorCount > 0 && validCount > 0 && (
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      * 오류 {errorCount}개는 제외하고 {validCount}개만 저장됩니다
                    </span>
                  )}
                </div>
              </div>
            )}

            {importResult && (
              <div style={{ padding: '12px 16px', background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.25)', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Check size={16} color="#059669" />
                <div>
                  <p style={{ fontSize: '14px', fontWeight: 700, color: '#059669' }}>가져오기 완료!</p>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {importResult.saved}개 저장
                    {importResult.skipped > 0 && `, ${importResult.skipped}개는 중복으로 건너뜀`}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ── FAQ 목록 ── */}
          <div style={S.card}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>FAQ 목록</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '200px', position: 'relative' }}>
                <Search size={15} color="var(--text-secondary)" style={{ position: 'absolute', left: '12px', pointerEvents: 'none' }} />
                <input type="text" value={searchQuery} onChange={e => handleSearch(e.target.value)}
                  placeholder="질문 또는 답변 검색..."
                  style={{ ...S.input, paddingLeft: '36px', flex: 1, minHeight: '38px', fontSize: '13px' }} />
                {searchQuery && (
                  <button onClick={() => { setSearchQuery(''); setPage(1) }} style={{ position: 'absolute', right: '10px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px', display: 'flex', alignItems: 'center' }}>
                    <X size={14} />
                  </button>
                )}
              </div>
              <select value={filterCat} onChange={e => { setFilterCat(e.target.value); setPage(1) }}
                style={{ ...S.select, minWidth: '120px', width: 'auto', minHeight: '38px' }}>
                <option value="">전체 카테고리</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {loadingList ? <SkeletonTable /> : docs.length === 0 ? (
              <EmptyState
                title={searchQuery ? `"${searchQuery}" 검색 결과 없음` : '등록된 FAQ가 없습니다'}
                description={searchQuery ? '다른 키워드로 검색해보세요.' : '위 폼에서 FAQ를 등록하거나 엑셀로 일괄 업로드하세요.'}
                icon={<BookOpen size={24} color="var(--text-secondary)" />}
              />
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse', minWidth: '500px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {['상태', '질문', '카테고리', '등록일', ''].map(h => (
                          <th key={h} style={{ textAlign: 'left', paddingBottom: '10px', paddingRight: '12px', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {docs.map((doc: any) => (
                        <tr key={doc.id} style={{ borderBottom: '1px solid var(--border)', opacity: doc.is_active === false ? 0.5 : 1 }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-primary)'}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                          {editId === doc.id ? (
                            <td colSpan={5} style={{ padding: '12px 0' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <textarea value={editData.question} onChange={e => setEditData(p => ({ ...p, question: e.target.value }))}
                                  style={{ ...S.textarea, height: '56px', fontSize: '12px' }} />
                                <textarea value={editData.answer} onChange={e => setEditData(p => ({ ...p, answer: e.target.value }))}
                                  style={{ ...S.textarea, height: '72px', fontSize: '12px' }} />
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button onClick={() => saveEdit(doc.id)} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', background: '#059669', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', minHeight: '36px', fontFamily: 'inherit' }}><Check size={12} />저장</button>
                                  <button onClick={() => setEditId(null)} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', minHeight: '36px', fontFamily: 'inherit' }}><X size={12} />취소</button>
                                </div>
                              </div>
                            </td>
                          ) : (
                            <>
                              <td style={{ padding: '12px 12px 12px 0', width: '50px' }}>
                                <button onClick={() => handleToggle(doc)} disabled={togglingId === doc.id}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', color: doc.is_active !== false ? '#059669' : 'var(--text-secondary)' }}
                                  title={doc.is_active !== false ? '활성 (클릭하여 비활성화)' : '비활성 (클릭하여 활성화)'}>
                                  {togglingId === doc.id
                                    ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                                    : doc.is_active !== false ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                                </button>
                              </td>
                              <td style={{ padding: '12px 12px 12px 0', maxWidth: '280px' }}>
                                <p style={{ fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.refined_question || doc.original_question}</p>
                                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>{doc.refined_answer || doc.original_answer}</p>
                              </td>
                              <td style={{ padding: '12px 12px 12px 0' }}><Badge variant="gray">{doc.category}</Badge></td>
                              <td style={{ padding: '12px 12px 12px 0', fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{doc.created_at?.slice(0, 10)}</td>
                              <td style={{ padding: '12px 0' }}>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                  <button onClick={() => startEdit(doc)} style={{ padding: '6px', borderRadius: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', minWidth: '36px', minHeight: '36px', justifyContent: 'center' }}><Pencil size={14} /></button>
                                  <button onClick={() => setDeleteConfirm(doc.id)} style={{ padding: '6px', borderRadius: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', display: 'flex', alignItems: 'center', minWidth: '36px', minHeight: '36px', justifyContent: 'center' }}><Trash2 size={14} /></button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
                  <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                    style={{ ...S.btnSecondary, padding: '7px 14px', minHeight: '36px', opacity: page <= 1 ? 0.4 : 1 }}>이전</button>
                  <span style={{ display: 'flex', alignItems: 'center', fontSize: '13px', color: 'var(--text-secondary)', padding: '0 8px' }}>{page} / {Math.max(1, Math.ceil(total / 20))}</span>
                  <button disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(p => p + 1)}
                    style={{ ...S.btnSecondary, padding: '7px 14px', minHeight: '36px', opacity: page >= Math.ceil(total / 20) ? 0.4 : 1 }}>다음</button>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* ── AI 미리보기 모달 ── */}
      <Modal open={previewOpen} onClose={() => setConfirmClose(true)} title="✨ AI 자동정리 미리보기" size="lg">
        {refined && editRefined && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              <div>
                <h4 style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>원본</h4>
                <div style={{ background: 'var(--bg-primary)', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{question}</p>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{answer}</p>
                </div>
              </div>
              <div>
                <h4 style={{ fontSize: '11px', fontWeight: 600, color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}><Sparkles size={12} />AI 정리본</h4>
                <div style={{ background: 'rgba(79,70,229,0.05)', border: '1px solid rgba(79,70,229,0.15)', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <textarea value={editRefined.question} onChange={e => setEditRefined(p => p ? { ...p, question: e.target.value } : p)}
                    style={{ ...S.textarea, background: 'transparent', border: 'none', borderBottom: '1px solid rgba(79,70,229,0.2)', borderRadius: 0, paddingLeft: 0, paddingRight: 0, height: '56px', fontSize: '14px', fontWeight: 600 }} />
                  <textarea value={editRefined.answer} onChange={e => setEditRefined(p => p ? { ...p, answer: e.target.value } : p)}
                    style={{ ...S.textarea, background: 'transparent', border: 'none', borderRadius: 0, paddingLeft: 0, paddingRight: 0, height: '90px', fontSize: '13px' }} />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handlePreviewSave} disabled={saving} style={{ ...S.btnPrimary, flex: 1, opacity: saving ? 0.7 : 1 }}>
                {saving ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />저장 중...</> : <><Check size={16} />이대로 저장</>}
              </button>
              <button onClick={() => setConfirmClose(true)} style={{ ...S.btnSecondary, flex: 1 }}>취소</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={confirmClose} onClose={() => setConfirmClose(false)} title="저장을 취소할까요?" size="sm" hideClose>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>미리보기를 닫으면 저장되지 않습니다.</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => { setConfirmClose(false); setPreviewOpen(false) }} style={{ ...S.btnDanger, flex: 1 }}>취소하기</button>
            <button onClick={() => setConfirmClose(false)} style={{ ...S.btnSecondary, flex: 1 }}>계속 수정</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="FAQ를 삭제할까요?" size="sm" hideClose>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>삭제된 FAQ는 복구할 수 없습니다.</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => handleDelete(deleteConfirm!)} style={{ ...S.btnDanger, flex: 1 }}>삭제</button>
            <button onClick={() => setDeleteConfirm(null)} style={{ ...S.btnSecondary, flex: 1 }}>취소</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
