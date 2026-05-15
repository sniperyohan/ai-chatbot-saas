import React, { useState } from 'react'
import { Copy, Check, ChevronDown, ChevronRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { S } from '../lib/ui'

// 복사 버튼 컴포넌트
function CopyButton({ text, label = '복사', size = 'sm' }: { text: string; label?: string; size?: 'sm' | 'md' }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  const pad = size === 'md' ? '9px 18px' : '6px 14px'
  const fs = size === 'md' ? '13px' : '12px'
  return (
    <button onClick={copy} style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px', padding: pad,
      background: copied ? '#059669' : 'var(--primary)', color: '#fff',
      border: 'none', borderRadius: '8px', fontSize: fs, fontWeight: 600,
      cursor: 'pointer', minHeight: '36px', fontFamily: 'inherit', transition: 'background 0.2s',
      whiteSpace: 'nowrap',
    }}>
      {copied ? <><Check size={13}/>복사됨!</> : <><Copy size={13}/>{label}</>}
    </button>
  )
}

// 코드 박스
function CodeBox({ code, lang = 'html' }: { code: string; lang?: string }) {
  return (
    <div style={{ position: 'relative', background: '#1E1E2E', borderRadius: '10px', padding: '20px', marginBottom: '10px', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '10px', right: '10px' }}>
        <CopyButton text={code} label="복사"/>
      </div>
      <pre style={{ fontSize: '12px', color: '#CDD6F4', overflowX: 'auto', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6, paddingRight: '80px' }}>
        {code}
      </pre>
      <div style={{ position: 'absolute', top: '10px', left: '14px', fontSize: '10px', color: 'rgba(205,214,244,0.4)', fontWeight: 600 }}>
        {lang.toUpperCase()}
      </div>
    </div>
  )
}

// 단계별 설치 가이드 아이템
function StepItem({ num, title, desc, code, codeLang, note }: { num: number; title: string; desc: string; code?: string; codeLang?: string; note?: string }) {
  const [expanded, setExpanded] = useState(num === 1)
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '10px', marginBottom: '10px', overflow: 'hidden' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', background: expanded ? 'rgba(79,70,229,0.03)' : 'var(--bg-secondary)', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
      >
        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: expanded ? 'var(--primary)' : 'var(--border)', color: expanded ? '#fff' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, flexShrink: 0 }}>
          {num}
        </div>
        <span style={{ flex: 1, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</span>
        {expanded ? <ChevronDown size={16} color="var(--text-secondary)"/> : <ChevronRight size={16} color="var(--text-secondary)"/>}
      </button>
      {expanded && (
        <div style={{ padding: '0 16px 16px 56px' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: code ? '12px' : 0, lineHeight: 1.7 }}>{desc}</p>
          {code && <CodeBox code={code} lang={codeLang}/>}
          {note && <p style={{ fontSize: '12px', color: 'var(--primary)', background: 'rgba(79,70,229,0.06)', padding: '8px 12px', borderRadius: '6px', marginTop: '8px', lineHeight: 1.6 }}>💡 {note}</p>}
        </div>
      )}
    </div>
  )
}

// 플랫폼 탭
const PLATFORMS = [
  {
    id: 'cafe24',
    label: '카페24',
    icon: '🛒',
    color: '#FF6B35',
    desc: '국내 최대 쇼핑몰 플랫폼',
  },
  {
    id: 'smartstore',
    label: '스마트스토어',
    icon: '🟢',
    color: '#03C75A',
    desc: '네이버 스마트스토어',
  },
  {
    id: 'imweb',
    label: '아임웹',
    icon: '🌐',
    color: '#5B67CA',
    desc: '홈페이지/쇼핑몰 빌더',
  },
  {
    id: 'godomall',
    label: '고도몰',
    icon: '🏪',
    color: '#FF4444',
    desc: '고도소프트 쇼핑몰',
  },
  {
    id: 'woocommerce',
    label: 'WooCommerce',
    icon: '🎯',
    color: '#7F54B3',
    desc: '워드프레스 기반 쇼핑몰',
  },
  {
      id: 'kakao',
    label: '카카오채널',
    icon: '💬',
    color: '#FAE100',
    desc: '카카오톡 채널 연동',
  },
  {
    id: 'custom',
    label: '직접 설치',
    icon: '⚙️',
    color: '#6B7280',
    desc: 'HTML 직접 삽입',
  },
]

function getSteps(platform: string, script: string, tenantId: string) {
  const steps: Record<string, any[]> = {
    cafe24: [
      {
        title: '카페24 관리자 접속',
        desc: '카페24 관리자 페이지(admin.cafe24.com)에 로그인하세요.',
      },
      {
        title: '디자인 편집 진입',
        desc: '좌측 메뉴에서 [디자인] → [디자인 편집] → [HTML 편집]을 클릭하세요.',
      },
      {
        title: '레이아웃 파일에서 코드 삽입',
        desc: '기본 레이아웃의 HTML에서 </body> 태그를 찾아 그 바로 앞에 아래 코드를 붙여넣으세요.',
        code: script,
        codeLang: 'html',
        note: '다자인 편집에서 상단 메뉴 [공통 레이아웃(하단)]을 선택하면 더 편리합니다.',
      },
      {
        title: '저장 후 확인',
        desc: '저장 버튼을 클릭하고, 쇼핑몰 프론트에서 채팅 위젯이 정상 표시되는지 확인하세요.',
      },
    ],
    smartstore: [
      {
        title: '스마트스토어 관리자 접속',
        desc: '스마트스토어 센터(sell.smartstore.naver.com)에 로그인하세요.',
      },
      {
        title: '스토어 전시 관리 접속',
        desc: '좌측 메뉴에서 [스토어 전시] → [스토어 꾸미기] → [컴포넌트 관리]를 클릭하세요.',
      },
      {
        title: 'HTML 위젯 추가',
        desc: '컴포넌트 추가에서 [HTML/CSS] 유형을 선택하고 아래 코드를 붙여넣으세요.',
        code: script,
        codeLang: 'html',
        note: '스마트스토어는 외부 스크립트 사용에 제한이 있을 수 있습니다. "직접 설치" 방법도 참고해 주세요.',
      },
      {
        title: '저장 후 미리보기',
        desc: '저장 후 스토어 화면에서 채팅 위젯을 확인하세요.',
      },
    ],
    imweb: [
      {
        title: '아임웹 편집 화면 접속',
        desc: '아임웹 관리자(imweb.me)에 로그인 후 내 사이트 → 편집하기를 클릭하세요.',
      },
      {
        title: '코드 삽입 설정으로 이동',
        desc: '[설정] → [코드 삽입] 메뉴로 이동하세요. 또는 [사이트 설정] → [분석/마케팅 코드 삽입]을 찾으세요.',
      },
      {
        title: 'BODY 종료 전 코드 삽입',
        desc: '"BODY 종료 전" 입력란에 아래 코드를 붙여넣으세요.',
        code: script,
        codeLang: 'html',
        note: '아임웹 버전에 따라 경로가 다를 수 있습니다. "외부 스크립트" 항목도 확인해 보세요.',
      },
      {
        title: '저장 및 배포',
        desc: '저장 후 [배포하기] 버튼을 눌러 변경사항을 사이트에 반영하세요.',
      },
    ],
    godomall: [
      {
        title: '고도몰 관리자 접속',
        desc: '고도몰 관리자 페이지에 로그인하세요.',
      },
      {
        title: '디자인 편집 진입',
        desc: '[디자인] → [PC 쇼핑몰 디자인] → [HTML 편집]으로 이동하세요.',
      },
      {
        title: 'footer.html에 코드 삽입',
        desc: 'layouts 폴더의 footer.html 파일을 열고 </body> 태그 앞에 아래 코드를 삽입하세요.',
        code: script,
        codeLang: 'html',
        note: '고도몰 5 이상에서는 [통합 레이아웃] 파일 편집을 사용하세요.',
      },
      {
        title: '저장 후 확인',
        desc: '저장 후 쇼핑몰에서 위젯이 표시되는지 확인하세요.',
      },
    ],
    woocommerce: [
      {
        title: '워드프레스 관리자 접속',
        desc: '워드프레스 관리자(/wp-admin)에 로그인하세요.',
      },
      {
        title: '테마 편집 또는 플러그인 사용',
        desc: '[외관] → [테마 편집] → footer.php 파일을 선택하세요. 또는 "Insert Headers and Footers" 플러그인을 사용하세요.',
      },
      {
        title: 'footer.php에 코드 삽입',
        desc: '</body> 태그 직전에 아래 코드를 붙여넣으세요.',
        code: script,
        codeLang: 'html',
        note: '"Insert Headers and Footers" 플러그인 사용 시 [설정] → [Insert Headers and Footers] → Footer 섹션에 붙여넣으세요.',
      },
      {
        title: '저장 및 확인',
        desc: '저장 후 사이트 프론트에서 채팅 위젯을 확인하세요.',
      },
    ],
    kakao: [
      {
        title: '카카오톡 채널 개설',
        desc: '카카오톡 채널 관리자(business.kakao.com)에 접속하여 채널을 개설하세요.',
      },
      {
        title: '카카오 비즈니스 관리자 설정',
        desc: '카카오 비즈니스 관리자센터에서 [채널] → [채널 관리] → [챗봇 연결]을 클릭하세요.',
      },
      {
        title: '웹사이트에 스크립트 삽입',
        desc: '웹사이트 </body> 태그 바로 위에 아래 코드를 붙여넣으세요.',
        code: script,
        codeLang: 'html',
        note: '카카오채널 연동 시 data-tenant 값이 카카오 채널 ID와 매핑됩니다. 변경하지 마세요.',
      },
      {
        title: '채널 연동 확인',
        desc: '카카오톡에서 채널을 검색하여 챗봇이 정상 응답하는지 확인하세요.',
      },
    ],
    custom: [
      {
        title: 'HTML 파일 준비',
        desc: '위젯을 설치할 HTML 파일을 텍스트 에디터(VS Code, 메모장 등)로 여세요.',
      },
      {
        title: '</body> 태그 위치 확인',
        desc: 'HTML 파일에서 </body> 태그를 찾으세요. 보통 파일 가장 하단에 있습니다.',
      },
      {
        title: '스크립트 삽입',
        desc: '</body> 태그 바로 위에 아래 코드를 붙여넣으세요.',
        code: script,
        codeLang: 'html',
        note: `data-tenant="${tenantId}" 값이 귀사 고유 ID입니다. 절대 변경하지 마세요.`,
      },
      {
        title: '파일 저장 후 업로드',
        desc: '수정한 파일을 저장하고 서버에 업로드하세요. 브라우저에서 채팅 아이콘이 표시되면 설치 완료입니다.',
      },
    ],
  }
  return steps[platform] || steps.custom
}

export default function InstallPage() {
  const { tenant } = useAuth()
  const [activePlatform, setActivePlatform] = useState('cafe24')

  const tenantId    = tenant?.id           || 'YOUR_TENANT_ID'
  const widgetColor = tenant?.widget_color || '#4F46E5'
  const botName     = tenant?.bot_name     || 'AI 상담봇'
  const greeting    = tenant?.greeting_message || '안녕하세요! 무엇을 도와드릴까요? 😊'
  const domain      = 'https://ai-chatbot-saas.angels1st.workers.dev'

  /* ── 설치 코드 1: data-tenant 속성 방식 (간단) ── */
  const widgetScript = `<script\n  src="${domain}/widget.js"\n  data-tenant="${tenantId}"\n  data-color="${widgetColor}"\n  data-bot-name="${botName}"\n  defer\n></script>`

  /* ── 설치 코드 2: ChatbotWidget.init() 방식 (고급) ── */
  const initScript = `<script>
  (function() {
    var s = document.createElement('script');
    s.src = '${domain}/widget.js';
    s.onload = function() {
      ChatbotWidget.init({
        tenantId: '${tenantId}',
        apiUrl:   '${domain}',
        color:    '${widgetColor}',
        botName:  '${botName}',
        greeting: '${greeting}'
      });
    };
    document.head.appendChild(s);
  })();
</script>`

  const currentPlatform = PLATFORMS.find(p => p.id === activePlatform)!
  const steps = getSteps(activePlatform, widgetScript, tenantId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>위젯 설치 가이드</h2>
        <span style={{ fontSize: '12px', fontWeight: 600, padding: '3px 10px', borderRadius: '9999px', background: 'rgba(79,70,229,0.1)', color: 'var(--primary)' }}>
          Tenant ID: {tenantId.slice(0, 16)}{tenantId.length > 16 ? '...' : ''}
        </span>
      </div>

      {/* ── 설치 코드 공통 섹션 ── */}
      <div style={{ ...S.card }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span style={{ fontSize: '18px' }}>📋</span>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>설치 코드</h3>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.6 }}>
          아래 두 가지 방식 중 하나를 선택해 웹사이트의{' '}
          <code style={{ background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: '4px', fontSize: '12px', color: 'var(--primary)', fontFamily: 'monospace' }}>&lt;/body&gt;</code>
          {' '}태그 앞에 붙여넣으세요.
        </p>

        {/* 방식 1 */}
        <div style={{ marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, padding: '2px 8px', borderRadius: '9999px', background: 'rgba(79,70,229,0.1)', color: 'var(--primary)' }}>방식 1</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>간단 설치 (data-tenant 속성)</span>
          </div>
          <CodeBox code={widgetScript} lang="html"/>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '4px' }}>
            <CopyButton text={widgetScript} label="코드 복사" size="md"/>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Tenant ID: <code style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--primary)' }}>{tenantId}</code>
            </span>
          </div>
        </div>

        {/* 방식 2 */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, padding: '2px 8px', borderRadius: '9999px', background: 'rgba(5,150,105,0.1)', color: '#059669' }}>방식 2</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>고급 설치 (ChatbotWidget.init)</span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', lineHeight: 1.6 }}>
            색상·봇이름·인사말이 자동 반영되며, 동적 로딩이 필요할 때 사용하세요.
          </p>
          <CodeBox code={initScript} lang="javascript"/>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '4px' }}>
            <CopyButton text={initScript} label="코드 복사" size="md"/>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              색상: <code style={{ fontFamily: 'monospace', fontWeight: 600, color: widgetColor }}>{widgetColor}</code>
              {' '}&nbsp;봇이름: <code style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--primary)' }}>{botName}</code>
            </span>
          </div>
        </div>
      </div>

      {/* ── 플랫폼 선택 탭 ── */}
      <div style={{ ...S.card }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px' }}>
          📦 플랫폼별 설치 가이드
        </h3>

        {/* 플랫폼 탭 버튼들 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
          {PLATFORMS.map(p => {
            const isActive = activePlatform === p.id
            return (
              <button
                key={p.id}
                onClick={() => setActivePlatform(p.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '8px 14px', borderRadius: '10px', cursor: 'pointer',
                  fontSize: '13px', fontWeight: 600, fontFamily: 'inherit',
                  border: isActive ? `2px solid ${p.color}` : '2px solid var(--border)',
                  background: isActive ? `${p.color}12` : 'var(--bg-secondary)',
                  color: isActive ? p.color : 'var(--text-secondary)',
                  transition: 'all 0.15s',
                  minHeight: '40px',
                }}
              >
                <span style={{ fontSize: '16px' }}>{p.icon}</span>
                {p.label}
              </button>
            )
          })}
        </div>

        {/* 선택된 플랫폼 정보 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', background: `${currentPlatform.color}08`, border: `1px solid ${currentPlatform.color}25`, borderRadius: '10px', marginBottom: '20px' }}>
          <span style={{ fontSize: '28px' }}>{currentPlatform.icon}</span>
          <div>
            <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{currentPlatform.label}</p>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{currentPlatform.desc}</p>
          </div>
          <div style={{ marginLeft: 'auto', padding: '4px 12px', borderRadius: '9999px', background: `${currentPlatform.color}15`, color: currentPlatform.color, fontSize: '12px', fontWeight: 700 }}>
            {steps.length}단계
          </div>
        </div>

        {/* 단계별 가이드 */}
        <div>
          {steps.map((step: any, i: number) => (
            <StepItem
              key={i}
              num={i + 1}
              title={step.title}
              desc={step.desc}
              code={step.code}
              codeLang={step.codeLang}
              note={step.note}
            />
          ))}
        </div>

        {/* 설치 완료 체크 */}
        <div style={{ marginTop: '20px', padding: '14px 16px', background: 'rgba(5,150,105,0.05)', border: '1px solid rgba(5,150,105,0.2)', borderRadius: '10px' }}>
          <p style={{ fontSize: '13px', fontWeight: 700, color: '#059669', marginBottom: '6px' }}>✅ 설치 완료 확인</p>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            설치 후 쇼핑몰 화면 오른쪽 하단에 채팅 버튼이 나타나면 설치 완료입니다.<br/>
            버튼이 보이지 않으면 브라우저 캐시를 지우거나 (Ctrl+Shift+R) 다시 시도해 보세요.
          </p>
        </div>
      </div>

      {/* ── 테스트 링크 ── */}
      <div style={{ ...S.card }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>🧪 위젯 테스트</h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: 1.6 }}>
          설치 전 위젯이 정상 작동하는지 미리 테스트해보세요.
        </p>
        <a
          href={`${domain}/widget-test.html`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            padding: '9px 18px', borderRadius: '8px',
            background: 'var(--primary)', color: '#fff',
            fontSize: '13px', fontWeight: 600, textDecoration: 'none',
            minHeight: '36px',
          }}
        >
          <span>🔗</span> 위젯 테스트 페이지 열기
        </a>
      </div>

      {/* ── 고급 설정 ── */}
      <div style={{ ...S.card }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>⚙️ 고급 설정 (선택사항)</h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: 1.6 }}>
          위젯의 위치, 색상, 자동 오픈 기능을 커스터마이징할 수 있습니다.
        </p>
        <CodeBox
          code={`<script\n  src="${domain}/widget.js"\n  data-tenant="${tenantId}"\n  data-color="${widgetColor}"\n  data-bot-name="${botName}"\n  data-position="bottom-right"\n  data-auto-open="false"\n  data-delay="3000"\n  defer\n></script>`}
          lang="html"
        />
      </div>

      {/* ── 문의 ── */}
      <div style={{ ...S.card, textAlign: 'center', padding: '24px' }}>
        <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>설치가 어려우시면 연락주세요</p>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          
          📞 010-2974-0933
        </p>
      </div>
    </div>
  )
}
