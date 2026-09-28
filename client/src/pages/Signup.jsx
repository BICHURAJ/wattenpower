import { useState } from 'react'
import { Navigate, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { Banner, BrandLogo } from '../components/ui'

const MIN_PASSWORD = 10

// Create an account. It waits for an admin to approve it and choose the role
// (Admin, Finance, Sales or Engineer) -- nobody picks their own access.
export default function Signup() {
  const { user, signup, loading } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  if (!loading && user) return <Navigate to="/" replace />

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.password.length < MIN_PASSWORD) return setError('Your password must be at least ' + MIN_PASSWORD + ' characters.')
    if (form.password !== form.confirm) return setError("The two passwords don't match.")
    setBusy(true)
    try {
      const result = await signup({ name: form.name, email: form.email, password: form.password })
      if (result.token) navigate('/') // first account: signed in as admin
      else setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#cfe1ff] via-[#dcebff] to-[#e4f7d4] p-4 sm:p-8">
      <div className="w-full max-w-md bg-white rounded-[28px] shadow-panel p-8 sm:p-10">
        <BrandLogo className="w-56 max-w-full mb-8" />

        {done ? (
          <div>
            <div className="grid place-items-center w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 text-xl mb-4">&#10003;</div>
            <h2 className="text-2xl font-semibold text-slate-900">Account created</h2>
            <p className="text-sm text-slate-500 mt-2">
              An administrator needs to approve your account and give you a role (Admin, Finance, Sales or Engineer).
              You'll be able to sign in once that's done.
            </p>
            <Link to="/login" className="btn-primary w-full mt-6">Back to sign in</Link>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-semibold text-slate-900">Create an account</h2>
            <p className="text-sm text-slate-500 mt-1 mb-6">An administrator will approve it and set your role.</p>

            <Banner onDismiss={() => setError('')}>{error}</Banner>

            <form onSubmit={submit} className="space-y-4">
              <input className="input" placeholder="Full name" autoComplete="name" value={form.name} onChange={set('name')} required minLength={2} maxLength={80} />
              <input className="input" type="email" placeholder="Work email" autoComplete="email" value={form.email} onChange={set('email')} required />
              <div>
                <input className="input" type="password" placeholder="Password" autoComplete="new-password" value={form.password} onChange={set('password')} required minLength={MIN_PASSWORD} />
                <p className="text-xs text-slate-400 mt-1.5">At least {MIN_PASSWORD} characters. A short phrase is easiest to remember.</p>
              </div>
              <input className="input" type="password" placeholder="Confirm password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} required />
              <button className="btn-primary w-full" disabled={busy}>{busy ? 'Creating account...' : 'Create account'}</button>
            </form>

            <p className="mt-6 text-sm text-slate-500 text-center">
              Already have an account? <Link to="/login" className="text-brand-600 font-medium hover:underline">Sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
