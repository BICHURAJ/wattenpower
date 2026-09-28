import { useState } from 'react'
import { api, qs, money, shortDate, inputDate } from '../api'
import { useAuth } from '../auth'
import { WEEK_DAYS, defaultWeek, scheduleOf, nextTimeOff, availabilityToday, hoursLabel, weekdayIndex } from '../availability'
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
  const { can } = useAuth()

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
        can('stock', 'update') ? (
          <div className="flex gap-1">
            <button className="btn-secondary px-2 py-0.5 text-xs" onClick={() => adjust(r, -1)}>-</button>
            <button className="btn-secondary px-2 py-0.5 text-xs" onClick={() => adjust(r, 1)}>+</button>
          </div>
        ) : null
      ),
    },
  ]

  return (
    <>
      <PageHeader title="Stock & Inventory" subtitle="Parts held for jobs, ordered just in time from UK suppliers">
        {can('stock', 'create') && <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Add Stock</button>}
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
const DAY_MS = 24 * 60 * 60 * 1000
const DUE_SOON_DAYS = 30

/** How close a renewal date is: { tone, text } for the MOT and insurance badges. */
function renewalState(date) {
  if (!date) return { tone: 'slate', text: 'Not recorded' }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.round((new Date(date).setHours(0, 0, 0, 0) - today) / DAY_MS)
  if (days < 0) return { tone: 'red', text: 'Expired ' + -days + (days === -1 ? ' day' : ' days') + ' ago' }
  if (days === 0) return { tone: 'red', text: 'Due today' }
  if (days <= DUE_SOON_DAYS) return { tone: 'amber', text: 'Due in ' + days + (days === 1 ? ' day' : ' days') }
  return { tone: 'green', text: 'Valid' }
}

/** The MOT or insurance block on a van card. */
function RenewalSection({ title, date, dateLabel, rows }) {
  const state = renewalState(date)
  return (
    <section className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
        <Badge tone={state.tone}>{state.text}</Badge>
      </div>
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-slate-500">{dateLabel}</dt><dd className="text-slate-800">{date ? shortDate(date) : '--'}</dd></div>
        {rows.filter(([, value]) => value).map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3"><dt className="text-slate-500">{label}</dt><dd className="text-slate-800 text-right break-all">{value}</dd></div>
        ))}
      </dl>
    </section>
  )
}

const vanLabel = (van) => [van.name, van.regNo].filter(Boolean).join(' - ')

/** Calibration due date as a badge: the date while it's fine, a warning when due or overdue. */
function CalibrationBadge({ date }) {
  const state = renewalState(date)
  if (!date) return <span className="text-slate-400">--</span>
  return <Badge tone={state.tone}>{state.tone === 'green' ? shortDate(date) : state.text}</Badge>
}

/** The "Tools" block on a van card. Leave out an action to hide its control. */
function VanToolsSection({ tools, onAdd, onEdit, onReturn }) {
  return (
    <section className="mt-2 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tools ({tools.length})</h3>
        {onAdd && <button type="button" className="text-xs font-medium text-brand-600 hover:underline" onClick={onAdd}>+ Add tool</button>}
      </div>
      {tools.length === 0
        ? <p className="text-xs text-slate-400">No tools on this van.</p>
        : (
          <ul className="divide-y divide-slate-100">
            {tools.map((tool) => (
              <li key={tool._id} className="flex items-center justify-between gap-2 py-1.5">
                <button type="button" className="min-w-0 text-left disabled:cursor-default" onClick={() => onEdit?.(tool)} disabled={!onEdit} title={onEdit ? 'Edit tool' : undefined}>
                  <p className={'text-sm text-slate-800 truncate ' + (onEdit ? 'hover:text-brand-600' : '')}>{tool.name}</p>
                  {tool.serialNo && <p className="text-[11px] text-slate-400">{tool.serialNo}</p>}
                </button>
                <span className="flex items-center gap-2 shrink-0">
                  <CalibrationBadge date={tool.calibrationDue} />
                  {onReturn && (
                    <button
                      type="button"
                      className="text-slate-300 hover:text-red-500 text-base leading-none"
                      title="Take off this van (back to the store)"
                      onClick={() => onReturn(tool)}
                    >
                      &times;
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
    </section>
  )
}

/** Put a tool on a van: pick one from the store (or another van), or add a new one. */
function AddToolToVanModal({ van, tools, onAssign, onNew, onClose }) {
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState(null)
  const term = search.trim().toLowerCase()
  const candidates = tools
    .filter((t) => (t.van?._id || t.van) !== van._id)
    .filter((t) => !term || [t.name, t.serialNo].some((v) => (v || '').toLowerCase().includes(term)))
    // Store tools first, then ones on other vans.
    .sort((a, b) => Number(Boolean(a.van)) - Number(Boolean(b.van)) || a.name.localeCompare(b.name))

  const assign = async (tool) => {
    setBusyId(tool._id)
    try { await onAssign(tool) } finally { setBusyId(null) }
  }

  return (
    <Modal open title={'Add tool to ' + vanLabel(van)} onClose={onClose}>
      <div className="space-y-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search tools..." />
        <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-100">
          {candidates.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-400">No other tools to add.</li>}
          {candidates.map((tool) => (
            <li key={tool._id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm text-slate-800 truncate">{tool.name}</p>
                <p className="text-[11px] text-slate-400">
                  {[tool.serialNo, tool.van ? 'On ' + vanLabel(tool.van) : 'In store'].filter(Boolean).join(' · ')}
                </p>
              </div>
              <button type="button" className="btn-secondary px-2.5 py-1 text-xs shrink-0" disabled={busyId === tool._id} onClick={() => assign(tool)}>
                {busyId === tool._id ? 'Adding...' : tool.van ? 'Move here' : 'Add'}
              </button>
            </li>
          ))}
        </ul>
        <div className="flex justify-between gap-2 pt-1">
          {onNew ? <button type="button" className="btn-secondary" onClick={onNew}>+ New tool</button> : <span />}
          <button type="button" className="btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  )
}

const TOOL_STATUSES = ['In Service', 'Calibration Due', 'Out of Service']

/** Add or edit a tool, including which van it's on. */
function ToolModal({ tool, presetVan, vans, onClose, onSaved }) {
  const { can } = useAuth()
  const isNew = !tool._id
  const [form, setForm] = useState(() => ({
    name: tool.name || '',
    serialNo: tool.serialNo || '',
    van: presetVan?._id || presetVan || '',
    lastCalibration: inputDate(tool.lastCalibration),
    calibrationDue: inputDate(tool.calibrationDue),
    status: tool.status || 'In Service',
  }))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const body = {
        ...form,
        van: form.van || null,
        lastCalibration: form.lastCalibration || null,
        calibrationDue: form.calibrationDue || null,
      }
      if (isNew) await api.post('/tools', body)
      else await api.put('/tools/' + tool._id, body)
      onSaved()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const remove = async () => {
    if (!window.confirm('Delete ' + tool.name + '? This cannot be undone.')) return
    setBusy(true)
    try {
      await api.del('/tools/' + tool._id)
      onSaved()
    } catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <Modal open title={isNew ? 'Add Tool' : 'Edit ' + tool.name} onClose={onClose}>
      <Banner onDismiss={() => setError('')}>{error}</Banner>
      <form onSubmit={save} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Tool" required><input className="input" value={form.name} onChange={set('name')} placeholder="e.g. Megger MFT1741 Tester" required autoFocus /></Field>
          <Field label="Serial No."><input className="input" value={form.serialNo} onChange={set('serialNo')} /></Field>
          <Field label="Van">
            <select className="input" value={form.van} onChange={set('van')}>
              <option value="">Store (not on a van)</option>
              {vans.map((v) => <option key={v._id} value={v._id}>{vanLabel(v)}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className="input" value={form.status} onChange={set('status')}>
              {TOOL_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Last Calibration"><input className="input" type="date" value={form.lastCalibration} onChange={set('lastCalibration')} /></Field>
          <Field label="Calibration Due"><input className="input" type="date" value={form.calibrationDue} onChange={set('calibrationDue')} /></Field>
        </div>
        <div className="flex items-center justify-between gap-2 pt-2">
          {!isNew && can('tools', 'delete')
            ? <button type="button" className="text-sm text-red-600 hover:underline disabled:opacity-50" onClick={remove} disabled={busy}>Delete tool</button>
            : <span />}
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" disabled={busy}>{busy ? 'Saving...' : isNew ? 'Add Tool' : 'Save Changes'}</button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

export function VansTools() {
  const [tab, setTab] = useState('Vans')
  const vans = useFetch('/vans' + qs({ limit: 100 }))
  const tools = useFetch('/tools' + qs({ limit: 200 }))
  const [editingVan, setEditingVan] = useState(null) // null = closed, {} = new, van = edit
  const [editingTool, setEditingTool] = useState(null) // null = closed, { tool, van } = open
  const [addingToVan, setAddingToVan] = useState(null) // van whose "add tool" picker is open
  const [toolError, setToolError] = useState('')
  const { can } = useAuth()
  const canEditTools = can('tools', 'update')

  const vanList = vans.data?.items || []
  const toolList = tools.data?.items || []
  const toolsOnVan = (van) => toolList.filter((t) => (t.van?._id || t.van) === van._id)
  const reloadAll = () => { vans.reload(); tools.reload() }

  // Move a tool onto a van, or back to the store (van = null).
  const assignTool = async (tool, van) => {
    setToolError('')
    try {
      await api.put('/tools/' + tool._id, { van: van?._id || null })
      tools.reload()
    } catch (err) { setToolError(err.message) }
  }
  // Vans needing attention: MOT or insurance expired or due within 30 days.
  const attention = vanList.filter((v) => ['red', 'amber'].includes(renewalState(v.motDue).tone) || ['red', 'amber'].includes(renewalState(v.insuranceExpiry).tone)).length

  return (
    <>
      <PageHeader title="Vans & Tools" subtitle="What each engineer is driving and carrying">
        {tab === 'Vans' && can('vans', 'create') && <button className="btn-primary" onClick={() => setEditingVan({})}>+ Add Van</button>}
      </PageHeader>

      <Tabs tabs={['Vans', 'Tools']} active={tab} onChange={setTab} />

      {tab === 'Vans' && (
        vans.loading ? <Loading /> : (
          <>
            {attention > 0 && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {attention} {attention === 1 ? 'van has' : 'vans have'} an MOT or insurance expired or due within {DUE_SOON_DAYS} days.
              </div>
            )}
            {vanList.length === 0 && <p className="py-12 text-center text-sm text-slate-400">No vans yet. Add one to record its MOT and insurance.</p>}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {vanList.map((van) => (
                <Card key={van._id}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{[van.name, van.regNo].filter(Boolean).join(' - ')}</p>
                      <p className="text-sm text-slate-500">{van.model || '--'}</p>
                    </div>
                    {can('vans', 'update') && <button className="btn-secondary px-2.5 py-1 text-xs shrink-0" onClick={() => setEditingVan(van)}>Edit</button>}
                  </div>
                  <dl className="space-y-1.5 text-sm mb-3">
                    <div className="flex justify-between"><dt className="text-slate-500">Engineer</dt><dd className="text-slate-800">{van.engineer?.name || 'Unassigned'}</dd></div>
                    <div className="flex justify-between items-center"><dt className="text-slate-500">Status</dt><dd><Badge>{van.status}</Badge></dd></div>
                    <div className="flex justify-between"><dt className="text-slate-500">Mileage</dt><dd className="text-slate-800">{(van.mileage || 0).toLocaleString('en-GB')}</dd></div>
                  </dl>
                  <div className="space-y-2">
                    <RenewalSection title="MOT" date={van.motDue} dateLabel="Due" rows={[['Certificate', van.motCertificateNo]]} />
                    <RenewalSection
                      title="Insurance"
                      date={van.insuranceExpiry}
                      dateLabel="Expires"
                      rows={[['Insurer', van.insurer], ['Policy No.', van.insurancePolicyNo], ['Cover', van.insuranceType]]}
                    />
                  </div>
                  <VanToolsSection
                    tools={toolsOnVan(van)}
                    onAdd={canEditTools ? () => setAddingToVan(van) : undefined}
                    onEdit={canEditTools ? (tool) => setEditingTool({ tool, van }) : undefined}
                    onReturn={canEditTools ? (tool) => assignTool(tool, null) : undefined}
                  />
                  {van.notes && <p className="mt-3 text-xs text-slate-500 whitespace-pre-line">{van.notes}</p>}
                </Card>
              ))}
            </div>
          </>
        )
      )}

      {editingVan && (
        <VanModal
          van={editingVan}
          onClose={() => setEditingVan(null)}
          onSaved={() => { setEditingVan(null); vans.reload(); tools.reload() }}
        />
      )}

      {addingToVan && (
        <AddToolToVanModal
          van={addingToVan}
          tools={toolList}
          onAssign={async (tool) => { await assignTool(tool, addingToVan); setAddingToVan(null) }}
          onNew={can('tools', 'create') ? () => { setEditingTool({ tool: {}, van: addingToVan }); setAddingToVan(null) } : undefined}
          onClose={() => setAddingToVan(null)}
        />
      )}

      {editingTool && (
        <ToolModal
          tool={editingTool.tool}
          presetVan={editingTool.van}
          vans={vanList}
          onClose={() => setEditingTool(null)}
          onSaved={() => { setEditingTool(null); reloadAll() }}
        />
      )}

      <Banner onDismiss={() => setToolError('')}>{toolError}</Banner>

      {tab === 'Tools' && (
        tools.loading ? <Loading /> : (
          <>
            {can('tools', 'create') && (
              <div className="flex justify-end mb-3">
                <button className="btn-primary" onClick={() => setEditingTool({ tool: {}, van: null })}>+ Add Tool</button>
              </div>
            )}
            <Card bodyClass="">
              <Table
                columns={[
                  { key: 'name', header: 'Tool', render: (r) => <span className="font-medium text-slate-900">{r.name}</span> },
                  { key: 'serialNo', header: 'Serial No.' },
                  { key: 'van', header: 'Assigned Van', render: (r) => r.van ? vanLabel(r.van) : 'Store' },
                  { key: 'lastCalibration', header: 'Last Calibration', render: (r) => shortDate(r.lastCalibration) },
                  { key: 'calibrationDue', header: 'Calibration Due', render: (r) => <CalibrationBadge date={r.calibrationDue} /> },
                  { key: 'status', header: 'Status', render: (r) => <Badge>{r.status}</Badge> },
                ]}
                rows={toolList}
                onRowClick={canEditTools ? (r) => setEditingTool({ tool: r, van: r.van || null }) : undefined}
                empty="No tools recorded."
              />
            </Card>
          </>
        )
      )}
    </>
  )
}

const VAN_STATUSES = ['On Road', 'In Service', 'Off Road']
const INSURANCE_TYPES = ['Comprehensive', 'Third Party, Fire & Theft', 'Third Party Only', 'Fleet Policy']

const vanForm = (van) => ({
  name: van.name || '',
  regNo: van.regNo || '',
  model: van.model || '',
  engineer: van.engineer?._id || van.engineer || '',
  status: van.status || 'On Road',
  mileage: van.mileage ?? '',
  motDue: inputDate(van.motDue),
  motCertificateNo: van.motCertificateNo || '',
  insurer: van.insurer || '',
  insurancePolicyNo: van.insurancePolicyNo || '',
  insuranceType: van.insuranceType || '',
  insuranceExpiry: inputDate(van.insuranceExpiry),
  notes: van.notes || '',
})

/** Add or edit a van: details, MOT and insurance. */
function VanModal({ van, onClose, onSaved }) {
  const { can } = useAuth()
  const isNew = !van._id
  const engineers = useFetch('/engineers' + qs({ limit: 200 }))
  const [form, setForm] = useState(() => vanForm(van))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const body = {
        ...form,
        regNo: form.regNo.trim().toUpperCase(),
        mileage: Number(form.mileage) || 0,
        // null (not a missing key) so clearing a field on edit sticks.
        engineer: form.engineer || null,
        motDue: form.motDue || null,
        insuranceExpiry: form.insuranceExpiry || null,
      }
      if (isNew) await api.post('/vans', body)
      else await api.put('/vans/' + van._id, body)
      onSaved()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const remove = async () => {
    if (!window.confirm('Delete ' + [van.name, van.regNo].filter(Boolean).join(' - ') + '?\n\nAny tools on it go back to the store.')) return
    setBusy(true)
    try {
      await api.del('/vans/' + van._id)
      onSaved()
    } catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <Modal open title={isNew ? 'Add Van' : 'Edit ' + [van.name, van.regNo].filter(Boolean).join(' - ')} onClose={onClose} width="max-w-2xl">
      <Banner onDismiss={() => setError('')}>{error}</Banner>
      <form onSubmit={save} className="space-y-6">
        <section>
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Van details</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Registration" required>
              <input className="input uppercase" value={form.regNo} onChange={set('regNo')} placeholder="e.g. WP24 ABC" required autoFocus />
            </Field>
            <Field label="Name"><input className="input" value={form.name} onChange={set('name')} placeholder="e.g. Van 4" /></Field>
            <Field label="Make & Model"><input className="input" value={form.model} onChange={set('model')} placeholder="e.g. Ford Transit Custom" /></Field>
            <Field label="Engineer">
              <select className="input" value={form.engineer} onChange={set('engineer')}>
                <option value="">Unassigned</option>
                {(engineers.data?.items || []).map((en) => <option key={en._id} value={en._id}>{en.name}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select className="input" value={form.status} onChange={set('status')}>
                {VAN_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Mileage"><input className="input" type="number" min="0" value={form.mileage} onChange={set('mileage')} /></Field>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-slate-800 mb-3">MOT</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="MOT Due"><input className="input" type="date" value={form.motDue} onChange={set('motDue')} /></Field>
            <Field label="MOT Test Certificate No."><input className="input" value={form.motCertificateNo} onChange={set('motCertificateNo')} /></Field>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Insurance</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Insurer"><input className="input" value={form.insurer} onChange={set('insurer')} placeholder="e.g. Aviva" /></Field>
            <Field label="Policy No."><input className="input" value={form.insurancePolicyNo} onChange={set('insurancePolicyNo')} /></Field>
            <Field label="Cover">
              <select className="input" value={form.insuranceType} onChange={set('insuranceType')}>
                <option value="">Not recorded</option>
                {INSURANCE_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Expiry Date"><input className="input" type="date" value={form.insuranceExpiry} onChange={set('insuranceExpiry')} /></Field>
          </div>
        </section>

        <Field label="Notes"><textarea className="input min-h-[70px]" value={form.notes} onChange={set('notes')} /></Field>

        <div className="flex items-center justify-between gap-2 pt-2">
          {!isNew && can('vans', 'delete')
            ? <button type="button" className="text-sm text-red-600 hover:underline disabled:opacity-50" onClick={remove} disabled={busy}>Delete van</button>
            : <span />}
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" disabled={busy}>{busy ? 'Saving...' : isNew ? 'Add Van' : 'Save Changes'}</button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

// Engineers directory -- the "Engineers" figures dotted around the workflow.
const ENGINEER_ROLES =['Installation Engineer', 'Senior Engineer', 'Surveyor', 'Apprentice', 'Electrician']

// Screen: Engineers -- who we have, and when they can be booked.
export function Engineers() {
  const { data, loading, error, reload } = useFetch('/engineers' + qs({ limit: 100 }))
  const { can } = useAuth()
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null) // null = closed, {} = new, engineer = edit

  if (loading) return <Loading />

  const all = data?.items || []
  const term = search.trim().toLowerCase()
  const shown = all
    .filter((e) => filter === 'All' || (filter === 'Working today') === availabilityToday(e).working)
    .filter((e) => !term || [e.name, e.email, e.role, e.coverageArea].some((v) => (v || '').toLowerCase().includes(term)))
  const todayIndex = weekdayIndex()

  return (
    <>
      <PageHeader title="Engineers" subtitle="The people who carry out surveys, installs and repairs, and when they're free">
        {can('engineers', 'create') && <button className="btn-primary" onClick={() => setEditing({})}>+ Add Engineer</button>}
      </PageHeader>
      <Banner>{error}</Banner>

      <div className="flex flex-wrap items-start gap-3">
        <Tabs tabs={['All', 'Working today', 'Off today']} active={filter} onChange={setFilter} />
        <div className="flex-1 min-w-[220px] max-w-sm">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, role, area..." />
        </div>
      </div>

      {shown.length === 0 && (
        <Card><p className="py-8 text-center text-sm text-slate-400">{all.length ? 'No engineers match this filter.' : 'No engineers yet. Add your first one.'}</p></Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((engineer) => {
          const today = availabilityToday(engineer)
          const schedule = scheduleOf(engineer)
          const upcoming = nextTimeOff(engineer)
          return (
            // Full-height column so the Edit button sits at the bottom of every card in a row.
            <Card key={engineer._id} className="h-full flex flex-col" bodyClass="p-5 flex flex-1 flex-col">
              <div className="flex items-center gap-3 mb-4">
                <span className="grid place-items-center w-10 h-10 rounded-full bg-brand-50 text-brand-600 font-semibold text-sm">
                  {engineer.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{engineer.name}</p>
                  <p className="text-xs text-slate-400 truncate">{engineer.role}{engineer.coverageArea ? ' · ' + engineer.coverageArea : ''}</p>
                </div>
                <span className="ml-auto"><Badge>{engineer.status}</Badge></span>
              </div>

              {/* Availability */}
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <Badge tone={today.tone}>{today.label}</Badge>
                  <span className="text-[11px] text-slate-400 whitespace-nowrap">{hoursLabel(schedule)}h / week</span>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {schedule.map((d, i) => (
                    <div
                      key={d.day}
                      title={d.working ? d.day + ' ' + d.start + '–' + d.end : d.day + ': off'}
                      className={'text-center rounded-lg py-1.5 ' +
                        (d.working ? 'bg-brand-500 text-white' : 'bg-white text-slate-300 border border-slate-100') +
                        (i === todayIndex ? ' ring-2 ring-offset-1 ring-brand-300' : '')}
                    >
                      <p className="text-[10px] font-semibold">{d.day.slice(0, 2)}</p>
                      <p className={'text-[9px] ' + (d.working ? 'text-white/80' : '')}>{d.working ? d.start : 'off'}</p>
                    </div>
                  ))}
                </div>
                {upcoming && (
                  <p className="mt-2.5 text-xs text-slate-500">
                    Next time off: <span className="font-medium text-slate-700">{upcoming.reason}</span> · {shortDate(upcoming.from)} – {shortDate(upcoming.to)}
                  </p>
                )}
              </div>

              <div className="mt-3 space-y-0.5">
                {engineer.email && <p className="text-sm text-slate-600 truncate">{engineer.email}</p>}
                {engineer.phone && <p className="text-sm text-slate-600">{engineer.phone}</p>}
              </div>

              {(engineer.certifications || []).length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1.5">Certifications</p>
                  {engineer.certifications.map((cert, index) => (
                    <div key={index} className="flex justify-between gap-2 text-sm py-0.5">
                      <span className="text-slate-700 truncate">{cert.name}</span>
                      <span className="text-slate-400 text-xs whitespace-nowrap">{shortDate(cert.expiryDate)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-auto pt-4">
                {can('engineers', 'update') && <button className="btn-secondary w-full justify-center px-3 py-2 text-xs" onClick={() => setEditing(engineer)}>Edit details &amp; availability</button>}
              </div>
            </Card>
          )
        })}
      </div>

      {editing && (
        <EngineerModal
          engineer={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload() }}
        />
      )}
    </>
  )
}

const emptyEngineer = () => ({
  name: '', email: '', phone: '', role: 'Installation Engineer', status: 'Available', coverageArea: '',
  weeklySchedule: defaultWeek(), timeOff: [], certifications: [],
})

function EngineerModal({ engineer, onClose, onSaved }) {
  const isNew = !engineer._id
  const [form, setForm] = useState(() => (isNew ? emptyEngineer() : {
    ...emptyEngineer(),
    ...engineer,
    weeklySchedule: scheduleOf(engineer),
    timeOff: (engineer.timeOff || []).map((t) => ({ ...t, from: inputDate(t.from), to: inputDate(t.to) })),
    certifications: (engineer.certifications || []).map((c) => ({ ...c, expiryDate: inputDate(c.expiryDate) })),
  }))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })
  const setDay = (index, patch) => setForm({ ...form, weeklySchedule: form.weeklySchedule.map((d, i) => (i === index ? { ...d, ...patch } : d)) })
  const setRow = (list, index, patch) => setForm({ ...form, [list]: form[list].map((row, i) => (i === index ? { ...row, ...patch } : row)) })
  const removeRow = (list, index) => setForm({ ...form, [list]: form[list].filter((_, i) => i !== index) })
  const applyPreset = (workingDays) => setForm({
    ...form,
    weeklySchedule: WEEK_DAYS.map((day, i) => ({ day, working: i < workingDays, start: '08:00', end: '17:00' })),
  })

  const save = async (e) => {
    e.preventDefault()
    const badDay = form.weeklySchedule.find((d) => d.working && (!d.start || !d.end || d.end <= d.start))
    if (badDay) return setError(badDay.day + ': finish time must be after the start time.')
    const badOff = form.timeOff.find((t) => !t.from || !t.to || t.to < t.from)
    if (badOff) return setError('Each time-off period needs a start date and an end date on or after it.')

    setBusy(true)
    setError('')
    try {
      const body = {
        ...form,
        certifications: form.certifications.filter((c) => c.name?.trim()).map((c) => ({ ...c, expiryDate: c.expiryDate || undefined })),
      }
      if (isNew) await api.post('/engineers', body)
      else await api.put('/engineers/' + engineer._id, body)
      onSaved()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const remove = async () => {
    if (!window.confirm('Remove ' + engineer.name + ' from the engineer list?')) return
    setBusy(true)
    try {
      await api.del('/engineers/' + engineer._id)
      onSaved()
    } catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <Modal open title={isNew ? 'Add Engineer' : 'Edit ' + engineer.name} onClose={onClose} width="max-w-2xl">
      <Banner onDismiss={() => setError('')}>{error}</Banner>
      <form onSubmit={save} className="space-y-6">
        {/* Details */}
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Full Name" required><input className="input" value={form.name} onChange={set('name')} required autoFocus /></Field>
          <Field label="Role">
            <input className="input" list="engineer-roles" value={form.role} onChange={set('role')} />
            <datalist id="engineer-roles">{ENGINEER_ROLES.map((r) => <option key={r} value={r} />)}</datalist>
          </Field>
          <Field label="Email"><input className="input" type="email" value={form.email || ''} onChange={set('email')} /></Field>
          <Field label="Phone"><input className="input" value={form.phone || ''} onChange={set('phone')} /></Field>
          <Field label="Coverage Area"><input className="input" value={form.coverageArea || ''} onChange={set('coverageArea')} placeholder="e.g. London & South East" /></Field>
          <Field label="Current Status"><Select className="w-full" value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={['Available', 'On Job', 'Off Duty']} /></Field>
        </div>

        {/* Weekly availability */}
        <section>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Weekly availability</h3>
              <p className="text-xs text-slate-400">{hoursLabel(form.weeklySchedule)} hours per week</p>
            </div>
            <div className="flex gap-1">
              <button type="button" className="btn-ghost px-2.5 py-1 text-xs" onClick={() => applyPreset(5)}>Mon–Fri</button>
              <button type="button" className="btn-ghost px-2.5 py-1 text-xs" onClick={() => applyPreset(6)}>Mon–Sat</button>
              <button type="button" className="btn-ghost px-2.5 py-1 text-xs" onClick={() => applyPreset(7)}>Every day</button>
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 divide-y divide-slate-100">
            {form.weeklySchedule.map((d, i) => (
              <div key={d.day} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <label className="flex items-center gap-2.5 w-24 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-brand-500" checked={d.working} onChange={(e) => setDay(i, { working: e.target.checked })} />
                  <span className={'text-sm font-medium ' + (d.working ? 'text-slate-800' : 'text-slate-400')}>{d.day}</span>
                </label>
                {d.working ? (
                  <div className="flex items-center gap-2">
                    <input type="time" className="input w-32 py-1.5" value={d.start} onChange={(e) => setDay(i, { start: e.target.value })} required />
                    <span className="text-slate-400 text-sm">to</span>
                    <input type="time" className="input w-32 py-1.5" value={d.end} onChange={(e) => setDay(i, { end: e.target.value })} required />
                  </div>
                ) : (
                  <span className="text-sm text-slate-400">Not working</span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Time off */}
        <section>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Time off</h3>
              <p className="text-xs text-slate-400">Holidays, training or sickness. These dates show as unavailable.</p>
            </div>
            <button type="button" className="btn-secondary px-3 py-1 text-xs"
              onClick={() => setForm({ ...form, timeOff: [...form.timeOff, { from: '', to: '', reason: 'Holiday' }] })}>+ Add</button>
          </div>
          {form.timeOff.length === 0 && <p className="text-sm text-slate-400 px-1">No time off booked.</p>}
          <div className="space-y-2">
            {form.timeOff.map((t, i) => (
              <div key={t._id || i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                <input type="date" className="input py-1.5" value={t.from} title="From"
                  onChange={(e) => setRow('timeOff', i, { from: e.target.value, to: t.to && t.to >= e.target.value ? t.to : e.target.value })} required />
                <input type="date" className="input py-1.5" value={t.to} min={t.from} title="To" onChange={(e) => setRow('timeOff', i, { to: e.target.value })} required />
                <input className="input py-1.5" list="time-off-reasons" value={t.reason} onChange={(e) => setRow('timeOff', i, { reason: e.target.value })} placeholder="Reason" />
                <button type="button" className="btn-ghost px-2 py-1" title="Remove" onClick={() => removeRow('timeOff', i)}>&times;</button>
              </div>
            ))}
            <datalist id="time-off-reasons">{['Holiday', 'Training course', 'Sickness', 'Personal'].map((r) => <option key={r} value={r} />)}</datalist>
          </div>
        </section>

        {/* Certifications */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-800">Certifications</h3>
            <button type="button" className="btn-secondary px-3 py-1 text-xs"
              onClick={() => setForm({ ...form, certifications: [...form.certifications, { name: '', body: '', number: '', expiryDate: '' }] })}>+ Add</button>
          </div>
          {form.certifications.length === 0 && <p className="text-sm text-slate-400 px-1">None recorded.</p>}
          <div className="space-y-2">
            {form.certifications.map((c, i) => (
              <div key={c._id || i} className="grid grid-cols-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 items-center">
                <input className="input py-1.5" value={c.name || ''} onChange={(e) => setRow('certifications', i, { name: e.target.value })} placeholder="Certification" />
                <input className="input py-1.5" value={c.body || ''} onChange={(e) => setRow('certifications', i, { body: e.target.value })} placeholder="Body" />
                <input className="input py-1.5" value={c.number || ''} onChange={(e) => setRow('certifications', i, { number: e.target.value })} placeholder="Number" />
                <input type="date" className="input py-1.5" value={c.expiryDate || ''} onChange={(e) => setRow('certifications', i, { expiryDate: e.target.value })} title="Expiry date" />
                <button type="button" className="btn-ghost px-2 py-1" title="Remove" onClick={() => removeRow('certifications', i)}>&times;</button>
              </div>
            ))}
          </div>
        </section>

        <div className="flex items-center gap-2 pt-4 border-t border-slate-100">
          {!isNew && <button type="button" className="btn-ghost text-red-600 hover:bg-red-50" onClick={remove} disabled={busy}>Remove</button>}
          <div className="ml-auto flex gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" disabled={busy}>{busy ? 'Saving...' : isNew ? 'Add Engineer' : 'Save Changes'}</button>
          </div>
        </div>
      </form>
    </Modal>
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
