import { useEffect, useState } from 'react'
import { api } from '../api'

/* Shared building blocks so every screen looks like the same product. */

/**
 * The Watten Power logo, cropped to its artwork. logo.png is 658x148 but the
 * artwork only fills the top 96px, so sizing the raw image by height left the
 * name tiny. Size this by width (e.g. className="w-60").
 */
export function BrandLogo({ className = '' }) {
  return (
    <span className={'block overflow-hidden ' + className} style={{ aspectRatio: '658 / 96' }}>
      <img src="/logo.png" alt="Watten Power" className="block w-full h-auto" />
    </span>
  )
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

export function Card({ title, subtitle, action, children, className = '', bodyClass = 'p-5' }) {
  return (
    <section className={'card min-w-0 ' + className}>
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  )
}

export function StatCard({ label, value, hint, icon, pill, pillTone = 'violet' }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        {icon && (
          <span className="grid place-items-center w-8 h-8 rounded-full border border-slate-200 text-slate-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d={icon} /></svg>
          </span>
        )}
      </div>
      <p className="text-[28px] leading-none font-semibold tracking-tight text-slate-900 mt-3">{value}</p>
      <div className="flex items-center gap-2 mt-3">
        {pill != null && <span className={'px-1.5 py-0.5 rounded-md text-[11px] font-medium ' + PILL[pillTone]}>{pill}</span>}
        {hint && <p className="text-xs text-slate-400 truncate">{hint}</p>}
      </div>
    </div>
  )
}

const PILL = {
  violet: 'bg-brand-50 text-brand-600',
  green: 'bg-accent-50 text-accent-700',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600',
  slate: 'bg-slate-100 text-slate-500',
}

const TONES = {
  green: 'bg-emerald-50 text-emerald-700',
  blue: 'bg-brand-50 text-brand-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-600',
  slate: 'bg-slate-100 text-slate-500',
  violet: 'bg-brand-50 text-brand-700',
}

const DOTS = {
  green: 'bg-emerald-500', blue: 'bg-brand-500', amber: 'bg-amber-500',
  red: 'bg-red-500', slate: 'bg-slate-400', violet: 'bg-brand-500',
}

// One place decides what colour a status gets, so the same word never shows
// up in two different colours on two different screens.
export function statusTone(value) {
  const key = String(value || '').toLowerCase()
  if (['active', 'accepted', 'completed', 'pass', 'valid', 'closed', 'approved', 'on road', 'in service', 'available'].includes(key)) return 'green'
  if (['sent', 'scheduled', 'in progress', 'submitted', 'contacted', 'new', 'on job'].includes(key)) return 'blue'
  if (['draft', 'pending', 'expiring soon', 'on hold', 'medium', 'calibration due', 'survey booked'].includes(key)) return 'amber'
  if (['declined', 'expired', 'rejected', 'high', 'fail', 'cancelled', 'off road', 'out of service'].includes(key)) return 'red'
  return 'slate'
}

export function Badge({ children, tone }) {
  const resolved = tone || statusTone(children)
  return (
    <span className={'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium ' + TONES[resolved]}>
      <span className={'w-1.5 h-1.5 rounded-full ' + DOTS[resolved]} />
      {children}
    </span>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Search...' }) {
  return (
    <div className="relative flex-1 min-w-[200px]">
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
      </svg>
      <input className="input pl-9" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

export function Select({ value, onChange, options, className = '' }) {
  return (
    <select className={'input w-auto ' + className} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((opt) => {
        const val = typeof opt === 'string' ? opt : opt.value
        const label = typeof opt === 'string' ? opt : opt.label
        return <option key={val} value={val}>{label}</option>
      })}
    </select>
  )
}

export function Table({ columns, rows, empty = 'Nothing to show yet.', onRowClick }) {
  if (!rows.length) {
    return <div className="px-4 py-12 text-center text-sm text-slate-400">{empty}</div>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-slate-100">
          <tr>{columns.map((col) => <th key={col.key} className="th">{col.header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr
              key={row._id || index}
              className={'hover:bg-brand-50/40 transition-colors ' + (onRowClick ? 'cursor-pointer' : '')}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((col) => <td key={col.key} className="td">{col.render ? col.render(row) : row[col.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Pagination({ page, pages, total, onChange }) {
  if (!total) return null
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-400">
      <span>Showing page {page} of {pages} &middot; {total} record{total === 1 ? '' : 's'}</span>
      <div className="flex gap-1">
        <button className="btn-secondary px-3 py-1" disabled={page <= 1} onClick={() => onChange(page - 1)}>Prev</button>
        <button className="btn-secondary px-3 py-1" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</button>
      </div>
    </div>
  )
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="inline-flex max-w-full gap-1 p-1 mb-4 rounded-xl bg-white border border-slate-100 shadow-soft overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={'px-4 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ' +
            (active === tab ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/30' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50')}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}

export function Modal({ open, title, onClose, children, width = 'max-w-lg' }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto bg-brand-900/30 backdrop-blur-sm">
      <div className={'card w-full mt-12 ' + width} onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <button className="btn-ghost px-2 py-1" onClick={onClose}>&times;</button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, required, children }) {
  return (
    <div>
      <label className="label">{label}{required && <span className="text-red-500"> *</span>}</label>
      {children}
    </div>
  )
}

export function Banner({ kind = 'error', children, onDismiss }) {
  if (!children) return null
  const styles = kind === 'error'
    ? 'bg-red-50 text-red-700 border-red-200'
    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
  return (
    <div className={'flex items-start justify-between gap-3 border rounded-xl px-3 py-2 text-sm mb-4 ' + styles}>
      <span>{children}</span>
      {onDismiss && <button onClick={onDismiss} className="opacity-60 hover:opacity-100">&times;</button>}
    </div>
  )
}

/** Small hook for the "fetch a list, show a spinner, show an error" pattern. */
export function useFetch(path, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.get(path)
      .then((result) => { if (!cancelled) { setData(result); setError('') } })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, nonce, ...deps])

  return { data, loading, error, reload: () => setNonce((n) => n + 1) }
}

export function Loading({ label = 'Loading...' }) {
  return <div className="py-12 text-center text-sm text-slate-400">{label}</div>
}
