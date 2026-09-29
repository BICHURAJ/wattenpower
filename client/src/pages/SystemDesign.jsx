import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, shortDate } from '../api'
import { PageHeader, Card, Table, Badge, Banner, Loading, Tabs, useFetch } from '../components/ui'
import { useAuth } from '../auth'
import {
  normaliseProducts, ProductChips, DesignFields, DesignSummary, designForm, designPayload, kWpOf, mcsEstimate,
} from '../processes'

// System Design: the engineers' workspace for designing solar PV and battery
// systems to MCS rules. It lists the jobs that need a design and opens each one
// in a full-page editor. Only engineers and admins (systemDesign right).

const TABS = { needs: 'Needs design', done: 'Designed', all: 'All' }

/** Where a job's design stands. */
function designState(job) {
  if (job.progress?.systemDesigned) return { label: 'Designed', tone: 'green' }
  const d = job.design || {}
  const started = Object.entries(d).some(([k, v]) => k !== 'kWp' && v !== '' && v != null)
  return started ? { label: 'In progress', tone: 'amber' } : { label: 'Not started', tone: 'slate' }
}

const sizeOf = (job) => {
  const products = normaliseProducts(job.products)
  const kWp = kWpOf(job.design)
  return [products.includes('solar') && kWp && kWp + ' kWp', products.includes('battery') && job.design?.batteryKwh && job.design.batteryKwh + ' kWh'].filter(Boolean).join(' + ')
}

export function SystemDesignList() {
  const [state, setState] = useState('needs')
  const navigate = useNavigate()
  const { data, loading, error } = useFetch('/installations/designs?state=' + state)
  const counts = data?.counts || {}
  const tabLabel = (key) => TABS[key] + (counts[key] != null ? ' (' + counts[key] + ')' : '')

  const columns = [
    { key: 'installNo', header: 'Job', render: (r) => <span className="font-medium text-slate-900">{r.installNo}</span> },
    { key: 'client', header: 'Client', render: (r) => r.client?.name || '--' },
    { key: 'products', header: 'System', render: (r) => <ProductChips products={r.products} size="xs" /> },
    { key: 'size', header: 'Size', render: (r) => sizeOf(r) || <span className="text-slate-400">--</span> },
    { key: 'estimate', header: 'MCS estimate', render: (r) => (r.design?.estimatedAnnualKwh ? r.design.estimatedAnnualKwh.toLocaleString('en-GB') + ' kWh/yr' : <span className="text-slate-400">--</span>) },
    { key: 'design', header: 'Design', render: (r) => { const s = designState(r); return <Badge tone={s.tone}>{s.label}</Badge> } },
    { key: 'installDate', header: 'Install date', render: (r) => (r.installDate ? shortDate(r.installDate) : <span className="text-slate-400">Not booked</span>) },
    { key: 'engineer', header: 'Engineer', render: (r) => r.engineer?.name || <span className="text-slate-400">Unassigned</span> },
  ]

  return (
    <>
      <PageHeader title="System Design" subtitle="Solar PV and battery systems, designed by the engineers to MCS standards" />
      <Banner>{error}</Banner>
      <Tabs
        tabs={Object.keys(TABS).map(tabLabel)}
        active={tabLabel(state)}
        onChange={(label) => setState(Object.keys(TABS).find((k) => label.startsWith(TABS[k])))}
      />
      <Card bodyClass="">
        {loading ? <Loading /> : (
          <Table
            columns={columns}
            rows={data?.items || []}
            onRowClick={(r) => navigate('/system-design/' + r._id)}
            empty={state === 'needs' ? 'Nothing waiting for a design.' : 'No jobs here yet.'}
          />
        )}
      </Card>
      <p className="mt-3 text-xs text-slate-400">
        Jobs appear here when they include solar PV or a battery. Mark a design complete to tick the job's "System design" step.
      </p>
    </>
  )
}

export function SystemDesignEditor() {
  const { id } = useParams()
  const { can } = useAuth()
  const canDesign = can('systemDesign', 'update')
  const canProgress = can('installationProgress', 'update')
  const { data: job, loading, reload } = useFetch('/installations/' + id)
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  if (loading) return <Loading />
  if (!job) return <Banner>Job not found.</Banner>

  const products = normaliseProducts(job.products)
  const values = form || designForm(job.design)
  const designed = Boolean(job.progress?.systemDesigned)
  const estimate = mcsEstimate(values)
  const address = [job.address || job.client?.address, job.postcode || job.client?.postcode].filter(Boolean).join(', ')

  const save = async (e) => {
    e?.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api.put('/installations/' + id, { design: designPayload(values) })
      setForm(null)
      setNotice('Design saved.')
      reload()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  // Ticks (or unticks) the job's "System design" step. Saves the design first.
  const setDesigned = async (done) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (form) await api.put('/installations/' + id, { design: designPayload(values) })
      await api.put('/installations/' + id, { progress: { ...(job.progress || {}), systemDesigned: done } })
      setForm(null)
      setNotice(done ? 'Design marked complete.' : 'Design reopened.')
      reload()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <>
      <PageHeader title={'System design · ' + job.installNo} subtitle={job.client?.name}>
        <Link to="/system-design" className="btn-secondary">Back</Link>
        <Link to={'/installations/' + id} className="btn-secondary">Open job</Link>
      </PageHeader>

      <Banner onDismiss={() => setError('')}>{error}</Banner>
      <Banner kind="success" onDismiss={() => setNotice('')}>{notice}</Banner>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {canDesign ? (
            <Card title="Design" subtitle="MCS MIS 3002 (solar) / MIS 3012 (battery)">
              <form onSubmit={save}>
                <DesignFields value={values} onChange={setForm} products={products} />
                <div className="flex flex-wrap justify-end gap-2 mt-5">
                  {form && <button type="button" className="btn-secondary" onClick={() => setForm(null)}>Discard changes</button>}
                  <button className="btn-primary" disabled={busy || !form}>{busy ? 'Saving...' : 'Save Design'}</button>
                </div>
              </form>
            </Card>
          ) : (
            <Card title="Design"><DesignSummary design={job.design} products={products} /></Card>
          )}
        </div>

        <div className="space-y-4">
          <Card title="Job">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-slate-500">System</dt><dd><ProductChips products={products} size="xs" /></dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Address</dt><dd className="text-right text-slate-800">{address || '--'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Install date</dt><dd className="text-slate-800">{job.installDate ? shortDate(job.installDate) : 'Not booked'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Engineer</dt><dd className="text-slate-800">{job.engineer?.name || 'Unassigned'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Supply</dt><dd className="text-slate-800">{job.supplyType || '--'}</dd></div>
              {job.accessNotes && <div className="flex justify-between gap-3"><dt className="text-slate-500">Access</dt><dd className="text-right text-slate-800">{job.accessNotes}</dd></div>}
            </dl>
          </Card>

          <Card title="Design status">
            <div className="flex items-center justify-between gap-3">
              <Badge tone={designed ? 'green' : 'amber'}>{designed ? 'Designed' : 'Not complete'}</Badge>
              {products.includes('solar') && (
                <span className="text-sm text-slate-700">{estimate != null ? estimate.toLocaleString('en-GB') + ' kWh / yr' : 'No estimate yet'}</span>
              )}
            </div>
            {canDesign && canProgress && (
              designed
                ? <button className="btn-secondary w-full mt-4" disabled={busy || job.status === 'On Hold'} onClick={() => setDesigned(false)}>Reopen design</button>
                : <button className="btn-primary w-full mt-4" disabled={busy || job.status === 'On Hold'} onClick={() => setDesigned(true)}>Mark design complete</button>
            )}
            {job.status === 'On Hold' && <p className="mt-2 text-xs text-slate-500">This job is on hold, so its steps can't change until it's resumed.</p>}
            {products.includes('solar') && !designed && estimate == null && (
              <p className="mt-2 text-xs text-slate-500">Fill in the panels and the MCS zone, Kk and shading factor to get the estimate.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
