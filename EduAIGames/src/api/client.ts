import { API_BASE_URL } from '../config'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new ApiError(res.status, data.error || res.statusText || 'Request failed')
  }
  return res.json() as Promise<T>
}

function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL}${normalized}`
}

// Identifies the signed-in user so the backend can resolve institution-scoped
// feature gating (paid features) for every request.
function identityHeaders(): Record<string, string> {
  try {
    const raw = localStorage.getItem('user')
    if (!raw) return {}
    const parsed = JSON.parse(raw) as { id?: number }
    return typeof parsed.id === 'number' ? { 'X-User-Id': String(parsed.id) } : {}
  } catch {
    return {}
  }
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    method: 'GET',
    headers: { ...identityHeaders(), ...init?.headers },
  })
  return parseJson<T>(res)
}

export async function apiPost<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...identityHeaders(), ...init?.headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return parseJson<T>(res)
}

export async function apiPut<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...identityHeaders(), ...init?.headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return parseJson<T>(res)
}

export async function apiDelete<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    method: 'DELETE',
    headers: body !== undefined
      ? { 'Content-Type': 'application/json', ...identityHeaders(), ...init?.headers }
      : { ...identityHeaders(), ...init?.headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return parseJson<T>(res)
}
