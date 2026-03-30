import React, { useEffect, useState } from 'react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { MessageCircle, BookOpen, TrendingUp, TrendingDown, Calendar, ArrowUp, ArrowDown } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { SkeletonStats, SkeletonCard } from '../components/Skeleton'
import Badge from '../components/Badge'
import { S } from '../lib/ui'

const COLORS = ['#4F46E5','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4']
const CH_LABELS: Record<string,string> = { web:'웹', kakao:'카카오', naver:'네이버', messenger:'메신저' }
const IT_LABELS: Record<string,string> = { FAQ_INQUIRY:'FAQ', ORDER_INQUIRY:'주문', GREETING:'인사', RESERVATION:'예약', PAYMENT:'결제', COMPLAINT:'불만', OTHER:'기타' }

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
