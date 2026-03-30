import React, { useEffect, useState, useCallback } from 'react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { MessageCircle, BookOpen, TrendingUp, Calendar, ArrowUp, ArrowDown, Copy, Check, AlertCircle, X } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { SkeletonStats, SkeletonCard } from '../components/Skeleton'
import Badge from '../components/Badge'
import { S } from '../lib/ui'

const COLORS = ['#4F46E5','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4']
const CH_LABELS: Record<string,string> = { web:'웹', kakao:'카카오', naver:'네이버', messenger:'메신저' }
const IT_LABELS: Record<string,string> = { FAQ_INQUIRY:'FAQ', ORDER_INQUIRY:'주문', GREETING:'인사', RESERVATION:'예약', PAYMENT:'결제', COMPLAINT:'불만', OTHER:'기타' }
const PLAN_PRICE: Record<string,number> = { basic: 99000, pro: 199000, master: 399000 }

// ─────────────────────────────────────────
// 구독 현황 카드 컴포넌트
// ─────────────────────────────────────────
function SubscriptionCard({ tenantPlan }: { tenantPlan: string }) {
  const [sub, setSub] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [payModalOpen, setPayModalOpen] = useState(false)
  const [payMemo, setPayMemo] = useState('')
  const [payLoading, setPayLoading] = useState(false)
  const [payDone, setPayDone] = useState(false)
  const [tooltipVisible, setTooltipVisible] = useState(false)

  const loadSub = useCallback(async () => {
    try {
      const res = await api.getSubscription()
      setSub(res.data)
    } catch { /* 실패 무시 */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadSub() }, [])

  function calcDday(endStr: string | null): number | null {
    if (!endStr) return null
    const today = new Date(); today.setHours(0,0,0,0)
    const end = new Date(endStr); end.setHours(0,0,0,0)
    return Math.floor((end.getTime() - today.getTime()) / (1000*60*60*24))
  }

  function formatDate(str: string | null): string {
    if (!str) return '—'
    const d = new Date(str)
    return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`
  }

  function copyAccount() {
    const acct = sub?.payment_settings?.account_number || ''
    navigator.clipboard.writeText(acct).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }

  async function handlePayRequest() {
    if (!payMemo.trim()) return
    setPayLoading(true)
    try {
      await api.sendPaymentRequest(payMemo.trim())
      setPayDone(true)
      setPayModalOpen(false)
      await loadSub()
    } catch { /* 실패해도 완료 처리 */ setPayDone(true); setPayModalOpen(false) }
    finally { setPayLoading(false) }
  }

  if (loading) {
    return (
      <div style={{ ...S.card, height: '80px', animation: 'shimmer 1.4s infinite', background: 'linear-gradient(90deg, var(--bg-secondary) 25%, var(--border) 50%, var(--bg-secondary) 75%)', backgroundSize: '200% 100%' }} />
    )
  }

  const dday = calcDday(sub?.subscription_end_date)
  const plan = sub?.plan || tenantPlan || 'basic'
  const status = sub?.subscription_status || 'active'
  const isPaymentPending = status === 'pending' || !!sub?.payment_requested_at

  // 배너 결정
  let banner: { bg: string; color: string; border: string; text: string } | null = null
  if (dday !== null && dday < 0) {
    banner = { bg: '#FEF2F2', color: '#991B1B', border: '#FECACA', text: '⛔ 구독이 만료되었습니다. 챗봇 서비스가 중단됩니다. 입금 후 입금했어요 버튼을 눌러주세요.' }
  } else if (dday === 0) {
    banner = { bg: '#FFF7ED', color: '#9A3412', border: '#FED7AA', text: '⚠️ 오늘 구독이 만료됩니다.' }
  } else if (dday !== null && dday <= 7) {
    banner = { bg: '#FEFCE8', color: '#854D0E', border: '#FEF08A', text: `⏰ 구독 만료까지 D-${dday}입니다. 아래 계좌로 입금해 주세요.` }
  }

  const showPaymentSection = dday !== null && dday <= 7

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* 배너 */}
      {banner && (
        <div style={{ padding: '12px 16px', borderRadius: '10px', background: banner.bg, border: `1px solid ${banner.border}`, color: banner.color, fontSize: '13px', fontWeight: 600 }}>
          {banner.text}
        </div>
      )}

      {/* 구독 현황 카드 */}
      <div style={{ ...S.card }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>📋 구독 현황</h3>
          {isPaymentPending && (
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#D97706', background: 'rgba(245,158,11,0.12)', padding: '3px 10px', borderRadius: '12px' }}>입금 대기 중</span>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: showPaymentSection ? '16px' : 0 }}>
          <div style={{ padding: '12px', background: 'var(--bg-primary)', borderRadius: '10px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>현재 플랜</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary)' }}>{plan.charAt(0).toUpperCase() + plan.slice(1)}</div>
          </div>
          <div style={{ padding: '12px', background: 'var(--bg-primary)', borderRadius: '10px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>구독 만료일</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{formatDate(sub?.subscription_end_date)}</div>
          </div>
          <div style={{ padding: '12px', background: 'var(--bg-primary)', borderRadius: '10px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>남은 기간</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: dday !== null && dday <= 7 ? '#EF4444' : '#059669' }}>
              {dday === null ? '—' : dday < 0 ? '만료됨' : `D-${dday}`}
            </div>
          </div>
          <div style={{ padding: '12px', background: 'var(--bg-primary)', borderRadius: '10px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>월 요금</div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>₩{(PLAN_PRICE[plan] || 99000).toLocaleString()}</div>
          </div>
        </div>

        {/* 입금 안내 섹션 */}
        {showPaymentSection && sub?.payment_settings && (
          <div style={{ padding: '14px 16px', background: 'rgba(79,70,229,0.04)', border: '1px solid rgba(79,70,229,0.15)', borderRadius: '10px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)' }}>💳 입금 계좌 안내</span>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <button
                  onMouseEnter={() => setTooltipVisible(true)}
                  onMouseLeave={() => setTooltipVisible(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px', display: 'flex', alignItems: 'center' }}
                >
                  <AlertCircle size={13} />
                </button>
                {tooltipVisible && (
                  <div style={{ position: 'absolute', left: '20px', top: '-4px', zIndex: 100, background: '#1F2937', color: '#fff', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', whiteSpace: 'nowrap', boxShadow: '0 4px 16px rgba(0,0,0,0.2)', lineHeight: 1.5 }}>
                    입금 후 아래 버튼을 눌러주세요.<br />슈퍼관리자 확인 후 자동으로 구독이 연장됩니다.
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {sub.payment_settings.bank_name}
                </span>
                <span style={{ fontSize: '14px', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                  {sub.payment_settings.account_number}
                </span>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', marginLeft: '6px' }}>
                  ({sub.payment_settings.account_holder})
                </span>
              </div>
              <button
                onClick={copyAccount}
                style={{ background: copied ? '#059669' : 'var(--primary)', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'inherit', flexShrink: 0 }}
              >
                {copied ? <><Check size={12} /> 복사됨</> : <><Copy size={12} /> 복사</>}
              </button>
            </div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#4F46E5', marginBottom: '6px' }}>
              입금 금액: ₩{(PLAN_PRICE[plan] || 99000).toLocaleString()}
            </div>
            {sub.payment_settings.payment_guide && (
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.5 }}>
                {sub.payment_settings.payment_guide}
              </p>
            )}

            {/* 입금했어요 버튼 */}
            {payDone || isPaymentPending ? (
              <div style={{ padding: '10px 14px', background: 'rgba(5,150,105,0.1)', border: '1px solid rgba(5,150,105,0.2)', borderRadius: '8px', fontSize: '13px', color: '#059669', fontWeight: 600 }}>
                ✅ 입금 요청이 전달되었습니다. 확인 후 처리해 드립니다.
              </div>
            ) : (
              <button
                onClick={() => setPayModalOpen(true)}
                style={{ ...S.btnPrimary, background: '#059669', width: '100%', fontSize: '13px' }}
              >
                💰 입금했어요
              </button>
            )}
          </div>
        )}
      </div>

      {/* 입금자명 모달 */}
      {payModalOpen && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setPayModalOpen(false) }}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: 'rgba(0,0,0,0.5)' }}
        >
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '16px', width: '100%', maxWidth: '400px', animation: 'fadeIn 0.2s ease-out' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>입금 요청</h3>
              <button onClick={() => setPayModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: '4px' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '20px 24px 24px' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.6 }}>
                입금 후 입금자명을 입력해 주세요. 슈퍼관리자에게 알림이 전달됩니다.
              </p>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ ...S.label }}>입금자명 <span style={{ color: '#EF4444' }}>*</span></label>
                <input
                  type="text"
                  value={payMemo}
                  onChange={e => setPayMemo(e.target.value)}
                  placeholder="예: 홍길동"
                  style={S.input}
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter' && payMemo.trim()) handlePayRequest() }}
                />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setPayModalOpen(false)} style={{ ...S.btnSecondary, flex: 1 }}>취소</button>
                <button
                  onClick={handlePayRequest}
                  disabled={payLoading || !payMemo.trim()}
                  style={{ ...S.btnPrimary, flex: 1, background: '#059669', opacity: (payLoading || !payMemo.trim()) ? 0.7 : 1 }}
                >
                  {payLoading ? '전송 중...' : '확인'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ title, value, sub, trend, icon: Icon, color }: any) {
  const up = trend > 0
  return (
    <div style={{ ...S.card, transition: 'box-shadow 0.2s' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={20} color="#fff"/>
        </div>
        {trend !== undefined && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600, color: up ? '#059669' : trend < 0 ? '#DC2626' : 'var(--text-secondary)' }}>
            {up ? <ArrowUp size={12}/> : trend < 0 ? <ArrowDown size={12}/> : null}
            {trend > 0 ? `+${trend}` : trend}%
          </span>
        )}
      </div>
      <p style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</p>
      {sub && <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{sub}</p>}
    </div>
  )
}

export default function DashboardPage() {
  const { tenant } = useAuth()
  const [stats, setStats] = useState<any>(null)
  const [logs, setLogs] = useState<any[]>([])
  const [docs, setDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.getStats(),
      api.getLogs({ page: 1, limit: 5 }),
      api.getDocuments({ page: 1, limit: 10 })
    ]).then(([s, l, d]) => {
      setStats(s.data)
      setLogs(l.data?.items || [])
      setDocs(d.data?.items || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const channelData = stats ? Object.entries(stats.channel_stats || {}).map(([k, v]: any) => ({ name: CH_LABELS[k] || k, value: v })) : []
  const intentData  = stats ? Object.entries(stats.intent_stats || {}).map(([k, v]: any) => ({ name: IT_LABELS[k] || k, value: v })) : []

  const PLAN_LIMIT: Record<string,number> = { basic: 50, pro: 200, master: -1 }
  const limit = PLAN_LIMIT[tenant?.plan || 'basic'] || 50
  const faqCount = stats?.faq_count || 0
  const faqPct = limit === -1 ? 0 : Math.round((faqCount / limit) * 100)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 구독 현황 카드 */}
      <SubscriptionCard tenantPlan={tenant?.plan || 'basic'} />

      {/* 통계 카드 */}
      {loading ? <SkeletonStats/> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
          <StatCard title="오늘 대화수" value={stats?.today_count || 0}
            icon={MessageCircle} color="#4F46E5"
            trend={stats?.growth_rate_today} sub={`어제 ${stats?.yesterday_count || 0}건`}/>
          <StatCard title="이번달 대화수" value={stats?.month_count || 0}
            icon={Calendar} color="#10B981"/>
          <StatCard title="총 대화수" value={stats?.total_count || 0}
            icon={TrendingUp} color="#8B5CF6"/>
          <StatCard
            title="FAQ 등록수"
            value={limit === -1 ? faqCount : `${faqCount} / ${limit}`}
            icon={BookOpen}
            color={faqPct >= 100 ? '#EF4444' : faqPct >= 90 ? '#F59E0B' : '#3B82F6'}
            sub={limit === -1 ? '무제한 플랜' : faqPct >= 90 ? '⚠️ 한도에 가까워지고 있어요' : `플랜 한도 ${limit}개`}/>
        </div>
      )}

      {/* FAQ 경고 */}
      {!loading && faqPct >= 100 && (
        <div style={{ borderRadius: '12px', background: '#FEF2F2', border: '1px solid #FECACA', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontSize: '13px', color: '#991B1B', fontWeight: 600 }}>🚫 FAQ 한도에 도달했습니다. 플랜을 업그레이드해주세요.</p>
          <button style={{ background: '#DC2626', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '12px', cursor: 'pointer', minHeight: '36px', fontFamily: 'inherit' }}>업그레이드</button>
        </div>
      )}

      {/* 차트 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
        <div style={S.card}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>채널별 대화 분포</h3>
          {loading ? <div style={{ height: '200px', background: 'var(--bg-primary)', borderRadius: '8px', animation: 'shimmer 1.5s infinite' }}/> :
            channelData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={channelData} cx="50%" cy="50%" outerRadius={75} dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                    {channelData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]}/>)}
                  </Pie>
                  <Tooltip formatter={(v: any) => [`${v}건`, '대화수']}/>
                </PieChart>
              </ResponsiveContainer>
            ) : <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px', padding: '60px 0' }}>아직 대화 데이터가 없습니다.</p>}
        </div>

        <div style={S.card}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>의도별 분류</h3>
          {loading ? <div style={{ height: '200px', background: 'var(--bg-primary)', borderRadius: '8px', animation: 'shimmer 1.5s infinite' }}/> :
            intentData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={intentData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}/>
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}/>
                  <Tooltip/>
                  <Bar dataKey="value" name="건수" fill="#4F46E5" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            ) : <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px', padding: '60px 0' }}>아직 데이터가 없습니다.</p>}
        </div>
      </div>

      {/* 최근 대화 */}
      <div style={S.card}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>최근 대화</h3>
        {loading ? <SkeletonCard/> : logs.length === 0 ?
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px', padding: '40px 0' }}>아직 대화 기록이 없습니다.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['시간','채널','질문','의도'].map(h => (
                    <th key={h} style={{ textAlign: 'left', paddingBottom: '10px', paddingRight: '16px', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log: any) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px 12px 0', fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{log.created_at_kst?.slice(5,16)}</td>
                    <td style={{ padding: '12px 16px 12px 0' }}><Badge variant="indigo">{CH_LABELS[log.channel]||log.channel}</Badge></td>
                    <td style={{ padding: '12px 16px 12px 0', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>{log.user_message}</td>
                    <td style={{ padding: '12px 0' }}><Badge variant={log.intent==='COMPLAINT'?'red':'gray'}>{IT_LABELS[log.intent]||log.intent}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* FAQ TOP10 */}
      <div style={S.card}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>등록된 FAQ</h3>
        {loading ? <SkeletonCard/> : docs.length === 0 ?
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px', padding: '40px 0' }}>등록된 FAQ가 없습니다.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {docs.map((doc: any, i: number) => (
              <div key={doc.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px', borderRadius: '8px', background: 'var(--bg-primary)' }}>
                <span style={{ flexShrink: 0, width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(79,70,229,0.1)', color: 'var(--primary)', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{i+1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.refined_question || doc.original_question}</p>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>{doc.refined_answer || doc.original_answer}</p>
                </div>
                <Badge variant="gray">{doc.category}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
