import { useState } from 'react'
import { api, qs, money, shortDate } from '../api'
import {
  PageHeader, Card, Table, Badge, SearchInput, Select, Pagination, Field, Modal,
  Tabs, Banner, Loading, useFetch,
} from '../components/ui'

// Screen 14: Compliance Hub
// The three yellow "Project Compliance Hub" boxes on the workflow, in one place.
export function ComplianceHub() {
  const items = useFetch('/compliance' + qs({ limit: 100 }))
  const documents = useFetch('/documents' + qs({ limit: 50 }))
  const activities = useFetch('/activities' + qs({ type: 'compliance', limit: 6 }))

  if (items.loading) return <Loading />

  const all = items.data?.items || []
  const expiring = all.filter((item) => item.status !== 'Valid')

  return (
    <>
      <PageHeader title="Compliance Hub" subtitle="Certificates, registrations and calibrations that must stay in date" />

      <Banner>{items.error}</Banner>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Upcoming Expiry" bodyClass="divide-y divide-slate-100">
          {expiring.length === 0 && <p className="p-4 text-sm text-slate-400">Everything is currently in date.</p>}
          {expiring.map((item) => (
            <div key={item._id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm text-slate-800">{item.title}</p>
                <p className="text-xs text-slate-500">{item.category} &middot; {item.relatedTo}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">{shortDate(item.expiryDate)}</p>
                <Badge>{item.status}</Badge>
              </div>
            </div>
          ))}
        </Card>

        <Card title="Recent Compliance Notifications" bodyClass="divide-y divide-slate-100">
          {(activities.data?.items || []).length === 0 && <p className="p-4 text-sm text-slate-400">No compliance notifications yet.</p>}
          {(activities.data?.items || []).map((item) => (
            <div key={item._id} className="px-4 py-3">
              <p className="text-sm text-slate-700">{item.text}</p>
              <p className="text-xs text-slate-400 mt-0.5">{shortDate(item.createdAt)}</p>
            </div>
          ))}
        </Card>
      </div>

      <Card title="All Compliance Records" className="mt-4" bodyClass="">
        <Table
          columns={[
            { key: 'title', header: 'Record', render: (r) => <span className="font-medium text-slate-900">{r.title}</span> },
            { key: 'category', header: 'Category' },
            { key: 'reference', header: 'Reference' },
            { key: 'relatedTo', header: 'Related To' },
            { key: 'expiryDate', header: 'Expires', render: (r) => shortDate(r.expiryDate) },
            { key: 'status', header: 'Status', render: (r) => <Badge>{r.status}</Badge> },
          ]}
          rows={all}
          empty="No compliance records."
        />
      </Card>

      <Card title="Reference Documents" className="mt-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(documents.data?.items || []).map((doc) => (
            <div key={doc._id} className="border border-slate-200 rounded-md p-3">
              <div className="w-8 h-8 grid place-items-center rounded bg-brand-50 text-brand-600 mb-2">&#128196;</div>
              <p className="text-sm font-medium text-slate-800">{doc.title}</p>
              <p className="text-xs text-slate-500 mt-1">{doc.description}</p>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}

// Screen 15: Stock & Inventory
export function StockInventory() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [page, setPage] = useState(1)
  const [showAdd, setShowAdd] = useState(false)
  const [error, setError] = useState('')
  const { data, loading, reload } = useFetch('/stock' + qs({ q: search, category, page }))

  const adjust = async (item, delta) => {
    try {
      await api.put('/stock/' + item._id, { stock: Math.max(0, item.stock + delta) })
      reload()
    } catch (err) { setError(err.message) }
  }

  const columns = [
    { key: 'name', header: 'Item', render: (r) => <span className="font-medium text-slate-900">{r.name}</span> },
    { key: 'category', header: 'Category' },
    {
      key: 'stock', header: 'Stock',
      render: (r) => (
        <span className={r.stock <= r.reorderLevel ? 'text-red-600 font-medium' : ''}>
          {r.stock}{r.stock <= r.reorderLevel && ' (reorder)'}
        </span>
      ),
    },
    { key: 'unit', header: 'Unit' },
    { key: 'reorderLevel', header: 'Reorder Level' },
    { key: 'supplier', header: 'Supplier' },
    { key: 'unitCost', header: 'Unit Cost', render: (r) => money(r.unitCost) },
    {
      key: 'actions', header: 'Actions',
      render: (r) => (
        <div className="flex gap-1">
          <button className="btn-secondary px-2 py-0.5 text-xs" onClick={() => adjust(r, -1)}>-</button>
          <button className="btn-secondary px-2 py-0.5 text-xs" onClick={() => adjust(r, 1)}>+</button>
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader title="Stock & Inventory" subtitle="Parts held for jobs, ordered just in time from UK suppliers">
        <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Add Stock</button>
      </PageHeader>

      <Banner onDismiss={() => setError('')}>{error}</Banner>

      <Card bodyClass="">
        <div className="flex flex-wrap gap-2 p-4 border-b border-slate-200">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search items..." />
          <Select value={category} onChange={setCategory} options={['All', 'Chargers', 'Accessories', 'Electrical', 'Consumables']} />
        </div>
        {loading ? <Loading /> : (
          <>
            <Table columns={columns} rows={data?.items || []} empty="No stock items match that search." />
            <Pagination page={data?.page} pages={data?.pages} total={data?.total} onChange={setPage} />
          </>
        )}
      </Card>

      <AddStockModal open={showAdd} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); reload() }} />
    </>
  )
}

function AddStockModal({ open, onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', category: 'Electrical', stock: 0, unit: 'pcs', reorderLevel: 0, supplier: '', unitCost: 0 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.post('/stock', { ...form, stock: Number(form.stock), reorderLevel: Number(form.reorderLevel), unitCost: Number(form.unitCost) })
      onSaved()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} title="Add Stock Item" onClose={onClose}>
      <Banner onDismiss={() => setError('')}>{error}</Banner>
      <form onSubmit={save} className="space-y-4">
        <Field label="Item Name" required><input className="input" value={form.name} onChange={set('name')} required /></Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Category">
            <select className="input" value={form.category} onChange={set('category')}>
              <option>Chargers</option><option>Accessories</option><option>Electrical</option><option>Consumables</option>
            </select>
          </Field>
          <Field label="Supplier"><input className="input" value={form.supplier} onChange={set('supplier')} /></Field>
          <Field label="Stock"><input className="input" type="number" value={form.stock} onChange={set('stock')} /></Field>
          <Field label="Unit"><input className="input" value={form.unit} onChange={set('unit')} /></Field>
          <Field label="Reorder Level"><input className="input" type="number" value={form.reorderLevel} onChange={set('reorderLevel')} /></Field>
          <Field label="Unit Cost"><input className="input" type="number" step="0.01" value={form.unitCost} onChange={set('unitCost')} /></Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Add Item'}</button>
        </div>
      </form>
    </Modal>
  )
}

// Screen 16: Vans & Tools Management
export function VansTools() {
  const [tab, setTab] = useState('Vans')
  const vans = useFetch('/vans' + qs({ limit: 100 }))
  const tools = useFetch('/tools' + qs({ limit: 100 }))

  return (
    <>
      <PageHeader title="Vans & Tools" subtitle="What each engineer is driving and carrying" />

      <Tabs tabs={['Vans', 'Tools']} active={tab} onChange={setTab} />

      {tab === 'Vans' && (
        vans.loading ? <Loading /> : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {(vans.data?.items || []).map((van) => (
              <Card key={van._id}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-slate-900">{van.name} - {van.regNo}</p>
                    <p className="text-sm text-slate-500">{van.model}</p>
                  </div>
                  <span className="text-2xl">&#128667;</span>
                </div>
                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between"><dt className="text-slate-500">Engineer</dt><dd className="text-slate-800">{van.engineer?.name || 'Unassigned'}</dd></div>
                  <div className="flex justify-between items-center"><dt className="text-slate-500">Status</dt><dd><Badge>{van.status}</Badge></dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Mileage</dt><dd className="text-slate-800">{van.mileage?.toLocaleString('en-GB')}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">MOT Due</dt><dd className="text-slate-800">{shortDate(van.motDue)}</dd></div>
                </dl>
              </Card>
            ))}
          </div>
        )
      )}

      {tab === 'Tools' && (
        tools.loading ? <Loading /> : (
          <Card bodyClass="">
            <Table
              columns={[
                { key: 'name', header: 'Tool', render: (r) => <span className="font-medium text-slate-900">{r.name}</span> },
                { key: 'serialNo', header: 'Serial No.' },
                { key: 'van', header: 'Assigned Van', render: (r) => r.van ? r.van.name + ' (' + r.van.regNo + ')' : 'Store' },
                { key: 'lastCalibration', header: 'Last Calibration', render: (r) => shortDate(r.lastCalibration) },
                { key: 'calibrationDue', header: 'Calibration Due', render: (r) => shortDate(r.calibrationDue) },
                { key: 'status', header: 'Status', render: (r) => <Badge>{r.status}</Badge> },
              ]}
              rows={tools.data?.items || []}
              empty="No tools recorded."
            />
          </Card>
        )
      )}
    </>
  )
}

// Engineers directory -- the "Engineers" figures dotted around the workflow.
export function Engineers() {
  const { data, loading, error } = useFetch('/engineers' + qs({ limit: 100 }))

  if (loading) return <Loading />

  return (
    <>
      <PageHeader title="Engineers" subtitle="The people who carry out surveys, installs and repairs" />
      <Banner>{error}</Banner>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(data?.items || []).map((engineer) => (
          <Card key={engineer._id}>
            <div className="flex items-center gap-3 mb-3">
              <span className="grid place-items-center w-10 h-10 rounded-full bg-brand-50 text-brand-600 font-semibold">
                {engineer.name.split(' ').map((part) => part[0]).join('')}
              </span>
              <div>
                <p className="font-semibold text-slate-900">{engineer.name}</p>
                <p className="text-xs text-slate-500">{engineer.role}</p>
              </div>
              <span className="ml-auto"><Badge>{engineer.status}</Badge></span>
            </div>
            <p className="text-sm text-slate-600">{engineer.email}</p>
            <p className="text-sm text-slate-600">{engineer.phone}</p>
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Certifications</p>
              {(engineer.certifications || []).map((cert, index) => (
                <div key={index} className="flex justify-between text-sm py-0.5">
                  <span className="text-slate-700">{cert.name}</span>
                  <span className="text-slate-400 text-xs">{shortDate(cert.expiryDate)}</span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </>
  )
}

export function DocumentsPage() {
  const { data, loading } = useFetch('/documents' + qs({ limit: 100 }))
  if (loading) return <Loading />

  return (
    <>
      <PageHeader title="Documents" subtitle="Regulations, guidance and certification references" />
      <Card bodyClass="">
        <Table
          columns={[
            { key: 'title', header: 'Title', render: (r) => <span className="font-medium text-slate-900">{r.title}</span> },
            { key: 'category', header: 'Category' },
            { key: 'description', header: 'What it covers', render: (r) => <span className="whitespace-normal">{r.description}</span> },
          ]}
          rows={data?.items || []}
          empty="No documents stored."
        />
      </Card>
    </>
  )
}
