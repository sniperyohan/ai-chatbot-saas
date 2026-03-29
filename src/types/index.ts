// =====================================================
// 공통 타입 정의
// =====================================================

export type Bindings = {
  GEMINI_API_KEY: string
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_KEY: string
  SUPER_JWT_SECRET: string
  ADMIN_JWT_SECRET: string
  RESEND_API_KEY: string
  ENCRYPTION_KEY: string
  ALLOWED_ORIGINS: string
}

export type Variables = {
  tenantId?: string
  tenantEmail?: string
  role?: 'super_admin' | 'tenant_admin'
  jwtPayload?: JwtPayload
}

export interface JwtPayload {
  sub: string       // tenant id or admin id
  email: string
  role: 'super_admin' | 'tenant_admin'
  iat?: number
  exp?: number
}

export interface Tenant {
  id: string
  company_name: string
  email: string
  password: string
  plan: string
  widget_color: string
  bot_name: string
  greeting_message: string
  supported_languages: string[]
  external_product_api_url?: string
  external_customer_api_url?: string
  is_active: boolean
  is_deleted: boolean
  is_temp_password: boolean
  password_changed_at?: string
  login_fail_count: number
  login_locked_until?: string
  created_at: string
}

export interface Admin {
  id: string
  email: string
  password: string
  created_at: string
}

export interface Document {
  id: string
  tenant_id: string
  original_question?: string
  original_answer?: string
  refined_question?: string
  refined_answer?: string
  content: string
  embedding?: number[]
  category: string
  language: string
  is_ai_refined: boolean
  is_deleted: boolean
  created_at: string
}

export interface ChatLog {
  id: string
  tenant_id: string
  message_id?: string
  channel: string
  user_message: string
  bot_answer: string
  detected_language: string
  intent: string
  created_at: string
}

export interface TenantApiIntegration {
  id: string
  tenant_id: string
  platform_name: string
  api_key?: string
  api_secret?: string
  shop_id?: string
  access_token?: string
  token_expires_at?: string
  is_active: boolean
  last_synced_at?: string
  created_at: string
}

export type Intent =
  | 'FAQ_INQUIRY'
  | 'RESERVATION'
  | 'PAYMENT'
  | 'COMPLAINT'
  | 'GREETING'
  | 'ORDER_INQUIRY'
  | 'OTHER'

export type Channel = 'web' | 'kakao' | 'naver' | 'messenger'

export interface ProcessMessageResult {
  answer: string
  intent: Intent
  detected_language: string
  channel: Channel
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}
