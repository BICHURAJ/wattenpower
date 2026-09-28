import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { api, getToken, setToken, clearToken } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!getToken()) { setLoading(false); return }
    api.get('/auth/me')
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false))
  }, [])

  // A session loaded from an older server has no permissions, which would make
  // every page look locked. Fetch it again once instead of leaving it stale.
  const refreshed = useRef(false)
  useEffect(() => {
    if (!user || user.permissions || refreshed.current) return
    refreshed.current = true
    api.get('/auth/me').then(setUser).catch(() => {})
  }, [user])

  const login = async (email, password) => {
    const { token, user: signedIn } = await api.post('/auth/login', { email, password })
    setToken(token)
    setUser(signedIn)
    return signedIn
  }

  // Resolves to { pending: true } normally; the very first account is signed straight in.
  const signup = async (form) => {
    const result = await api.public.post('/auth/signup', form)
    if (result.token) {
      setToken(result.token)
      setUser(result.user)
    }
    return result
  }

  const logout = () => {
    clearToken()
    setUser(null)
  }

  // Mirrors the server's permissions.js for this user. Only hides what they
  // can't use -- the server still checks every request.
  const can = (resource, action = 'read') => Boolean(user?.permissions?.[resource]?.includes(action))

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, can }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

export function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="h-screen grid place-items-center text-slate-400 text-sm">
        Loading your workspace...
      </div>
    )
  }
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  return children
}
