import React, { useState, useEffect } from 'react'
import { Copy, Check, ExternalLink, Key, TestTube, Save, Trash2, Loader2, CheckCircle, XCircle, Link2 } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../hooks/useToast'
import ToastContainer from '../components/Toast'
import Modal from '../components/Modal'
import { S } from '../lib/ui'

const PLATFORMS = [
  { name: 'cafe24', label: '카페24', icon: '🛒', color: '#FF6B35', authType: 'oauth2', desc: '카페24 쇼핑몰 주문조회 연동' },
  { name: 'smartstore', label: '스마트스토어', icon: '🟢', color: '#03C75A', authType: 'oauth2', desc: '네이버 스마트스토어 주문조회 연동' },
  { name: 'imweb', label: '아임웹', icon: '🌐', color: '#5B67CA', authType: 'api_key', desc: '아임웹 쇼핑몰 주문조회 연동' },
  { name: 'woocommerce', label: 'WooCommerce', icon: '🎯', color: '#7F54B3', authType: 'api_key', desc: '워드프레스 우커머스 주문조회 연동' },
  { name: 'custom', label: '커스텀 API', icon: '⚙️', color: '#6B7280', authType: 'api_key', desc: '직접 개발한 쇼핑몰 API 연동' },
]

function CopyButton({ text, label = '복사' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy} style={{
      display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px',
      background: copied ? '#059669' : 'var(--primary)', color: '#fff',
      border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', minHeight: '38px', fontFamily: 'inherit',
      transition: 'background 0.2s',
    }}>
      {copied ? <><Check size={14}/>복사됨!</> : <><Copy size={14}/>{label}</>}
    </button>
  )
}

export default function InstallPage() {
  const { tenant } = useAuth()
  const toast = useToast()
  const [integrations, setIntegrations] = useState<Record<string, any>>({})
  const [modalPlatform, setModalPlatform] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [shopId, setShopId] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'success'|'fail'|null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string|null>(null)

  const tenantId = tenant?.id || 'YOUR_TENANT_ID'
  const widgetScript = `<script src="https://your-domain.pages.dev/widget.js" data-tenant="${tenantId}" defer></script>`
  const kakaoUrl = `https://your-domain.pages.dev/api/kakao/chat`
  const naverUrl = `https://your-domain.pages.dev/api/naver/chat`
  const orderApiUrl = `https://your-domain.pages.dev/api/order/lookup`

  const isPro = tenant?.plan === 'pro' || tenant?.plan === 'master'

  useEffect(() => {
    api.getIntegrations().then(res => {
      const data: Record<string, any> = {}
      for (const i of res.data?.items || []) data[i.platform_name] = i
      setIntegrations(data)
    }).catch(() => {})
  }, [])

  const openModal = (platform: string) => {
    const existing = integrations[platform]
    setApiKey(existing?.api_key || '')
    setApiSecret(existing?.api_secret || '')
    setShopId(existing?.shop_id || '')
    setTestResult(null)
    setModalPlatform(platform)
  }

  const handleTest = async () => {
    setTesting(true); setTestResult(null)
    try {
      await api.testIntegration({ platform_name: modalPlatform, api_key: apiKey, api_secret: apiSecret, shop_id: shopId })
      setTestResult('success')
    } catch {
      setTestResult('fail')
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.saveIntegration({ platform_name: modalPlatform, api_key: apiKey, api_secret: apiSecret, shop_id: shopId })
      const res = await api.getIntegrations()
      const data: Record<string, any> = {}
      for (const i of res.data?.items || []) data[i.platform_name] = i
      setIntegrations(data)
      toast.success(`${PLATFORMS.find(p=>p.name===modalPlatform)?.label} 연동이 저장되었습니다!`)
      setModalPlatform(null)
    } catch (e: any) {
      toast.error(e.message || '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (platform: string) => {
    setDeleting(platform)
    try {
      await api.deleteIntegration(platform)
      setIntegrations(prev => { const n = {...prev}; delete n[platform]; return n })
      toast.success('연동이 해제되었습니다.')
    } catch (e: any) {
      toast.error(e.message || '삭제 실패')
    } finally {
      setDeleting(null)
    }
  }

  const modalPlatformInfo = PLATFORMS.find(p => p.name === modalPlatform)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast}/>
      <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>설치 코드</h2>

      {/* Web Widget */}
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <span style={{ fontSize: '20px' }}>🌐</span>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>웹 위젯 설치</h3>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>아래 코드를 웹사이트 {'<body>'} 태그 안에 붙여넣으세요.</p>
        <div style={{ position: 'relative', background: '#1E1E2E', borderRadius: '10px', padding: '20px', marginBottom: '12px' }}>
          <pre style={{ fontSize: '13px', color: '#CDD6F4', overflowX: 'auto', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{widgetScript}</pre>
        </div>
        <CopyButton text={widgetScript} label="코드 복사"/>

        {/* Platform Guides */}
        <div style={{ marginTop: '20px', padding: '16px', background: 'var(--bg-primary)', borderRadius: '10px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>📋 플랫폼별 설치 가이드</p>
          {[
            { name: 'Cafe24', step: '쇼핑몰 관리 → 디자인 → HTML/CSS 편집 → body 태그 전에 삽입' },
            { name: 'Shopify', step: '온라인 스토어 → 테마 → 코드 편집 → theme.liquid → </body> 앞에 삽입' },
            { name: '워드프레스', step: '외관 → 테마 편집 → footer.php → </body> 앞에 삽입' },
          ].map(({ name, step }) => (
            <div key={name} style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--primary)', minWidth: '80px' }}>{name}</span>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{step}</span>
            </div>
          ))}
        </div>
      </div>

      {/* KakaoTalk */}
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <span style={{ fontSize: '20px' }}>💬</span>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>카카오톡 채널 연동</h3>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>카카오 비즈니스 → 카카오톡 채널 → 챗봇 → 스킬 서버 URL에 입력하세요.</p>
        <div style={{ background: 'var(--bg-primary)', borderRadius: '8px', padding: '12px 16px', fontFamily: 'monospace', fontSize: '13px', color: 'var(--text-primary)', marginBottom: '12px', wordBreak: 'break-all' }}>
          {kakaoUrl}
        </div>
        <CopyButton text={kakaoUrl} label="URL 복사"/>
      </div>

      {/* Naver TalkTalk */}
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <span style={{ fontSize: '20px' }}>🟢</span>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>네이버 톡톡 연동</h3>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>네이버 톡톡 파트너센터 → 챗봇 설정 → 웹훅 URL에 입력하세요.</p>
        <div style={{ background: 'var(--bg-primary)', borderRadius: '8px', padding: '12px 16px', fontFamily: 'monospace', fontSize: '13px', color: 'var(--text-primary)', marginBottom: '12px', wordBreak: 'break-all' }}>
          {naverUrl}
        </div>
        <CopyButton text={naverUrl} label="URL 복사"/>
      </div>

      {/* Order Lookup - Pro+ Only */}
      <div style={{ ...S.card, opacity: isPro ? 1 : 0.7, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>🔗</span>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>주문조회 API 연동</h3>
          </div>
          <span style={{ padding: '3px 10px', borderRadius: '9999px', fontSize: '11px', fontWeight: 700, background: 'rgba(79,70,229,0.1)', color: 'var(--primary)' }}>Pro+ 전용</span>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>쇼핑몰 플랫폼과 연동하여 고객이 주문 현황을 조회할 수 있습니다.</p>

        {!isPro && (
          <div style={{ padding: '16px', background: 'rgba(79,70,229,0.05)', border: '1px solid rgba(79,70,229,0.15)', borderRadius: '10px', textAlign: 'center', marginBottom: '20px' }}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--primary)', marginBottom: '4px' }}>🚀 Pro 플랜으로 업그레이드하세요</p>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>주문조회 연동은 Pro 플랜 이상에서만 사용 가능합니다.</p>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
          {PLATFORMS.map(({ name, label, icon, color, desc }) => {
            const integrated = !!integrations[name]
            return (
              <div key={name} style={{ border: `2px solid ${integrated ? color : 'var(--border)'}`, borderRadius: '12px', padding: '16px', background: integrated ? `${color}08` : 'var(--bg-secondary)', transition: 'all 0.2s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '22px' }}>{icon}</span>
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{label}</p>
                    {integrated && <p style={{ fontSize: '11px', color: color, fontWeight: 600 }}>✓ 연동됨</p>}
                  </div>
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: 1.5 }}>{desc}</p>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => isPro && openModal(name)} disabled={!isPro}
                    style={{ flex: 1, padding: '7px 10px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: isPro ? 'pointer' : 'not-allowed', border: 'none', background: integrated ? color : 'var(--primary)', color: '#fff', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', minHeight: '36px' }}>
                    <Key size={12}/>{integrated ? '수정' : '연동'}
                  </button>
                  {integrated && (
                    <button onClick={() => isPro && handleDelete(name)} disabled={deleting === name || !isPro}
                      style={{ padding: '7px', borderRadius: '7px', background: 'rgba(239,68,68,0.1)', border: 'none', cursor: 'pointer', color: '#DC2626', display: 'flex', alignItems: 'center', minHeight: '36px' }}>
                      {deleting === name ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }}/> : <Trash2 size={12}/>}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {isPro && (
          <div style={{ marginTop: '20px', padding: '14px 16px', background: 'var(--bg-primary)', borderRadius: '10px' }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>주문조회 API 엔드포인트</p>
            <div style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-secondary)', wordBreak: 'break-all', marginBottom: '10px' }}>{orderApiUrl}</div>
            <CopyButton text={orderApiUrl} label="API URL 복사"/>
          </div>
        )}
      </div>

      {/* Integration Modal */}
      <Modal open={!!modalPlatform} onClose={() => setModalPlatform(null)} title={`${modalPlatformInfo?.label || ''} 연동 설정`} size="md">
        {modalPlatformInfo && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: 'var(--bg-primary)', borderRadius: '10px' }}>
              <span style={{ fontSize: '24px' }}>{modalPlatformInfo.icon}</span>
              <div>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{modalPlatformInfo.label}</p>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{modalPlatformInfo.desc}</p>
              </div>
            </div>

            {(modalPlatformInfo.authType === 'api_key' || modalPlatform === 'custom') && (
              <div>
                <label style={S.label}>API 키</label>
                <input value={apiKey} onChange={e => setApiKey(e.target.value)} type="password"
                  style={S.input} placeholder="API 키를 입력하세요"/>
              </div>
            )}

            {modalPlatformInfo.authType === 'oauth2' && (
              <>
                <div>
                  <label style={S.label}>Client ID</label>
                  <input value={apiKey} onChange={e => setApiKey(e.target.value)}
                    style={S.input} placeholder="Client ID"/>
                </div>
                <div>
                  <label style={S.label}>Client Secret</label>
                  <input value={apiSecret} onChange={e => setApiSecret(e.target.value)} type="password"
                    style={S.input} placeholder="Client Secret"/>
                </div>
              </>
            )}

            {(modalPlatform === 'cafe24' || modalPlatform === 'woocommerce') && (
              <div>
                <label style={S.label}>{modalPlatform === 'cafe24' ? '몰 ID (Mall ID)' : '쇼핑몰 URL'}</label>
                <input value={shopId} onChange={e => setShopId(e.target.value)}
                  style={S.input} placeholder={modalPlatform === 'cafe24' ? 'mymall' : 'https://myshop.com'}/>
              </div>
            )}

            {/* Test Result */}
            {testResult && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderRadius: '8px', background: testResult === 'success' ? '#ECFDF5' : '#FEF2F2', border: `1px solid ${testResult === 'success' ? '#6EE7B7' : '#FECACA'}`, color: testResult === 'success' ? '#065F46' : '#991B1B' }}>
                {testResult === 'success' ? <CheckCircle size={18}/> : <XCircle size={18}/>}
                <p style={{ fontSize: '13px', fontWeight: 600 }}>{testResult === 'success' ? '✅ 연동 테스트 성공!' : '❌ 연동 테스트 실패. 키를 확인해주세요.'}</p>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleTest} disabled={testing || !apiKey}
                style={{ ...S.btnSecondary, flex: 1, opacity: testing || !apiKey ? 0.5 : 1 }}>
                {testing ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }}/>테스트 중...</> : <><TestTube size={14}/>연동 테스트</>}
              </button>
              <button onClick={handleSave} disabled={saving || !apiKey}
                style={{ ...S.btnPrimary, flex: 1, opacity: saving || !apiKey ? 0.5 : 1 }}>
                {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }}/>저장 중...</> : <><Save size={14}/>저장</>}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
