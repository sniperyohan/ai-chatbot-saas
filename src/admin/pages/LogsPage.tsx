import React, { useState, useEffect, useCallback } from 'react'
import { Search, Filter, X, MessageSquare, BookmarkPlus, ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '../lib/api'
import { useToast } from '../hooks/useToast'
import ToastContainer from '../components/Toast'
import Modal from '../components/Modal'
import Badge from '../components/Badge'
import EmptyState from '../components/EmptyState'
import { SkeletonTable } from '../components/Skeleton'
import { S } from '../lib/ui'

const CH_LABELS: Record<string,string> = { web:'웹', kakao:'카카오', naver:'네이버', messenger:'메신저' }
const IT_LABELS: Record<string,string> = { FAQ_INQUIRY:'FAQ', ORDER_INQUIRY:'주문조회', GREETING:'인사', RESERVATION:'예약', PAYMENT:'결제', COMPLAINT:'불만', OTHER:'기타' }
const IT_VARIANTS: Record<string, any> = { FAQ_INQUIRY:'indigo', ORDER_INQUIRY:'blue', GREETING:'green', RESERVATION:'yellow', PAYMENT:'green', COMPLAINT:'red', OTHER:'gray' }

export default function LogsPage() {
  const toast = useToast()
  const [logs, setLogs] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any>(null)

  // Filters
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [channel, setChannel] = useState('')
  const [intent, setIntent] = useState('')

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params: any = { page, limit: 20 }
      if (dateFrom) params.date_from = dateFrom
      if (dateTo) params.date_to = dateTo
      if (channel) params.channel = channel
      if (intent) params.intent = intent
      const res = await api.getLogs(params)
      setLogs(res.data?.items || [])
      setTotal(res.data?.total || 0)
    } catch {}
    setLoading(false)
  }, [page, dateFrom, dateTo, channel, intent])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const addToFAQ = async (log: any) => {
    try {
      const userMsg = log.user_message || ''
      const botMsg = log.bot_response || log.bot_answer || ''

      if (!userMsg.trim() || !botMsg.trim()) {
        toast.error('질문 또는 답변이 비어 있습니다')
        return
      }

      const ref = await api.refineDocument(userMsg, botMsg)
      const refinedQ = ref?.data?.refined_question || userMsg
      const refinedA = ref?.data?.refined_answer || botMsg

      await api.embedDocument({
        original_question: userMsg,
        original_answer: botMsg,
        refined_question: refinedQ,
        refined_answer: refinedA,
        content: `${refinedQ}\n${refinedA}`,
        category: '일반',
        language: log.detected_language || 'ko',
        is_ai_refined: true,
      })
      toast.success('FAQ에 추가되었습니다!')
      setSelected(null)
      fetchLogs()
    } catch (e: any) {
      console.error('[addToFAQ] error:', e)
      toast.error(e.message || 'FAQ 추가 실패')
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / 20))

  const inputStyle: React.CSSProperties = { ...S.input, minHeight: '38px', fontSize: '13px' }
  const selectStyle: React.CSSProperties = { ...S.select, minHeight: '38px', fontSize: '13px' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast}/>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>대화 로그</h2>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>총 {total.toLocaleString()}건</span>
      </div>

      {/* Filters */}
      <div style={{ ...S.card, padding: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }} style={inputStyle} placeholder="시작일"/>
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }} style={inputStyle} placeholder="종료일"/>
          <select value={channel} onChange={e => { setChannel(e.target.value); setPage(1) }} style={selectStyle}>
            <option value="">전체 채널</option>
            {Object.entries(CH_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={intent} onChange={e => { setIntent(e.target.value); setPage(1) }} style={selectStyle}>
            <option value="">전체 의도</option>
            {Object.entries(IT_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {(dateFrom || dateTo || channel || intent) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); setChannel(''); setIntent(''); setPage(1) }}
              style={{ ...S.btnSecondary, fontSize: '13px', padding: '8px 14px', minHeight: '38px' }}>
              <X size={14}/> 초기화
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={S.card}>
        {loading ? <SkeletonTable/> : logs.length === 0 ? (
          <EmptyState title="대화 기록이 없습니다" description="조건에 맞는 대화 기록을 찾을 수 없습니다."/>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse', minWidth: '640px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['시간(KST)','채널','질문','의도',''].map(h => (
                      <th key={h} style={{ textAlign: 'left', paddingBottom: '10px', paddingRight: '12px', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log: any) => (
                    <tr key={log.id} onClick={() => setSelected(log)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-primary)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                      <td style={{ padding: '12px 12px 12px 0', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: '12px' }}>{log.created_at_kst?.slice(0,16)?.replace('T',' ')}</td>
                      <td style={{ padding: '12px 12px 12px 0' }}><Badge variant="indigo">{CH_LABELS[log.channel]||log.channel}</Badge></td>
                      <td style={{ padding: '12px 12px 12px 0', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>{log.user_message}</td>
                      <td style={{ padding: '12px 12px 12px 0' }}><Badge variant={IT_VARIANTS[log.intent]||'gray'}>{IT_LABELS[log.intent]||log.intent}</Badge></td>
                      <td style={{ padding: '12px 0' }}>
                        <button onClick={e => { e.stopPropagation(); addToFAQ(log) }}
                          style={{ background: 'rgba(79,70,229,0.08)', border: '1px solid rgba(79,70,229,0.2)', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                          <BookmarkPlus size={12}/>FAQ 추가
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page <= 1}
                style={{ ...S.btnSecondary, padding: '8px 12px', minHeight: '36px', opacity: page <= 1 ? 0.4 : 1 }}>
                <ChevronLeft size={16}/>
              </button>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '0 8px' }}>{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page >= totalPages}
                style={{ ...S.btnSecondary, padding: '8px 12px', minHeight: '36px', opacity: page >= totalPages ? 0.4 : 1 }}>
                <ChevronRight size={16}/>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Detail Modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title="대화 상세" size="md">
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Meta */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <Badge variant="indigo">{CH_LABELS[selected.channel]||selected.channel}</Badge>
              <Badge variant={IT_VARIANTS[selected.intent]||'gray'}>{IT_LABELS[selected.intent]||selected.intent}</Badge>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{selected.created_at_kst?.slice(0,16)?.replace('T',' ')} KST</span>
            </div>
            {/* User */}
            <div>
              <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' }}>고객 질문</p>
              <div style={{ background: 'var(--bg-primary)', borderRadius: '10px', padding: '14px', fontSize: '14px', color: 'var(--text-primary)' }}>{selected.user_message}</div>
            </div>
            {/* Bot */}
            <div>
              <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' }}>봇 답변</p>
              <div style={{ background: 'rgba(79,70,229,0.05)', border: '1px solid rgba(79,70,229,0.15)', borderRadius: '10px', padding: '14px', fontSize: '14px', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{selected.bot_answer}</div>
            </div>
            <button onClick={() => addToFAQ(selected)} style={{ ...S.btnPrimary, width: '100%' }}>
              <BookmarkPlus size={16}/> 이 대화를 FAQ에 추가
            </button>
          </div>
        )}
      </Modal>
    </div>
  )
}
