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
  // 로그인
  login: (email: string, password: string) =>
    superRequest<any>('POST', '/login', { email, password }),

  // 대시보드
  getDashboard: () => superRequest<any>('GET', '/dashboard'),

  // 고객사 CRUD
  getTenants: (params: Record<string, string | number> = {}) => {
    const q = new URLSearchParams(params as Record<string, string>).toString()
    return superRequest<any>('GET', `/tenants${q ? '?' + q : ''}`)
  },
  createTenant: (data: { company_name: string; email: string; plan: string }) =>
    superRequest<any>('POST', '/tenants', data),
  updateTenant: (id: string, data: Record<string, unknown>) =>
    superRequest<any>('PUT', `/tenants/${id}`, data),
  deleteTenant: (id: string) =>
    superRequest<any>('DELETE', `/tenants/${id}`),

  // 플랜
  getPlans: () => superRequest<any>('GET', '/plans'),
  updatePlan: (id: string, data: Record<string, unknown>) =>
    superRequest<any>('PUT', `/plans/${id}`, data),
}
