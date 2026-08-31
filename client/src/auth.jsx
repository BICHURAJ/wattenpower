import { createContext, useContext, useEffect, useState } from 'react'
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

  const login = async (email, password) => {
    const { token, user: signedIn } = await api.post('/auth/login', { email, password })
    setToken(token)
    setUser(signedIn)
    return signedIn
  }

  const logout = () => {
    clearToken()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
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
