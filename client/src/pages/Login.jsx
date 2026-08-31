import { useState } from 'react'
import { Navigate, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { Banner } from '../components/ui'

// Screen 1: Login / Sign In
export default function Login() {
  const { user, login, loading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('david@wattenpower.co.uk')
  const [password, setPassword] = useState('password123')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!loading && user) return <Navigate to="/" replace />

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Brand panel */}
      <div className="hidden lg:flex flex-col items-center justify-center bg-white border-r border-slate-200 p-12">
        <div className="grid place-items-center w-20 h-20 rounded-full bg-brand-50 text-brand-500 text-4xl">&#9889;</div>
        <h1 className="mt-6 text-xl font-bold tracking-tight text-slate-900">WATTEN POWER LTD</h1>
        <p className="mt-2 text-sm text-slate-500">Sales CRM &amp; Job Management Platform</p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <span className="grid place-items-center w-9 h-9 rounded bg-brand-500 text-white">&#9889;</span>
            <span className="font-bold text-slate-900">WATTEN POWER LTD</span>
          </div>

          <h2 className="text-2xl font-semibold text-slate-900">Welcome Back</h2>
          <p className="text-sm text-slate-500 mt-1 mb-6">Sign in to your account</p>

          <Banner onDismiss={() => setError('')}>{error}</Banner>

          <form onSubmit={submit} className="space-y-4">
            <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <div>
              <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <div className="text-right mt-1.5">
                <span className="text-xs text-brand-600">Forgot password?</span>
              </div>
            </div>
            <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in...' : 'Sign In'}</button>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" className="rounded border-slate-300" defaultChecked /> Remember me
            </label>
          </form>

          <p className="mt-6 text-xs text-slate-400 text-center">
            Demo sign-in: david@wattenpower.co.uk / password123
          </p>
          <p className="mt-2 text-xs text-center">
            <Link to="/lead-capture" className="text-brand-600 hover:underline">Open the public website enquiry form</Link>
          </p>
          <p className="mt-8 text-[11px] text-slate-400 text-center">&copy; 2026 Watten Power Ltd. All rights reserved.</p>
        </div>
      </div>
    </div>
  )
}
