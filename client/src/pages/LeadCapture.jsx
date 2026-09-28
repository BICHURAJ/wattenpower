import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, qs, shortDate } from '../api'
import {
  PageHeader, Card, Table, Badge, SearchInput, Select, Pagination, Field, Banner, Loading, useFetch, BrandLogo,
} from '../components/ui'
import { useAuth } from '../auth'
import LocationPicker from '../components/LocationPicker'

// Screen 5: Website Lead Capture.
// This is the "Website (Lead Capture)" node on the workflow -- it posts to a
// public endpoint, so a prospective customer can use it without an account.
export default function LeadCapture() {
  const [form, setForm] = useState({
    fullName: '', email: '', phone: '', address: '', postcode: '', location: null,
    leadType: 'Installation Enquiry', preferredContactMethod: 'Email', message: '',
  })
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.public.post('/public/leads', { ...form, location: form.location || undefined })
      setDone(true)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <BrandLogo className="w-60 max-w-full" />
        </div>

        <Card title="New Lead Capture" action={<span className="text-xs text-slate-400">Source: Website</span>}>
          {done ? (
            <div className="py-10 text-center">
              <p className="text-lg font-semibold text-slate-900">Thanks, we have your enquiry.</p>
              <p className="text-sm text-slate-500 mt-2">
                Our sales team will be in touch by {form.preferredContactMethod.toLowerCase()} to arrange your survey.
              </p>
              <button className="btn-secondary mt-6" onClick={() => { setDone(false); setForm({ ...form, fullName: '', email: '', phone: '', message: '' }) }}>
                Submit another enquiry
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <Banner onDismiss={() => setError('')}>{error}</Banner>

              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Full Name" required>
                  <input className="input" placeholder="Enter full name" value={form.fullName} onChange={set('fullName')} required />
                </Field>
                <Field label="Email" required>
                  <input className="input" type="email" placeholder="Enter email" value={form.email} onChange={set('email')} required />
                </Field>
                <Field label="Phone" required>
                  <input className="input" placeholder="Enter phone" value={form.phone} onChange={set('phone')} required />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Where is the installation? (optional)">
                    <LocationPicker value={form} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} height={240} />
                  </Field>
                </div>
                <Field label="Address">
                  <input className="input" placeholder="Enter address" value={form.address} onChange={set('address')} />
                </Field>
                <Field label="Postcode">
                  <input className="input" placeholder="Enter postcode" value={form.postcode} onChange={set('postcode')} />
                </Field>
                <Field label="Lead Type">
                  <select className="input" value={form.leadType} onChange={set('leadType')}>
                    <option>Installation Enquiry</option>
                    <option>Survey Request</option>
                    <option>Support Request</option>
                    <option>General Enquiry</option>
                  </select>
                </Field>
                <Field label="Preferred Contact Method">
                  <select className="input" value={form.preferredContactMethod} onChange={set('preferredContactMethod')}>
                    <option>Email</option>
                    <option>Phone</option>
                    <option>SMS</option>
                  </select>
                </Field>
                <Field label="Message / Requirements">
                  <textarea className="input h-[42px] min-h-[42px]" rows="1" placeholder="Enter message..." value={form.message} onChange={set('message')} />
                </Field>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Link to="/login" className="btn-secondary">Cancel</Link>
                <button className="btn-primary" disabled={busy}>{busy ? 'Submitting...' : 'Submit Lead'}</button>
              </div>
            </form>
          )}
        </Card>

        <p className="mt-4 text-center text-xs text-slate-400">
          Staff member? <Link to="/login" className="text-brand-600 hover:underline">Sign in to the platform</Link>
        </p>
      </div>
    </div>
  )
}

// The staff-side view of everything the website form has captured.
export function LeadsList() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('All')
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const { data, loading, reload } = useFetch('/leads' + qs({ q: search, status, page }))
  const { can } = useAuth()
  // Converting updates the lead and creates a client.
  const canConvert = can('leads', 'update') && can('clients', 'create')

  const convert = async (lead) => {
    try {
      await api.post('/leads/' + lead._id + '/convert')
      reload()
    } catch (err) { setError(err.message) }
  }

  const columns = [
    { key: 'fullName', header: 'Name', render: (r) => <span className="font-medium text-slate-900">{r.fullName}</span> },
    { key: 'email', header: 'Email' },
    { key: 'phone', header: 'Phone' },
    { key: 'leadType', header: 'Lead Type' },
    { key: 'createdAt', header: 'Received', render: (r) => shortDate(r.createdAt) },
    { key: 'status', header: 'Status', render: (r) => <Badge>{r.status}</Badge> },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => r.convertedClient
        ? <span className="text-xs text-slate-400">Converted</span>
        : canConvert
          ? <button className="text-brand-600 text-sm hover:underline" onClick={() => convert(r)}>Convert to client</button>
          : <span className="text-xs text-slate-400">Not converted</span>,
    },
  ]

  return (
    <>
      <PageHeader title="Website Leads" subtitle="Enquiries captured by the public website form">
        <Link to="/lead-capture" className="btn-primary">Open public form</Link>
      </PageHeader>

      <Banner onDismiss={() => setError('')}>{error}</Banner>

      <Card bodyClass="">
        <div className="flex flex-wrap gap-2 p-4 border-b border-slate-200">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search leads..." />
          <Select value={status} onChange={setStatus} options={['All', 'New', 'Contacted', 'Survey Booked', 'Quoted', 'Closed']} />
        </div>
        {loading ? <Loading /> : (
          <>
            <Table columns={columns} rows={data?.items || []} empty="No website enquiries yet." />
            <Pagination page={data?.page} pages={data?.pages} total={data?.total} onChange={setPage} />
          </>
        )}
      </Card>
    </>
  )
}
