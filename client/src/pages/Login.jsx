import { useState } from 'react'
import { Navigate, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { Banner, BrandLogo } from '../components/ui'

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#cfe1ff] via-[#dcebff] to-[#e4f7d4] p-4 sm:p-8">
     <div className="w-full max-w-5xl grid lg:grid-cols-2 bg-white rounded-[28px] shadow-panel overflow-hidden">
      {/* Brand panel */}
      <div className="relative hidden lg:flex flex-col items-center justify-center p-12 overflow-hidden bg-gradient-to-br from-brand-50 via-white to-accent-50 border-r border-slate-100">
        <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-brand-500/10" />
        <div className="absolute -bottom-28 -right-20 w-80 h-80 rounded-full bg-accent-500/15" />
        <BrandLogo className="relative w-80 max-w-full" />
        <p className="relative mt-5 text-sm text-slate-500">Sales CRM &amp; Job Management Platform</p>
        <div className="relative mt-4 flex gap-1.5">
          <span className="w-8 h-1 rounded-full bg-brand-500" /><span className="w-4 h-1 rounded-full bg-accent-500" />
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-8 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8">
            <BrandLogo className="w-60 max-w-full" />
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
    </div>
  )
}
