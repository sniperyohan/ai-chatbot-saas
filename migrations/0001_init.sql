-- =====================================================
-- AI 상담봇 SaaS - Cloudflare D1 초기 스키마
-- D1은 SQLite 기반 → UUID 대신 TEXT PRIMARY KEY 사용
-- =====================================================

-- ─── plans (요금제) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS plans (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  plan_name   TEXT NOT NULL UNIQUE,
  price       INTEGER NOT NULL DEFAULT 0,
  faq_limit   INTEGER NOT NULL DEFAULT 50,
  chat_limit  INTEGER NOT NULL DEFAULT 1000,
  description TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- ─── admins (슈퍼관리자) ─────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email         TEXT NOT NULL UNIQUE,
  password      TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'super_admin',
  is_active     INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

-- ─── tenants (고객사) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id                      TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),

  -- 기본 정보
  company_name            TEXT NOT NULL,
  email                   TEXT NOT NULL UNIQUE,
  password                TEXT NOT NULL,

  -- 요금제
  plan                    TEXT NOT NULL DEFAULT 'basic',

  -- 봇 설정
  bot_name                TEXT DEFAULT 'AI 상담봇',
  greeting_message        TEXT DEFAULT '안녕하세요! 무엇을 도와드릴까요? 😊',
  fallback_message        TEXT DEFAULT '죄송합니다. 잘 이해하지 못했습니다.',
  widget_color            TEXT DEFAULT '#4F46E5',
  supported_languages     TEXT DEFAULT '["ko"]',
  system_prompt           TEXT DEFAULT '',
  response_tone           TEXT DEFAULT 'friendly',
  max_response_length     INTEGER DEFAULT 500,
  show_sources            INTEGER DEFAULT 1,
  auto_escalate           INTEGER DEFAULT 0,

  -- 운영시간 설정
  business_hours_enabled  INTEGER DEFAULT 0,
  business_hours          TEXT DEFAULT '{}',
  off_hours_message       TEXT DEFAULT '운영시간이 아닙니다.',
  lunch_break             TEXT DEFAULT '{}',

  -- 구독 정보
  billing_day             INTEGER DEFAULT 1,
  subscribed_at           TEXT,
  subscription_start_date TEXT,
  subscription_end_date   TEXT,
  subscription_status     TEXT DEFAULT 'active',
  payment_memo            TEXT,
  payment_requested_at    TEXT,

  -- 한도
  faq_limit               INTEGER DEFAULT 50,
  chat_limit              INTEGER DEFAULT 1000,

  -- 계정 상태
  is_active               INTEGER NOT NULL DEFAULT 1,
  is_deleted              INTEGER NOT NULL DEFAULT 0,
  is_temp_password        INTEGER NOT NULL DEFAULT 1,
  password_changed_at     TEXT,

  -- 로그인 보안
  login_fail_count        INTEGER DEFAULT 0,
  login_locked_until      TEXT,

  created_at              TEXT DEFAULT (datetime('now')),
  updated_at              TEXT DEFAULT (datetime('now'))
);

-- ─── plan_history (요금제 변경 이력) ─────────────────
CREATE TABLE IF NOT EXISTS plan_history (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  old_plan    TEXT NOT NULL,
  new_plan    TEXT NOT NULL,
  changed_by  TEXT,
  changed_at  TEXT DEFAULT (datetime('now')),
  memo        TEXT
);

-- ─── documents (FAQ / 지식베이스) ────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  question          TEXT NOT NULL DEFAULT '',
  answer            TEXT NOT NULL DEFAULT '',
  original_question TEXT,
  original_answer   TEXT,
  refined_question  TEXT,
  refined_answer    TEXT,
  content           TEXT DEFAULT '',
  category          TEXT DEFAULT '일반',
  language          TEXT DEFAULT 'ko',
  intent            TEXT DEFAULT '',
  is_active         INTEGER NOT NULL DEFAULT 1,
  is_deleted        INTEGER NOT NULL DEFAULT 0,
  is_ai_refined     INTEGER NOT NULL DEFAULT 0,
  embedding         TEXT,
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT DEFAULT (datetime('now'))
);

-- ─── chat_logs (채팅 로그) ────────────────────────────
CREATE TABLE IF NOT EXISTS chat_logs (
  id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id       TEXT,
  message_id       TEXT,
  user_message     TEXT NOT NULL,
  bot_response     TEXT NOT NULL DEFAULT '',
  bot_answer       TEXT DEFAULT '',
  channel          TEXT DEFAULT 'web',
  intent           TEXT,
  detected_language TEXT DEFAULT 'ko',
  confidence       REAL,
  response_time_ms INTEGER,
  created_at       TEXT DEFAULT (datetime('now'))
);

-- ─── payment_settings (결제 계좌) ─────────────────────
CREATE TABLE IF NOT EXISTS payment_settings (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  bank_name       TEXT,
  account_number  TEXT,
  account_holder  TEXT,
  payment_guide   TEXT,
  updated_at      TEXT DEFAULT (datetime('now'))
);

-- ─── platform_apis (연동 플랫폼) ─────────────────────
CREATE TABLE IF NOT EXISTS platform_apis (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  platform_name TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  api_endpoint  TEXT,
  auth_type     TEXT DEFAULT 'api_key',
  description   TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

-- ─── integrations (테넌트별 플랫폼 연동) ─────────────
CREATE TABLE IF NOT EXISTS integrations (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform_name TEXT NOT NULL,
  api_key       TEXT,
  config        TEXT DEFAULT '{}',
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

-- ─── 인덱스 ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tenants_email       ON tenants(email);
CREATE INDEX IF NOT EXISTS idx_tenants_is_active   ON tenants(is_active);
CREATE INDEX IF NOT EXISTS idx_tenants_plan        ON tenants(plan);
CREATE INDEX IF NOT EXISTS idx_tenants_sub_end     ON tenants(subscription_end_date);
CREATE INDEX IF NOT EXISTS idx_chat_logs_tenant    ON chat_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_logs_created   ON chat_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_documents_tenant    ON documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_is_active ON documents(is_active, is_deleted);
CREATE INDEX IF NOT EXISTS idx_admins_email        ON admins(email);

-- ─── 기본 요금제 데이터 ───────────────────────────────
INSERT OR IGNORE INTO plans (plan_name, price, faq_limit, chat_limit, description) VALUES
  ('basic',  99000,   50,  1000, 'FAQ 50개, 월 1,000회 답변'),
  ('pro',   199000,  200,  5000, 'FAQ 200개, 월 5,000회 답변'),
  ('master',399000,   -1,    -1, 'FAQ 무제한, 월 답변 무제한');

-- ─── 기본 플랫폼 데이터 ───────────────────────────────
INSERT OR IGNORE INTO platform_apis (platform_name, display_name, api_endpoint, auth_type, description, is_active) VALUES
  ('cafe24',      'Cafe24',           'https://api.cafe24.com/api/v2',           'oauth2',  'Cafe24 쇼핑몰 연동',      1),
  ('smartstore',  'Naver Smartstore', 'https://api.commerce.naver.com/external', 'oauth2',  '네이버 스마트스토어 연동', 1),
  ('imweb',       'imweb',            'https://api.imweb.me/v2',                 'api_key', 'imweb 쇼핑몰 연동',       1),
  ('godomall',    'Godomall',         'https://api.godo.co.kr',                  'api_key', '고도몰 연동',             1),
  ('woocommerce', 'WooCommerce',      'https://yourstore.com/wp-json/wc/v3',     'api_key', 'WooCommerce 연동',        1),
  ('kakao',       'Kakao Channel',    'https://kapi.kakao.com',                  'oauth2',  '카카오 채널 연동',        1),
  ('custom',      'Custom API',       '',                                         'api_key', '커스텀 API 연동',         1);
