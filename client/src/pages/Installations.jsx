import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, qs, shortDate, inputDate } from '../api'
import {
  PageHeader, Card, Table, Badge, SearchInput, Select, Pagination, Field, Modal,
  Tabs, Banner, Loading, useFetch,
} from '../components/ui'

const STATUSES = ['All', 'Scheduled', 'In Progress', 'Completed', 'On Hold', 'Cancelled']

// Screen 9: Installations List
export function InstallationsList() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('All')
  const [page, setPage] = useState(1)
  const [showNew, setShowNew] = useState(false)
  const navigate = useNavigate()
  const { data, loading, error, reload } = useFetch('/installations' + qs({ q: search, status, page }))

  const columns = [
    { key: 'installNo', header: 'Install No.', render: (r) => <span className="font-medium text-slate-900">{r.installNo}</span> },
    { key: 'client', header: 'Client', render: (r) => r.client?.name || '--' },
    { key: 'site', header: 'Site' },
    { key: 'installDate', header: 'Install Date', render: (r) => shortDate(r.installDate) },
    { key: 'status', header: 'Status', render: (r) => <Badge>{r.status}</Badge> },
    { key: 'engineer', header: 'Engineer', render: (r) => r.engineer?.name || <span className="text-slate-400">Unassigned</span> },
    {
      key: 'actions', header: 'Actions',
      render: (r) => <Link to={'/installations/' + r._id} className="text-brand-600 text-sm hover:underline" onClick={(e) => e.stopPropagation()}>View</Link>,
    },
  ]

  return (
    <>
      <PageHeader title="Installations" subtitle="Every job from survey through to handover">
        <button className="btn-primary" onClick={() => setShowNew(true)}>+ New Installation</button>
      </PageHeader>

      <Banner>{error}</Banner>

      <Card bodyClass="">
        <div className="flex flex-wrap gap-2 p-4 border-b border-slate-200">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search installations..." />
          <Select value={status} onChange={(v) => { setStatus(v); setPage(1) }} options={STATUSES} />
        </div>
        {loading ? <Loading /> : (
          <>
            <Table columns={columns} rows={data?.items || []} onRowClick={(r) => navigate('/installations/' + r._id)} empty="No installations match that search." />
            <Pagination page={data?.page} pages={data?.pages} total={data?.total} onChange={setPage} />
          </>
        )}
      </Card>

      <NewInstallationModal open={showNew} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); reload() }} />
    </>
  )
}

function NewInstallationModal({ open, onClose, onSaved }) {
  const clients = useFetch('/clients' + qs({ limit: 200 }))
  const engineers = useFetch('/engineers' + qs({ limit: 200 }))
  const [form, setForm] = useState({ client: '', site: '', installDate: '', engineer: '', chargerModel: '', supplyType: 'Single Phase', location: '', accessNotes: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const payload = { ...form }
      if (!payload.engineer) delete payload.engineer
      await api.post('/installations', payload)
      onSaved()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} title="New Installation" onClose={onClose}>
      <Banner onDismiss={() => setError('')}>{error}</Banner>
      <form onSubmit={save} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Client" required>
            <select className="input" value={form.client} onChange={set('client')} required>
              <option value="">Select client...</option>
              {(clients.data?.items || []).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Engineer">
            <select className="input" value={form.engineer} onChange={set('engineer')}>
              <option value="">Unassigned</option>
              {(engineers.data?.items || []).map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
            </select>
          </Field>
          <Field label="Site"><input className="input" value={form.site} onChange={set('site')} /></Field>
          <Field label="Install Date"><input className="input" type="date" value={form.installDate} onChange={set('installDate')} /></Field>
          <Field label="Charger Model"><input className="input" value={form.chargerModel} onChange={set('chargerModel')} /></Field>
          <Field label="Supply Type">
            <select className="input" value={form.supplyType} onChange={set('supplyType')}>
              <option>Single Phase</option><option>Three Phase</option>
            </select>
          </Field>
          <Field label="Location"><input className="input" value={form.location} onChange={set('location')} /></Field>
          <Field label="Access Notes"><input className="input" value={form.accessNotes} onChange={set('accessNotes')} /></Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Create Installation'}</button>
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

// Screen 10: Installation Details
export function InstallationDetails() {
  const { id } = useParams()
  const [tab, setTab] = useState('Overview')
  const [error, setError] = useState('')
  const { data: install, loading, reload } = useFetch('/installations/' + id)

  if (loading) return <Loading />
  if (!install) return <Banner>Installation not found.</Banner>

  const toggleStage = async (key) => {
    try {
      await api.put('/installations/' + id, { progress: { ...install.progress, [key]: !install.progress[key] } })
      reload()
    } catch (err) { setError(err.message) }
  }

  const toggleTask = async (taskId) => {
    const tasks = install.tasks.map((t) => (t._id === taskId ? { ...t, done: !t.done } : t))
    await api.put('/installations/' + id, { tasks })
    reload()
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
        <Link to={'/installations/' + id + '/certification'} className="btn-primary">Certification</Link>
      </PageHeader>

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
                <Row label="Engineer">{install.engineer?.name || 'Unassigned'}</Row>
                <Row label="Site">{install.site || '--'}</Row>
                <Row label="Install Date">{shortDate(install.installDate)}</Row>
                <Row label="Charger Model">{install.chargerModel || '--'}</Row>
                <Row label="Supply Type">{install.supplyType}</Row>
                <Row label="Location">{install.location || '--'}</Row>
                <Row label="Access Notes">{install.accessNotes || '--'}</Row>
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

        <Card title="Progress">
          <ol className="space-y-3">
            {STAGES.map(([key, label]) => {
              const done = install.progress?.[key]
              return (
                <li key={key} className="flex items-start gap-3">
                  <button
                    onClick={() => toggleStage(key)}
                    className={'mt-0.5 grid place-items-center w-5 h-5 rounded-full text-[11px] shrink-0 transition-colors ' +
                      (done ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400 hover:bg-slate-300')}
                    title={done ? 'Mark as not done' : 'Mark as done'}
                  >
                    {done ? '✓' : ''}
                  </button>
                  <div>
                    <p className={'text-sm ' + (done ? 'text-slate-800' : 'text-slate-500')}>{label}</p>
                    <p className="text-xs text-slate-400">{done ? 'Completed' : 'Pending'}</p>
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
