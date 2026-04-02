/*
 * AI 챗봇 위젯 (ChatbotWidget)
 * 순수 JavaScript - 외부 CSS 없음, 인라인 스타일 전용
 *
 * ── 설치 코드 (고객사 </body> 태그 앞에 삽입) ──────────────────────────
 *
 * <script>
 *   (function() {
 *     var s = document.createElement('script');
 *     s.src = 'https://ai-chatbot-saas-1cb.pages.dev/widget.js';
 *     s.onload = function() {
 *       ChatbotWidget.init({
 *         tenantId: 'YOUR_TENANT_ID',
 *         apiUrl:   'https://ai-chatbot-saas-1cb.pages.dev',
 *         color:    '#4F46E5',
 *         botName:  'AI 상담봇',
 *         greeting: '안녕하세요! 무엇을 도와드릴까요? 😊'
 *       });
 *     };
 *     document.head.appendChild(s);
 *   })();
 * </script>
 *
 * ───────────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  /* ─────────────────────────────────────────
   * 네임스페이스 & 전역 변수 (__chatbot_ 접두사)
   * ───────────────────────────────────────── */
  var __chatbot_open    = false;
  var __chatbot_sending = false;
  var __chatbot_config  = null;

  /* ─────────────────────────────────────────
   * 유틸
   * ───────────────────────────────────────── */
  function __chatbot_isMobile() {
    return window.innerWidth < 480;
  }

  function __chatbot_scrollToBottom(el) {
    if (el) el.scrollTop = el.scrollHeight;
  }

  function __chatbot_escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ─────────────────────────────────────────
   * DOM 요소 참조 (초기화 후 할당)
   * ───────────────────────────────────────── */
  var __chatbot_btn      = null;  // 플로팅 버튼
  var __chatbot_window   = null;  // 채팅창 컨테이너
  var __chatbot_messages = null;  // 메시지 스크롤 영역
  var __chatbot_input    = null;  // 입력 필드
  var __chatbot_sendBtn  = null;  // 전송 버튼

  /* ─────────────────────────────────────────
   * CSS 애니메이션 키프레임 (한 번만 삽입)
   * ───────────────────────────────────────── */
  function __chatbot_injectKeyframes() {
    if (document.getElementById('__chatbot_style')) return;
    var style = document.createElement('style');
    style.id = '__chatbot_style';
    style.textContent = [
      '@keyframes __chatbot_bounce {',
      '  0%,80%,100%{transform:scale(0)} 40%{transform:scale(1)}',
      '}',
      '@keyframes __chatbot_fadeIn {',
      '  from{opacity:0;transform:translateY(20px)}',
      '  to{opacity:1;transform:translateY(0)}',
      '}',
    ].join('');
    document.head.appendChild(style);
  }

  /* ─────────────────────────────────────────
   * 플로팅 버튼 생성
   * ───────────────────────────────────────── */
  function __chatbot_createButton(color) {
    var btn = document.createElement('button');
    btn.id = '__chatbot_fab';
    btn.setAttribute('aria-label', '채팅 열기');
    Object.assign(btn.style, {
      position:     'fixed',
      bottom:       '20px',
      right:        '20px',
      zIndex:       '999999',
      width:        '56px',
      height:       '56px',
      borderRadius: '50%',
      background:   color,
      border:       'none',
      cursor:       'pointer',
      boxShadow:    '0 4px 16px rgba(0,0,0,0.2)',
      display:      'flex',
      alignItems:   'center',
      justifyContent: 'center',
      fontSize:     '24px',
      transition:   'transform 0.2s ease, box-shadow 0.2s ease',
      outline:      'none',
      padding:      '0',
      lineHeight:   '1',
    });
    btn.textContent = '💬';

    btn.addEventListener('mouseenter', function () {
      btn.style.transform = 'scale(1.1)';
      btn.style.boxShadow = '0 6px 20px rgba(0,0,0,0.28)';
    });
    btn.addEventListener('mouseleave', function () {
      btn.style.transform = 'scale(1)';
      btn.style.boxShadow = '0 4px 16px rgba(0,0,0,0.2)';
    });
    return btn;
  }

  /* ─────────────────────────────────────────
   * 채팅창 생성
   * ───────────────────────────────────────── */
  function __chatbot_createWindow(cfg) {
    var mobile = __chatbot_isMobile();

    /* ── 외부 컨테이너 ── */
    var win = document.createElement('div');
    win.id = '__chatbot_window';
    Object.assign(win.style, {
      position:     'fixed',
      bottom:       mobile ? '0'   : '90px',
      right:        mobile ? '0'   : '20px',
      zIndex:       '999998',
      width:        mobile ? '100vw' : '360px',
      height:       mobile ? '100vh' : '520px',
      borderRadius: mobile ? '0'   : '16px',
      boxShadow:    '0 8px 32px rgba(0,0,0,0.15)',
      display:      'flex',
      flexDirection:'column',
      overflow:     'hidden',
      background:   '#FFFFFF',
      fontFamily:   '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
      opacity:      '0',
      transform:    'translateY(20px)',
      transition:   'opacity 0.25s ease, transform 0.25s ease',
      pointerEvents:'none',
    });

    /* ── 헤더 ── */
    var header = document.createElement('div');
    Object.assign(header.style, {
      background:    cfg.color,
      padding:       '14px 16px',
      display:       'flex',
      alignItems:    'center',
      gap:           '10px',
      flexShrink:    '0',
    });

    var avatar = document.createElement('div');
    Object.assign(avatar.style, {
      width:        '36px',
      height:       '36px',
      borderRadius: '50%',
      background:   'rgba(255,255,255,0.25)',
      display:      'flex',
      alignItems:   'center',
      justifyContent:'center',
      fontSize:     '18px',
      flexShrink:   '0',
    });
    avatar.textContent = '🤖';

    var headerInfo = document.createElement('div');
    headerInfo.style.flex = '1';

    var botNameEl = document.createElement('div');
    Object.assign(botNameEl.style, {
      fontSize:   '15px',
      fontWeight: '700',
      color:      '#FFFFFF',
      lineHeight: '1.2',
    });
    botNameEl.textContent = cfg.botName || 'AI 상담봇';

    var statusEl = document.createElement('div');
    Object.assign(statusEl.style, {
      display:    'flex',
      alignItems: 'center',
      gap:        '4px',
      marginTop:  '2px',
    });
    var dot = document.createElement('span');
    Object.assign(dot.style, {
      width:        '7px',
      height:       '7px',
      borderRadius: '50%',
      background:   '#4ADE80',
      display:      'inline-block',
    });
    var onlineTxt = document.createElement('span');
    Object.assign(onlineTxt.style, {
      fontSize: '11px',
      color:    'rgba(255,255,255,0.85)',
    });
    onlineTxt.textContent = '온라인';
    statusEl.appendChild(dot);
    statusEl.appendChild(onlineTxt);

    headerInfo.appendChild(botNameEl);
    headerInfo.appendChild(statusEl);

    var closeBtn = document.createElement('button');
    closeBtn.setAttribute('aria-label', '채팅 닫기');
    Object.assign(closeBtn.style, {
      background:   'rgba(255,255,255,0.2)',
      border:       'none',
      borderRadius: '50%',
      width:        '30px',
      height:       '30px',
      display:      'flex',
      alignItems:   'center',
      justifyContent:'center',
      cursor:       'pointer',
      fontSize:     '16px',
      color:        '#FFFFFF',
      flexShrink:   '0',
      padding:      '0',
      lineHeight:   '1',
      transition:   'background 0.15s',
    });
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('mouseenter', function () {
      closeBtn.style.background = 'rgba(255,255,255,0.35)';
    });
    closeBtn.addEventListener('mouseleave', function () {
      closeBtn.style.background = 'rgba(255,255,255,0.2)';
    });
    closeBtn.addEventListener('click', function () {
      __chatbot_toggle();
    });

    header.appendChild(avatar);
    header.appendChild(headerInfo);
    header.appendChild(closeBtn);

    /* ── 메시지 영역 ── */
    var messages = document.createElement('div');
    messages.id = '__chatbot_messages';
    Object.assign(messages.style, {
      flex:       '1',
      overflowY:  'auto',
      padding:    '16px 14px',
      display:    'flex',
      flexDirection:'column',
      gap:        '10px',
      background: '#F9FAFB',
    });
    /* 스크롤바 스타일 */
    messages.style.scrollbarWidth = 'thin';
    messages.style.scrollbarColor = '#D1D5DB transparent';

    /* ── 입력 영역 ── */
    var inputArea = document.createElement('div');
    Object.assign(inputArea.style, {
      display:      'flex',
      alignItems:   'center',
      gap:          '8px',
      padding:      '10px 12px',
      background:   '#FFFFFF',
      borderTop:    '1px solid #E5E7EB',
      flexShrink:   '0',
    });

    var input = document.createElement('input');
    input.id          = '__chatbot_input';
    input.type        = 'text';
    input.placeholder = '메시지를 입력하세요...';
    Object.assign(input.style, {
      flex:        '1',
      padding:     '9px 13px',
      border:      '1px solid #E5E7EB',
      borderRadius:'10px',
      fontSize:    '14px',
      outline:     'none',
      fontFamily:  'inherit',
      background:  '#F9FAFB',
      color:       '#111827',
      transition:  'border-color 0.15s',
      minWidth:    '0',
    });
    input.addEventListener('focus', function () {
      input.style.borderColor = cfg.color;
      input.style.background  = '#FFFFFF';
    });
    input.addEventListener('blur', function () {
      input.style.borderColor = '#E5E7EB';
      input.style.background  = '#F9FAFB';
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        __chatbot_send();
      }
    });

    var sendBtn = document.createElement('button');
    sendBtn.id = '__chatbot_send';
    sendBtn.setAttribute('aria-label', '전송');
    Object.assign(sendBtn.style, {
      width:        '38px',
      height:       '38px',
      borderRadius: '10px',
      background:   cfg.color,
      border:       'none',
      cursor:       'pointer',
      display:      'flex',
      alignItems:   'center',
      justifyContent:'center',
      fontSize:     '16px',
      flexShrink:   '0',
      padding:      '0',
      transition:   'opacity 0.15s',
    });
    sendBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
    sendBtn.addEventListener('click', function () {
      __chatbot_send();
    });

    inputArea.appendChild(input);
    inputArea.appendChild(sendBtn);

    win.appendChild(header);
    win.appendChild(messages);
    win.appendChild(inputArea);

    /* 내부 참조 저장 */
    __chatbot_messages = messages;
    __chatbot_input    = input;
    __chatbot_sendBtn  = sendBtn;

    return win;
  }

  /* ─────────────────────────────────────────
   * 메시지 버블 생성
   * ───────────────────────────────────────── */
  function __chatbot_addMessage(text, isBot) {
    var cfg    = __chatbot_config;
    var bubble = document.createElement('div');
    Object.assign(bubble.style, {
      display:      'flex',
      flexDirection:'column',
      alignItems:   isBot ? 'flex-start' : 'flex-end',
      maxWidth:     '80%',
      alignSelf:    isBot ? 'flex-start' : 'flex-end',
    });

    var inner = document.createElement('div');
    Object.assign(inner.style, {
      padding:      '10px 13px',
      borderRadius: isBot ? '12px 12px 12px 4px' : '12px 12px 4px 12px',
      background:   isBot ? '#F3F4F6' : cfg.color,
      color:        isBot ? '#111827'  : '#FFFFFF',
      fontSize:     '14px',
      lineHeight:   '1.55',
      wordBreak:    'break-word',
      whiteSpace:   'pre-wrap',
    });
    inner.textContent = text;

    bubble.appendChild(inner);
    __chatbot_messages.appendChild(bubble);
    __chatbot_scrollToBottom(__chatbot_messages);
  }

  /* ─────────────────────────────────────────
   * 타이핑 인디케이터
   * ───────────────────────────────────────── */
  function __chatbot_showTyping() {
    var wrap = document.createElement('div');
    wrap.id = '__chatbot_typing';
    Object.assign(wrap.style, {
      display:      'flex',
      alignItems:   'flex-end',
      gap:          '6px',
      alignSelf:    'flex-start',
    });

    var bubble = document.createElement('div');
    Object.assign(bubble.style, {
      padding:      '10px 14px',
      borderRadius: '12px 12px 12px 4px',
      background:   '#F3F4F6',
      display:      'flex',
      alignItems:   'center',
      gap:          '4px',
    });

    for (var i = 0; i < 3; i++) {
      var dot = document.createElement('span');
      Object.assign(dot.style, {
        width:           '7px',
        height:          '7px',
        borderRadius:    '50%',
        background:      '#9CA3AF',
        display:         'inline-block',
        animation:       '__chatbot_bounce 1.4s ease-in-out ' + (i * 0.16) + 's infinite',
      });
      bubble.appendChild(dot);
    }

    wrap.appendChild(bubble);
    __chatbot_messages.appendChild(wrap);
    __chatbot_scrollToBottom(__chatbot_messages);
    return wrap;
  }

  function __chatbot_removeTyping() {
    var el = document.getElementById('__chatbot_typing');
    if (el) el.parentNode.removeChild(el);
  }

  /* ─────────────────────────────────────────
   * 전송 로직
   * ───────────────────────────────────────── */
  function __chatbot_send() {
    if (__chatbot_sending) return;
    var msg = __chatbot_input.value.trim();
    if (!msg) return;

    var cfg = __chatbot_config;

    __chatbot_input.value    = '';
    __chatbot_sending        = true;
    __chatbot_input.disabled = true;
    __chatbot_sendBtn.style.opacity = '0.5';
    __chatbot_sendBtn.style.cursor  = 'not-allowed';

    __chatbot_addMessage(msg, false);
    var typingEl = __chatbot_showTyping();

    var sessionId = null;
    try { sessionId = sessionStorage.getItem('chatbot_session'); } catch (e) {}

    fetch(cfg.apiUrl + '/api/chat/widget', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        tenant_id:  cfg.tenantId,
        message:    msg,
        channel:    'web',
        session_id: sessionId || null,
      }),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        __chatbot_removeTyping();
        var answer = (data && data.answer) ? data.answer : '죄송합니다. 잠시 후 다시 시도해주세요.';
        __chatbot_addMessage(answer, true);
        if (data && data.session_id) {
          try { sessionStorage.setItem('chatbot_session', data.session_id); } catch (e) {}
        }
      })
      .catch(function () {
        __chatbot_removeTyping();
        __chatbot_addMessage('죄송합니다. 잠시 후 다시 시도해주세요.', true);
      })
      .then(function () {
        /* 전송 완료 후 상태 초기화 */
        __chatbot_sending        = false;
        __chatbot_input.disabled = false;
        __chatbot_sendBtn.style.opacity = '1';
        __chatbot_sendBtn.style.cursor  = 'pointer';
        __chatbot_input.focus();
      });
  }

  /* ─────────────────────────────────────────
   * 열기/닫기 토글
   * ───────────────────────────────────────── */
  function __chatbot_toggle() {
    __chatbot_open = !__chatbot_open;

    if (__chatbot_open) {
      /* 열기 */
      __chatbot_window.style.pointerEvents = 'auto';
      __chatbot_window.style.opacity       = '1';
      __chatbot_window.style.transform     = 'translateY(0)';
      __chatbot_btn.textContent            = '✕';
      __chatbot_btn.setAttribute('aria-label', '채팅 닫기');
      /* 입력창 포커스 */
      setTimeout(function () {
        if (__chatbot_input) __chatbot_input.focus();
      }, 280);
    } else {
      /* 닫기 */
      __chatbot_window.style.pointerEvents = 'none';
      __chatbot_window.style.opacity       = '0';
      __chatbot_window.style.transform     = 'translateY(20px)';
      __chatbot_btn.textContent            = '💬';
      __chatbot_btn.setAttribute('aria-label', '채팅 열기');
    }
  }

  /* ─────────────────────────────────────────
   * 반응형: 창 크기 변경 시 채팅창 레이아웃 업데이트
   * ───────────────────────────────────────── */
  function __chatbot_onResize() {
    if (!__chatbot_window) return;
    var mobile = __chatbot_isMobile();
    __chatbot_window.style.width        = mobile ? '100vw'  : '360px';
    __chatbot_window.style.height       = mobile ? '100vh'  : '520px';
    __chatbot_window.style.bottom       = mobile ? '0'      : '90px';
    __chatbot_window.style.right        = mobile ? '0'      : '20px';
    __chatbot_window.style.borderRadius = mobile ? '0'      : '16px';
  }

  /* ─────────────────────────────────────────
   * 공개 API: ChatbotWidget.init()
   * ───────────────────────────────────────── */
  window.ChatbotWidget = {
    init: function (config) {
      /* 중복 초기화 방지 */
      if (window.__chatbotWidgetLoaded) return;
      window.__chatbotWidgetLoaded = true;

      /* config 검증 */
      if (!config || !config.tenantId || !config.apiUrl) {
        console.warn('[ChatbotWidget] tenantId와 apiUrl은 필수입니다.');
        return;
      }

      __chatbot_config = {
        tenantId: config.tenantId,
        apiUrl:   config.apiUrl.replace(/\/$/, ''),
        color:    config.color    || '#4F46E5',
        botName:  config.botName  || 'AI 상담봇',
        greeting: config.greeting || '안녕하세요! 무엇을 도와드릴까요? 😊',
      };

      /* CSS 키프레임 삽입 */
      __chatbot_injectKeyframes();

      /* DOM 생성 */
      __chatbot_btn    = __chatbot_createButton(__chatbot_config.color);
      __chatbot_window = __chatbot_createWindow(__chatbot_config);

      document.body.appendChild(__chatbot_btn);
      document.body.appendChild(__chatbot_window);

      /* 플로팅 버튼 클릭 */
      __chatbot_btn.addEventListener('click', function () {
        __chatbot_toggle();
      });

      /* 초기 인사말 */
      __chatbot_addMessage(__chatbot_config.greeting, true);

      /* 반응형 */
      window.addEventListener('resize', __chatbot_onResize);
    },
  };

  /* ─────────────────────────────────────────
   * data-tenant 속성 자동 초기화 (스크립트 태그에
   * data-tenant="ID" 방식도 지원)
   * ───────────────────────────────────────── */
  (function __chatbot_autoInit() {
    var scripts = document.querySelectorAll('script[data-tenant]');
    if (!scripts.length) return;
    var s         = scripts[scripts.length - 1];
    var tenantId  = s.getAttribute('data-tenant');
    var apiUrl    = s.getAttribute('data-api-url') || 'https://ai-chatbot-saas-1cb.pages.dev';
    var color     = s.getAttribute('data-color')   || '#4F46E5';
    var botName   = s.getAttribute('data-bot-name')|| 'AI 상담봇';
    var greeting  = s.getAttribute('data-greeting')|| '안녕하세요! 무엇을 도와드릴까요? 😊';

    if (tenantId) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
          window.ChatbotWidget.init({ tenantId: tenantId, apiUrl: apiUrl, color: color, botName: botName, greeting: greeting });
        });
      } else {
        window.ChatbotWidget.init({ tenantId: tenantId, apiUrl: apiUrl, color: color, botName: botName, greeting: greeting });
      }
    }
  })();

})();
