import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, shortDate, quoteTotals } from '../api'
import { PageHeader, Card, Table, Badge, Banner, Loading, Tabs, useFetch } from '../components/ui'
import { useAuth } from '../auth'
import {
  normaliseProducts, ProductChips, DesignFields, DesignSummary, designForm, designPayload, kWpOf, mcsEstimate, stepsFor, JobProgress,
} from '../processes'
import { proposalFigures, OCCUPANCY, ASSUMPTIONS } from '../solar/proposalCalc'
import { approximateLocation } from '../components/LocationPicker'

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
  const { can, user } = useAuth()
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
  // Steps go in order: the design waits for the steps before it (the survey),
  // and can't be reopened once a later step is done.
  const steps = stepsFor(products)
  const at = steps.findIndex((s) => s.key === 'systemDesigned')
  const isDone = (s) => (s.fromQuote ? job.quotation?.status === 'Accepted' : Boolean(job.progress?.[s.key]))
  const waitingFor = at > 0 ? steps.slice(0, at).find((s) => !isDone(s)) : null
  const laterDone = at >= 0 && steps.slice(at + 1).some((s) => !s.fromQuote && isDone(s))
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

          {products.includes('solar') && (
            <ProposalCard
              job={job}
              values={values}
              estimate={estimate}
              editable={canDesign}
              onChange={setForm}
              canSeePrice={can('quotations', 'read')}
              preparedBy={user?.name}
            />
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
            <div className={'flex items-center justify-between gap-3 rounded-xl px-3 py-2 -mx-1 ' + (designed ? 'bg-emerald-50' : 'bg-amber-50/60')}>
              <Badge tone={designed ? 'green' : 'amber'}>{designed ? 'Designed' : 'Not complete'}</Badge>
              {products.includes('solar') && (
                <span className="text-sm text-slate-700">{estimate != null ? estimate.toLocaleString('en-GB') + ' kWh / yr' : 'No estimate yet'}</span>
              )}
            </div>
            {canDesign && canProgress && (
              designed
                ? <button className="btn-secondary w-full mt-4" disabled={busy || job.status === 'On Hold' || laterDone} onClick={() => setDesigned(false)}>Reopen design</button>
                : <button className="btn-primary w-full mt-4" disabled={busy || job.status === 'On Hold' || Boolean(waitingFor)} onClick={() => setDesigned(true)}>Mark design complete</button>
            )}
            {!designed && waitingFor && <p className="mt-2 text-xs text-slate-500">Complete "{waitingFor.label}" on the job first.</p>}
            {designed && laterDone && <p className="mt-2 text-xs text-slate-500">Later steps are already done, so the design can't be reopened.</p>}
            {job.status === 'On Hold' && <p className="mt-2 text-xs text-slate-500">This job is on hold, so its steps can't change until it's resumed.</p>}
            {products.includes('solar') && !designed && estimate == null && (
              <p className="mt-2 text-xs text-slate-500">Fill in the panels and the MCS zone, Kk and shading factor to get the estimate.</p>
            )}
          </Card>

          <Card title="Job progress" subtitle="Marking the design complete ticks its step on the job">
            <JobProgress install={job} highlight="systemDesigned" />
          </Card>
        </div>
      </div>
    </>
  )
}

/**
 * Customer proposal: the home's use and tariffs, the figures they give
 * (self-use, savings, payback, CO2) and the branded PDF download. The inputs
 * are saved with the design ("Save Design").
 */
function ProposalCard({ job, values, estimate, editable, onChange, canSeePrice, preparedBy }) {
  const [quote, setQuote] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const quoteId = job.quotation?._id || job.quotation

  // The price comes from the linked quotation, for people allowed to see quotes.
  useEffect(() => {
    if (!canSeePrice || !quoteId) return
    let cancelled = false
    api.get('/quotations/' + quoteId).then((q) => { if (!cancelled) setQuote(q) }).catch(() => {})
    return () => { cancelled = true }
  }, [canSeePrice, quoteId])

  const price = quote ? quoteTotals(quote.items).total : null
  const design = { ...values, estimatedAnnualKwh: estimate }
  const f = estimate ? proposalFigures(design, { price }) : null
  const set = (key) => (e) => onChange({ ...values, [key]: e.target.value })

  const download = async () => {
    setBusy(true)
    setError('')
    try {
      const where = job.coordinates?.lat != null ? job.coordinates
        : job.client?.location?.lat != null ? job.client.location
        : await approximateLocation({ postcode: job.postcode || job.client?.postcode, address: job.address || job.client?.address }).catch(() => null)
      const [{ exportProposalPdf }, { renderSiteImage }] = await Promise.all([import('../reports/proposal'), import('../reports/mapImage')])
      const siteImage = where ? await renderSiteImage({ lat: where.lat, lng: where.lng }) : null
      await exportProposalPdf({ job: { ...job, design }, quote, siteImage, preparedBy })
    } catch (err) { setError('Could not create the proposal: ' + err.message) } finally { setBusy(false) }
  }

  const input = (key, props) => (
    <input className="input" type="number" min="0" step="any" value={values[key]} onChange={set(key)} disabled={!editable} {...props} />
  )
  const priceHint = price
    ? 'Price £' + Math.round(price).toLocaleString('en-GB') + ' (' + (quote.quoteNo || 'quote') + ')'
    : canSeePrice ? 'Link a quotation to show' : 'Price not shown to your role'

  return (
    <Card title="Customer proposal" subtitle="A branded PDF for the customer, built from this MCS design">
      <Banner onDismiss={() => setError('')}>{error}</Banner>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1">Electricity use (kWh/yr)</span>
          {input('consumptionKwh', { placeholder: String(ASSUMPTIONS.consumptionKwh), step: 100 })}
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1">Occupancy</span>
          <select className="input" value={values.occupancy || ''} onChange={set('occupancy')} disabled={!editable}>
            <option value="">{OCCUPANCY[ASSUMPTIONS.occupancy].label} (default)</option>
            {Object.entries(OCCUPANCY).map(([k, o]) => <option key={k} value={k}>{o.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1">Import tariff (p/kWh)</span>
          {input('importTariff', { placeholder: String(ASSUMPTIONS.importTariff), step: 0.01 })}
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1">Export tariff (p/kWh)</span>
          {input('exportTariff', { placeholder: String(ASSUMPTIONS.exportTariff), step: 0.01 })}
        </label>
      </div>
      <p className="mt-1.5 text-xs text-slate-400">Blank fields use the defaults shown. Save the design to keep these for next time.</p>

      {f ? (
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Figure label="Used at home" value={f.energy.selfUse.toLocaleString('en-GB') + ' kWh'} hint={Math.round(f.energy.selfSufficiency * 100) + '% self-sufficient'} tone="amber" />
          <Figure label="First-year saving" value={'£' + Math.round(f.firstYear.total).toLocaleString('en-GB')} hint={'Bills £' + Math.round(f.firstYear.importSaving) + ' + export £' + Math.round(f.firstYear.exportIncome)} tone="blue" />
          <Figure label="Payback" value={f.payback ? f.payback + ' years' : price ? '25+ years' : '--'} hint={priceHint} tone="slate" />
          <Figure label="CO2 saved" value={Math.round(f.co2.total).toLocaleString('en-GB') + ' kg/yr'} hint={'about ' + Math.round(f.co2.trees) + ' trees'} tone="green" />
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">Fill in the panels and the MCS zone, Kk and shading factor to work out the proposal figures.</p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-400 max-w-md">
          {price ? 'Includes the quote, order form and payback pages from ' + quote.quoteNo + '.'
            : 'The quote and payback pages are added when a quotation is linked' + (canSeePrice ? '.' : ' and you can see prices.')}
        </p>
        <button type="button" className="btn-primary" disabled={!f || busy} onClick={download}>
          {busy ? 'Building PDF...' : 'Download proposal PDF'}
        </button>
      </div>
    </Card>
  )
}

const FIGURE_TONES = {
  amber: 'bg-amber-50 text-amber-800',
  blue: 'bg-brand-50 text-brand-800',
  slate: 'bg-slate-50 text-slate-800',
  green: 'bg-emerald-50 text-emerald-800',
}

function Figure({ label, value, hint, tone }) {
  return (
    <div className={'rounded-xl px-3 py-2.5 ' + FIGURE_TONES[tone]}>
      <p className="text-[11px] font-medium opacity-70">{label}</p>
      <p className="text-base font-semibold">{value}</p>
      {hint && <p className="text-[11px] opacity-70 truncate" title={hint}>{hint}</p>}
    </div>
  )
}
