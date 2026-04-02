import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { MessageCircle, BookOpen, TrendingUp, Calendar, ArrowUp, ArrowDown, Copy, Check, AlertCircle, X, Info } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { SkeletonStats, SkeletonCard } from '../components/Skeleton'
import Badge from '../components/Badge'
import { S } from '../lib/ui'

const COLORS = ['#4F46E5','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4']
const CH_LABELS: Record<string,string> = { web:'웹', kakao:'카카오', naver:'네이버', messenger:'메신저' }
const IT_LABELS: Record<string,string> = { FAQ_INQUIRY:'FAQ', ORDER_INQUIRY:'주문', GREETING:'인사', RESERVATION:'예약', PAYMENT:'결제', COMPLAINT:'불만', OTHER:'기타' }
const PLAN_PRICE: Record<string,number> = { basic: 99000, pro: 199000, master: 399000 }
const PLAN_LIMIT: Record<string,number> = { basic: 50, pro: 200, master: -1 }

// ─────────────────────────────────────────
// 툴팁 컴포넌트
// ─────────────────────────────────────────
function StatTooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState({ left: 0, top: 0 })

  const handleMouseEnter = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      setPos({ left: rect.left, top: rect.top })
    }
    setVisible(true)
  }

  return (
    <>
      <button
        ref={ref}
        type="button"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setVisible(false)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', padding: '2px', display: 'flex', alignItems: 'center' }}
      >
        <Info size={12}/>
      </button>
      {visible && (
        <div style={{
          position: 'fixed',
          left: pos.left + 'px',
          top: (pos.top - 8) + 'px',
          transform: 'translateY(-100%)',
          zIndex: 9999,
          background: '#1F2937',
          color: '#fff',
          padding: '8px 12px',
          borderRadius: '8px',
          fontSize: '12px',
          maxWidth: '200px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          lineHeight: 1.6,
          pointerEvents: 'none',
        }}>
          {text}
        </div>
      )}
    </>
  )
}

// ─────────────────────────────────────────
// 통계 카드 컴포넌트
// ─────────────────────────────────────────
function StatCard({ title, value, sub, trend, icon: Icon, color, tooltip }: any) {
  const up = trend > 0
  return (
    <div style={{ ...S.card, transition: 'box-shadow 0.2s' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', position: 'relative' }}>
          <Icon size={20} color="#fff"/>
          {tooltip && (
            <div style={{ position: 'absolute', top: '-6px', right: '-6px' }}>
              <StatTooltip text={tooltip}/>
            </div>
          )}
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

// ─────────────────────────────────────────
// 사용량 프로그레스 바 카드
// ─────────────────────────────────────────
function UsageBar({ label, current, limit, color, tooltip }: { label: string; current: number; limit: number; color: string; tooltip?: string }) {
  const pct = limit <= 0 ? 0 : Math.min(Math.round((current / limit) * 100), 100)
  const isUnlimited = limit === -1
  const barColor = pct >= 100 ? '#EF4444' : pct >= 80 ? '#F59E0B' : color

  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
          {tooltip && (
            <div style={{ position: 'relative', display: 'inline-flex' }}>
              <div style={{ position: 'relative' }}>
                <Info size={12} color="var(--text-secondary)"/>
              </div>
            </div>
          )}
        </div>
        <span style={{ fontSize: '12px', fontWeight: 600, color: barColor }}>
          {isUnlimited ? `${current.toLocaleString()} / 무제한` : `${current.toLocaleString()} / ${limit.toLocaleString()} (${pct}%)`}
        </span>
      </div>
      {!isUnlimited && (
        <div style={{ height: '8px', background: 'var(--bg-primary)', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: '4px', transition: 'width 0.5s ease' }}/>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────
// 구독 현황 카드 (billing_day 기반)
// ─────────────────────────────────────────
function SubscriptionCard({ tenantPlan }: { tenantPlan: string }) {
  const [sub, setSub] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [showAccount, setShowAccount] = useState(false);
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
    } catch { setPayDone(true); setPayModalOpen(false) }
    finally { setPayLoading(false) }
  }

  if (loading) {
    return <div style={{ ...S.card, height: '120px', animation: 'shimmer 1.4s infinite', background: 'linear-gradient(90deg, var(--bg-secondary) 25%, var(--border) 50%, var(--bg-secondary) 75%)', backgroundSize: '200% 100%' }}/>
  }

  const plan = sub?.plan || tenantPlan || 'basic'
  const dday = sub?.days_until_billing
  const nextBilling = sub?.next_billing_date
  const periodStart = sub?.current_period_start
  const periodEnd = sub?.current_period_end
  const billingDay = sub?.billing_day
  const status = sub?.subscription_status || 'active'
  const isPaymentPending = status === 'pending' || !!sub?.payment_requested_at
  const isMaster = plan === 'master'

  // 배너 결정
  let banner: { bg: string; color: string; border: string; text: string } | null = null
  if (!isMaster) {
    if (dday !== null && dday !== undefined && dday < 0) {
      banner = { bg: '#FEF2F2', color: '#991B1B', border: '#FECACA', text: '⛔ 구독이 만료되었습니다. 챗봇 서비스가 중단됩니다. 입금 후 입금했어요 버튼을 눌러주세요.' }
    } else if (dday === 0) {
      banner = { bg: '#FFF7ED', color: '#9A3412', border: '#FED7AA', text: '⚠️ 오늘 결제일입니다!' }
    } else if (dday !== null && dday !== undefined && dday <= 7) {
      banner = { bg: '#FEFCE8', color: '#854D0E', border: '#FEF08A', text: `⏰ 다음 결제일까지 D-${dday}입니다. 아래 계좌로 입금해 주세요.` }
    }
  }

  const showPaymentSection = !isMaster && dday !== null && dday !== undefined && dday <= 7

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {banner && (
        <div style={{ padding: '12px 16px', borderRadius: '10px', background: banner.bg, border: `1px solid ${banner.border}`, color: banner.color, fontSize: '13px', fontWeight: 600 }}>
          {banner.text}
        </div>
      )}

      <div style={{ ...S.card }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>📋 구독 정보</h3>
          {isPaymentPending && !isMaster && (
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#D97706', background: 'rgba(245,158,11,0.12)', padding: '3px 10px', borderRadius: '12px' }}>입금 대기 중</span>
          )}
          {isMaster && (
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#D97706', background: 'rgba(245,158,11,0.12)', padding: '3px 10px', borderRadius: '12px' }}>⭐ Master 플랜 (무제한)</span>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: showPaymentSection ? '16px' : 0 }}>
          <div style={{ padding: '12px', background: 'var(--bg-primary)', borderRadius: '10px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>현재 플랜</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary)' }}>{plan.charAt(0).toUpperCase() + plan.slice(1)}</div>
          </div>
          {!isMaster && (
            <>
              <div style={{ padding: '12px', background: 'var(--bg-primary)', borderRadius: '10px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>결제일</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>매월 {billingDay}일</div>
              </div>
              <div style={{ padding: '12px', background: 'var(--bg-primary)', borderRadius: '10px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>다음 결제일</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: dday !== undefined && dday <= 7 ? '#EF4444' : 'var(--text-primary)' }}>
                  {formatDate(nextBilling)}
                </div>
              </div>
              <div style={{ padding: '12px', background: 'var(--bg-primary)', borderRadius: '10px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>남은 기간</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: dday !== undefined && dday <= 7 ? '#EF4444' : '#059669' }}>
                  {dday === undefined || dday === null ? '—' : dday < 0 ? '만료됨' : `D-${dday}`}
                </div>
              </div>
              <div style={{ padding: '12px', background: 'var(--bg-primary)', borderRadius: '10px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>월 요금</div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>₩{(PLAN_PRICE[plan] || 99000).toLocaleString()}</div>
              </div>
            </>
          )}
          {!isMaster && periodStart && periodEnd && (
            <div style={{ padding: '12px', background: 'var(--bg-primary)', borderRadius: '10px', gridColumn: 'span 2' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>현재 구독 기간</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {periodStart} ~ {periodEnd}
              </div>
            </div>
          )}
        </div>

        {/* 입금 안내 섹션 */}
        {showPaymentSection && sub?.payment_settings && (
          <div style={{ padding: '14px 16px', background: 'rgba(79,70,229,0.04)', border: '1px solid rgba(79,70,229,0.15)', borderRadius: '10px', marginTop: '12px' }}>
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
                    입금 후 아래 버튼을 눌러주세요.<br/>슈퍼관리자 확인 후 자동으로 구독이 연장됩니다.
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{sub.payment_settings.bank_name}</span>
                <span style={{ fontSize: '14px', color: 'var(--text-secondary)', marginLeft: '8px' }}>{sub.payment_settings.account_number}</span>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', marginLeft: '6px' }}>
  {sub.payment_settings.account_holder}</span>
</div>

{/* 토글 버튼 */}
<button
  onClick={() => setShowAccount(prev => !prev)}
  style={{
    background: showAccount ? '#6B7280' : 'var(--primary)',
    color: '#fff', border: 'none', borderRadius: '6px',
    padding: '5px 10px', cursor: 'pointer', fontSize: '12px',
    fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px',
    fontFamily: 'inherit', flexShrink: 0
  }}
>
  {showAccount ? '닫기 ▲' : '입금하기 ▼'}
</button>
</div>

{/* 계좌번호 + 복사 + 금액 - 버튼 클릭시만 표시 */}
{showAccount && (
  <div style={{
    marginTop: '8px', padding: '10px 12px',
    background: '#F0F9FF', border: '1px solid #BAE6FD',
    borderRadius: '8px',
  }}>
    <div style={{ fontSize: '12px', fontWeight: 600, color: '#4F46E5', marginBottom: '6px' }}>
      입금 금액: ₩{(PLAN_PRICE[plan] || 99000).toLocaleString()}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
        {sub.payment_settings.account_number}
      </span>
      <button onClick={copyAccount} style={{
        background: copied ? '#059669' : 'var(--primary)',
        color: '#fff', border: 'none', borderRadius: '6px',
        padding: '5px 10px', cursor: 'pointer', fontSize: '12px',
        fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px',
        fontFamily: 'inherit', flexShrink: 0
      }}>
        {copied ? <><Check size={12}/>복사됨</> : <><Copy size={12}/>복사</>}
      </button>
    </div>
  </div>
)}
            {sub.payment_settings.payment_guide && (
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.5 }}>{sub.payment_settings.payment_guide}</p>
            )}
            {payDone || isPaymentPending ? (
              <div style={{ padding: '10px 14px', background: 'rgba(5,150,105,0.1)', border: '1px solid rgba(5,150,105,0.2)', borderRadius: '8px', fontSize: '13px', color: '#059669', fontWeight: 600 }}>
                ✅ 입금 요청이 전달되었습니다. 확인 후 처리해 드립니다.
              </div>
            ) : (
              <button onClick={() => setPayModalOpen(true)} style={{ ...S.btnPrimary, background: '#059669', width: '100%', fontSize: '13px' }}>
                💰 입금했어요
              </button>
            )}
          </div>
        )}
      </div>

      {/* 입금자명 모달 */}
      {payModalOpen && (
        <div onClick={e => { if (e.target === e.currentTarget) setPayModalOpen(false) }}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: 'rgba(0,0,0,0.5)' }}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '16px', width: '100%', maxWidth: '400px', animation: 'fadeIn 0.2s ease-out' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>입금 요청</h3>
              <button onClick={() => setPayModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: '4px' }}>
                <X size={18}/>
              </button>
            </div>
            <div style={{ padding: '20px 24px 24px' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.6 }}>입금 후 입금자명을 입력해 주세요. 슈퍼관리자에게 알림이 전달됩니다.</p>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ ...S.label }}>입금자명 <span style={{ color: '#EF4444' }}>*</span></label>
                <input type="text" value={payMemo} onChange={e => setPayMemo(e.target.value)} placeholder="예: 홍길동" style={S.input} autoFocus
                  onKeyDown={e => { if (e.key === 'Enter' && payMemo.trim()) handlePayRequest() }}/>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setPayModalOpen(false)} style={{ ...S.btnSecondary, flex: 1 }}>취소</button>
                <button onClick={handlePayRequest} disabled={payLoading || !payMemo.trim()} style={{ ...S.btnPrimary, flex: 1, background: '#059669', opacity: (payLoading || !payMemo.trim()) ? 0.7 : 1 }}>
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

// ─────────────────────────────────────────
// 메인 대시보드
// ─────────────────────────────────────────
export default function DashboardPage() {
  const { tenant } = useAuth()
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getStats().then(res => {
      setStats(res.data)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const channelData = stats ? Object.entries(stats.channel_stats || {}).map(([k, v]: any) => ({ name: CH_LABELS[k] || k, value: v })) : []
  const intentData  = stats ? Object.entries(stats.intent_stats || {}).map(([k, v]: any) => ({ name: IT_LABELS[k] || k, value: v })) : []

  const limit = PLAN_LIMIT[tenant?.plan || 'basic'] || 50
  const faqCount = stats?.faq_count || tenant?.faq_count || 0
  const faqPct = limit === -1 ? 0 : Math.round((faqCount / limit) * 100)

  const recentLogs = stats?.recent_logs || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 구독 현황 카드 */}
      <SubscriptionCard tenantPlan={tenant?.plan || 'basic'} />

      {/* 사용량 프로그레스 바 */}
      {!loading && tenant?.plan !== 'master' && (
        <div style={{ ...S.card }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px' }}>📊 사용량 현황</h3>
          <UsageBar label="FAQ 등록" current={faqCount} limit={limit} color="#4F46E5"/>
          <UsageBar label="이번달 대화" current={stats?.month_count || 0} limit={limit === -1 ? -1 : limit * 100} color="#10B981"/>
        </div>
      )}

      {/* 통계 카드 */}
      {loading ? <SkeletonStats/> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
          <StatCard
            title="오늘 대화수"
            value={stats?.today_count || 0}
            icon={MessageCircle} color="#4F46E5"
            trend={stats?.growth_rate_today}
            sub={`어제 ${stats?.yesterday_count || 0}건`}
            tooltip="오늘 00:00~현재까지의 대화 수입니다.\n어제 대비 증감률을 함께 보여줍니다."
          />
          <StatCard
            title="이번달 대화수"
            value={stats?.month_count || 0}
            icon={Calendar} color="#10B981"
            tooltip="이번달 1일부터 오늘까지의 총 대화 수입니다."
          />
          <StatCard
            title="총 대화수"
            value={stats?.total_count || 0}
            icon={TrendingUp} color="#8B5CF6"
            tooltip="서비스 시작 이후 누적된 전체 대화 수입니다."
          />
          <StatCard
            title="FAQ 등록수"
            value={limit === -1 ? faqCount : `${faqCount} / ${limit}`}
            icon={BookOpen}
            color={faqPct >= 100 ? '#EF4444' : faqPct >= 80 ? '#F59E0B' : '#3B82F6'}
            sub={limit === -1 ? '무제한 플랜' : faqPct >= 80 ? '⚠️ 한도에 가까워지고 있어요' : `플랜 한도 ${limit}개`}
            tooltip={`현재 플랜(${tenant?.plan || 'basic'})에서 등록 가능한 FAQ 수입니다.\n${limit === -1 ? '무제한으로 사용 가능합니다.' : `최대 ${limit}개까지 등록 가능합니다.`}`}
          />
        </div>
      )}

      {/* FAQ 한도 경고 */}
      {!loading && faqPct >= 100 && tenant?.plan !== 'master' && (
        <div style={{ borderRadius: '12px', background: '#FEF2F2', border: '1px solid #FECACA', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
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

      {/* 최근 대화 5건 */}
      <div style={S.card}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>최근 대화 5건</h3>
        {loading ? <SkeletonCard/> : recentLogs.length === 0 ?
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px', padding: '40px 0' }}>아직 대화 기록이 없습니다.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse', minWidth: '400px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['시간','채널','질문','의도'].map(h => (
                    <th key={h} style={{ textAlign: 'left', paddingBottom: '10px', paddingRight: '16px', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentLogs.slice(0, 5).map((log: any) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px 12px 0', fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {log.created_at_kst?.slice(5, 16) || '—'}
                    </td>
                    <td style={{ padding: '12px 16px 12px 0' }}><Badge variant="indigo">{CH_LABELS[log.channel]||log.channel||'웹'}</Badge></td>
                    <td style={{ padding: '12px 16px 12px 0', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                      {log.user_message}
                    </td>
                    <td style={{ padding: '12px 0' }}><Badge variant={log.intent==='COMPLAINT'?'red':'gray'}>{IT_LABELS[log.intent]||log.intent||'기타'}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
