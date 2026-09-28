import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, qs, money, shortDate, inputDate, lineAmounts, quoteTotals } from '../api'
import {
  PageHeader, Card, Table, Badge, SearchInput, Select, Pagination, Field,
  Tabs, Banner, Loading, useFetch,
} from '../components/ui'
import { exportQuotationPdf } from '../reports/quotation'
import { useAuth } from '../auth'

const STATUSES = ['All', 'Draft', 'Sent', 'Accepted', 'Declined', 'Expired']

const DownloadIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </svg>
)

const EditIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
)

/** Tracks which quotation is being turned into a PDF, and any failure. */
function usePdfExport() {
  const [busyId, setBusyId] = useState(null)
  const [pdfError, setPdfError] = useState('')
  const download = async (quote) => {
    setBusyId(quote._id)
    setPdfError('')
    try {
      await exportQuotationPdf(quote)
    } catch (err) {
      setPdfError('Could not create the PDF: ' + err.message)
    } finally {
      setBusyId(null)
    }
  }
  return { busyId, pdfError, setPdfError, download }
}

// Screen 6: Quotation List
export function QuotationsList() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('All')
  const [page, setPage] = useState(1)
  const navigate = useNavigate()
  const { data, loading, error } = useFetch('/quotations' + qs({ q: search, status, page }))
  const { busyId, pdfError, setPdfError, download } = usePdfExport()
  const { can } = useAuth()

  const columns = [
    { key: 'quoteNo', header: 'Quote No.', render: (r) => <span className="font-medium text-slate-900">{r.quoteNo}</span> },
    { key: 'client', header: 'Client', render: (r) => r.client?.name || '--' },
    { key: 'site', header: 'Site' },
    { key: 'total', header: 'Amount', render: (r) => money(r.total) },
    { key: 'status', header: 'Status', render: (r) => <Badge>{r.status}</Badge> },
    { key: 'validUntil', header: 'Valid Until', render: (r) => shortDate(r.validUntil) },
    {
      key: 'actions', header: 'Actions',
      render: (r) => (
        <span className="flex items-center gap-3">
          <Link to={'/quotations/' + r._id} className="text-brand-600 text-sm hover:underline" onClick={(e) => e.stopPropagation()}>View</Link>
          {can('quotations', 'update') && (
            <Link to={'/quotations/' + r._id + '/edit'} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600" onClick={(e) => e.stopPropagation()}>
              <EditIcon /> Edit
            </Link>
          )}
          <button
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600 disabled:opacity-50"
            disabled={busyId === r._id}
            title="Download PDF"
            onClick={(e) => { e.stopPropagation(); download(r) }}
          >
            <DownloadIcon /> {busyId === r._id ? '...' : 'PDF'}
          </button>
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader title="Quotations" subtitle="Prices sent to clients and where each one stands">
        {can('quotations', 'create') && <Link to="/quotations/new" className="btn-primary">+ New Quotation</Link>}
      </PageHeader>

      <Banner>{error}</Banner>
      <Banner onDismiss={() => setPdfError('')}>{pdfError}</Banner>

      <Card bodyClass="">
        <div className="flex flex-wrap gap-2 p-4 border-b border-slate-200">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search quotations..." />
          <Select value={status} onChange={(v) => { setStatus(v); setPage(1) }} options={STATUSES} />
        </div>
        {loading ? <Loading /> : (
          <>
            <Table columns={columns} rows={data?.items || []} onRowClick={(r) => navigate('/quotations/' + r._id)} empty="No quotations match that search." />
            <Pagination page={data?.page} pages={data?.pages} total={data?.total} onChange={setPage} />
          </>
        )}
      </Card>
    </>
  )
}

const blankItem = () => ({ description: '', qty: 1, unitPrice: 0, vat: 20 })

// Screen 7: Create Quotation
export function QuotationCreate() {
  return <QuotationForm />
}

// Edit an existing quotation, including its status.
export function QuotationEdit() {
  const { id } = useParams()
  const { data: quote, loading } = useFetch('/quotations/' + id)
  if (loading) return <Loading />
  if (!quote) return <Banner>Quotation not found.</Banner>
  return <QuotationForm quote={quote} />
}

const EDIT_STATUSES = STATUSES.filter((s) => s !== 'All')
// Status changes that have their own workflow step on the server (history
// entry, activity log, and for Accepted the installation job), not a plain field update.
const STATUS_ACTIONS = { Sent: 'send', Accepted: 'accept', Declined: 'decline' }

function QuotationForm({ quote }) {
  const editing = Boolean(quote)
  const navigate = useNavigate()
  const clients = useFetch('/clients' + qs({ limit: 200 }))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState(() => (editing
    ? {
        client: quote.client?._id || quote.client || '',
        site: quote.site || '',
        quoteDate: inputDate(quote.quoteDate),
        validUntil: inputDate(quote.validUntil),
        reference: quote.reference || '',
        financeOption: quote.financeOption || 'None',
        notes: quote.notes || '',
        status: quote.status,
      }
    : {
        client: '', site: '', quoteDate: inputDate(new Date()), validUntil: '', reference: '',
        financeOption: 'Pay in Full', notes: '',
      }))
  const [items, setItems] = useState(() => (editing
    ? quote.items.map(({ description, qty, unitPrice, vat }) => ({ description, qty, unitPrice, vat }))
    : [{ description: 'EV Charger Installation', qty: 1, unitPrice: 1000, vat: 20 }]))

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const updateItem = (index, key, value) => {
    const next = [...items]
    next[index] = { ...next[index], [key]: key === 'description' ? value : Number(value) }
    setItems(next)
  }

  // Totals are shown live here and recalculated again on the server on save,
  // so what the client sees and what gets stored can never drift apart.
  const { subtotal, vatTotal, total } = quoteTotals(items)

  const save = async (status) => {
    if (!form.client) { setError('Please choose a client first.'); return }
    setBusy(true)
    setError('')
    try {
      const quote = await api.post('/quotations', { ...form, items, status: 'Draft' })
      if (status === 'Sent') await api.post('/quotations/' + quote._id + '/send')
      navigate('/quotations/' + quote._id)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const saveChanges = async () => {
    if (!form.client) { setError('Please choose a client first.'); return }
    setBusy(true)
    setError('')
    try {
      const { status, ...fields } = form
      const statusChanged = status !== quote.status
      const action = statusChanged && STATUS_ACTIONS[status]
      await api.put('/quotations/' + quote._id, {
        ...fields,
        validUntil: fields.validUntil || null,
        items,
        // Draft / Expired have no workflow step, so they are set directly.
        ...(statusChanged && !action && { status }),
      })
      if (action) await api.post('/quotations/' + quote._id + '/' + action)
      navigate('/quotations/' + quote._id)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const cancelTo = editing ? '/quotations/' + quote._id : '/quotations'

  return (
    <>
      <PageHeader
        title={editing ? 'Edit Quotation ' + quote.quoteNo : 'New Quotation'}
        subtitle={editing ? 'Quotations > ' + quote.quoteNo + ' > Edit' : 'Quotations > New Quotation'}
      >
        <Link to={cancelTo} className="btn-secondary">Cancel</Link>
      </PageHeader>

      <Banner onDismiss={() => setError('')}>{error}</Banner>

      <div className="space-y-4 max-w-4xl">
        <Card title="Client Information">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Select Client" required>
              <select className="input" value={form.client} onChange={set('client')} required>
                <option value="">Select client...</option>
                {(clients.data?.items || []).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Site / Address">
              <input className="input" placeholder="Enter site address" value={form.site} onChange={set('site')} />
            </Field>
          </div>
        </Card>

        <Card title="Quotation Details">
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Quote Date" required><input className="input" type="date" value={form.quoteDate} onChange={set('quoteDate')} /></Field>
            <Field label="Valid Until" required><input className="input" type="date" value={form.validUntil} onChange={set('validUntil')} /></Field>
            <Field label="Reference (Optional)"><input className="input" value={form.reference} onChange={set('reference')} /></Field>
          </div>
          <div className="mt-4 grid sm:grid-cols-3 gap-4">
            <Field label="Payment / Finance">
              <select className="input" value={form.financeOption} onChange={set('financeOption')}>
                <option>Pay in Full</option>
                <option>Finance Plan</option>
                <option>OLEV Grant Funded</option>
                <option>None</option>
              </select>
            </Field>
            {editing && (
              <Field label="Status">
                <select className="input" value={form.status} onChange={set('status')}>
                  {EDIT_STATUSES.map((s) => <option key={s} value={s}>{s === 'Declined' ? 'Declined (Rejected)' : s}</option>)}
                </select>
              </Field>
            )}
          </div>
          {editing && form.status === 'Accepted' && quote.status !== 'Accepted' && (
            <p className="mt-2 text-xs text-slate-500">Saving as Accepted creates and schedules the installation job for this quote.</p>
          )}
          {editing && (
            <div className="mt-4">
              <Field label="Notes">
                <textarea className="input min-h-[80px]" value={form.notes} onChange={set('notes')} />
              </Field>
            </div>
          )}
        </Card>

        <Card title="Items">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 uppercase">
                  <th className="py-2 pr-2">Item / Description</th>
                  <th className="py-2 px-2 w-20">Qty</th>
                  <th className="py-2 px-2 w-32">Unit Price</th>
                  <th className="py-2 px-2 w-24">VAT (%)</th>
                  <th className="py-2 pl-2 w-32 text-right">Total (inc. VAT)</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={index}>
                    <td className="py-1.5 pr-2"><input className="input" value={item.description} onChange={(e) => updateItem(index, 'description', e.target.value)} /></td>
                    <td className="py-1.5 px-2"><input className="input" type="number" min="0" value={item.qty} onChange={(e) => updateItem(index, 'qty', e.target.value)} /></td>
                    <td className="py-1.5 px-2"><input className="input" type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(index, 'unitPrice', e.target.value)} /></td>
                    <td className="py-1.5 px-2"><input className="input" type="number" min="0" value={item.vat} onChange={(e) => updateItem(index, 'vat', e.target.value)} /></td>
                    <td className="py-1.5 pl-2 text-right text-slate-700">{money(lineAmounts(item).total)}</td>
                    <td className="text-center">
                      {items.length > 1 && (
                        <button className="text-slate-400 hover:text-red-500" onClick={() => setItems(items.filter((_, i) => i !== index))}>&times;</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn-ghost mt-2 px-0 text-brand-600" onClick={() => setItems([...items, blankItem()])}>+ Add Item</button>

          <div className="mt-4 pt-4 border-t border-slate-200 flex justify-end">
            <dl className="w-full sm:w-64 space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd>{money(subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">VAT</dt><dd>{money(vatTotal)}</dd></div>
              <div className="flex justify-between pt-1.5 border-t border-slate-200 font-semibold text-slate-900">
                <dt>Total</dt><dd>{money(total)}</dd>
              </div>
            </dl>
          </div>
        </Card>

        <div className="flex justify-end gap-2 pb-6">
          <Link to={cancelTo} className="btn-secondary">Cancel</Link>
          {editing ? (
            <button className="btn-primary" disabled={busy} onClick={saveChanges}>{busy ? 'Saving...' : 'Save Changes'}</button>
          ) : (
            <>
              <button className="btn-secondary" disabled={busy} onClick={() => save('Draft')}>Save as Draft</button>
              <button className="btn-primary" disabled={busy} onClick={() => save('Sent')}>{busy ? 'Saving...' : 'Send Quotation'}</button>
            </>
          )}
        </div>
      </div>
    </>
  )
}

// Screen 8: Quotation Details
export function QuotationDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState('Items')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(null) // { text, installationId }
  const { data: quote, loading, reload } = useFetch('/quotations/' + id)
  const { busyId, pdfError, setPdfError, download } = usePdfExport()
  const { can } = useAuth()
  const canEdit = can('quotations', 'update')

  if (loading) return <Loading />
  if (!quote) return <Banner>Quotation not found.</Banner>
  // Worked out from the lines so they always add up, even on quotes saved before line totals included VAT.
  const totals = quoteTotals(quote.items)

  const act = async (action) => {
    try {
      const result = await api.post('/quotations/' + id + '/' + action)
      if (action === 'accept' && result.installation) {
        setNotice({
          text: 'Quotation accepted. Installation ' + result.installation.installNo + ' is linked to it.',
          installationId: result.installation._id,
        })
      }
      reload()
    } catch (err) { setError(err.message) }
  }

  return (
    <>
      <PageHeader title={'Quotation ' + quote.quoteNo} subtitle={quote.client?.name}>
        <Link to="/quotations" className="btn-secondary">Back</Link>
        {canEdit && <Link to={'/quotations/' + id + '/edit'} className="btn-secondary"><EditIcon /> Edit</Link>}
        <button className="btn-secondary" onClick={() => download(quote)} disabled={busyId === quote._id}>
          <DownloadIcon /> {busyId === quote._id ? 'Preparing...' : 'Download PDF'}
        </button>
        {canEdit && quote.status === 'Draft' && <button className="btn-primary" onClick={() => act('send')}>Send Quotation</button>}
        {canEdit && quote.status === 'Sent' && (
          <>
            <button className="btn-secondary" onClick={() => act('decline')}>Mark Declined</button>
            <button className="btn-primary" onClick={() => act('accept')}>Mark Accepted</button>
          </>
        )}
      </PageHeader>

      <Banner onDismiss={() => setError('')}>{error}</Banner>
      <Banner onDismiss={() => setPdfError('')}>{pdfError}</Banner>
      {notice && (
        <Banner kind="success" onDismiss={() => setNotice(null)}>
          {notice.text} <button className="underline" onClick={() => navigate('/installations/' + notice.installationId)}>View installation</button>
        </Banner>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-slate-900">{quote.quoteNo}</span>
            <Badge>{quote.status}</Badge>
          </div>
          <dl className="space-y-2 text-sm">
            <Row label="Client">{quote.client?.name}</Row>
            <Row label="Site">{quote.site || '--'}</Row>
            <Row label="Quote Date">{shortDate(quote.quoteDate)}</Row>
            <Row label="Valid Until">{shortDate(quote.validUntil)}</Row>
            <Row label="Reference">{quote.reference || '--'}</Row>
            <Row label="Payment">{quote.financeOption}</Row>
            <Row label="Installation">
              {(quote.installations || []).length === 0
                ? <span className="text-slate-400">{quote.status === 'Accepted' ? 'None linked' : 'Created when accepted'}</span>
                : quote.installations.map((ins) => (
                  <Link key={ins._id} to={'/installations/' + ins._id} className="block text-brand-600 hover:underline">
                    {ins.installNo} · {ins.status}
                  </Link>
                ))}
            </Row>
          </dl>
        </Card>

        <Card className="lg:col-span-2" bodyClass="p-4">
          <Tabs tabs={['Items', 'Notes', 'Documents', 'History']} active={tab} onChange={setTab} />

          {tab === 'Items' && (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 uppercase border-b border-slate-200">
                    <th className="py-2">Item</th><th className="py-2 px-2">Qty</th>
                    <th className="py-2 px-2">Unit Price</th><th className="py-2 px-2">VAT</th>
                    <th className="py-2 text-right">Total (inc. VAT)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {quote.items.map((item) => (
                    <tr key={item._id}>
                      <td className="py-2 text-slate-700">{item.description}</td>
                      <td className="py-2 px-2">{item.qty}</td>
                      <td className="py-2 px-2">{money(item.unitPrice)}</td>
                      <td className="py-2 px-2">{item.vat}%</td>
                      <td className="py-2 text-right">{money(lineAmounts(item).total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 pt-3 border-t border-slate-200 flex justify-end">
                <dl className="w-64 space-y-1.5 text-sm">
                  <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd>{money(totals.subtotal)}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">VAT</dt><dd>{money(totals.vatTotal)}</dd></div>
                  <div className="flex justify-between pt-1.5 border-t border-slate-200 font-semibold text-slate-900">
                    <dt>Total</dt><dd>{money(totals.total)}</dd>
                  </div>
                </dl>
              </div>
            </>
          )}

          {tab === 'Notes' && <p className="text-sm text-slate-600 py-4">{quote.notes || 'No notes on this quotation.'}</p>}

          {tab === 'Documents' && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="grid place-items-center w-10 h-10 rounded-lg bg-red-50 text-red-600 text-[10px] font-bold">PDF</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">Quotation {quote.quoteNo}</p>
                  <p className="text-xs text-slate-400">Client copy with items, totals, terms and a sign-off section</p>
                </div>
              </div>
              <button className="btn-primary px-3 py-1.5" onClick={() => download(quote)} disabled={busyId === quote._id}>
                <DownloadIcon /> {busyId === quote._id ? 'Preparing...' : 'Download'}
              </button>
            </div>
          )}

          {tab === 'History' && (
            <div className="divide-y divide-slate-100">
              {(quote.history || []).length === 0 && <p className="py-6 text-sm text-slate-400 text-center">Nothing recorded yet.</p>}
              {(quote.history || []).map((entry) => (
                <div key={entry._id} className="py-3 flex justify-between text-sm">
                  <span className="text-slate-700">{entry.action}</span>
                  <span className="text-slate-400">{shortDate(entry.at)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  )
}

const Row = ({ label, children }) => (
  <div className="flex justify-between gap-3">
    <dt className="text-slate-500">{label}</dt>
    <dd className="text-slate-800 text-right">{children}</dd>
  </div>
)
