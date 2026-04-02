-- =====================================================
-- AI 상담봇 SaaS - Supabase 스키마
-- =====================================================

-- pgvector 확장 활성화 (임베딩 저장용)
CREATE EXTENSION IF NOT EXISTS vector;

-- ─────────────────────────────────────────
-- plans 테이블 (요금제)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plans (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_name     TEXT NOT NULL UNIQUE,          -- 'basic' | 'pro' | 'master'
  price         INTEGER NOT NULL DEFAULT 0,    -- 월 금액 (원)
  faq_limit     INTEGER NOT NULL DEFAULT 50,   -- FAQ 한도 (-1 = 무제한)
  chat_limit    INTEGER NOT NULL DEFAULT 1000, -- 월 채팅 한도 (-1 = 무제한)
  description   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 기본 요금제 데이터
INSERT INTO plans (plan_name, price, faq_limit, chat_limit, description) VALUES
  ('basic',  99000,  50,  1000, 'FAQ 50개, 월 1,000회 답변'),
  ('pro',    199000, 200, 5000, 'FAQ 200개, 월 5,000회 답변'),
  ('master', 399000, -1,  -1,   'FAQ 무제한, 월 답변 무제한')
ON CONFLICT (plan_name) DO NOTHING;

-- ─────────────────────────────────────────
-- tenants 테이블 (고객사)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id                          UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- 기본 정보
  company_name                TEXT NOT NULL,
  email                       TEXT NOT NULL UNIQUE,
  password                    TEXT NOT NULL,                         -- bcrypt 해시

  -- 요금제
  plan                        TEXT NOT NULL DEFAULT 'basic',        -- 'basic'|'pro'|'master'

  -- 봇 설정
  bot_name                    TEXT DEFAULT 'AI 상담봇',
  greeting_message            TEXT DEFAULT '안녕하세요! 무엇을 도와드릴까요? 😊',
  fallback_message            TEXT DEFAULT '죄송합니다. 잘 이해하지 못했습니다. 다시 한번 질문해 주세요.',
  widget_color                TEXT DEFAULT '#4F46E5',
  supported_languages         TEXT[] DEFAULT ARRAY['ko'],
  system_prompt               TEXT DEFAULT '',
  response_tone               TEXT DEFAULT 'friendly',
  max_response_length         INTEGER DEFAULT 500,
  show_sources                BOOLEAN DEFAULT TRUE,
  auto_escalate               BOOLEAN DEFAULT FALSE,

  -- 운영시간 설정
  business_hours_enabled      BOOLEAN DEFAULT FALSE,
  business_hours              JSONB DEFAULT '{}',
  off_hours_message           TEXT DEFAULT '현재 운영시간이 아닙니다. 운영시간에 다시 문의해 주세요.',
  lunch_break                 JSONB DEFAULT '{}',

  -- 구독 정보
  billing_day                 INTEGER DEFAULT 1,                    -- 결제일 (1~28)
  billing_cycle               TEXT DEFAULT 'monthly',               -- 'monthly' | 'yearly'
  subscribed_at               DATE,
  subscription_start_date     DATE,
  subscription_end_date       DATE,
  subscription_status         TEXT DEFAULT 'active',                -- 'active'|'pending'|'expired'
  next_billing_date           DATE,
  current_period_start        DATE,
  current_period_end          DATE,
  payment_memo                TEXT,
  payment_requested_at        TIMESTAMPTZ,

  -- 계정 상태
  is_active                   BOOLEAN DEFAULT TRUE,
  is_deleted                  BOOLEAN DEFAULT FALSE,
  is_temp_password            BOOLEAN DEFAULT TRUE,
  password_changed_at         TIMESTAMPTZ,

  -- 로그인 보안 (계정 잠금)
  login_fail_count            INTEGER DEFAULT 0,
  login_locked_until          TIMESTAMPTZ,

  -- 한도
  faq_limit                   INTEGER DEFAULT 50,
  chat_limit                  INTEGER DEFAULT 1000,

  -- JWT 관련
  jwt_issued_at               TIMESTAMPTZ,

  -- 타임스탬프
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- plan_history 테이블 (요금제 변경 이력)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_history (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  old_plan      TEXT NOT NULL,
  new_plan      TEXT NOT NULL,
  changed_by    TEXT,                           -- 변경한 관리자 이메일
  changed_at    TIMESTAMPTZ DEFAULT NOW(),
  memo          TEXT
);

-- ─────────────────────────────────────────
-- admins 테이블 (슈퍼관리자)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password      TEXT NOT NULL,                  -- bcrypt 해시
  role          TEXT NOT NULL DEFAULT 'super_admin',
  is_active     BOOLEAN DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- documents 테이블 (FAQ / 지식베이스)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  question      TEXT NOT NULL,
  answer        TEXT NOT NULL,
  category      TEXT DEFAULT '일반',
  intent        TEXT DEFAULT '',
  embedding     vector(1536),                   -- OpenAI text-embedding-ada-002
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW 인덱스 (벡터 유사도 검색 최적화)
CREATE INDEX IF NOT EXISTS documents_embedding_hnsw_idx
  ON documents
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 테넌트별 조회 최적화 인덱스
CREATE INDEX IF NOT EXISTS documents_tenant_id_idx ON documents(tenant_id);
CREATE INDEX IF NOT EXISTS documents_tenant_active_idx ON documents(tenant_id, is_active);

-- ─────────────────────────────────────────
-- chat_logs 테이블 (채팅 로그)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_logs (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id    TEXT,
  user_message  TEXT NOT NULL,
  bot_response  TEXT,
  intent        TEXT DEFAULT '',
  channel       TEXT DEFAULT 'web',             -- 'web'|'kakao'|'naver'|'api'
  is_answered   BOOLEAN DEFAULT TRUE,
  response_time INTEGER,                        -- 응답 시간 (ms)
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS chat_logs_tenant_id_idx ON chat_logs(tenant_id);
CREATE INDEX IF NOT EXISTS chat_logs_tenant_created_idx ON chat_logs(tenant_id, created_at DESC);

-- ─────────────────────────────────────────
-- scenarios 테이블 (시나리오)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scenarios (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  trigger_type  TEXT DEFAULT 'keyword',         -- 'keyword'|'intent'|'greeting'
  trigger_value TEXT,
  responses     JSONB DEFAULT '[]',
  is_active     BOOLEAN DEFAULT TRUE,
  priority      INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scenarios_tenant_id_idx ON scenarios(tenant_id);

-- ─────────────────────────────────────────
-- payment_settings 테이블 (결제 계좌 설정)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_settings (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bank_name       TEXT DEFAULT '국민은행',
  account_number  TEXT DEFAULT '123-456-789012',
  account_holder  TEXT DEFAULT '홍길동',
  payment_guide   TEXT DEFAULT '입금 후 입금했어요 버튼을 눌러주세요. 확인 후 1시간 이내 처리됩니다.',
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- platform_apis 테이블 (쇼핑몰 플랫폼 API)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_apis (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  platform_name   TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  api_endpoint    TEXT,
  auth_type       TEXT DEFAULT 'api_key',       -- 'oauth2'|'api_key'|'bearer'
  description     TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 기본 플랫폼 데이터
INSERT INTO platform_apis (platform_name, display_name, api_endpoint, auth_type, description, is_active) VALUES
  ('cafe24',      'Cafe24',           'https://{mall_id}.cafe24api.com/api/v2',          'oauth2',  'Cafe24 쇼핑몰 연동',           TRUE),
  ('smartstore',  'Naver Smartstore', 'https://api.commerce.naver.com/external',         'oauth2',  '네이버 스마트스토어 연동',      TRUE),
  ('imweb',       'imweb',            'https://api.imweb.me/v2',                         'api_key', 'imweb 쇼핑몰 연동',            TRUE),
  ('godomall',    'Godomall',         'https://api.godomall.com/v1',                     'api_key', '고도몰 연동',                  TRUE),
  ('woocommerce', 'WooCommerce',      '',                                                'api_key', 'WooCommerce 연동',             TRUE),
  ('kakao',       'Kakao Channel',    'https://kapi.kakao.com',                          'oauth2',  '카카오 채널 연동',             TRUE),
  ('custom',      'Custom API',       '',                                                'api_key', '커스텀 API 연동',              TRUE)
ON CONFLICT (platform_name) DO NOTHING;

-- ─────────────────────────────────────────
-- integrations 테이블 (고객사별 연동 설정)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integrations (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform_name   TEXT NOT NULL,
  api_key         TEXT,
  api_secret      TEXT,
  access_token    TEXT,
  refresh_token   TEXT,
  config          JSONB DEFAULT '{}',
  is_active       BOOLEAN DEFAULT TRUE,
  last_tested_at  TIMESTAMPTZ,
  test_status     TEXT,                         -- 'success'|'failed'|null
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, platform_name)
);

CREATE INDEX IF NOT EXISTS integrations_tenant_id_idx ON integrations(tenant_id);

-- ─────────────────────────────────────────
-- updated_at 자동 갱신 함수 & 트리거
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_scenarios_updated_at
  BEFORE UPDATE ON scenarios
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_plans_updated_at
  BEFORE UPDATE ON plans
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_platform_apis_updated_at
  BEFORE UPDATE ON platform_apis
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
