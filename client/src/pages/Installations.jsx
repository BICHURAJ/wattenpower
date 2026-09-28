import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, qs, money, shortDate, inputDate } from '../api'
import {
  PageHeader, Card, Table, Badge, SearchInput, Select, Pagination, Field, Modal,
  Tabs, Banner, Loading, useFetch,
} from '../components/ui'
import LocationPicker from '../components/LocationPicker'
import { LocationPanel, LocationModal } from '../components/LocationPanel'
import { directionsUrl } from '../components/LocationPicker'
import { useInstallationLocations, progressOf, phaseOf, pinColour, TOTAL_STEPS } from '../components/InstallationMap'
import { StaticMap, useMapPrefs, streetViewUrl } from '../components/mapView'

const STATUSES = ['All', 'Scheduled', 'In Progress', 'Completed', 'On Hold', 'Cancelled']

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6m4 5v6m4-6v6" />
  </svg>
)

const EditIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
)

/**
 * Asks for confirmation, then deletes. The server refuses installations that
 * have grant claims or support tickets, and its message explains why.
 * Resolves to true when the installation was deleted.
 */
async function confirmAndDelete(install) {
  const who = install.client?.name ? ' for ' + install.client.name : ''
  const message = 'Delete installation ' + install.installNo + who + '?\n\n' +
    'Its certification record is deleted too. This cannot be undone.'
  if (!window.confirm(message)) return false
  await api.del('/installations/' + install._id)
  return true
}

const PinIcon = () => (
  <svg className="w-3.5 h-3.5 shrink-0 mt-px" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" />
  </svg>
)

// Cards or table, remembered per browser.
const VIEW_KEY = 'wp-installations-view'
const readView = () => { try { return localStorage.getItem(VIEW_KEY) === 'Table' ? 'Table' : 'Cards' } catch { return 'Cards' } }
const saveView = (view) => { try { localStorage.setItem(VIEW_KEY, view) } catch { /* storage blocked */ } }

const segmentClass = (active) =>
  'px-2.5 py-1 text-xs font-medium rounded-md transition-colors ' +
  (active ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700')

/** One installation as a card: where it is on top, then the job details. */
function InstallationCard({ install, where, locating, base, onOpen, onDelete, deleting }) {
  const done = progressOf(install)
  const colour = pinColour(install)
  const address = where?.address || [install.address, install.postcode].filter(Boolean).join(', ') || install.site
  const stop = (e) => e.stopPropagation()
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen() }}
      className="card overflow-hidden flex flex-col cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <div className="relative h-40">
        {where
          ? <StaticMap lat={where.lat} lng={where.lng} base={base} pinColour={colour} />
          : (
            <div className="absolute inset-0 grid place-items-center bg-slate-100 text-xs text-slate-400">
              {locating ? 'Finding location...' : 'No location yet'}
            </div>
          )}
        <span className="absolute left-2 top-2 rounded-lg bg-white/95 shadow-sm"><Badge>{install.status}</Badge></span>
        {where && where.precision !== 'Exact pin' && (
          <span className="absolute right-2 top-2 rounded-md bg-white/95 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 shadow-sm" title="Placed from the postcode, not an exact pin">
            Approx. · {where.precision.toLowerCase()}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold text-slate-900">{install.installNo}</span>
          <span className="text-xs text-slate-400 whitespace-nowrap">{install.installDate ? shortDate(install.installDate) : 'Not booked'}</span>
        </div>
        <p className="text-sm text-slate-700 truncate">{install.client?.name || '--'}</p>
        <p className="flex gap-1 text-xs text-slate-500">
          <PinIcon />
          <span className="line-clamp-2">{address || 'No address'}</span>
        </p>
        <p className="text-xs text-slate-500 truncate">
          {install.engineer?.name || <span className="text-slate-400">Unassigned</span>}
          {install.chargerModel ? ' · ' + install.chargerModel : ''}
        </p>
        <div className="mt-auto pt-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full" style={{ width: (done / TOTAL_STEPS) * 100 + '%', background: colour }} />
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Progress {done}/{TOTAL_STEPS} · {phaseOf(install)}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5 text-xs">
        <span className="flex gap-3">
          {where && <a href={directionsUrl(where)} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline" onClick={stop}>Directions</a>}
          {where && <a href={streetViewUrl(where.lat, where.lng)} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline" onClick={stop}>Street View</a>}
        </span>
        <button
          className="inline-flex items-center gap-1 text-slate-400 hover:text-red-600 disabled:opacity-50"
          title={'Delete ' + install.installNo}
          disabled={deleting}
          onClick={(e) => { stop(e); onDelete() }}
        >
          <TrashIcon /> {deleting ? 'Deleting...' : 'Delete'}
        </button>
      </div>
    </div>
  )
}

// Screen 9: Installations List
export function InstallationsList() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('All')
  const [page, setPage] = useState(1)
  const [showNew, setShowNew] = useState(false)
  const navigate = useNavigate()
  const { data, loading, error, reload } = useFetch('/installations' + qs({ q: search, status, page }))
  const [deletingId, setDeletingId] = useState(null)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [view, setView] = useState(readView)
  const chooseView = (next) => { setView(next); saveView(next) }
  // The card pictures follow the maps' Map / Satellite choice.
  const noMap = useRef(null)
  const { prefs, setBase } = useMapPrefs(noMap)
  const rows = data?.items || []
  const { locations, loading: locating } = useInstallationLocations(rows)

  const remove = async (row) => {
    setActionError('')
    setNotice('')
    setDeletingId(row._id)
    try {
      if (await confirmAndDelete(row)) {
        setNotice('Installation ' + row.installNo + ' deleted.')
        reload()
      }
    } catch (err) {
      setActionError(err.message)
    } finally {
      setDeletingId(null)
    }
  }

  const columns = [
    { key: 'installNo', header: 'Install No.', render: (r) => <span className="font-medium text-slate-900">{r.installNo}</span> },
    { key: 'client', header: 'Client', render: (r) => r.client?.name || '--' },
    { key: 'site', header: 'Site' },
    { key: 'installDate', header: 'Install Date', render: (r) => shortDate(r.installDate) },
    { key: 'status', header: 'Status', render: (r) => <Badge>{r.status}</Badge> },
    { key: 'engineer', header: 'Engineer', render: (r) => r.engineer?.name || <span className="text-slate-400">Unassigned</span> },
    {
      key: 'actions', header: 'Actions',
      render: (r) => (
        <span className="flex items-center gap-3">
          <Link to={'/installations/' + r._id} className="text-brand-600 text-sm hover:underline" onClick={(e) => e.stopPropagation()}>View</Link>
          <button
            className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-red-600 disabled:opacity-50"
            title={'Delete ' + r.installNo}
            disabled={deletingId === r._id}
            onClick={(e) => { e.stopPropagation(); remove(r) }}
          >
            <TrashIcon /> {deletingId === r._id ? 'Deleting...' : 'Delete'}
          </button>
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader title="Installations" subtitle="Every job from survey through to handover">
        <button className="btn-primary" onClick={() => setShowNew(true)}>+ New Installation</button>
      </PageHeader>

      <Banner>{error}</Banner>
      <Banner onDismiss={() => setActionError('')}>{actionError}</Banner>
      <Banner kind="success" onDismiss={() => setNotice('')}>{notice}</Banner>

      <Card bodyClass="">
        <div className="flex flex-wrap gap-2 p-4 border-b border-slate-200">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search installations..." />
          <Select value={status} onChange={(v) => { setStatus(v); setPage(1) }} options={STATUSES} />
          <div className="ml-auto flex flex-wrap gap-2">
            {view === 'Cards' && (
              <div className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5" title="Picture on the cards">
                {['Map', 'Satellite'].map((b) => (
                  <button key={b} type="button" className={segmentClass(prefs.base === b)} onClick={() => setBase(b)}>{b}</button>
                ))}
              </div>
            )}
            <div className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5">
              {['Cards', 'Table'].map((v) => (
                <button key={v} type="button" className={segmentClass(view === v)} onClick={() => chooseView(v)}>{v}</button>
              ))}
            </div>
          </div>
        </div>
        {loading ? <Loading /> : (
          <>
            {view === 'Table' && (
              <Table columns={columns} rows={rows} onRowClick={(r) => navigate('/installations/' + r._id)} empty="No installations match that search." />
            )}
            {view === 'Cards' && (rows.length === 0
              ? <p className="py-12 text-center text-sm text-slate-400">No installations match that search.</p>
              : (
                <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
                  {rows.map((r) => (
                    <InstallationCard
                      key={r._id}
                      install={r}
                      where={locations.get(r._id)}
                      locating={locating}
                      base={prefs.base}
                      onOpen={() => navigate('/installations/' + r._id)}
                      onDelete={() => remove(r)}
                      deleting={deletingId === r._id}
                    />
                  ))}
                </div>
              ))}
            <Pagination page={data?.page} pages={data?.pages} total={data?.total} onChange={setPage} />
          </>
        )}
      </Card>

      <InstallationFormModal open={showNew} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); reload() }} />
    </>
  )
}

const EDIT_STATUSES = STATUSES.filter((s) => s !== 'All')

const emptyInstallation = () => ({
  client: '', quotation: '', site: '', installDate: '', engineer: '', chargerModel: '', supplyType: 'Single Phase', location: '', accessNotes: '',
  address: '', postcode: '', coordinates: null, status: 'Scheduled',
})

// Older jobs have no address of their own, so start from the client's.
const installationForm = (install) => {
  const ownAddress = Boolean(install.address || install.postcode || install.coordinates)
  return {
    client: install.client?._id || install.client || '',
    quotation: install.quotation?._id || install.quotation || '',
    site: install.site || '',
    installDate: inputDate(install.installDate),
    engineer: install.engineer?._id || install.engineer || '',
    chargerModel: install.chargerModel || '',
    supplyType: install.supplyType || 'Single Phase',
    location: install.location || '',
    accessNotes: install.accessNotes || '',
    address: (ownAddress ? install.address : install.client?.address) || '',
    postcode: (ownAddress ? install.postcode : install.client?.postcode) || '',
    coordinates: (ownAddress ? install.coordinates : install.client?.location) || null,
    status: install.status || 'Scheduled',
  }
}

/** Creates a new installation, or edits `install` when one is passed. */
function InstallationFormModal({ open, install, onClose, onSaved }) {
  const editing = Boolean(install)
  const clients = useFetch('/clients' + qs({ limit: 200 }))
  const engineers = useFetch('/engineers' + qs({ limit: 200 }))
  const [form, setForm] = useState(() => (editing ? installationForm(install) : emptyInstallation()))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const clientList = clients.data?.items || []
  const selectedClient = clientList.find((c) => c._id === form.client)

  // The chosen client's quotations, for the Quotation picker. After the client
  // changes, their accepted quote (if any) is picked for you.
  const [clientQuotes, setClientQuotes] = useState([])
  const pickAcceptedQuote = useRef(false)
  useEffect(() => {
    setClientQuotes([])
    if (!form.client) return
    let cancelled = false
    api.get('/quotations' + qs({ client: form.client, limit: 200 }))
      .then((result) => {
        if (cancelled) return
        const quotes = result.items || []
        setClientQuotes(quotes)
        if (pickAcceptedQuote.current) {
          pickAcceptedQuote.current = false
          const accepted = quotes.find((q) => q.status === 'Accepted')
          if (accepted) setForm((f) => ({ ...f, quotation: accepted._id, site: f.site || accepted.site || '' }))
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [form.client])
  const chooseQuote = (e) => {
    const quote = clientQuotes.find((q) => q._id === e.target.value)
    setForm((f) => ({ ...f, quotation: e.target.value, site: f.site || quote?.site || '' }))
  }

  // Choosing a client (or one of their sites) fills in the job address and pin,
  // which can then be changed on the map.
  const chooseClient = (e) => {
    const client = clientList.find((c) => c._id === e.target.value)
    pickAcceptedQuote.current = true
    setForm((f) => ({
      ...f,
      client: e.target.value,
      quotation: '',
      site: '',
      address: client?.address || '',
      postcode: client?.postcode || '',
      coordinates: client?.location || null,
    }))
  }
  const chooseSite = (e) => {
    const name = e.target.value
    const site = (selectedClient?.sites || []).find((s) => s.name === name)
    setForm((f) => ({
      ...f,
      site: name,
      ...(site && (site.address || site.postcode) && {
        address: site.address || '',
        postcode: site.postcode || '',
        // A different postcode means a different place, so drop the client's pin.
        coordinates: site.postcode && site.postcode !== selectedClient?.postcode ? null : f.coordinates,
      }),
    }))
  }
  // LocationPicker speaks { address, postcode, location }; installations store the pin as `coordinates`.
  const onMapChange = ({ location, ...rest }) =>
    setForm((f) => ({ ...f, ...rest, ...(location !== undefined && { coordinates: location }) }))

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const payload = { ...form }
      if (editing) {
        // null (not a missing key) so unassigning an engineer or clearing the pin sticks.
        payload.engineer = payload.engineer || null
        payload.quotation = payload.quotation || null
        payload.coordinates = payload.coordinates || null
        payload.installDate = payload.installDate || null
        await api.put('/installations/' + install._id, payload)
      } else {
        if (!payload.engineer) delete payload.engineer
        if (!payload.quotation) delete payload.quotation
        if (!payload.coordinates) delete payload.coordinates
        delete payload.status
        await api.post('/installations', payload)
      }
      onSaved()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} title={editing ? 'Edit Installation ' + install.installNo : 'New Installation'} onClose={onClose} width="max-w-2xl">
      <Banner onDismiss={() => setError('')}>{error}</Banner>
      <form onSubmit={save} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Client" required>
            <select className="input" value={form.client} onChange={chooseClient} required>
              <option value="">Select client...</option>
              {/* Inactive clients can't get new jobs; an existing job keeps its client. */}
              {clientList.filter((c) => c.status !== 'Inactive' || c._id === form.client).map((c) => (
                <option key={c._id} value={c._id}>{c.name}{c.status === 'Inactive' ? ' (inactive)' : ''}</option>
              ))}
            </select>
          </Field>
          <Field label="Engineer">
            <select className="input" value={form.engineer} onChange={set('engineer')}>
              <option value="">Unassigned</option>
              {(engineers.data?.items || []).map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
            </select>
          </Field>
          <Field label="Quotation">
            <select className="input" value={form.quotation} onChange={chooseQuote} disabled={!form.client}>
              <option value="">{form.client ? (clientQuotes.length ? 'Not linked' : 'No quotations for this client') : 'Select a client first'}</option>
              {clientQuotes.map((q) => (
                <option key={q._id} value={q._id}>{q.quoteNo} · {q.status} · {money(q.total)}</option>
              ))}
            </select>
          </Field>
          <Field label="Site">
            <input className="input" list="client-sites" value={form.site} onChange={chooseSite} placeholder={selectedClient?.sites?.length ? 'Pick or type a site' : ''} />
            <datalist id="client-sites">{(selectedClient?.sites || []).map((s) => <option key={s._id || s.name} value={s.name} />)}</datalist>
          </Field>
          <Field label="Install Date"><input className="input" type="date" value={form.installDate} onChange={set('installDate')} /></Field>
          {editing && (
            <Field label="Status">
              <select className="input" value={form.status} onChange={set('status')}>
                {EDIT_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
          )}
          <Field label="Charger Model"><input className="input" value={form.chargerModel} onChange={set('chargerModel')} /></Field>
          <Field label="Supply Type">
            <select className="input" value={form.supplyType} onChange={set('supplyType')}>
              <option>Single Phase</option><option>Three Phase</option>
            </select>
          </Field>
          <Field label="Fit Point"><input className="input" value={form.location} onChange={set('location')} placeholder="e.g. Garage - right wall" /></Field>
          <Field label="Access Notes"><input className="input" value={form.accessNotes} onChange={set('accessNotes')} /></Field>
        </div>

        <Field label="Installation Address">
          <LocationPicker
            key={form.client /* re-centre the map when the client changes */}
            value={{ address: form.address, postcode: form.postcode, location: form.coordinates }}
            onChange={onMapChange}
            height={220}
          />
        </Field>
        <div className="grid sm:grid-cols-[2fr_1fr] gap-4">
          <Field label="Address"><input className="input" value={form.address} onChange={set('address')} /></Field>
          <Field label="Postcode"><input className="input" value={form.postcode} onChange={set('postcode')} /></Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>{busy ? 'Saving...' : editing ? 'Save Changes' : 'Create Installation'}</button>
        </div>
      </form>
    </Modal>
  )
}

const STAGES = [
  ['siteSurveyCompleted', 'Site Survey Completed'],
  ['quotationAccepted', 'Quotation Accepted'],
  ['installationInProgress', 'Installation In Progress'],
  ['testingCertification', 'Testing & Certification'],
  ['handover', 'Handover'],
]
// Final step of the Progress panel: ticking it sets the job's status to Completed.
const COMPLETED = 'completed'
const PROGRESS_PANEL = [...STAGES, [COMPLETED, 'Completed']]
const QUOTE_STEP = PROGRESS_PANEL.findIndex(([key]) => key === 'quotationAccepted')
// Steps that cannot be unticked once done.
const FINAL_STEPS = ['siteSurveyCompleted']

// Screen 10: Installation Details
export function InstallationDetails() {
  const { id } = useParams()
  const [tab, setTab] = useState('Overview')
  const [error, setError] = useState('')
  const { data: install, loading, reload } = useFetch('/installations/' + id)
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editingLocation, setEditingLocation] = useState(null) // null = closed, { start } = open

  if (loading) return <Loading />
  if (!install) return <Banner>Installation not found.</Banner>

  // Jobs created before installations had their own address fall back to the client's.
  const ownAddress = Boolean(install.address || install.postcode || install.coordinates)
  const jobAddress = ownAddress ? install.address : install.client?.address
  const jobPostcode = ownAddress ? install.postcode : install.client?.postcode
  const saveLocation = async ({ address, postcode, location }) => {
    await api.put('/installations/' + id, { address, postcode, coordinates: location })
    setEditingLocation(null)
    reload()
  }

  const remove = async () => {
    setError('')
    setDeleting(true)
    try {
      if (await confirmAndDelete(install)) navigate('/installations')
      else setDeleting(false)
    } catch (err) {
      setError(err.message)
      setDeleting(false)
    }
  }

  // "Quotation Accepted" follows the job's linked quotation only, never a hand
  // tick: with no quote linked it stays unticked. It unlocks the later steps.
  const quote = install.quotation || null
  const quoteAccepted = quote?.status === 'Accepted'

  const toggleStage = async (key) => {
    try {
      // The last step is the job's status, not a progress flag.
      const change = key === COMPLETED
        ? { status: install.status === 'Completed' ? 'In Progress' : 'Completed' }
        : { progress: { ...install.progress, [key]: !install.progress[key] } }
      await api.put('/installations/' + id, change)
      reload()
    } catch (err) { setError(err.message) }
  }

  const toggleTask = async (taskId) => {
    const tasks = install.tasks.map((t) => (t._id === taskId ? { ...t, done: !t.done } : t))
    await api.put('/installations/' + id, { tasks })
    reload()
  }

  const onHold = install.status === 'On Hold'
  const canHold = !['Completed', 'Cancelled'].includes(install.status)
  const toggleHold = async () => {
    try {
      if (onHold) {
        await api.post('/installations/' + id + '/resume')
      } else {
        const reason = window.prompt('Put ' + install.installNo + ' on hold?\n\nReason (optional):', '')
        if (reason === null) return // cancelled
        await api.post('/installations/' + id + '/hold', { reason })
      }
      reload()
    } catch (err) { setError(err.message) }
  }

  const notifyDno = async () => {
    try {
      await api.post('/installations/' + id + '/dno-notify')
      reload()
    } catch (err) { setError(err.message) }
  }

  return (
    <>
      <PageHeader title={'Installation ' + install.installNo} subtitle={install.client?.name}>
        <Link to="/installations" className="btn-secondary">Back</Link>
        <button className="btn-secondary" onClick={() => setEditing(true)}>
          <EditIcon /> Edit
        </button>
        <button className="btn-secondary text-red-600 hover:bg-red-50 hover:border-red-200" onClick={remove} disabled={deleting}>
          <TrashIcon /> {deleting ? 'Deleting...' : 'Delete'}
        </button>
        <Link to={'/installations/' + id + '/certification'} className="btn-primary">Certification</Link>
      </PageHeader>

      {/* Mounted only while open so the form starts from the latest saved values. */}
      {editing && (
        <InstallationFormModal
          open
          install={install}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); reload() }}
        />
      )}

      {editingLocation && (
        <LocationModal
          title={'Location · ' + install.installNo}
          initial={{ address: jobAddress, postcode: jobPostcode, location: install.coordinates || editingLocation.start }}
          onClose={() => setEditingLocation(null)}
          onSave={saveLocation}
        />
      )}

      <Banner onDismiss={() => setError('')}>{error}</Banner>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Card bodyClass="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-slate-900">{install.installNo}</span>
              <Badge>{install.status}</Badge>
            </div>
            <Tabs tabs={['Overview', 'Tasks', 'Compliance', 'Notes']} active={tab} onChange={setTab} />

            {tab === 'Overview' && (
              <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <Row label="Client">{install.client?.name}</Row>
                <Row label="Quotation">
                  {install.quotation
                    ? <Link to={'/quotations/' + install.quotation._id} className="text-brand-600 hover:underline">{install.quotation.quoteNo}</Link>
                    : <span className="text-slate-400">Not linked</span>}
                  {install.quotation && <span className="ml-1.5"><Badge>{install.quotation.status}</Badge></span>}
                </Row>
                <Row label="Engineer">{install.engineer?.name || 'Unassigned'}</Row>
                <Row label="Site">{install.site || '--'}</Row>
                <Row label="Install Date">{shortDate(install.installDate)}</Row>
                <Row label="Charger Model">{install.chargerModel || '--'}</Row>
                <Row label="Supply Type">{install.supplyType}</Row>
                <Row label="Fit Point">{install.location || '--'}</Row>
                <Row label="Access Notes">{install.accessNotes || '--'}</Row>
                <div className="sm:col-span-2">
                  <Row label="Address">
                    {[jobAddress, jobPostcode].filter(Boolean).join(', ') || '--'}
                    {!ownAddress && (jobAddress || jobPostcode) && <span className="ml-1 text-xs text-slate-400">(client address)</span>}
                  </Row>
                </div>
                <div className="sm:col-span-2 pt-1">
                  <LocationPanel
                    title="Installation location"
                    address={jobAddress}
                    postcode={jobPostcode}
                    location={install.coordinates || (!ownAddress ? install.client?.location : null)}
                    onEdit={(start) => setEditingLocation({ start })}
                    onKeepApprox={(point) => saveLocation({ address: jobAddress || '', postcode: jobPostcode || '', location: point })}
                  />
                </div>
              </dl>
            )}

            {tab === 'Tasks' && (
              <div className="divide-y divide-slate-100">
                {(install.tasks || []).length === 0 && <p className="py-6 text-sm text-slate-400 text-center">No tasks added to this job.</p>}
                {(install.tasks || []).map((task) => (
                  <label key={task._id} className="flex items-center gap-3 py-2.5 text-sm cursor-pointer">
                    <input type="checkbox" className="rounded border-slate-300" checked={task.done} onChange={() => toggleTask(task._id)} />
                    <span className={task.done ? 'line-through text-slate-400' : 'text-slate-700'}>{task.title}</span>
                  </label>
                ))}
              </div>
            )}

            {tab === 'Compliance' && (
              <div className="space-y-4 py-2">
                <div className="flex items-center justify-between p-3 rounded-md bg-amber-50 border border-amber-200">
                  <div>
                    <p className="text-sm font-medium text-amber-900">DNO Notification</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      The local electricity network operator must be told that a charger has been added.
                    </p>
                  </div>
                  {install.dnoNotified
                    ? <Badge tone="green">Sent {shortDate(install.dnoNotifiedAt)}</Badge>
                    : <button className="btn-primary" onClick={notifyDno}>Notify DNO</button>}
                </div>
                <ul className="text-sm text-slate-600 space-y-1.5 list-disc pl-5">
                  <li>IET Wiring Regulations (18th Edition, BS 7671)</li>
                  <li>Code of Practice for EV Charging Equipment Installation (5th Edition)</li>
                  <li>Sign-off by an NICEIC or NAPIT certified electrician</li>
                </ul>
              </div>
            )}

            {tab === 'Notes' && <p className="text-sm text-slate-600 py-4">{install.notes || 'No notes on this job.'}</p>}
          </Card>
        </div>

        <Card
          title="Progress"
          action={canHold && (
            <button
              className={onHold ? 'btn-primary text-xs px-2.5 py-1' : 'btn-secondary text-xs px-2.5 py-1'}
              onClick={toggleHold}
            >
              {onHold ? 'Resume' : 'Put on hold'}
            </button>
          )}
        >
          {onHold && (
            <div className="mb-3 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
              <p className="font-medium text-slate-700">On hold{install.hold?.since ? ' since ' + shortDate(install.hold.since) : ''}</p>
              {install.hold?.reason && <p className="mt-0.5">{install.hold.reason}</p>}
              <p className="mt-0.5 text-slate-500">Progress is frozen until the job is resumed.</p>
            </div>
          )}
          {!quoteAccepted && (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Installation steps unlock once the quotation is accepted.
            </p>
          )}
          {!quote && (
            <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              No quotation is linked to this job.{' '}
              <button className="text-brand-600 hover:underline" onClick={() => setEditing(true)}>Link one</button>
            </p>
          )}
          <ol className="space-y-3">
            {PROGRESS_PANEL.map(([key, label], index) => {
              const isQuoteStep = key === 'quotationAccepted'
              const done = key === COMPLETED ? install.status === 'Completed' : isQuoteStep ? quoteAccepted : install.progress?.[key]
              // Steps after the quote wait for it to be accepted; ones already ticked can still be unticked.
              const locked = index > QUOTE_STEP && !quoteAccepted && !done
              // Driven by the quotation status, so never ticked by hand.
              const fromQuote = isQuoteStep
              const final = done && FINAL_STEPS.includes(key)
              const disabled = locked || fromQuote || final || onHold
              let hint = done ? 'Completed' : 'Pending'
              if (locked) hint = 'Waiting for quote acceptance'
              if (onHold && !done && !fromQuote) hint = 'On hold'
              if (fromQuote) hint = quote ? quote.quoteNo + ' · ' + quote.status : 'No quotation linked'
              return (
                <li key={key} className="flex items-start gap-3">
                  <button
                    onClick={() => toggleStage(key)}
                    disabled={disabled}
                    className={'mt-0.5 grid place-items-center w-5 h-5 rounded-full text-[11px] shrink-0 transition-colors disabled:cursor-not-allowed ' +
                      (done ? 'bg-emerald-500 text-white' : locked ? 'bg-slate-100 text-slate-300' : 'bg-slate-200 text-slate-400 hover:bg-slate-300 disabled:hover:bg-slate-200')}
                    title={fromQuote ? 'Set from the quotation status' : onHold ? 'Resume the job to change its progress' : final ? 'Completed -- cannot be undone' : locked ? 'Accept the quotation first' : done ? 'Mark as not done' : 'Mark as done'}
                  >
                    {done ? '✓' : locked ? '🔒' : ''}
                  </button>
                  <div>
                    <p className={'text-sm ' + (done ? 'text-slate-800' : locked ? 'text-slate-400' : 'text-slate-500')}>{label}</p>
                    <p className="text-xs text-slate-400">{hint}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        </Card>
      </div>
    </>
  )
}

// Screen 11: Installation Certification
export function InstallationCertification() {
  const { id } = useParams()
  const navigate = useNavigate()
  const install = useFetch('/installations/' + id)
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.get('/installations/' + id + '/certification').then((cert) => {
      setForm(cert || {
        certificateNo: '',
        issueDate: inputDate(new Date()),
        testedBy: '',
        nextInspectionDue: '',
        tests: { continuity: 'Pass', insulationResistance: 'Pass', earthElectrode: 'Pass', rcd: 'Pass', functional: 'Pass' },
        certificateFileName: '',
      })
    })
  }, [id])

  if (install.loading || !form) return <Loading />

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })
  const setTest = (key, value) => setForm({ ...form, tests: { ...form.tests, [key]: value } })

  const save = async (complete) => {
    setBusy(true)
    setError('')
    try {
      await api.post('/installations/' + id + '/certification', {
        ...form,
        issueDate: form.issueDate || undefined,
        nextInspectionDue: form.nextInspectionDue || undefined,
        complete,
      })
      navigate('/installations/' + id)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const TESTS = [
    ['continuity', 'Continuity Test'],
    ['insulationResistance', 'Insulation Resistance'],
    ['earthElectrode', 'Earth Electrode'],
    ['rcd', 'RCD Test'],
    ['functional', 'Functional Test'],
  ]

  return (
    <>
      <PageHeader
        title={'Installation Certification - ' + (install.data?.installNo || '')}
        subtitle="Electrical Installation Certificate (EIC)"
      >
        <Link to={'/installations/' + id} className="btn-secondary">Back</Link>
      </PageHeader>

      <Banner onDismiss={() => setError('')}>{error}</Banner>

      <div className="grid gap-4 lg:grid-cols-2 max-w-4xl">
        <Card title="Electrical Installation Certificate">
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Certificate No." required>
                <input className="input" placeholder="EIC-00000" value={form.certificateNo} onChange={set('certificateNo')} />
              </Field>
              <Field label="Issue Date">
                <input className="input" type="date" value={inputDate(form.issueDate)} onChange={set('issueDate')} />
              </Field>
              <Field label="Tested By">
                <input className="input" value={form.testedBy || ''} onChange={set('testedBy')} />
              </Field>
              <Field label="Next Inspection Due">
                <input className="input" type="date" value={inputDate(form.nextInspectionDue)} onChange={set('nextInspectionDue')} />
              </Field>
            </div>
            <Field label="Upload Certificate (PDF)">
              <input
                className="input"
                type="file"
                accept="application/pdf"
                onChange={(e) => setForm({ ...form, certificateFileName: e.target.files?.[0]?.name || '' })}
              />
              {form.certificateFileName && <p className="text-xs text-slate-500 mt-1">Attached: {form.certificateFileName}</p>}
            </Field>
          </div>
        </Card>

        <Card title="Test Results">
          <div className="divide-y divide-slate-100">
            {TESTS.map(([key, label]) => (
              <div key={key} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-slate-700">{label}</span>
                <div className="flex gap-1">
                  {['Pass', 'Fail', 'N/A'].map((option) => (
                    <button
                      key={option}
                      onClick={() => setTest(key, option)}
                      className={'px-2.5 py-1 rounded text-xs font-medium border transition-colors ' +
                        (form.tests[key] === option
                          ? option === 'Pass' ? 'bg-emerald-500 text-white border-emerald-500'
                            : option === 'Fail' ? 'bg-red-500 text-white border-red-500'
                              : 'bg-slate-500 text-white border-slate-500'
                          : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-50')}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-3">
            Marking this complete sets the installation to Completed and ticks off testing and handover.
          </p>
        </Card>
      </div>

      <div className="flex justify-end gap-2 mt-4 max-w-4xl">
        <button className="btn-secondary" disabled={busy} onClick={() => save(false)}>Save Draft</button>
        <button className="btn-primary" disabled={busy} onClick={() => save(true)}>{busy ? 'Saving...' : 'Save & Complete'}</button>
      </div>
    </>
  )
}

const Row = ({ label, children }) => (
  <div>
    <dt className="text-xs text-slate-500">{label}</dt>
    <dd className="text-slate-800">{children}</dd>
  </div>
)
