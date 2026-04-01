// =====================================================
// API 클라이언트 (Fetch 기반)
// =====================================================
const BASE = '/api'

function getToken() {
  return localStorage.getItem('admin_token') || ''
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>
): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || json.message || '요청 실패')
  return json
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<any>('POST', '/admin/login', { email, password }),
  changePassword: (current_password: string, new_password: string) =>
    request<any>('PUT', '/admin/password', { current_password, new_password }),

  // Me (확장)
  getMe: () => request<any>('GET', '/admin/me'),
  updateMe: (data: Record<string, unknown>) =>
    request<any>('PUT', '/admin/me', data),

  // Stats
  getStats: () => request<any>('GET', '/admin/stats'),
  getLogs: (params: Record<string, string | number>) => {
    const q = new URLSearchParams(params as Record<string, string>).toString()
    return request<any>('GET', `/admin/logs?${q}`)
  },

  // Documents
  getDocuments: (params: Record<string, string | number> = {}) => {
    const q = new URLSearchParams(params as Record<string, string>).toString()
    return request<any>('GET', `/documents?${q}`)
  },
  refineDocument: (question: string, answer: string) =>
    request<any>('POST', '/documents/refine', { question, answer }),
  embedDocument: (data: Record<string, unknown>) =>
    request<any>('POST', '/documents/embed', data),
  deleteDocument: (id: string) => request<any>('DELETE', `/documents/${id}`),
  toggleDocument: (id: string, is_active: boolean) =>
    request<any>('PUT', `/documents/${id}/toggle`, { is_active }),

  // Scenarios (Supabase 직접 호출 대신 admin 엔드포인트 사용)
  getScenarios: () => request<any>('GET', '/admin/scenarios'),
  saveScenario: (data: Record<string, unknown>) =>
    request<any>('POST', '/admin/scenarios', data),
  updateScenario: (id: string, data: Record<string, unknown>) =>
    request<any>('PUT', `/admin/scenarios/${id}`, data),

  // Bot settings (기존 호환성 유지)
  getTenant: () => request<any>('GET', '/admin/me'),
  updateTenant: (data: Record<string, unknown>) =>
    request<any>('PUT', '/admin/me', data),

  // 챗봇 상세 설정 (NEW)
  getSettings: () => request<any>('GET', '/admin/settings'),
  saveSettings: (data: Record<string, unknown>) =>
    request<any>('PUT', '/admin/settings', data),

  // Integration
  getIntegrations: () => request<any>('GET', '/admin/integration'),
  testIntegration: (data: Record<string, unknown>) =>
    request<any>('POST', '/admin/integration/test', data),
  saveIntegration: (data: Record<string, unknown>) =>
    request<any>('POST', '/admin/integration/save', data),
  deleteIntegration: (platform: string) =>
    request<any>('DELETE', `/admin/integration/${platform}`),

  // 구독 / 결제
  getSubscription: () => request<any>('GET', '/admin/subscription'),
  sendPaymentRequest: (payment_memo: string) =>
    request<any>('POST', '/admin/payment-request', { payment_memo }),

  // FAQ 엑셀 업로드 (NEW)
  uploadFaqExcel: (rows: { question: string; answer: string; category: string }[]) =>
    request<any>('POST', '/admin/faq/excel', { rows }),

  // TOP10 분석 (NEW)
  getTop10: (period: string = 'month') =>
    request<any>('GET', `/admin/analytics/top10?period=${period}`),
}
