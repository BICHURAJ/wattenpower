const TOKEN_KEY = 'wp.token'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (auth && token) headers.Authorization = 'Bearer ' + token

  const res = await fetch('/api' + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (res.status === 401) {
    clearToken()
    if (!location.pathname.startsWith('/login')) location.href = '/login'
  }

  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) throw new Error(data?.error || 'Request failed (' + res.status + ')')
  return data
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  del: (path) => request(path, { method: 'DELETE' }),
  public: {
    post: (path, body) => request(path, { method: 'POST', body, auth: false }),
  },
}

/** Build a querystring from an object, skipping empty values. */
export function qs(params = {}) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && value !== undefined && value !== null && value !== 'All') search.set(key, value)
  }
  const str = search.toString()
  return str ? '?' + str : ''
}

export const money = (value) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(value) || 0)

export const shortDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '--'

export const inputDate = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '')

export const timeAgo = (value) => {
  if (!value) return ''
  const seconds = Math.floor((Date.now() - new Date(value)) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return minutes + 'm ago'
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return hours + 'h ago'
  const days = Math.floor(hours / 24)
  return days + 'd ago'
}
