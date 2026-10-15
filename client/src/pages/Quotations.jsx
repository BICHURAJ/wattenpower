import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, qs, money, shortDate, inputDate, lineAmounts, quoteTotals } from '../api'
import {
  PageHeader, Card, Table, Badge, SearchInput, Select, Pagination, Field,
  Tabs, Banner, Loading, useFetch,
} from '../components/ui'
import { exportQuotationPdf } from '../reports/quotation'
import { useAuth } from '../auth'
import { normaliseProducts, ProductChips, ProductPicker } from '../processes'
import { quoteTemplate } from '../quoteTemplates'

const STATUSES = ['All', 'Draft', 'Sent', 'Accepted', 'Declined', 'Expired']

// Starting lines for a new quote, per product. Residential solar panels and
// batteries are 0% VAT in the UK (energy-saving materials, until March 2027);
// EV chargers are standard rate.
const DEFAULT_ITEMS = {
  ev: [
    { description: 'Ohme EV Charger - 7 kW', qty: 1, unitPrice: 750, vat: 20 },
    { description: 'Standard Installation and Commissioning', qty: 1, unitPrice: 300, vat: 20 },
  ],
  solar: { description: 'Solar PV system - supply & installation', qty: 1, unitPrice: 5500, vat: 0 },
  battery: { description: 'Battery storage - supply & installation', qty: 1, unitPrice: 4000, vat: 0 },
}
const defaultItems = (products) => normaliseProducts(products).flatMap((p) => [].concat(DEFAULT_ITEMS[p]).map((item) => ({ ...item })))

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

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
  </svg>
)

/** Asks, then deletes a quotation. Resolves true if it was deleted. */
async function confirmAndDelete(quote) {
  const who = quote.client?.name ? ' for ' + quote.client.name : ''
  const accepted = quote.status === 'Accepted' ? '\n\nThis quote was accepted by the customer.' : ''
  if (!window.confirm('Delete quotation ' + quote.quoteNo + who + '?' + accepted + '\n\nThis cannot be undone.')) return false
  await api.del('/quotations/' + quote._id)
  return true
}

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
  // Searched a moment after typing stops, not on every key.
  const [query, setQuery] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])
  const [status, setStatus] = useState('All')
  const [page, setPage] = useState(1)
  const navigate = useNavigate()
  const { data, loading, error, reload } = useFetch('/quotations' + qs({ q: query, status, page }))
  const { busyId, pdfError, setPdfError, download } = usePdfExport()
  const { can } = useAuth()
  const canDelete = can('quotations', 'delete')
  const [deletingId, setDeletingId] = useState(null)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const remove = async (row) => {
    setActionError('')
    setNotice('')
    setDeletingId(row._id)
    try {
      if (await confirmAndDelete(row)) { setNotice('Quotation ' + row.quoteNo + ' deleted.'); reload() }
    } catch (err) { setActionError(err.message) } finally { setDeletingId(null) }
  }

  const columns = [
    { key: 'quoteNo', header: 'Quote No.', render: (r) => <span className="font-medium text-slate-900">{r.quoteNo}</span> },
    { key: 'client', header: 'Client', render: (r) => r.client?.name || '--' },
    { key: 'products', header: 'For', render: (r) => <ProductChips products={r.products} size="xs" /> },
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
          {canDelete && (
            <button
              className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-red-600 disabled:opacity-50"
              disabled={deletingId === r._id}
              title={'Delete ' + r.quoteNo}
              onClick={(e) => { e.stopPropagation(); remove(r) }}
            >
              <TrashIcon /> {deletingId === r._id ? 'Deleting...' : 'Delete'}
            </button>
          )}
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
      <Banner onDismiss={() => setActionError('')}>{actionError}</Banner>
      <Banner kind="success" onDismiss={() => setNotice('')}>{notice}</Banner>

      <Card bodyClass="">
        <div className="flex flex-wrap gap-2 p-4 border-b border-slate-200">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search quote no., customer, address, postcode, EV, solar, battery, item..." />
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
        products: normaliseProducts(quote.products),
        // Quotes from before the template get its wording when next edited.
        title: quote.title || quoteTemplate(quote.products).title,
        worksDescription: quote.worksDescription || quoteTemplate(quote.products).works,
        paymentTerms: quote.paymentTerms || quoteTemplate(quote.products).paymentTerms,
        showLinePrices: Boolean(quote.showLinePrices),
      }
    : {
        client: '', site: '', quoteDate: inputDate(new Date()), validUntil: '', reference: '',
        financeOption: 'Pay in Full', notes: '', products: ['ev'],
        title: quoteTemplate(['ev']).title,
        worksDescription: quoteTemplate(['ev']).works,
        paymentTerms: quoteTemplate(['ev']).paymentTerms,
        showLinePrices: false,
      }))
  // The wording follows the chosen products until someone edits it.
  const wordingEdited = useRef(editing)
  const [items, setItems] = useState(() => (editing
    ? quote.items.map(({ description, qty, unitPrice, vat }) => ({ description, qty, unitPrice, vat }))
    : defaultItems(['ev'])))
  // Optional discount on the whole quote: { type: '' | 'percent' | 'amount', value, reason }.
  const [discount, setDiscount] = useState(() => ({
    type: quote?.discount?.type || '',
    value: quote?.discount?.value ? String(quote.discount.value) : '',
    reason: quote?.discount?.reason || '',
  }))
  const discountPayload = () => (discount.type
    ? { type: discount.type, value: Number(discount.value) || 0, reason: discount.reason.trim() }
    : { type: '', value: 0, reason: '' })
  // On a new quote, the lines follow the chosen products until someone edits them.
  const itemsEdited = useRef(editing)
  const chooseProducts = (products) => {
    const t = quoteTemplate(products)
    setForm((f) => ({ ...f, products, ...(!wordingEdited.current && { title: t.title, worksDescription: t.works }) }))
    if (!itemsEdited.current) setItems(defaultItems(products))
  }
  // The system design isn't part of the quote: the engineer designs it on the job (MCS).
  const productFields = () => ({ products: normaliseProducts(form.products) })

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })
  const setWording = (key) => (e) => { wordingEdited.current = true; setForm({ ...form, [key]: e.target.value }) }

  const updateItem = (index, key, value) => {
    itemsEdited.current = true
    const next = [...items]
    next[index] = { ...next[index], [key]: key === 'description' ? value : Number(value) }
    setItems(next)
  }

  // Totals are shown live here and recalculated again on the server on save,
  // so what the client sees and what gets stored can never drift apart.
  const totals = quoteTotals(items, discountPayload())

  const save = async (status) => {
    if (!form.client) { setError('Please choose a client first.'); return }
    setBusy(true)
    setError('')
    try {
      const quote = await api.post('/quotations', { ...form, ...productFields(), items, discount: discountPayload(), status: 'Draft' })
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
        ...productFields(),
        validUntil: fields.validUntil || null,
        items,
        discount: discountPayload(),
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
        <Card title="What's being quoted">
          <ProductPicker value={form.products} onChange={chooseProducts} />
          {!editing && <p className="mt-2 text-xs text-slate-400">The quote lines below start from what you pick; edit them freely.</p>}
        </Card>

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

        <Card title="Quotation document" subtitle="Wording on the PDF, from the template for what's being quoted">
          <div className="space-y-4">
            <Field label="Headline (shown with the total)">
              <input className="input" value={form.title} maxLength={120} onChange={setWording('title')} />
            </Field>
            <Field label="Description of works">
              <textarea className="input min-h-[140px]" value={form.worksDescription} maxLength={4000} onChange={setWording('worksDescription')} />
            </Field>
            <div className="grid sm:grid-cols-2 gap-4 items-end">
              <Field label="Payment terms">
                <input className="input" value={form.paymentTerms} maxLength={300} onChange={set('paymentTerms')} />
              </Field>
              <label className="flex items-center gap-2 text-sm text-slate-600 pb-2">
                <input type="checkbox" className="rounded border-slate-300" checked={form.showLinePrices}
                  onChange={(e) => setForm({ ...form, showLinePrices: e.target.checked })} />
                Show line prices on the PDF
              </label>
            </div>
            <button type="button" className="text-xs text-brand-600 hover:underline" onClick={() => {
              const t = quoteTemplate(form.products)
              wordingEdited.current = false
              setForm({ ...form, title: t.title, worksDescription: t.works, paymentTerms: t.paymentTerms })
            }}>
              Reset to the template wording
            </button>
          </div>
        </Card>

        <Card title="Items">
          {/* Phones: each line is its own block, with the fields on two rows. */}
          <div className="sm:overflow-x-auto">
            <table className="block sm:table w-full text-sm">
              <thead className="hidden sm:table-header-group">
                <tr className="text-left text-xs text-slate-500 uppercase">
                  <th className="py-2 pr-2">Item / Description</th>
                  <th className="py-2 px-2 w-20">Qty</th>
                  <th className="py-2 px-2 w-32">Unit Price</th>
                  <th className="py-2 px-2 w-24">VAT (%)</th>
                  <th className="py-2 pl-2 w-32 text-right">Total (inc. VAT)</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="block sm:table-row-group divide-y divide-slate-100 sm:divide-y-0">
                {items.map((item, index) => (
                  <tr key={index} className="relative grid grid-cols-3 gap-2 py-3 sm:table-row sm:py-0">
                    <td className="col-span-3 pr-8 sm:pr-2 sm:py-1.5 sm:table-cell">
                      <span className="sm:hidden label">Item / Description</span>
                      <input className="input" value={item.description} onChange={(e) => updateItem(index, 'description', e.target.value)} />
                    </td>
                    <td className="sm:py-1.5 sm:px-2 sm:table-cell">
                      <span className="sm:hidden label">Qty</span>
                      <input className="input" type="number" min="0" value={item.qty} onChange={(e) => updateItem(index, 'qty', e.target.value)} />
                    </td>
                    <td className="sm:py-1.5 sm:px-2 sm:table-cell">
                      <span className="sm:hidden label">Unit price</span>
                      <input className="input" type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(index, 'unitPrice', e.target.value)} />
                    </td>
                    <td className="sm:py-1.5 sm:px-2 sm:table-cell">
                      <span className="sm:hidden label">VAT %</span>
                      <input className="input" type="number" min="0" value={item.vat} onChange={(e) => updateItem(index, 'vat', e.target.value)} />
                    </td>
                    <td className="col-span-3 flex justify-between sm:table-cell sm:py-1.5 sm:pl-2 text-right text-slate-700 whitespace-nowrap">
                      <span className="sm:hidden text-xs text-slate-500">Line total (inc. VAT)</span>
                      {money(lineAmounts(item).total)}
                    </td>
                    <td className="absolute right-0 top-9 sm:static sm:table-cell text-center">
                      {items.length > 1 && (
                        <button className="text-slate-400 hover:text-red-500" onClick={() => { itemsEdited.current = true; setItems(items.filter((_, i) => i !== index)) }}>&times;</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn-ghost mt-2 px-0 text-brand-600" onClick={() => { itemsEdited.current = true; setItems([...items, blankItem()]) }}>+ Add Item</button>

          <div className="mt-4 pt-4 border-t border-slate-200 flex flex-wrap items-start justify-between gap-6">
            <DiscountFields value={discount} onChange={setDiscount} subtotal={totals.subtotal} />
            <QuoteTotalsList totals={totals} discount={discountPayload()} />
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
  const [deleting, setDeleting] = useState(false)

  if (loading) return <Loading />
  if (!quote) return <Banner>Quotation not found.</Banner>
  // Worked out from the lines so they always add up, even on quotes saved before line totals included VAT.
  const totals = quoteTotals(quote.items, quote.discount)

  const linkedJobs = quote.installations || []
  const remove = async () => {
    setError('')
    setDeleting(true)
    try {
      if (await confirmAndDelete(quote)) navigate('/quotations')
    } catch (err) { setError(err.message) } finally { setDeleting(false) }
  }

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
        {can('quotations', 'delete') && (
          <button
            className="btn-secondary text-red-600 hover:bg-red-50 hover:border-red-200 disabled:text-slate-400"
            onClick={remove}
            disabled={deleting || linkedJobs.length > 0}
            title={linkedJobs.length ? 'Linked to installation ' + linkedJobs.map((j) => j.installNo).join(', ') + ' -- unlink it on the job first, or mark the quote Declined or Expired' : 'Delete this quotation'}
          >
            <TrashIcon /> {deleting ? 'Deleting...' : 'Delete'}
          </button>
        )}
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
            <Row label="For"><ProductChips products={quote.products} /></Row>
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
              <div className="overflow-x-auto">
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
                      <td className="py-2 px-2 whitespace-nowrap">{money(item.unitPrice)}</td>
                      <td className="py-2 px-2 whitespace-nowrap">{item.vat}%</td>
                      <td className="py-2 text-right whitespace-nowrap">{money(lineAmounts(item).total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-200 flex justify-end">
                <QuoteTotalsList totals={totals} discount={quote.discount} />
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
    <dt className="text-slate-500 shrink-0">{label}</dt>
    <dd className="min-w-0 text-slate-800 text-right break-words">{children}</dd>
  </div>
)

/** "10% (Loyalty)" / "£250 (Price match)" -- how a discount is described on screen and in PDFs. */
export function discountLabel(discount) {
  if (!discount?.type || !Number(discount.value)) return ''
  const what = discount.type === 'percent' ? Number(discount.value) + '%' : money(discount.value)
  return what + (discount.reason ? ' (' + discount.reason + ')' : '')
}

/** Subtotal, discount, net, VAT and total, as on the quote and the PDF. */
function QuoteTotalsList({ totals, discount }) {
  return (
    <dl className="w-full sm:w-72 space-y-1.5 text-sm ml-auto">
      <div className="flex justify-between"><dt className="text-slate-500">Subtotal (ex VAT)</dt><dd>{money(totals.subtotal)}</dd></div>
      {totals.discount > 0 && (
        <>
          <div className="flex justify-between gap-3 text-emerald-700">
            <dt className="min-w-0">Discount <span className="text-xs">{discountLabel(discount)}</span></dt>
            <dd className="whitespace-nowrap">-{money(totals.discount)}</dd>
          </div>
          <div className="flex justify-between"><dt className="text-slate-500">Net after discount</dt><dd>{money(totals.net)}</dd></div>
        </>
      )}
      <div className="flex justify-between"><dt className="text-slate-500">VAT</dt><dd>{money(totals.vatTotal)}</dd></div>
      <div className="flex justify-between pt-1.5 border-t border-slate-200 font-semibold text-slate-900">
        <dt>Total</dt><dd>{money(totals.total)}</dd>
      </div>
    </dl>
  )
}

/** Discount on the whole quote: none, a percentage, or a fixed amount, with a reason. */
function DiscountFields({ value, onChange, subtotal }) {
  const set = (patch) => onChange({ ...value, ...patch })
  const options = [['', 'No discount'], ['percent', '%'], ['amount', '£']]
  const tooBig = value.type === 'percent' ? Number(value.value) > 100 : value.type === 'amount' && Number(value.value) > subtotal
  return (
    <div className="w-full sm:w-auto sm:min-w-[300px] max-w-md">
      <p className="label">Discount</p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
          {options.map(([key, label]) => (
            <button key={key || 'none'} type="button" onClick={() => set({ type: key, value: key ? value.value : '' })}
              className={'px-3 py-1.5 text-xs font-medium rounded-md ' + (value.type === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}>
              {label}
            </button>
          ))}
        </div>
        {value.type && (
          <div className="relative w-28">
            {value.type === 'amount' && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">£</span>}
            <input className={'input ' + (value.type === 'amount' ? 'pl-7' : 'pr-7')} type="number" min="0" step={value.type === 'percent' ? '0.5' : '0.01'}
              max={value.type === 'percent' ? 100 : undefined} value={value.value} onChange={(e) => set({ value: e.target.value })} placeholder="0" />
            {value.type === 'percent' && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>}
          </div>
        )}
      </div>
      {value.type && (
        <>
          <input className="input mt-2" value={value.reason} maxLength={200} onChange={(e) => set({ reason: e.target.value })}
            placeholder="Reason (shown on the quote), e.g. Loyalty discount" />
          <p className={'mt-1 text-xs ' + (tooBig ? 'text-red-600' : 'text-slate-400')}>
            {tooBig ? (value.type === 'percent' ? 'Up to 100%.' : 'More than the subtotal: it will be capped at ' + money(subtotal) + '.')
              : 'Taken off before VAT, shared across the lines by value.'}
          </p>
        </>
      )}
    </div>
  )
}
