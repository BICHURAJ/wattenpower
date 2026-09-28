import { useState } from 'react'
import { api, shortDate } from '../api'
import { useAuth } from '../auth'
import { PageHeader, Card, Badge, Banner, Loading, Modal, Field, Tabs, useFetch } from '../components/ui'

export const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin', hint: 'Everything, including user accounts' },
  { value: 'finance', label: 'Finance', hint: 'Grant claims, quote values, stock costs' },
  { value: 'sales', label: 'Sales', hint: 'Leads, clients, quotations, booking jobs' },
  { value: 'engineer', label: 'Engineer', hint: 'Job progress, certificates, support, kit (no prices)' },
]
const roleLabel = (role) => ROLE_OPTIONS.find((r) => r.value === role)?.label || 'No role'

// Stored as active / disabled / pending; shown as Active / Inactive / Awaiting approval.
const STATUS_TONE = { active: 'green', pending: 'amber', disabled: 'slate' }
const STATUS_LABEL = { active: 'Active', pending: 'Awaiting approval', disabled: 'Inactive' }

/** Add a user directly with their role. Shows the temporary password once, if one was generated. */
function AddUserModal({ onClose, onAdded }) {
  const [form, setForm] = useState({ name: '', email: '', role: '', status: 'active', passwordMode: 'generate', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState(null) // { user, temporaryPassword }
  const [copied, setCopied] = useState(false)
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await api.post('/users', {
        name: form.name,
        email: form.email,
        role: form.role,
        status: form.status,
        ...(form.passwordMode === 'set' && { password: form.password }),
      })
      onAdded()
      if (result.temporaryPassword) setCreated(result)
      else onClose()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(created.temporaryPassword)
      setCopied(true)
    } catch { /* clipboard blocked: the password is still shown to copy by hand */ }
  }

  if (created) {
    return (
      <Modal open title="User added" onClose={onClose}>
        <p className="text-sm text-slate-600">
          <span className="font-medium text-slate-900">{created.user.name}</span> can now sign in as <span className="font-medium">{roleLabel(created.user.role)}</span> with:
        </p>
        <dl className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Email</dt><dd className="font-medium text-slate-900 break-all">{created.user.email}</dd></div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">Temporary password</dt>
            <dd className="flex items-center gap-2">
              <code className="rounded bg-white px-2 py-1 font-mono text-slate-900 ring-1 ring-slate-200 select-all">{created.temporaryPassword}</code>
              <button type="button" className="text-xs text-brand-600 hover:underline" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-amber-700">This password is shown only once. Pass it on privately (not by email in the same message as the address).</p>
        <div className="flex justify-end mt-5"><button className="btn-primary" onClick={onClose}>Done</button></div>
      </Modal>
    )
  }

  return (
    <Modal open title="Add User" onClose={onClose}>
      <Banner onDismiss={() => setError('')}>{error}</Banner>
      <form onSubmit={save} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Full Name" required><input className="input" value={form.name} onChange={set('name')} required autoFocus /></Field>
          <Field label="Email" required><input className="input" type="email" value={form.email} onChange={set('email')} required /></Field>
          <Field label="Role" required>
            <select className="input" value={form.role} onChange={set('role')} required>
              <option value="">Choose role...</option>
              {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className="input" value={form.status} onChange={set('status')}>
              <option value="active">Active</option>
              <option value="disabled">Inactive</option>
            </select>
          </Field>
        </div>
        {form.role && <p className="-mt-2 text-xs text-slate-500">{ROLE_OPTIONS.find((r) => r.value === form.role)?.hint}</p>}

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700 mb-1">Password</legend>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" name="pw" checked={form.passwordMode === 'generate'} onChange={() => setForm({ ...form, passwordMode: 'generate' })} />
            Generate a temporary password
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" name="pw" checked={form.passwordMode === 'set'} onChange={() => setForm({ ...form, passwordMode: 'set' })} />
            Set a password now
          </label>
          {form.passwordMode === 'set' && (
            <input className="input" type="password" autoComplete="new-password" placeholder="At least 10 characters" minLength={10} value={form.password} onChange={set('password')} required />
          )}
        </fieldset>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>{busy ? 'Adding...' : 'Add User'}</button>
        </div>
      </form>
    </Modal>
  )
}

/** Describes a list of actions, e.g. ['read', 'update'] -> "Read & update". */
function describeActions(actions = []) {
  if (!actions.length) return 'No access'
  if (actions.includes('delete')) return 'Read, write & delete'
  if (actions.includes('create') && actions.includes('update')) return 'Read & write'
  if (actions.includes('update')) return 'Read & update'
  if (actions.includes('create')) return 'Read & add'
  return 'Read only'
}

/**
 * Set a user's access to each tab: keep the role default, or pick a level.
 * Only tabs changed from the default are saved as overrides.
 */
function AccessModal({ user, areas, levels, roleDefaults, onClose, onSave }) {
  const defaults = roleDefaults[user.role] || {}
  const [access, setAccess] = useState(() => ({ ...(user.access || {}) }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const setLevel = (key, level) => setAccess((prev) => {
    const next = { ...prev }
    if (level) next[key] = level
    else delete next[key]
    return next
  })
  const changed = Object.keys(access).length

  const save = async (value) => {
    setBusy(true)
    setError('')
    try {
      await onSave(value)
    } catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <Modal open title={'Access for ' + user.name} onClose={onClose} width="max-w-2xl">
      <Banner onDismiss={() => setError('')}>{error}</Banner>
      <p className="text-sm text-slate-500 mb-3">
        Choose what {user.name.split(' ')[0]} can do on each tab. <span className="font-medium text-slate-700">Role default</span> keeps
        exactly what the {roleLabel(user.role)} role gives. <span className="font-medium text-slate-700">No access</span> hides the tab and blocks its data.
      </p>
      <div className="rounded-xl border border-slate-100 divide-y divide-slate-100">
        {areas.map((area) => {
          const level = access[area.key] || ''
          return (
            <div key={area.key} className={'flex flex-wrap items-center gap-3 px-3 py-2 ' + (level ? 'bg-brand-50/40' : '')}>
              <span className="flex-1 min-w-[140px] text-sm text-slate-800">{area.label}</span>
              <select className="input w-60 py-1.5" value={level} onChange={(e) => setLevel(area.key, e.target.value)}>
                <option value="">Role default ({describeActions(defaults[area.key])})</option>
                {levels.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
              </select>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-slate-400">
        Taking a tab away also takes its data, so other pages can go quiet -- e.g. without Clients, client pickers are empty.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-4">
        <button type="button" className="text-sm text-slate-500 hover:text-slate-800 disabled:opacity-50" disabled={busy || !user.access} onClick={() => save(null)}>
          Reset all to {roleLabel(user.role)} default
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{changed ? changed + ' tab' + (changed === 1 ? '' : 's') + ' changed' : 'All role default'}</span>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => save(changed ? access : null)}>{busy ? 'Saving...' : 'Save Access'}</button>
        </div>
      </div>
    </Modal>
  )
}

// Admin only: add users, approve sign-ups, set roles, make accounts active or inactive.
export default function Users() {
  const { user: me } = useAuth()
  const { data, loading, error, reload } = useFetch('/users')
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingTabs, setEditingTabs] = useState(null) // user whose tabs are being chosen
  const [roleTab, setRoleTab] = useState('All')
  // Role picked for a pending account before pressing Approve.
  const [chosenRole, setChosenRole] = useState({})

  const users = data?.items || []
  const areas = data?.areas || []
  const levels = data?.levels || []
  const roleDefaults = data?.roleDefaults || {}
  const overrideCount = (u) => Object.keys(u.access || {}).length
  const pending = users.filter((u) => u.status === 'pending')
  const others = users.filter((u) => u.status !== 'pending')
  const tabLabel = (r) => r.label + ' (' + others.filter((u) => u.role === r.value).length + ')'
  const tabs = ['All (' + others.length + ')', ...ROLE_OPTIONS.map(tabLabel)]
  const activeTab = tabs.find((t) => t.startsWith(roleTab + ' ')) || tabs[0]
  const shown = roleTab === 'All' ? others : others.filter((u) => roleLabel(u.role) === roleTab)

  const update = async (u, change, message) => {
    setBusyId(u.id)
    setActionError('')
    setNotice('')
    try {
      await api.put('/users/' + u.id, change)
      setNotice(message)
      reload()
    } catch (err) { setActionError(err.message) } finally { setBusyId(null) }
  }

  const remove = async (u) => {
    if (!window.confirm('Delete the account for ' + u.name + ' (' + u.email + ')? This cannot be undone.')) return
    setBusyId(u.id)
    setActionError('')
    try {
      await api.del('/users/' + u.id)
      setNotice(u.name + "'s account was deleted.")
      reload()
    } catch (err) { setActionError(err.message) } finally { setBusyId(null) }
  }

  if (loading) return <Loading />

  return (
    <>
      <PageHeader title="Users" subtitle="Who can sign in, their role, and whether their account is active">
        <button className="btn-primary" onClick={() => setAdding(true)}>+ Add User</button>
      </PageHeader>
      <Banner>{error}</Banner>
      <Banner onDismiss={() => setActionError('')}>{actionError}</Banner>
      <Banner kind="success" onDismiss={() => setNotice('')}>{notice}</Banner>

      {pending.length > 0 && (
        <Card title={'Awaiting approval (' + pending.length + ')'} subtitle="People who signed up. Choose a role, then approve" className="mb-4">
          <ul className="divide-y divide-slate-100">
            {pending.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">{u.name}</p>
                  <p className="text-xs text-slate-500">{u.email}</p>
                </div>
                <select
                  className="input w-44 py-1.5"
                  value={chosenRole[u.id] || ''}
                  onChange={(e) => setChosenRole({ ...chosenRole, [u.id]: e.target.value })}
                >
                  <option value="">Choose role...</option>
                  {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <button
                  className="btn-primary px-3 py-1.5 text-sm"
                  disabled={!chosenRole[u.id] || busyId === u.id}
                  onClick={() => update(u, { role: chosenRole[u.id], status: 'active' }, u.name + ' approved as ' + roleLabel(chosenRole[u.id]) + '.')}
                >
                  Approve
                </button>
                <button className="btn-ghost px-3 py-1.5 text-sm text-red-600" disabled={busyId === u.id} onClick={() => remove(u)}>Reject</button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Tabs tabs={tabs} active={activeTab} onChange={(t) => setRoleTab(t.replace(/ \(\d+\)$/, ''))} />

      <Card bodyClass="">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500 border-b border-slate-100">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Access</th>
                <th className="px-5 py-3 font-medium">Added</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">No {roleTab === 'All' ? '' : roleTab.toLowerCase() + ' '}users yet.</td></tr>
              )}
              {shown.map((u) => {
                const isMe = u.id === me?.id
                return (
                  <tr key={u.id} className={u.status === 'disabled' ? 'bg-slate-50/60' : ''}>
                    <td className="px-5 py-3">
                      <p className={'font-medium ' + (u.status === 'disabled' ? 'text-slate-500' : 'text-slate-900')}>
                        {u.name}{isMe && <span className="ml-1.5 text-xs font-normal text-slate-400">(you)</span>}
                      </p>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </td>
                    <td className="px-5 py-3">
                      {isMe ? roleLabel(u.role) : (
                        <select
                          className="input w-36 py-1.5"
                          value={u.role || ''}
                          disabled={busyId === u.id}
                          onChange={(e) => update(u, { role: e.target.value }, u.name + ' is now ' + roleLabel(e.target.value) + '.')}
                        >
                          {!u.role && <option value="">No role</option>}
                          {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {isMe ? <Badge tone={STATUS_TONE[u.status]}>{STATUS_LABEL[u.status]}</Badge> : (
                        <select
                          className="input w-32 py-1.5"
                          value={u.status}
                          disabled={busyId === u.id}
                          title={u.role ? '' : 'Choose a role before making the account active'}
                          onChange={(e) => update(u, { status: e.target.value }, u.name + (e.target.value === 'active' ? ' can sign in again.' : ' can no longer sign in.'))}
                        >
                          <option value="active" disabled={!u.role}>Active</option>
                          <option value="disabled">Inactive</option>
                        </select>
                      )}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      {u.role === 'admin' ? <span className="text-slate-400">Full access</span>
                        : !u.role ? <span className="text-slate-400">--</span>
                        : (
                          <button
                            className="text-brand-600 hover:underline disabled:text-slate-400 disabled:no-underline"
                            disabled={isMe}
                            onClick={() => setEditingTabs(u)}
                          >
                            {u.access ? 'Custom (' + overrideCount(u) + ' changed)' : 'Role default'}
                          </button>
                        )}
                    </td>
                    <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{u.createdAt ? shortDate(u.createdAt) : '--'}</td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      {!isMe && (
                        <button className="text-red-600 hover:underline disabled:opacity-50" disabled={busyId === u.id} onClick={() => remove(u)}>Delete</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="What each role can do" className="mt-4">
        <ul className="grid sm:grid-cols-2 gap-3 text-sm">
          {ROLE_OPTIONS.map((r) => (
            <li key={r.value} className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="font-medium text-slate-800">{r.label}</p>
              <p className="text-xs text-slate-500">{r.hint}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-400">
          Use <span className="font-medium">Access</span> on a user to set each tab to No access, Read only, Read &amp; write, or Read, write &amp; delete.
          Changing someone's role puts them back on that role's access. Inactive users can't sign in, and anyone signed in is logged out straight away.
        </p>
      </Card>

      {adding && <AddUserModal onClose={() => setAdding(false)} onAdded={reload} />}
      {editingTabs && (
        <AccessModal
          user={editingTabs}
          areas={areas}
          levels={levels}
          roleDefaults={roleDefaults}
          onClose={() => setEditingTabs(null)}
          onSave={async (value) => {
            await api.put('/users/' + editingTabs.id, { access: value })
            setNotice(editingTabs.name + (value ? "'s access was updated." : ' is back to the ' + roleLabel(editingTabs.role) + ' access.'))
            setEditingTabs(null)
            reload()
          }}
        />
      )}
    </>
  )
}
