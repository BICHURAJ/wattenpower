import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, qs, money, shortDate, inputDate } from '../api'
import {
  PageHeader, Card, Table, Badge, SearchInput, Select, Pagination, Field,
  Tabs, Banner, Loading, useFetch,
} from '../components/ui'

const STATUSES = ['All', 'Draft', 'Sent', 'Accepted', 'Declined', 'Expired']

// Screen 6: Quotation List
export function QuotationsList() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('All')
  const [page, setPage] = useState(1)
  const navigate = useNavigate()
  const { data, loading, error } = useFetch('/quotations' + qs({ q: search, status, page }))

  const columns = [
    { key: 'quoteNo', header: 'Quote No.', render: (r) => <span className="font-medium text-slate-900">{r.quoteNo}</span> },
    { key: 'client', header: 'Client', render: (r) => r.client?.name || '--' },
    { key: 'site', header: 'Site' },
    { key: 'total', header: 'Amount', render: (r) => money(r.total) },
    { key: 'status', header: 'Status', render: (r) => <Badge>{r.status}</Badge> },
    { key: 'validUntil', header: 'Valid Until', render: (r) => shortDate(r.validUntil) },
    {
      key: 'actions', header: 'Actions',
      render: (r) => <Link to={'/quotations/' + r._id} className="text-brand-600 text-sm hover:underline" onClick={(e) => e.stopPropagation()}>View</Link>,
    },
  ]

  return (
    <>
      <PageHeader title="Quotations" subtitle="Prices sent to clients and where each one stands">
        <Link to="/quotations/new" className="btn-primary">+ New Quotation</Link>
      </PageHeader>

      <Banner>{error}</Banner>

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
  const navigate = useNavigate()
  const clients = useFetch('/clients' + qs({ limit: 200 }))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    client: '', site: '', quoteDate: inputDate(new Date()), validUntil: '', reference: '',
    financeOption: 'Pay in Full', notes: '',
  })
  const [items, setItems] = useState([{ description: 'EV Charger Installation', qty: 1, unitPrice: 1000, vat: 20 }])

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const updateItem = (index, key, value) => {
    const next = [...items]
    next[index] = { ...next[index], [key]: key === 'description' ? value : Number(value) }
    setItems(next)
  }

  // Totals are shown live here and recalculated again on the server on save,
  // so what the client sees and what gets stored can never drift apart.
  const subtotal = items.reduce((sum, i) => sum + (i.qty || 0) * (i.unitPrice || 0), 0)
  const vatTotal = items.reduce((sum, i) => sum + (i.qty || 0) * (i.unitPrice || 0) * ((i.vat || 0) / 100), 0)

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

  return (
    <>
      <PageHeader title="New Quotation" subtitle="Quotations > New Quotation">
        <Link to="/quotations" className="btn-secondary">Cancel</Link>
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
          <div className="mt-4">
            <Field label="Payment / Finance">
              <select className="input sm:w-1/3" value={form.financeOption} onChange={set('financeOption')}>
                <option>Pay in Full</option>
                <option>Finance Plan</option>
                <option>OLEV Grant Funded</option>
                <option>None</option>
              </select>
            </Field>
          </div>
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
                  <th className="py-2 pl-2 w-28 text-right">Total</th>
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
                    <td className="py-1.5 pl-2 text-right text-slate-700">{money((item.qty || 0) * (item.unitPrice || 0))}</td>
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
                <dt>Total</dt><dd>{money(subtotal + vatTotal)}</dd>
              </div>
            </dl>
          </div>
        </Card>

        <div className="flex justify-end gap-2 pb-6">
          <Link to="/quotations" className="btn-secondary">Cancel</Link>
          <button className="btn-secondary" disabled={busy} onClick={() => save('Draft')}>Save as Draft</button>
          <button className="btn-primary" disabled={busy} onClick={() => save('Sent')}>{busy ? 'Saving...' : 'Send Quotation'}</button>
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
  const [notice, setNotice] = useState('')
  const { data: quote, loading, reload } = useFetch('/quotations/' + id)

  if (loading) return <Loading />
  if (!quote) return <Banner>Quotation not found.</Banner>

  const act = async (action) => {
    try {
      const result = await api.post('/quotations/' + id + '/' + action)
      if (action === 'accept' && result.installation) {
        setNotice('Quotation accepted. Installation ' + result.installation.installNo + ' has been created and scheduled.')
      }
      reload()
    } catch (err) { setError(err.message) }
  }

  return (
    <>
      <PageHeader title={'Quotation ' + quote.quoteNo} subtitle={quote.client?.name}>
        <Link to="/quotations" className="btn-secondary">Back</Link>
        {quote.status === 'Draft' && <button className="btn-primary" onClick={() => act('send')}>Send Quotation</button>}
        {quote.status === 'Sent' && (
          <>
            <button className="btn-secondary" onClick={() => act('decline')}>Mark Declined</button>
            <button className="btn-primary" onClick={() => act('accept')}>Mark Accepted</button>
          </>
        )}
      </PageHeader>

      <Banner onDismiss={() => setError('')}>{error}</Banner>
      {notice && (
        <Banner kind="success" onDismiss={() => setNotice('')}>
          {notice} <button className="underline" onClick={() => navigate('/installations')}>View installations</button>
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
                    <th className="py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {quote.items.map((item) => (
                    <tr key={item._id}>
                      <td className="py-2 text-slate-700">{item.description}</td>
                      <td className="py-2 px-2">{item.qty}</td>
                      <td className="py-2 px-2">{money(item.unitPrice)}</td>
                      <td className="py-2 px-2">{item.vat}%</td>
                      <td className="py-2 text-right">{money(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 pt-3 border-t border-slate-200 flex justify-end">
                <dl className="w-64 space-y-1.5 text-sm">
                  <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd>{money(quote.subtotal)}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">VAT</dt><dd>{money(quote.vatTotal)}</dd></div>
                  <div className="flex justify-between pt-1.5 border-t border-slate-200 font-semibold text-slate-900">
                    <dt>Total</dt><dd>{money(quote.total)}</dd>
                  </div>
                </dl>
              </div>
            </>
          )}

          {tab === 'Notes' && <p className="text-sm text-slate-600 py-4">{quote.notes || 'No notes on this quotation.'}</p>}

          {tab === 'Documents' && (
            <p className="text-sm text-slate-400 py-6 text-center">
              A PDF of this quotation would be generated and attached here.
            </p>
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
