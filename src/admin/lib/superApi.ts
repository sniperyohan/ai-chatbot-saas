// =====================================================
// 슈퍼관리자 전용 API 클라이언트 (Fetch 기반)
// =====================================================
const BASE = '/api/super'

function getSuperToken() {
  return localStorage.getItem('super_token') || ''
}

async function superRequest<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const token = getSuperToken()
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || json.message || '요청 실패')
  return json
}

export const superApi = {
  // ── 인증 ────────────────────────────────────────
  login: (email: string, password: string) =>
    superRequest<any>('POST', '/login', { email, password }),

  // ── 대시보드 ─────────────────────────────────────
  getDashboard: () => superRequest<any>('GET', '/dashboard'),

  // ── 고객사 CRUD ──────────────────────────────────
  getTenants: (params: Record<string, string | number> = {}) => {
    const q = new URLSearchParams(
      Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
    ).toString()
    return superRequest<any>('GET', `/tenants${q ? '?' + q : ''}`)
  },
  createTenant: (data: { company_name: string; email: string; plan: string }) =>
    superRequest<any>('POST', '/tenants', data),
  updateTenant: (id: string, data: Record<string, unknown>) =>
    superRequest<any>('PUT', `/tenants/${id}`, data),
  deleteTenant: (id: string) =>
    superRequest<any>('DELETE', `/tenants/${id}`),

  // ── 고객사 상태/플랜/비밀번호 ────────────────────
  updateTenantPlan: (id: string, plan: string) =>
    superRequest<any>('PUT', `/tenants/${id}/plan`, { plan }),
  updateTenantStatus: (id: string, is_active: boolean) =>
    superRequest<any>('PUT', `/tenants/${id}/status`, { is_active }),
  resetTenantPassword: (id: string) =>
    superRequest<any>('POST', `/tenants/${id}/reset-password`),

  // ── 구독 관리 ─────────────────────────────────────
  extendTenantSubscription: (id: string) =>
    superRequest<any>('POST', `/tenants/${id}/extend`),
  confirmTenantPayment: (id: string) =>
    superRequest<any>('POST', `/tenants/${id}/confirm-payment`),
  convertToYearlyBilling: (id: string) =>
    superRequest<any>('PUT', `/tenants/${id}/billing`, { billing_cycle: 'yearly' }),
  checkExpired: () =>
    superRequest<any>('GET', '/check-expired'),

  // ── 결제 설정 ─────────────────────────────────────
  getPaymentSettings: () => superRequest<any>('GET', '/payment-settings'),
  updatePaymentSettings: (data: {
    bank_name?: string
    account_number?: string
    account_holder?: string
    payment_guide?: string
  }) => superRequest<any>('PUT', '/payment-settings', data),

  // ── 플랜 ────────────────────────────────────────
  getPlans: () => superRequest<any>('GET', '/plans'),
  updatePlan: (id: string, data: Record<string, unknown>) =>
    superRequest<any>('PUT', `/plans/${id}`, data),

  // ── 슈퍼관리자 비밀번호 변경 ──────────────────────
  changePassword: (current_password: string, new_password: string) =>
    superRequest<any>('PUT', '/password', { current_password, new_password }),

  // ── API 플랫폼 ────────────────────────────────────
  getPlatformApis: () => superRequest<any>('GET', '/platform-apis'),
  createPlatformApi: (data: {
    platform_name: string
    display_name: string
    api_endpoint?: string
    auth_type?: string
    description?: string
  }) => superRequest<any>('POST', '/platform-apis', data),
  updatePlatformApi: (id: string, data: Record<string, unknown>) =>
    superRequest<any>('PUT', `/platform-apis/${id}`, data),
}
