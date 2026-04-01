import React, { useState, useEffect, useCallback } from 'react'
import { BarChart2, RefreshCw, AlertTriangle, BookOpen, Loader2, TrendingUp, Info } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer, Cell } from 'recharts'
import { api } from '../lib/api'
import { useToast } from '../hooks/useToast'
import ToastContainer from '../components/Toast'
import { S } from '../lib/ui'
import { useNavigate } from 'react-router-dom'

// ─── 기간 필터 옵션 ───
const PERIODS = [
  { value: 'today', label: '오늘' },
  { value: 'week',  label: '이번 주' },
  { value: 'month', label: '이번 달' },
  { value: 'all',   label: '전체' },
]

// ─── 툴팁 ───
function Tooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}>
      <button
        type="button"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px', display: 'flex', alignItems: 'center', marginLeft: '4px' }}
      >
        <Info size={13} />
      </button>
      {visible && (
        <div style={{
          position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)',
          zIndex: 9999, background: '#1F2937', color: '#fff',
          padding: '8px 12px', borderRadius: '8px', fontSize: '12px', maxWidth: '240px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)', lineHeight: 1.6, pointerEvents: 'none',
          whiteSpace: 'pre-wrap',
        }}>
          {text}
        </div>
      )}
    </span>
  )
}

// ─── 커스텀 바차트 툴팁 ───
function CustomBarTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{
      background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px',
      padding: '12px 14px', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', maxWidth: '240px',
    }}>
      <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px', wordBreak: 'break-all' }}>{d.question}</p>
      <p style={{ fontSize: '14px', fontWeight: 800, color: d.unanswered ? '#DC2626' : '#4F46E5' }}>{d.count}건</p>
      {d.unanswered && (
        <p style={{ fontSize: '11px', color: '#DC2626', marginTop: '4px', fontWeight: 600 }}>⚠ 미답변 질문</p>
      )}
    </div>
  )
}

export default function AnalyticsPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const [period, setPeriod] = useState('month')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.getTop10(period)
      setData(res.data)
    } catch (e: any) {
      toast.error(e.message || '데이터 로드 실패')
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { fetchData() }, [fetchData])

  // top10 + unanswered 합쳐서 표시용 데이터 생성
  const unansweredSet = new Set<string>((data?.unanswered || []).map((u: any) => u.question))
  const chartData = (data?.top10 || []).map((item: any, i: number) => ({
    ...item,
    shortQ: item.question.length > 14 ? item.question.slice(0, 14) + '…' : item.question,
    rank: i + 1,
    unanswered: unansweredSet.has(item.question),
  }))
  const totalQueries = data?.total_queries || 0
  const isSample = data?.is_sample

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* 헤더 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>질문 TOP 10 분석</h2>
          <Tooltip text="고객이 가장 많이 묻는 질문 상위 10개를 분석합니다.\n미답변 질문은 빨간색으로 표시되며 FAQ로 추가할 수 있습니다." />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={fetchData}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', minHeight: '38px', opacity: loading ? 0.6 : 1 }}
          >
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />새로고침
          </button>
        </div>
      </div>

      {/* 기간 필터 */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {PERIODS.map(p => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            style={{
              padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit', minHeight: '38px', transition: 'all 0.15s',
              border: `2px solid ${period === p.value ? 'var(--primary)' : 'var(--border)'}`,
              background: period === p.value ? 'var(--primary)' : 'var(--bg-secondary)',
              color: period === p.value ? '#fff' : 'var(--text-secondary)',
            }}
          >
            {p.label}
          </button>
        ))}
        {isSample && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 12px', fontSize: '12px', color: '#D97706', background: '#FEFCE8', border: '1px solid #FEF08A', borderRadius: '9999px', fontWeight: 600 }}>
            <AlertTriangle size={12} />샘플 데이터 (실제 로그 없음)
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ ...S.card, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '320px', gap: '12px' }}>
          <Loader2 size={24} color="var(--primary)" style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>분석 데이터 로딩 중...</span>
        </div>
      ) : (
        <>
          {/* 요약 카드 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            {[
              { label: '총 질문 수', value: totalQueries.toLocaleString() + '건', icon: <TrendingUp size={20} color="#4F46E5" />, color: 'rgba(79,70,229,0.08)', border: 'rgba(79,70,229,0.2)' },
              { label: 'TOP 10 질문 수', value: chartData.length + '개', icon: <BarChart2 size={20} color="#059669" />, color: 'rgba(5,150,105,0.08)', border: 'rgba(5,150,105,0.2)' },
              { label: '미답변 질문', value: (data?.unanswered?.length || 0) + '개', icon: <AlertTriangle size={20} color="#DC2626" />, color: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.2)' },
            ].map(card => (
              <div key={card.label} style={{ ...S.card, display: 'flex', alignItems: 'center', gap: '14px', padding: '16px', background: card.color, border: `1px solid ${card.border}` }}>
                <div style={{ flexShrink: 0 }}>{card.icon}</div>
                <div>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '2px' }}>{card.label}</p>
                  <p style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>{card.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* 바 차트 */}
          <div style={S.card}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '20px' }}>
              📊 TOP 10 질문 유형 ({PERIODS.find(p => p.value === period)?.label})
            </h3>
            {chartData.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', gap: '10px' }}>
                <BarChart2 size={40} color="var(--border)" />
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>해당 기간에 데이터가 없습니다.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <div style={{ minWidth: '560px' }}>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 60 }} barSize={32}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis
                        dataKey="shortQ"
                        tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                        angle={-35}
                        textAnchor="end"
                        interval={0}
                        height={70}
                      />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                      <ReTooltip content={<CustomBarTooltip />} cursor={{ fill: 'rgba(79,70,229,0.06)' }} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry: any, index: number) => (
                          <Cell key={index} fill={entry.unanswered ? '#EF4444' : '#4F46E5'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '16px', marginTop: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '14px', height: '14px', borderRadius: '3px', background: '#4F46E5' }} />
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>답변된 질문</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '14px', height: '14px', borderRadius: '3px', background: '#EF4444' }} />
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>미답변 질문</span>
              </div>
            </div>
          </div>

          {/* TOP 10 순위 테이블 */}
          <div style={S.card}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
              🏆 TOP 10 상세 순위
            </h3>
            {chartData.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '20px 0', textAlign: 'center' }}>데이터가 없습니다.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {chartData.map((item: any) => {
                  const maxCount = chartData[0]?.count || 1
                  const pct = Math.round((item.count / maxCount) * 100)
                  return (
                    <div key={item.rank} style={{
                      display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '10px',
                      background: item.unanswered ? 'rgba(239,68,68,0.04)' : 'var(--bg-primary)',
                      border: `1px solid ${item.unanswered ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`,
                    }}>
                      {/* 순위 뱃지 */}
                      <div style={{
                        width: '30px', height: '30px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 800, fontSize: '13px',
                        background: item.rank <= 3 ? ['#F59E0B', '#94A3B8', '#CD7C4B'][item.rank - 1] : 'var(--border)',
                        color: item.rank <= 3 ? '#fff' : 'var(--text-secondary)',
                      }}>
                        {item.rank}
                      </div>

                      {/* 질문 + 바 */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: item.unanswered ? '#DC2626' : 'var(--text-primary)', wordBreak: 'break-all' }}>
                            {item.question}
                          </span>
                          {item.unanswered && (
                            <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '9999px', background: 'rgba(220,38,38,0.12)', color: '#DC2626', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '3px' }}>
                              <AlertTriangle size={9} />미답변
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ flex: 1, height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: item.unanswered ? '#EF4444' : '#4F46E5', borderRadius: '3px', transition: 'width 0.5s ease' }} />
                          </div>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: item.unanswered ? '#DC2626' : 'var(--text-primary)', flexShrink: 0, minWidth: '40px', textAlign: 'right' }}>{item.count}건</span>
                        </div>
                      </div>

                      {/* 미답변이면 FAQ 추가 버튼 */}
                      {item.unanswered && (
                        <button
                          onClick={() => navigate('/admin/faq')}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit', minHeight: '34px',
                            background: '#DC2626', color: '#fff', border: 'none', borderRadius: '7px',
                          }}
                        >
                          <BookOpen size={12} />FAQ 추가
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* 미답변 TOP 10 (별도 섹션) */}
          {data?.unanswered?.length > 0 && (
            <div style={S.card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <AlertTriangle size={16} color="#DC2626" />
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#DC2626' }}>미답변 질문 TOP 10</h3>
                <Tooltip text="FAQ가 등록되지 않아 봇이 답변하지 못한 질문입니다.\nFAQ를 추가하면 자동으로 답변될 수 있습니다." />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {data.unanswered.map((item: any, i: number) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#DC2626', flexShrink: 0, width: '20px' }}>{i + 1}</span>
                    <span style={{ flex: 1, fontSize: '13px', color: '#991B1B', wordBreak: 'break-all' }}>{item.question}</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#DC2626', flexShrink: 0 }}>{item.count}건</span>
                    <button
                      onClick={() => navigate('/admin/faq')}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', background: '#DC2626', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, minHeight: '32px' }}
                    >
                      <BookOpen size={11} />FAQ 추가하기
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
