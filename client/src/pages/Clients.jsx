import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, qs, money, shortDate } from '../api'
import {
  PageHeader, Card, Table, Badge, SearchInput, Select, Pagination, Modal, Field,
  Tabs, Banner, Loading, StatCard, useFetch,
} from '../components/ui'

// Screen 3: Clients
export function ClientsList() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('All')
  const [page, setPage] = useState(1)
  const [showAdd, setShowAdd] = useState(false)
  const navigate = useNavigate()

  const { data, loading, error, reload } = useFetch('/clients' + qs({ q: search, status, page }))

  const columns = [
    { key: 'name', header: 'Client Name', render: (row) => <span className="font-medium text-slate-900">{row.name}</span> },
    { key: 'contactPerson', header: 'Contact Person' },
    { key: 'email', header: 'Email' },
    { key: 'phone', header: 'Phone' },
    { key: 'status', header: 'Status', render: (row) => <Badge>{row.status}</Badge> },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => <Link to={'/clients/' + row._id} className="text-brand-600 text-sm hover:underline" onClick={(e) => e.stopPropagation()}>View</Link>,
    },
  ]

  return (
    <>
      <PageHeader title="Clients" subtitle="Every account on the books, from first enquiry onwards">
        <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Add Client</button>
      </PageHeader>

      <Banner>{error}</Banner>

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

      <AddClientModal open={showAdd} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); reload() }} />
    </>
  )
}

function AddClientModal({ open, onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', contactPerson: '', email: '', phone: '', address: '', postcode: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.post('/clients', form)
      setForm({ name: '', contactPerson: '', email: '', phone: '', address: '', postcode: '' })
      onSaved()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} title="Add Client" onClose={onClose}>
      <Banner onDismiss={() => setError('')}>{error}</Banner>
      <form onSubmit={save} className="space-y-4">
        <Field label="Client Name" required><input className="input" value={form.name} onChange={set('name')} required /></Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Contact Person"><input className="input" value={form.contactPerson} onChange={set('contactPerson')} /></Field>
          <Field label="Phone"><input className="input" value={form.phone} onChange={set('phone')} /></Field>
        </div>
        <Field label="Email"><input className="input" type="email" value={form.email} onChange={set('email')} /></Field>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Address"><input className="input" value={form.address} onChange={set('address')} /></Field>
          <Field label="Postcode"><input className="input" value={form.postcode} onChange={set('postcode')} /></Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Save Client'}</button>
        </div>
      </form>
    </Modal>
  )
}

// Screen 4: Client Details
export function ClientDetails() {
  const { id } = useParams()
  const [tab, setTab] = useState('Overview')
  const client = useFetch('/clients/' + id)
  const summary = useFetch('/clients/' + id + '/summary')

  if (client.loading || summary.loading) return <Loading />
  if (client.error) return <Banner>{client.error}</Banner>

  const c = client.data
  const s = summary.data

  return (
    <>
      <PageHeader title="Client Details" subtitle={c.name}>
        <Link to="/clients" className="btn-secondary">Back to list</Link>
      </PageHeader>

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
