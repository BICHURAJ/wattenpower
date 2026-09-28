import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, qs, money, shortDate } from '../api'
import {
  PageHeader, Card, Table, Badge, SearchInput, Select, Pagination, Modal, Field,
  Tabs, Banner, Loading, StatCard, useFetch,
} from '../components/ui'
import LocationPicker from '../components/LocationPicker'
import { LocationPanel, LocationModal } from '../components/LocationPanel'

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6m4 5v6m4-6v6" />
  </svg>
)

const EyeIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const EditIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
)

/**
 * Asks for confirmation, then deletes. The server refuses clients that have
 * quotations, installations or tickets, and its message explains why.
 * Resolves to true when the client was deleted.
 */
async function confirmAndDelete(client) {
  const message = 'Delete client ' + client.name + '?\n\n' +
    'Their sites, contacts and notes are deleted too. This cannot be undone.'
  if (!window.confirm(message)) return false
  await api.del('/clients/' + client._id)
  return true
}

// Screen 3: Clients
export function ClientsList() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('All')
  const [page, setPage] = useState(1)
  const [showAdd, setShowAdd] = useState(false)
  const navigate = useNavigate()

  const { data, loading, error, reload } = useFetch('/clients' + qs({ q: search, status, page }))
  const [deletingId, setDeletingId] = useState(null)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')

  const remove = async (row) => {
    setActionError('')
    setNotice('')
    setDeletingId(row._id)
    try {
      if (await confirmAndDelete(row)) {
        setNotice('Client ' + row.name + ' deleted.')
        reload()
      }
    } catch (err) {
      setActionError(err.message)
    } finally {
      setDeletingId(null)
    }
  }

  const columns = [
    { key: 'name', header: 'Client Name', render: (row) => <span className="font-medium text-slate-900">{row.name}</span> },
    { key: 'contactPerson', header: 'Contact Person' },
    { key: 'email', header: 'Email' },
    { key: 'phone', header: 'Phone' },
    { key: 'status', header: 'Status', render: (row) => <Badge>{row.status}</Badge> },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <span className="flex items-center gap-3">
          <Link to={'/clients/' + row._id} className="inline-flex items-center gap-1 text-brand-600 text-sm hover:underline" onClick={(e) => e.stopPropagation()}>
            <EyeIcon /> View
          </Link>
          <button
            className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-red-600 disabled:opacity-50"
            title={'Delete ' + row.name}
            disabled={deletingId === row._id}
            onClick={(e) => { e.stopPropagation(); remove(row) }}
          >
            <TrashIcon /> {deletingId === row._id ? 'Deleting...' : 'Delete'}
          </button>
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader title="Clients" subtitle="Every account on the books, from first enquiry onwards">
        <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Add Client</button>
      </PageHeader>

      <Banner>{error}</Banner>
      <Banner onDismiss={() => setActionError('')}>{actionError}</Banner>
      <Banner kind="success" onDismiss={() => setNotice('')}>{notice}</Banner>

      <Card bodyClass="">
        <div className="flex flex-wrap gap-2 p-4 border-b border-slate-200">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search clients..." />
          <Select value={status} onChange={(v) => { setStatus(v); setPage(1) }} options={['All', 'Active', 'Inactive']} />
        </div>
        {loading ? <Loading /> : (
          <>
            <Table columns={columns} rows={data?.items || []} onRowClick={(row) => navigate('/clients/' + row._id)} empty="No clients match that search." />
            <Pagination page={data?.page} pages={data?.pages} total={data?.total} onChange={setPage} />
          </>
        )}
      </Card>

      <ClientFormModal open={showAdd} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); reload() }} />
    </>
  )
}

const emptyClient = () => ({ name: '', contactPerson: '', email: '', phone: '', address: '', postcode: '', location: null, status: 'Active' })

const clientForm = (client) => ({
  name: client.name || '',
  contactPerson: client.contactPerson || '',
  email: client.email || '',
  phone: client.phone || '',
  address: client.address || '',
  postcode: client.postcode || '',
  location: client.location || null,
  status: client.status || 'Active',
})

/** Adds a new client, or edits `client` when one is passed. */
function ClientFormModal({ open, client, onClose, onSaved }) {
  const editing = Boolean(client)
  const [form, setForm] = useState(() => (editing ? clientForm(client) : emptyClient()))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  // Functional update: map lookups finish asynchronously and must not overwrite newer typing.
  const setLocation = (patch) => setForm((f) => ({ ...f, ...patch }))

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      if (editing) {
        // null (not undefined) so a removed pin is actually cleared on the server.
        await api.put('/clients/' + client._id, { ...form, location: form.location || null })
      } else {
        await api.post('/clients', { ...form, location: form.location || undefined })
        setForm(emptyClient())
      }
      onSaved()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} title={editing ? 'Edit Client' : 'Add Client'} onClose={onClose} width="max-w-2xl">
      <Banner onDismiss={() => setError('')}>{error}</Banner>
      <form onSubmit={save} className="space-y-4">
        <div className={editing ? 'grid sm:grid-cols-[2fr_1fr] gap-4' : ''}>
          <Field label="Client Name" required><input className="input" value={form.name} onChange={set('name')} required /></Field>
          {editing && (
            <Field label="Status">
              <select className="input" value={form.status} onChange={set('status')}>
                <option>Active</option>
                <option>Inactive</option>
              </select>
            </Field>
          )}
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Contact Person"><input className="input" value={form.contactPerson} onChange={set('contactPerson')} /></Field>
          <Field label="Phone"><input className="input" value={form.phone} onChange={set('phone')} /></Field>
        </div>
        <Field label="Email"><input className="input" type="email" value={form.email} onChange={set('email')} /></Field>
        <Field label="Location">
          <LocationPicker value={form} onChange={setLocation} height={220} />
        </Field>
        <div className="grid sm:grid-cols-[2fr_1fr] gap-4">
          <Field label="Address"><input className="input" value={form.address} onChange={set('address')} /></Field>
          <Field label="Postcode"><input className="input" value={form.postcode} onChange={set('postcode')} /></Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>{busy ? 'Saving...' : editing ? 'Save Changes' : 'Save Client'}</button>
        </div>
      </form>
    </Modal>
  )
}

// Screen 4: Client Details
export function ClientDetails() {
  const { id } = useParams()
  const [tab, setTab] = useState('Overview')
  const [editingLocation, setEditingLocation] = useState(false)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const client = useFetch('/clients/' + id)
  const summary = useFetch('/clients/' + id + '/summary')

  if (client.loading || summary.loading) return <Loading />
  if (client.error) return <Banner>{client.error}</Banner>

  const c = client.data
  const s = summary.data

  const remove = async () => {
    setError('')
    setDeleting(true)
    try {
      if (await confirmAndDelete(c)) navigate('/clients')
      else setDeleting(false)
    } catch (err) {
      setError(err.message)
      setDeleting(false)
    }
  }

  return (
    <>
      <PageHeader title="Client Details" subtitle={c.name}>
        <Link to="/clients" className="btn-secondary">Back to list</Link>
        <button className="btn-secondary" onClick={() => setEditing(true)}>
          <EditIcon /> Edit
        </button>
        <button className="btn-secondary text-red-600 hover:bg-red-50 hover:border-red-200" onClick={remove} disabled={deleting}>
          <TrashIcon /> {deleting ? 'Deleting...' : 'Delete'}
        </button>
      </PageHeader>

      <Banner onDismiss={() => setError('')}>{error}</Banner>

      {/* Mounted only while open so the form starts from the latest saved values. */}
      {editing && (
        <ClientFormModal
          open
          client={c}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); client.reload() }}
        />
      )}

      {editingLocation && (
        <LocationModal
          title={'Location · ' + c.name}
          initial={{ address: c.address, postcode: c.postcode, location: c.location || editingLocation.start }}
          onClose={() => setEditingLocation(false)}
          onSave={async (values) => { await api.put('/clients/' + c._id, values); setEditingLocation(false); client.reload() }}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <div className="flex items-center gap-3 mb-4">
            <span className="grid place-items-center w-11 h-11 rounded-full bg-brand-50 text-brand-600 font-semibold">
              {c.name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <p className="font-semibold text-slate-900">{c.name}</p>
              <Badge>{c.status}</Badge>
            </div>
          </div>
          <dl className="space-y-2 text-sm">
            <Row label="Contact">{c.contactPerson || '--'}</Row>
            <Row label="Email">{c.email || '--'}</Row>
            <Row label="Phone">{c.phone || '--'}</Row>
            <Row label="Address">{[c.address, c.postcode].filter(Boolean).join(', ') || '--'}</Row>
          </dl>

          <div className="mt-4 pt-4 border-t border-slate-100">
            <LocationPanel
              address={c.address}
              postcode={c.postcode}
              location={c.location}
              onEdit={(start) => setEditingLocation({ start })}
              onKeepApprox={async (point) => { await api.put('/clients/' + c._id, { location: point }); client.reload() }}
            />
          </div>
        </Card>

        <div className="lg:col-span-2 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Total Quotations" value={s.counts.quotations} />
            <StatCard label="Total Installations" value={s.counts.installations} />
            <StatCard label="Open Tickets" value={s.counts.openTickets} />
          </div>

          <Card bodyClass="p-4">
            <Tabs tabs={['Overview', 'Sites', 'Contacts', 'Notes', 'Documents']} active={tab} onChange={setTab} />

            {tab === 'Overview' && (
              <div className="space-y-4">
                <Section title="Quotations">
                  {s.quotations.length === 0 && <Empty>No quotations raised yet.</Empty>}
                  {s.quotations.map((q) => (
                    <Link key={q._id} to={'/quotations/' + q._id} className="flex items-center justify-between py-2 text-sm hover:bg-slate-50 px-2 -mx-2 rounded">
                      <span className="font-medium text-slate-700">{q.quoteNo}</span>
                      <span className="flex items-center gap-3">
                        <span className="text-slate-500">{money(q.total)}</span>
                        <Badge>{q.status}</Badge>
                      </span>
                    </Link>
                  ))}
                </Section>
                <Section title="Installations">
                  {s.installations.length === 0 && <Empty>No installations booked yet.</Empty>}
                  {s.installations.map((i) => (
                    <Link key={i._id} to={'/installations/' + i._id} className="flex items-center justify-between py-2 text-sm hover:bg-slate-50 px-2 -mx-2 rounded">
                      <span className="font-medium text-slate-700">{i.installNo}</span>
                      <span className="flex items-center gap-3">
                        <span className="text-slate-500">{shortDate(i.installDate)}</span>
                        <Badge>{i.status}</Badge>
                      </span>
                    </Link>
                  ))}
                </Section>
                <Section title="Support Tickets">
                  {s.tickets.length === 0 && <Empty>No support tickets raised.</Empty>}
                  {s.tickets.map((t) => (
                    <div key={t._id} className="flex items-center justify-between py-2 text-sm">
                      <span className="text-slate-700">{t.ticketNo} &middot; {t.issue}</span>
                      <Badge>{t.status}</Badge>
                    </div>
                  ))}
                </Section>
              </div>
            )}

            {tab === 'Sites' && (
              <div className="divide-y divide-slate-100">
                {(c.sites || []).length === 0 && <Empty>No sites recorded.</Empty>}
                {(c.sites || []).map((site) => (
                  <div key={site._id} className="py-3">
                    <p className="text-sm font-medium text-slate-800">{site.name}</p>
                    <p className="text-sm text-slate-500">{site.address} {site.postcode}</p>
                  </div>
                ))}
              </div>
            )}

            {tab === 'Contacts' && (
              <div className="divide-y divide-slate-100">
                {(c.contacts || []).length === 0 && <Empty>No extra contacts recorded.</Empty>}
                {(c.contacts || []).map((contact) => (
                  <div key={contact._id} className="py-3">
                    <p className="text-sm font-medium text-slate-800">{contact.name} <span className="text-slate-400 font-normal">&middot; {contact.role}</span></p>
                    <p className="text-sm text-slate-500">{contact.email} &middot; {contact.phone}</p>
                  </div>
                ))}
              </div>
            )}

            {tab === 'Notes' && <ClientNotes client={c} onSaved={client.reload} />}

            {tab === 'Documents' && (
              <Empty>Documents for this client would be listed here. Certificates live on each installation.</Empty>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}

function ClientNotes({ client, onSaved }) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  const add = async () => {
    if (!body.trim()) return
    setBusy(true)
    try {
      await api.put('/clients/' + client._id, { notes: [...(client.notes || []), { body, author: 'You' }] })
      setBody('')
      onSaved()
    } finally { setBusy(false) }
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <input className="input" placeholder="Add a note..." value={body} onChange={(e) => setBody(e.target.value)} />
        <button className="btn-primary" onClick={add} disabled={busy}>Add</button>
      </div>
      <div className="divide-y divide-slate-100">
        {(client.notes || []).length === 0 && <Empty>No notes yet.</Empty>}
        {(client.notes || []).map((note) => (
          <div key={note._id} className="py-3">
            <p className="text-sm text-slate-700">{note.body}</p>
            <p className="text-xs text-slate-400 mt-1">{note.author} &middot; {shortDate(note.createdAt)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

const Row = ({ label, children }) => (
  <div className="flex justify-between gap-3">
    <dt className="text-slate-500">{label}</dt>
    <dd className="text-slate-800 text-right">{children}</dd>
  </div>
)

const Section = ({ title, children }) => (
  <div>
    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">{title}</h3>
    <div className="divide-y divide-slate-100">{children}</div>
  </div>
)

const Empty = ({ children }) => <p className="py-6 text-sm text-slate-400 text-center">{children}</p>
