import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Upload, Sparkles, Save, Trash2, Pencil, X, Check, Loader2, AlertTriangle, BookOpen } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../hooks/useToast'
import ToastContainer from '../components/Toast'
import Modal from '../components/Modal'
import Badge from '../components/Badge'
import EmptyState from '../components/EmptyState'
import { SkeletonTable } from '../components/Skeleton'
import { S } from '../lib/ui'

const CATEGORIES = ['일반','배송','결제','교환반품','기타']
const LANGUAGES = [{ v:'ko', l:'한국어' },{ v:'en', l:'영어' },{ v:'ja', l:'일본어' }]
const PLAN_LIMIT: Record<string,number> = { basic:50, pro:200, master:-1 }

export default function FAQPage() {
  const { tenant } = useAuth()
  const toast = useToast()

  const [aiToggle, setAiToggle] = useState(true)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [category, setCategory] = useState('일반')
  const [language, setLanguage] = useState('ko')
  const [saving, setSaving] = useState(false)

  const [previewOpen, setPreviewOpen] = useState(false)
  const [refined, setRefined] = useState<{question:string;answer:string}|null>(null)
  const [editRefined, setEditRefined] = useState<{question:string;answer:string}|null>(null)
  const [confirmClose, setConfirmClose] = useState(false)

  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [uploadFailed, setUploadFailed] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const [docs, setDocs] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filterCat, setFilterCat] = useState('')
  const [loadingList, setLoadingList] = useState(true)
  const [editId, setEditId] = useState<string|null>(null)
  const [editData, setEditData] = useState<{question:string;answer:string}>({question:'',answer:''})
  const [deleteConfirm, setDeleteConfirm] = useState<string|null>(null)

  const limit = PLAN_LIMIT[tenant?.plan || 'basic'] || 50
  const pct = limit === -1 ? 0 : Math.round((total / limit) * 100)

  const fetchDocs = useCallback(async () => {
    setLoadingList(true)
    try {
      const params: any = { page, limit: 20 }
      if (filterCat) params.category = filterCat
      const res = await api.getDocuments(params)
      setDocs(res.data?.items || [])
      setTotal(res.data?.total || 0)
    } catch {}
    setLoadingList(false)
  }, [page, filterCat])

  useEffect(() => { fetchDocs() }, [fetchDocs])

  const handleSave = async () => {
    if (question.trim().length < 2) { toast.error('질문은 2자 이상 입력하세요.'); return }
    if (answer.trim().length < 10) { toast.error('답변은 10자 이상 입력하세요.'); return }
    setSaving(true)
    try {
      if (aiToggle) {
        const res = await api.refineDocument(question, answer)
        setRefined(res.data.refined)
        setEditRefined({ ...res.data.refined })
        setPreviewOpen(true)
      } else {
        await embedAndSave({ question, answer }, false)
      }
    } catch (e: any) {
      toast.error(e.message || '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const embedAndSave = async (q: {question:string;answer:string}, isAi: boolean) => {
    await api.embedDocument({
      original_question: question, original_answer: answer,
      refined_question: q.question, refined_answer: q.answer,
      content: `${q.question}\n${q.answer}`,
      category, language, is_ai_refined: isAi
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

  const processFile = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) { toast.error('파일 크기는 10MB 이하여야 합니다.'); return }
    setUploading(true); setUploadFailed([])
    const ext = file.name.split('.').pop()?.toLowerCase()
    try {
      let rows: {question:string;answer:string}[] = []
      if (ext === 'csv' || ext === 'txt') {
        const text = await file.text()
        rows = parseCSV(text)
      } else {
        toast.error('CSV 또는 TXT 파일만 지원합니다.'); setUploading(false); return
      }
      const failed: string[] = []
      for (let i = 0; i < rows.length; i++) {
        setUploadProgress(`${rows.length}개 중 ${i+1}개 처리 중...`)
        try {
          const ref = aiToggle ? await api.refineDocument(rows[i].question, rows[i].answer) : { data: { refined: rows[i] } }
          await api.embedDocument({
            original_question: rows[i].question, original_answer: rows[i].answer,
            refined_question: ref.data.refined.question, refined_answer: ref.data.refined.answer,
            content: `${ref.data.refined.question}\n${ref.data.refined.answer}`,
            category, language, is_ai_refined: aiToggle
          })
        } catch { failed.push(rows[i].question.slice(0, 30) + '...') }
      }
      if (failed.length > 0) {
        setUploadFailed(failed)
        toast.error(`${rows.length - failed.length}개 저장, ${failed.length}개 실패`)
      } else {
        toast.success(`${rows.length}개 FAQ가 모두 저장되었습니다!`)
      }
      fetchDocs()
    } catch (e: any) { toast.error(e.message) }
    finally { setUploading(false); setUploadProgress('') }
  }

  function parseCSV(text: string): {question:string;answer:string}[] {
    return text.split('\n').slice(1)
      .map(line => { const cols = line.split(','); return { question: cols[0]?.trim(), answer: cols[1]?.trim() } })
      .filter(r => r.question && r.answer)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  const handleDelete = async (id: string) => {
    try {
      await api.deleteDocument(id)
      toast.success('삭제되었습니다.')
      fetchDocs()
    } catch (e: any) { toast.error(e.message) }
    setDeleteConfirm(null)
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
        content: `${editData.question}\n${editData.answer}`, category, language
      })
      toast.success('수정되었습니다.')
      setEditId(null); fetchDocs()
    } catch (e: any) { toast.error(e.message) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast}/>

      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>FAQ 관리</h2>
          <span style={{
            fontSize: '13px', fontWeight: 600, padding: '4px 12px', borderRadius: '9999px',
            background: pct >= 100 ? 'rgba(239,68,68,0.1)' : pct >= 90 ? 'rgba(245,158,11,0.1)' : 'rgba(79,70,229,0.1)',
            color: pct >= 100 ? '#DC2626' : pct >= 90 ? '#D97706' : 'var(--primary)',
          }}>
            {limit === -1 ? `${total}개 (무제한)` : `${total} / ${limit}개`}
          </span>
        </div>
        {/* AI Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>AI 자동정리</span>
          <div onClick={() => setAiToggle(!aiToggle)} style={{
            position: 'relative', width: '44px', height: '24px', borderRadius: '9999px', cursor: 'pointer',
            background: aiToggle ? 'var(--primary)' : 'var(--border)', transition: 'background 0.2s',
          }}>
            <span style={{ position: 'absolute', top: '2px', left: '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'transform 0.2s', transform: aiToggle ? 'translateX(20px)' : 'translateX(0)' }}/>
          </div>
          <Sparkles size={16} color={aiToggle ? 'var(--primary)' : 'var(--text-secondary)'}/>
        </div>
      </div>

      {/* FAQ 입력 폼 */}
      <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>새 FAQ 등록</h3>
        <div>
          <label style={S.label}>질문 <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>(2~500자)</span></label>
          <textarea value={question} onChange={e => setQuestion(e.target.value)} maxLength={500}
            style={{ ...S.textarea, height: '72px' }} placeholder="고객이 자주 묻는 질문을 입력하세요."/>
          <p style={{ fontSize: '11px', textAlign: 'right', color: 'var(--text-secondary)', marginTop: '4px' }}>{question.length}/500</p>
        </div>
        <div>
          <label style={S.label}>답변 <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>(10~3000자)</span></label>
          <textarea value={answer} onChange={e => setAnswer(e.target.value)} maxLength={3000}
            style={{ ...S.textarea, height: '100px' }} placeholder="답변을 입력하세요."/>
          <p style={{ fontSize: '11px', textAlign: 'right', color: 'var(--text-secondary)', marginTop: '4px' }}>{answer.length}/3000</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '140px' }}>
            <label style={S.label}>카테고리</label>
            <select value={category} onChange={e => setCategory(e.target.value)} style={S.select}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: '140px' }}>
            <label style={S.label}>언어</label>
            <select value={language} onChange={e => setLanguage(e.target.value)} style={S.select}>
              {LANGUAGES.map(l => <option key={l.v} value={l.v}>{l.l}</option>)}
            </select>
          </div>
        </div>
        <button onClick={handleSave} disabled={saving || pct >= 100}
          style={{ ...S.btnPrimary, opacity: saving || pct >= 100 ? 0.5 : 1, cursor: saving || pct >= 100 ? 'not-allowed' : 'pointer', alignSelf: 'flex-start' }}>
          {saving ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }}/>처리 중...</> : <><Save size={16}/>저장{aiToggle ? ' (AI 정리 후 미리보기)' : ''}</>}
        </button>
        {pct >= 100 && (
          <p style={{ fontSize: '12px', color: '#DC2626', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <AlertTriangle size={12}/> FAQ 한도 초과. 플랜을 업그레이드하세요.
          </p>
        )}
      </div>

      {/* 파일 업로드 */}
      <div style={S.card}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>파일 업로드 (CSV/TXT)</h3>
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: '12px', padding: '40px', textAlign: 'center', cursor: 'pointer',
            background: dragging ? 'rgba(79,70,229,0.04)' : 'var(--bg-primary)',
            transition: 'all 0.2s',
          }}>
          <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f) }}/>
          {uploading ? (
            <div>
              <Loader2 size={32} color="var(--primary)" style={{ animation: 'spin 1s linear infinite', display: 'block', margin: '0 auto 12px' }}/>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{uploadProgress}</p>
            </div>
          ) : (
            <>
              <Upload size={32} color="var(--text-secondary)" style={{ display: 'block', margin: '0 auto 12px' }}/>
              <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>파일을 드래그하거나 클릭하여 업로드</p>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>CSV, TXT · 최대 10MB · 1열=질문, 2열=답변</p>
            </>
          )}
        </div>
        {uploadFailed.length > 0 && (
          <div style={{ marginTop: '12px', padding: '12px 16px', borderRadius: '10px', background: '#FEF2F2', border: '1px solid #FECACA' }}>
            <p style={{ fontSize: '13px', color: '#991B1B', fontWeight: 600, marginBottom: '8px' }}>실패한 항목:</p>
            {uploadFailed.map((f,i) => <p key={i} style={{ fontSize: '12px', color: '#DC2626' }}>• {f}</p>)}
          </div>
        )}
      </div>

      {/* FAQ 목록 */}
      <div style={S.card}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>FAQ 목록</h3>
          <select value={filterCat} onChange={e => { setFilterCat(e.target.value); setPage(1) }}
            style={{ ...S.select, minWidth: '120px', width: 'auto', minHeight: '38px' }}>
            <option value="">전체 카테고리</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {loadingList ? <SkeletonTable/> : docs.length === 0 ? (
          <EmptyState title="등록된 FAQ가 없습니다" description="위 폼에서 첫 FAQ를 등록해보세요." icon={<BookOpen size={24} color="var(--text-secondary)"/>}/>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse', minWidth: '500px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['질문','카테고리','등록일',''].map(h => (
                      <th key={h} style={{ textAlign: 'left', paddingBottom: '10px', paddingRight: '12px', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {docs.map((doc: any) => (
                    <tr key={doc.id} style={{ borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-primary)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                      {editId === doc.id ? (
                        <td colSpan={4} style={{ padding: '12px 0' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <textarea value={editData.question} onChange={e => setEditData(p => ({...p, question: e.target.value}))}
                              style={{ ...S.textarea, height: '56px', fontSize: '12px' }}/>
                            <textarea value={editData.answer} onChange={e => setEditData(p => ({...p, answer: e.target.value}))}
                              style={{ ...S.textarea, height: '72px', fontSize: '12px' }}/>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button onClick={() => saveEdit(doc.id)} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', background: '#059669', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', minHeight: '36px', fontFamily: 'inherit' }}><Check size={12}/>저장</button>
                              <button onClick={() => setEditId(null)} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', minHeight: '36px', fontFamily: 'inherit' }}><X size={12}/>취소</button>
                            </div>
                          </div>
                        </td>
                      ) : (
                        <>
                          <td style={{ padding: '12px 12px 12px 0', maxWidth: '280px' }}>
                            <p style={{ fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.refined_question || doc.original_question}</p>
                            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>{doc.refined_answer || doc.original_answer}</p>
                          </td>
                          <td style={{ padding: '12px 12px 12px 0' }}><Badge variant="gray">{doc.category}</Badge></td>
                          <td style={{ padding: '12px 12px 12px 0', fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{doc.created_at?.slice(0,10)}</td>
                          <td style={{ padding: '12px 0' }}>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button onClick={() => startEdit(doc)} style={{ padding: '6px', borderRadius: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', minWidth: '36px', minHeight: '36px', justifyContent: 'center' }}><Pencil size={14}/></button>
                              <button onClick={() => setDeleteConfirm(doc.id)} style={{ padding: '6px', borderRadius: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', display: 'flex', alignItems: 'center', minWidth: '36px', minHeight: '36px', justifyContent: 'center' }}><Trash2 size={14}/></button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
              <button disabled={page<=1} onClick={() => setPage(p=>p-1)}
                style={{ ...S.btnSecondary, padding: '7px 14px', minHeight: '36px', opacity: page<=1 ? 0.4 : 1 }}>이전</button>
              <span style={{ display: 'flex', alignItems: 'center', fontSize: '13px', color: 'var(--text-secondary)', padding: '0 8px' }}>{page} / {Math.max(1,Math.ceil(total/20))}</span>
              <button disabled={page>=Math.ceil(total/20)} onClick={() => setPage(p=>p+1)}
                style={{ ...S.btnSecondary, padding: '7px 14px', minHeight: '36px', opacity: page>=Math.ceil(total/20) ? 0.4 : 1 }}>다음</button>
            </div>
          </>
        )}
      </div>

      {/* AI 미리보기 모달 */}
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
                <h4 style={{ fontSize: '11px', fontWeight: 600, color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}><Sparkles size={12}/>AI 정리본</h4>
                <div style={{ background: 'rgba(79,70,229,0.05)', border: '1px solid rgba(79,70,229,0.15)', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <textarea value={editRefined.question} onChange={e => setEditRefined(p => p ? {...p, question: e.target.value} : p)}
                    style={{ ...S.textarea, background: 'transparent', border: 'none', borderBottom: '1px solid rgba(79,70,229,0.2)', borderRadius: 0, paddingLeft: 0, paddingRight: 0, height: '56px', fontSize: '14px', fontWeight: 600 }}/>
                  <textarea value={editRefined.answer} onChange={e => setEditRefined(p => p ? {...p, answer: e.target.value} : p)}
                    style={{ ...S.textarea, background: 'transparent', border: 'none', borderRadius: 0, paddingLeft: 0, paddingRight: 0, height: '90px', fontSize: '13px' }}/>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--primary)', marginTop: '4px' }}>✏️ 직접 수정도 가능합니다</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handlePreviewSave} disabled={saving}
                style={{ ...S.btnPrimary, flex: 1, opacity: saving ? 0.7 : 1 }}>
                {saving ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }}/>저장 중...</> : <><Check size={16}/>이대로 저장</>}
              </button>
              <button onClick={() => setConfirmClose(true)}
                style={{ ...S.btnSecondary, flex: 1 }}>취소</button>
            </div>
          </div>
        )}
      </Modal>

      {/* 닫기 확인 */}
      <Modal open={confirmClose} onClose={() => setConfirmClose(false)} title="저장을 취소할까요?" size="sm" hideClose>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>미리보기를 닫으면 저장되지 않습니다.</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => { setConfirmClose(false); setPreviewOpen(false) }}
              style={{ ...S.btnDanger, flex: 1 }}>취소하기</button>
            <button onClick={() => setConfirmClose(false)}
              style={{ ...S.btnSecondary, flex: 1 }}>계속 수정</button>
          </div>
        </div>
      </Modal>

      {/* 삭제 확인 */}
      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="FAQ를 삭제할까요?" size="sm" hideClose>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>삭제된 FAQ는 복구할 수 없습니다.</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              style={{ ...S.btnDanger, flex: 1 }}>삭제</button>
            <button onClick={() => setDeleteConfirm(null)}
              style={{ ...S.btnSecondary, flex: 1 }}>취소</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
