-- =====================================================
-- AI 상담봇 SaaS - Supabase 전체 스키마
-- =====================================================

-- 1. admins (슈퍼관리자)
CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'super_admin',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. plans (플랜 정의)
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_name TEXT UNIQUE NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  faq_limit INTEGER NOT NULL DEFAULT 50,
  chat_limit INTEGER NOT NULL DEFAULT 1000,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. tenants (고객사)
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'basic',
  is_active BOOLEAN DEFAULT true,
  is_deleted BOOLEAN DEFAULT false,
  bot_name TEXT DEFAULT 'AI 상담봇',
  greeting_message TEXT DEFAULT '안녕하세요! 무엇을 도와드릴까요?',
  widget_color TEXT DEFAULT '#4F46E5',
  supported_languages TEXT[] DEFAULT ARRAY['ko'],
  login_failed_count INTEGER DEFAULT 0,
  login_locked_until TIMESTAMPTZ,
  -- 구독 관련
  subscription_start_date DATE,
  subscription_end_date DATE,
  subscription_status TEXT DEFAULT 'active',
  payment_memo TEXT,
  payment_requested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. plan_history (플랜 변경 이력)
CREATE TABLE IF NOT EXISTS plan_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  old_plan TEXT,
  new_plan TEXT NOT NULL,
  changed_by TEXT DEFAULT 'super_admin',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. scenarios (시나리오)
CREATE TABLE IF NOT EXISTS scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  trigger_keywords TEXT[],
  response TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. documents (FAQ 문서)
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(768),
  metadata JSONB,
  intent TEXT DEFAULT 'FAQ_INQUIRY',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. chat_logs (대화 로그)
CREATE TABLE IF NOT EXISTS chat_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  session_id TEXT,
  user_message TEXT NOT NULL,
  bot_response TEXT NOT NULL,
  channel TEXT DEFAULT 'web',
  intent TEXT,
  confidence FLOAT,
  response_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. platform_apis (연동 플랫폼)
CREATE TABLE IF NOT EXISTS platform_apis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  api_endpoint TEXT,
  auth_type TEXT DEFAULT 'api_key',
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. integrations (테넌트별 플랫폼 연동 설정)
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  platform_name TEXT NOT NULL,
  api_key TEXT,
  config JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. payment_settings (결제 계좌 설정)
CREATE TABLE IF NOT EXISTS payment_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name TEXT,
  account_number TEXT,
  account_holder TEXT,
  payment_guide TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 인덱스 ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tenants_email ON tenants(email);
CREATE INDEX IF NOT EXISTS idx_tenants_is_active ON tenants(is_active);
CREATE INDEX IF NOT EXISTS idx_tenants_plan ON tenants(plan);
CREATE INDEX IF NOT EXISTS idx_tenants_subscription_end ON tenants(subscription_end_date);
CREATE INDEX IF NOT EXISTS idx_chat_logs_tenant_id ON chat_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_logs_created_at ON chat_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_documents_tenant_id ON documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_scenarios_tenant_id ON scenarios(tenant_id);

-- ─── 기본 플랜 데이터 ─────────────────────────────
INSERT INTO plans (plan_name, price, faq_limit, chat_limit, description)
VALUES
  ('basic',  99000,  50,   1000, 'FAQ 50개, 월 1,000회 답변'),
  ('pro',   199000, 200,   5000, 'FAQ 200개, 월 5,000회 답변'),
  ('master',399000,  -1,     -1, 'FAQ 무제한, 월 답변 무제한')
ON CONFLICT (plan_name) DO NOTHING;

-- ─── 기본 플랫폼 데이터 ───────────────────────────
INSERT INTO platform_apis (platform_name, display_name, api_endpoint, auth_type, description, is_active)
VALUES
  ('cafe24',      'Cafe24',             'https://api.cafe24.com/api/v2',          'oauth2',  'Cafe24 쇼핑몰 연동',      true),
  ('smartstore',  'Naver Smartstore',   'https://api.commerce.naver.com/external','oauth2',  '네이버 스마트스토어 연동', true),
  ('imweb',       'imweb',              'https://api.imweb.me/v2',                'api_key', 'imweb 쇼핑몰 연동',       true),
  ('godomall',    'Godomall',           'https://api.godo.co.kr',                 'api_key', '고도몰 연동',             true),
  ('woocommerce', 'WooCommerce',        'https://yourstore.com/wp-json/wc/v3',    'api_key', 'WooCommerce 연동',        true),
  ('kakao',       'Kakao Channel',      'https://kapi.kakao.com',                 'oauth2',  '카카오 채널 연동',        true),
  ('custom',      'Custom API',         '',                                        'api_key', '커스텀 API 연동',         true)
ON CONFLICT (platform_name) DO NOTHING;
