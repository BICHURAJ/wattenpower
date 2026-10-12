import { useState } from 'react'
import { api, timeAgo } from '../api'
import { useAuth } from '../auth'
import { Banner } from './ui'

// Installation > Notes: a running log of notes on the job, newest first. The
// job's general notes (from the Edit form) stay pinned at the top. You edit or
// delete your own notes; admins can remove any.

const initials = (name) => String(name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
const when = (d) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function JobNotes({ install, canEdit }) {
  const { user, can } = useAuth()
  const [notes, setNotes] = useState(install.noteLog || [])
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(null) // { id, body }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const base = '/installations/' + install._id + '/notes'
  const mine = (n) => String(n.authorId) === String(user?.id)

  const run = async (fn) => {
    setBusy(true)
    setError('')
    try { setNotes(await fn()); return true } catch (err) { setError(err.message); return false } finally { setBusy(false) }
  }
  const add = async (e) => {
    e.preventDefault()
    if (draft.trim() && await run(() => api.post(base, { body: draft }))) setDraft('')
  }
  const save = async () => { if (await run(() => api.put(base + '/' + editing.id, { body: editing.body }))) setEditing(null) }
  const remove = (n) => { if (window.confirm('Delete this note?')) run(() => api.del(base + '/' + n._id)) }

  const sorted = [...notes].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  return (
    <div className="py-2 space-y-4">
      <Banner onDismiss={() => setError('')}>{error}</Banner>

      {canEdit && (
        <form onSubmit={add} className="rounded-xl bg-slate-50 p-3">
          <textarea className="input min-h-[80px]" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={4000}
            placeholder="Add a note -- a call with the customer, access details, parts on order..." />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400">Notes are visible to everyone who can see this job.</span>
            <button className="btn-primary text-sm" disabled={busy || !draft.trim()}>{busy ? 'Saving...' : 'Add note'}</button>
          </div>
        </form>
      )}

      {install.notes && (
        <div className="rounded-xl bg-amber-50/60 ring-1 ring-amber-100 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 mb-1">General notes</p>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{install.notes}</p>
        </div>
      )}

      {sorted.length === 0 && !install.notes && <p className="py-6 text-center text-sm text-slate-400">No notes on this job yet.</p>}

      <ul className="space-y-3">
        {sorted.map((n) => (
          <li key={n._id} className="flex gap-3">
            <span className="grid place-items-center w-8 h-8 shrink-0 rounded-full bg-brand-50 text-brand-700 text-[11px] font-semibold">{initials(n.author)}</span>
            <div className="flex-1 min-w-0 rounded-xl ring-1 ring-slate-100 bg-white px-3 py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-slate-800">{n.author || 'Unknown'}</p>
                <p className="text-[11px] text-slate-400" title={when(n.createdAt)}>
                  {timeAgo(n.createdAt)}{n.editedAt ? ' · edited' : ''}
                </p>
              </div>
              {editing?.id === n._id ? (
                <div className="mt-2">
                  <textarea className="input min-h-[70px]" value={editing.body} maxLength={4000} autoFocus onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
                  <div className="mt-2 flex justify-end gap-2">
                    <button type="button" className="btn-secondary text-xs px-3 py-1" onClick={() => setEditing(null)}>Cancel</button>
                    <button type="button" className="btn-primary text-xs px-3 py-1" disabled={busy || !editing.body.trim()} onClick={save}>Save</button>
                  </div>
                </div>
              ) : (
                <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap break-words">{n.body}</p>
              )}
              {editing?.id !== n._id && canEdit && (mine(n) || can('installations', 'delete')) && (
                <div className="mt-1.5 flex gap-3 text-xs">
                  {mine(n) && <button type="button" className="text-brand-600 hover:underline" onClick={() => setEditing({ id: n._id, body: n.body })}>Edit</button>}
                  <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => remove(n)}>Delete</button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
