import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, qs, shortDate } from '../api'
import {
  PageHeader, Card, Table, Badge, SearchInput, Select, Pagination, Field, Modal,
  Banner, Loading, useFetch,
} from '../components/ui'

// Screen 12: Post-Install Support / Warranty
export function SupportList() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('All')
  const [page, setPage] = useState(1)
  const [showNew, setShowNew] = useState(false)
  const [error, setError] = useState('')
  const { data, loading, reload } = useFetch('/tickets' + qs({ q: search, status, page }))

  const advance = async (ticket, nextStatus) => {
    try {
      await api.put('/tickets/' + ticket._id, { status: nextStatus })
      reload()
    } catch (err) { setError(err.message) }
  }

  const columns = [
    { key: 'ticketNo', header: 'Ticket No.', render: (r) => <span className="font-medium text-slate-900">{r.ticketNo}</span> },
    { key: 'client', header: 'Client', render: (r) => r.client?.name || '--' },
    { key: 'issue', header: 'Issue' },
    { key: 'priority', header: 'Priority', render: (r) => <Badge>{r.priority}</Badge> },
    { key: 'status', header: 'Status', render: (r) => <Badge>{r.status}</Badge> },
    {
      key: 'warranty', header: 'Warranty',
      render: (r) => r.underWarranty
        ? <span className="text-xs text-emerald-600">Covered</span>
        : <span className="text-xs text-slate-400">Chargeable</span>,
    },
    {
      key: 'actions', header: 'Actions',
      render: (r) => (
        <div className="flex gap-2">
          {r.status === 'Open' && <button className="text-brand-600 text-xs hover:underline" onClick={() => advance(r, 'In Progress')}>Start</button>}
          {r.status !== 'Closed' && <button className="text-slate-500 text-xs hover:underline" onClick={() => advance(r, 'Closed')}>Close</button>}
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader title="Post-Install Support" subtitle="Faults, questions and warranty work after handover">
        <button className="btn-primary" onClick={() => setShowNew(true)}>+ New Ticket</button>
      </PageHeader>

      <Banner onDismiss={() => setError('')}>{error}</Banner>

      <Card bodyClass="">
        <div className="flex flex-wrap gap-2 p-4 border-b border-slate-200">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search tickets..." />
          <Select value={status} onChange={(v) => { setStatus(v); setPage(1) }} options={['All', 'Open', 'In Progress', 'Closed']} />
        </div>
        {loading ? <Loading /> : (
          <>
            <Table columns={columns} rows={data?.items || []} empty="No support tickets match that search." />
            <Pagination page={data?.page} pages={data?.pages} total={data?.total} onChange={setPage} />
          </>
        )}
      </Card>

      <NewTicketModal open={showNew} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); reload() }} />
    </>
  )
}

function NewTicketModal({ open, onClose, onSaved }) {
  const clients = useFetch('/clients' + qs({ limit: 200 }))
  const [form, setForm] = useState({ client: '', issue: '', description: '', priority: 'Medium', underWarranty: true })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.post('/tickets', form)
      setForm({ client: '', issue: '', description: '', priority: 'Medium', underWarranty: true })
      onSaved()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} title="New Support Ticket" onClose={onClose}>
      <Banner onDismiss={() => setError('')}>{error}</Banner>
      <form onSubmit={save} className="space-y-4">
        <Field label="Client" required>
          <select className="input" value={form.client} onChange={set('client')} required>
            <option value="">Select client...</option>
            {(clients.data?.items || []).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Issue" required><input className="input" value={form.issue} onChange={set('issue')} required /></Field>
        <Field label="Description"><textarea className="input" rows="3" value={form.description} onChange={set('description')} /></Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Priority">
            <select className="input" value={form.priority} onChange={set('priority')}>
              <option>Low</option><option>Medium</option><option>High</option>
            </select>
          </Field>
          <Field label="Warranty">
            <label className="flex items-center gap-2 text-sm text-slate-600 h-[38px]">
              <input type="checkbox" className="rounded border-slate-300" checked={form.underWarranty}
                onChange={(e) => setForm({ ...form, underWarranty: e.target.checked })} />
              Covered by workmanship warranty
            </label>
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Raise Ticket'}</button>
        </div>
      </form>
    </Modal>
  )
}

// Screen 13 (list): OLEV grant claims
export function GrantsList() {
  const [status, setStatus] = useState('All')
  const [showNew, setShowNew] = useState(false)
  const navigate = useNavigate()
  const { data, loading, error, reload } = useFetch('/grants' + qs({ status }))

  const columns = [
    { key: 'installation', header: 'Installation', render: (r) => <span className="font-medium text-slate-900">{r.installation?.installNo || '--'}</span> },
    { key: 'client', header: 'Client', render: (r) => r.installation?.client?.name || '--' },
    { key: 'grantType', header: 'Grant Type' },
    { key: 'customerConsent', header: 'Consent', render: (r) => (r.customerConsent ? 'Received' : 'Outstanding') },
    { key: 'status', header: 'Status', render: (r) => <Badge>{r.status}</Badge> },
    { key: 'submittedAt', header: 'Submitted', render: (r) => shortDate(r.submittedAt) },
    {
      key: 'actions', header: 'Actions',
      render: (r) => <Link to={'/grants/' + r._id} className="text-brand-600 text-sm hover:underline" onClick={(e) => e.stopPropagation()}>Open</Link>,
    },
  ]

  return (
    <>
      <PageHeader title="OLEV Grant Submissions" subtitle="Government grant claims made on behalf of customers">
        <button className="btn-primary" onClick={() => setShowNew(true)}>+ New Submission</button>
      </PageHeader>

      <Banner>{error}</Banner>

      <Card bodyClass="">
        <div className="flex flex-wrap gap-2 p-4 border-b border-slate-200">
          <div className="flex-1" />
          <Select value={status} onChange={setStatus} options={['All', 'Draft', 'Submitted', 'Approved', 'Rejected']} />
        </div>
        {loading ? <Loading /> : (
          <Table columns={columns} rows={data?.items || []} onRowClick={(r) => navigate('/grants/' + r._id)} empty="No grant claims yet." />
        )}
      </Card>

      <NewGrantModal open={showNew} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); reload() }} />
    </>
  )
}

function NewGrantModal({ open, onClose, onSaved }) {
  const installs = useFetch('/installations' + qs({ limit: 200 }))
  const [form, setForm] = useState({ installation: '', grantType: 'Homecharge Scheme' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.post('/grants', form)
      onSaved()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} title="New Grant Submission" onClose={onClose}>
      <Banner onDismiss={() => setError('')}>{error}</Banner>
      <form onSubmit={save} className="space-y-4">
        <Field label="Installation" required>
          <select className="input" value={form.installation} onChange={(e) => setForm({ ...form, installation: e.target.value })} required>
            <option value="">Select installation...</option>
            {(installs.data?.items || []).map((i) => (
              <option key={i._id} value={i._id}>{i.installNo} - {i.client?.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Grant Type">
          <select className="input" value={form.grantType} onChange={(e) => setForm({ ...form, grantType: e.target.value })}>
            <option>Homecharge Scheme</option>
            <option>Workplace Charging Scheme</option>
            <option>EV Infrastructure Grant</option>
          </select>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>{busy ? 'Creating...' : 'Create'}</button>
        </div>
      </form>
    </Modal>
  )
}

const DOCS = [
  ['invoice', 'Invoice'],
  ['proofOfPayment', 'Proof of Payment'],
  ['eicCertificate', 'EIC Certificate'],
  ['productCertificate', 'Product Certificate'],
  ['photos', 'Photos'],
]

// Screen 13: OLEV Grant Submission
export function GrantSubmission() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: grant, loading, reload } = useFetch('/grants/' + id)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState(null)

  if (loading) return <Loading />
  if (!grant) return <Banner>Grant submission not found.</Banner>

  const current = draft || grant
  const update = (patch) => setDraft({ ...current, ...patch })

  const saveAndSubmit = async (submit) => {
    setBusy(true)
    setError('')
    try {
      await api.put('/grants/' + id, {
        grantType: current.grantType,
        customerConsent: current.customerConsent,
        documents: current.documents,
        comments: current.comments,
      })
      if (submit) await api.post('/grants/' + id + '/submit')
      setDraft(null)
      reload()
      if (submit) navigate('/grants')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <>
      <PageHeader title="OLEV Grant Submission" subtitle={current.installation?.installNo + ' - ' + (current.installation?.client?.name || '')}>
        <Link to="/grants" className="btn-secondary">Back</Link>
        <Badge>{current.status}</Badge>
      </PageHeader>

      <Banner onDismiss={() => setError('')}>{error}</Banner>

      <Card className="max-w-2xl">
        <div className="space-y-4">
          <Field label="Installation">
            <input className="input bg-slate-50" value={(current.installation?.installNo || '') + ' (' + (current.installation?.client?.name || '') + ')'} readOnly />
          </Field>

          <Field label="Grant Type">
            <select className="input" value={current.grantType} onChange={(e) => update({ grantType: e.target.value })}>
              <option>Homecharge Scheme</option>
              <option>Workplace Charging Scheme</option>
              <option>EV Infrastructure Grant</option>
            </select>
          </Field>

          <Field label="Customer Consent">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="rounded border-slate-300" checked={current.customerConsent}
                onChange={(e) => update({ customerConsent: e.target.checked })} />
              Consent received
            </label>
          </Field>

          <Field label="Documents Required">
            <div className="grid sm:grid-cols-2 gap-2 p-3 border border-slate-200 rounded-md">
              {DOCS.map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300"
                    checked={!!current.documents?.[key]}
                    onChange={(e) => update({ documents: { ...current.documents, [key]: e.target.checked } })}
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-1.5">
              The claim will not submit without consent, the invoice, proof of payment and the EIC certificate.
            </p>
          </Field>

          <Field label="Comments (Optional)">
            <textarea className="input" rows="3" value={current.comments || ''} onChange={(e) => update({ comments: e.target.value })} />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" disabled={busy} onClick={() => saveAndSubmit(false)}>Save</button>
            <button className="btn-primary" disabled={busy || current.status === 'Submitted'} onClick={() => saveAndSubmit(true)}>
              {current.status === 'Submitted' ? 'Already Submitted' : busy ? 'Submitting...' : 'Submit to OLEV'}
            </button>
          </div>
        </div>
      </Card>
    </>
  )
}
