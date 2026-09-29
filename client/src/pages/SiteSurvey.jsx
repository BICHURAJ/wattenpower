import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, qs, shortDate } from '../api'
import { PageHeader, Card, Table, Badge, Banner, Loading, SearchInput, Select, Pagination, useFetch } from '../components/ui'
import { useAuth } from '../auth'
import { normaliseProducts, ProductChips, productLabel, surveySectionsFor, surveyProgressOf } from '../processes'
import { AddPhotosButton, PhotoGrid, uploadPhotos } from '../components/Photos'

// Operations > Site Survey: every job's pre-installation survey, recorded to
// BS 7671, the IET Codes of Practice (EV, solar PV, energy storage) and MCS.
// The list shows how much is covered and what's pending; each survey opens as
// a checklist with its required photos. Completing one ticks the job's
// "Site / roof survey" step.

const STATUS_TONE = { 'Not started': 'slate', Booked: 'blue', 'In progress': 'amber', Completed: 'green' }
const STATUS_COLOUR = { 'Not started': 'bg-slate-300', Booked: 'bg-brand-400', 'In progress': 'bg-amber-400', Completed: 'bg-emerald-500' }
const FILTERS = [
  { key: 'All', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'Not started', label: 'Not started' },
  { key: 'Booked', label: 'Booked' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'In progress', label: 'In progress' },
  { key: 'Completed', label: 'Completed' },
]

const isOverdue = (s) => s.status === 'Booked' && s.scheduledAt && new Date(s.scheduledAt) < new Date(new Date().toDateString())
const when = (d) => new Date(d).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function Bar({ percent, tone = 'bg-brand-500', className = 'h-1.5' }) {
  return (
    <div className={'w-full rounded-full bg-slate-100 overflow-hidden ' + className}>
      <div className={'h-full rounded-full ' + tone} style={{ width: Math.max(0, Math.min(100, percent)) + '%' }} />
    </div>
  )
}

function Metric({ label, value, hint, tone = 'text-slate-900', onClick, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={'card p-4 text-left transition-shadow hover:shadow-md ' + (active ? 'ring-2 ring-brand-400' : '')}
    >
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={'mt-1 text-2xl font-semibold ' + tone}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400 truncate">{hint}</p>}
    </button>
  )
}

export function SiteSurveyList() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState('pending')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [product, setProduct] = useState('All')
  const [page, setPage] = useState(1)
  useEffect(() => { const t = setTimeout(() => setQuery(search.trim()), 300); return () => clearTimeout(t) }, [search])
  const stats = useFetch('/site-surveys/stats')
  const { data, loading, error } = useFetch('/site-surveys' + qs({ status: filter, q: query, products: product, page }))
  const s = stats.data
  const pick = (key) => { setFilter(key); setPage(1) }
  const { user } = useAuth()
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const exportReport = async () => {
    setExporting(true)
    setExportError('')
    try {
      const [report, { exportSurveyReportPdf }] = await Promise.all([api.get('/site-surveys/report'), import('../reports/surveyReport')])
      await exportSurveyReportPdf({ report, user })
    } catch (err) { setExportError('Could not create the report: ' + err.message) } finally { setExporting(false) }
  }

  const columns = [
    { key: 'job', header: 'Job', render: (r) => (
      <span className="block">
        <span className="block font-medium text-slate-900">{r.installation?.installNo}</span>
        <span className="block text-xs text-slate-500">{r.installation?.client?.name}</span>
      </span>
    ) },
    { key: 'products', header: 'System', render: (r) => <ProductChips products={r.installation?.products} size="xs" /> },
    { key: 'status', header: 'Status', render: (r) => (
      <span className="flex flex-col items-start gap-1">
        <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
        {r.progress?.issues > 0 && <span className="text-[11px] font-medium text-red-600">{r.progress.issues} to act on</span>}
      </span>
    ) },
    { key: 'visit', header: 'Visit', render: (r) => (r.scheduledAt
      ? <span className={isOverdue(r) ? 'text-red-600 font-medium' : ''}>{when(r.scheduledAt)}{isOverdue(r) ? ' · overdue' : ''}</span>
      : <span className="text-slate-400">Not booked</span>) },
    { key: 'surveyor', header: 'Surveyor', render: (r) => r.surveyor?.name || r.installation?.engineer?.name || <span className="text-slate-400">Unassigned</span> },
    { key: 'progress', header: 'Covered', render: (r) => (r.legacy ? (
      <span className="flex items-center gap-2 min-w-[120px]"><Bar percent={100} tone="bg-emerald-500" /><span className="text-xs text-slate-600 w-9 text-right">100%</span></span>
    ) : (
      <span className="block min-w-[120px]">
        <span className="flex items-center gap-2">
          <Bar percent={r.progress?.percent || 0} tone={r.status === 'Completed' ? 'bg-emerald-500' : 'bg-brand-500'} />
          <span className="text-xs text-slate-600 w-9 text-right">{r.progress?.percent || 0}%</span>
        </span>
        <span className="block text-[11px] text-slate-400">{r.photoCount || 0} photo{r.photoCount === 1 ? '' : 's'}</span>
      </span>
    )) },
  ]

  return (
    <>
      <PageHeader title="Site Survey" subtitle="Pre-installation surveys to BS 7671, the IET Codes of Practice and MCS, linked to each job">
        <button type="button" className="btn-primary" disabled={exporting || !s} onClick={exportReport}>
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3" /></svg>
          {exporting ? 'Building report...' : 'Export report'}
        </button>
      </PageHeader>
      <Banner>{stats.error || error}</Banner>
      <Banner onDismiss={() => setExportError('')}>{exportError}</Banner>

      {s && (
        <>
          <div className="grid gap-4 lg:grid-cols-3 mb-4">
            <Card className="lg:col-span-2" title="Survey coverage" subtitle={'Active jobs (not cancelled): ' + s.total + ' · ' + s.photos + ' survey photos'}>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <p className="text-4xl font-semibold text-slate-900">{s.coverage}%<span className="ml-2 text-sm font-normal text-slate-500">surveyed</span></p>
                <p className="text-sm text-slate-500">{s.counts.Completed} done · <span className="font-medium text-slate-800">{s.pending} pending</span></p>
              </div>
              <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
                {['Completed', 'In progress', 'Booked', 'Not started'].map((k) => (
                  <div key={k} className={STATUS_COLOUR[k]} style={{ width: (s.total ? (s.counts[k] / s.total) * 100 : 0) + '%' }} title={k + ': ' + s.counts[k]} />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                {['Completed', 'In progress', 'Booked', 'Not started'].map((k) => (
                  <span key={k} className="inline-flex items-center gap-1.5"><span className={'w-2 h-2 rounded-full ' + STATUS_COLOUR[k]} />{k} {s.counts[k]}</span>
                ))}
              </div>
            </Card>
            <Card title="By product">
              <div className="space-y-3">
                {Object.entries(s.byProduct).filter(([, v]) => v.total).map(([key, v]) => (
                  <div key={key}>
                    <div className="flex justify-between text-sm"><span className="text-slate-700">{productLabel(key)}</span><span className="text-slate-500">{v.completed} / {v.total}</span></div>
                    <Bar percent={v.total ? (v.completed / v.total) * 100 : 0} tone="bg-emerald-500" className="h-2 mt-1" />
                  </div>
                ))}
                {!Object.values(s.byProduct).some((v) => v.total) && <p className="text-sm text-slate-400">No jobs yet.</p>}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
            <Metric label="Not started" value={s.counts['Not started']} hint="No visit booked" onClick={() => pick('Not started')} active={filter === 'Not started'} />
            <Metric label="Booked" value={s.counts.Booked} hint={s.upcoming + ' in the next 7 days'} tone="text-brand-700" onClick={() => pick('Booked')} active={filter === 'Booked'} />
            <Metric label="Overdue" value={s.overdue} hint="Visit date passed" tone={s.overdue ? 'text-red-600' : 'text-slate-900'} onClick={() => pick('overdue')} active={filter === 'overdue'} />
            <Metric label="In progress" value={s.counts['In progress']} hint={'Average ' + s.averageInProgress + '% covered'} tone="text-amber-600" onClick={() => pick('In progress')} active={filter === 'In progress'} />
            <Metric label="Completed" value={s.counts.Completed} hint={s.completedThisMonth + ' this month'} tone="text-emerald-600" onClick={() => pick('Completed')} active={filter === 'Completed'} />
            <Metric label="Needs action" value={s.withIssues} hint="Open surveys with safety issues" tone={s.withIssues ? 'text-red-600' : 'text-slate-900'} onClick={() => pick('pending')} />
          </div>
        </>
      )}

      <Card bodyClass="">
        <div className="flex flex-wrap gap-2 p-4 border-b border-slate-200">
          <div className="inline-flex max-w-full gap-1 p-1 rounded-xl bg-slate-50 overflow-x-auto no-scrollbar">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" onClick={() => pick(f.key)}
                className={'px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap ' + (filter === f.key ? 'bg-brand-500 text-white' : 'text-slate-500 hover:bg-white')}>
                {f.label}
              </button>
            ))}
          </div>
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search customer, address, postcode, job no..." />
          <Select value={product} onChange={(v) => { setProduct(v); setPage(1) }}
            options={[{ value: 'All', label: 'All products' }, ...['ev', 'solar', 'battery'].map((k) => ({ value: k, label: productLabel(k) }))]} />
        </div>
        {loading ? <Loading /> : (
          <Table columns={columns} rows={data?.items || []} onRowClick={(r) => navigate('/site-survey/' + r._id)} empty="No surveys here." />
        )}
        <Pagination page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0} onChange={setPage} />
      </Card>
    </>
  )
}

// --- One survey -------------------------------------------------------------------

export function YesNo({ value, onChange, disabled, expect }) {
  const opts = [['yes', 'Yes'], ['no', 'No'], ['na', 'N/A']]
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
      {opts.map(([v, label]) => {
        const on = value === v
        const bad = on && expect && v !== expect
        return (
          <button key={v} type="button" disabled={disabled} onClick={() => onChange(on ? '' : v)}
            className={'px-3 py-1 text-xs font-medium rounded-md transition-colors disabled:cursor-not-allowed ' +
              (on ? (bad ? 'bg-red-500 text-white' : v === 'yes' ? 'bg-emerald-500 text-white' : 'bg-slate-600 text-white') : 'text-slate-500 hover:bg-white')}>
            {label}
          </button>
        )
      })}
    </div>
  )
}

export function SurveyItem({ item, value, onChange, disabled, issueText = "Needs action before installation -- record what's needed in the notes." }) {
  const issue = item.expect && value && value !== item.expect
  const set = (e) => onChange(e.target.value)
  let control
  if (item.type === 'yesno') control = <YesNo value={value} onChange={onChange} disabled={disabled} expect={item.expect} />
  else if (item.type === 'select') {
    control = (
      <select className="input" value={value ?? ''} onChange={set} disabled={disabled}>
        <option value="">--</option>
        {item.options.map((o) => <option key={o}>{o}</option>)}
      </select>
    )
  } else if (item.type === 'textarea') control = <textarea className="input min-h-[70px]" value={value ?? ''} onChange={set} disabled={disabled} />
  else if (item.type === 'date') control = <input className="input" type="date" value={value ?? ''} onChange={set} disabled={disabled} />
  else {
    control = (
      <div className="relative">
        <input className={'input ' + (item.unit ? 'pr-12' : '')} type={item.type === 'number' ? 'number' : 'text'} step="any" value={value ?? ''} onChange={set} disabled={disabled} />
        {item.unit && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{item.unit}</span>}
      </div>
    )
  }
  const inline = item.type === 'yesno'
  return (
    <div className={'rounded-xl px-3 py-2.5 ' + (issue ? 'bg-red-50 ring-1 ring-red-200' : 'bg-slate-50/70')}>
      <div className={inline ? 'flex flex-wrap items-center justify-between gap-2' : ''}>
        <label className={'block text-sm text-slate-700 ' + (inline ? '' : 'mb-1.5')}>
          {item.label}{item.required && <span className="text-red-500"> *</span>}
        </label>
        {control}
      </div>
      {item.help && <p className="mt-1 text-[11px] text-slate-400">{item.help}</p>}
      {issue && <p className="mt-1.5 text-xs font-medium text-red-700">{issueText}</p>}
    </div>
  )
}

function PhotoSlot({ slot, photos, locked, canAdd, onAdd, busy, onDeleted }) {
  const has = photos.length > 0
  return (
    <div className={'rounded-xl p-3 ring-1 ' + (has ? 'ring-emerald-200 bg-emerald-50/40' : 'ring-slate-200 bg-white')}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-sm text-slate-700">
          <span className={'mr-1.5 ' + (has ? 'text-emerald-600' : 'text-slate-300')}>{has ? '✓' : '○'}</span>
          {slot.label}<span className="text-red-500"> *</span>
        </p>
        {!locked && canAdd && <AddPhotosButton small label={has ? 'Add more' : 'Take photo'} busy={busy} onFiles={onAdd} />}
      </div>
      {has && <PhotoGrid photos={photos} locked={locked} onDeleted={onDeleted} />}
    </div>
  )
}

export function SiteSurveyEditor() {
  const { id } = useParams()
  const { can } = useAuth()
  const [survey, setSurvey] = useState(null)
  const [answers, setAnswers] = useState({})
  const [notes, setNotes] = useState('')
  const [photos, setPhotos] = useState([])
  const [booking, setBooking] = useState({ scheduledAt: '', surveyor: '' })
  const [saveState, setSaveState] = useState('') // '', 'saving', 'saved'
  const [busySlot, setBusySlot] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const pending = useRef({})
  const timer = useRef(null)
  const engineers = useFetch('/engineers?limit=200')

  const apply = (s) => {
    setSurvey(s)
    setAnswers(s.answers || {})
    setNotes(s.notes || '')
    setBooking({ scheduledAt: s.scheduledAt ? toLocalInput(s.scheduledAt) : '', surveyor: s.surveyor?._id || '' })
  }
  const loadPhotos = (installationId) => api.get('/photos?installation=' + installationId + '&stage=survey').then((r) => setPhotos(r.items))
  useEffect(() => {
    api.get('/site-surveys/' + id).then((s) => { apply(s); return loadPhotos(s.installation._id) }).catch((err) => setError(err.message))
    return () => clearTimeout(timer.current)
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const job = survey?.installation
  const products = normaliseProducts(job?.products)
  const sections = useMemo(() => surveySectionsFor(products), [products.join()]) // eslint-disable-line react-hooks/exhaustive-deps
  const slots = useMemo(() => new Set(photos.filter((p) => p.slot).map((p) => p.slot)), [photos])
  const progress = surveyProgressOf(products, answers, slots)
  const locked = survey?.status === 'Completed'
  const canEdit = can('siteSurveys', 'update') && !locked
  const canAddPhotos = can('photos', 'create')
  const canComplete = can('installationProgress', 'update')

  // Answers save themselves a moment after the last change.
  const flush = async () => {
    const changes = pending.current
    pending.current = {}
    if (!Object.keys(changes).length) return
    setSaveState('saving')
    try {
      const { answers: a, notes: n, ...rest } = changes
      const s = await api.put('/site-surveys/' + id, { ...(a && { answers: a }), ...(n !== undefined && { notes: n }), ...rest })
      setSurvey(s)
      setSaveState('saved')
    } catch (err) { setError(err.message); setSaveState('') }
  }
  const queue = (patch) => {
    pending.current = {
      ...pending.current,
      ...patch,
      ...(patch.answers && { answers: { ...(pending.current.answers || {}), ...patch.answers } }),
    }
    setSaveState('saving')
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, 700)
  }
  const setAnswer = (key, value) => {
    setAnswers((a) => ({ ...a, [key]: value }))
    queue({ answers: { [key]: value } })
  }

  const addPhotos = async (slot, files) => {
    setBusySlot(slot || 'extra')
    setError('')
    try {
      await uploadPhotos(files, { installation: job._id, stage: 'survey', slot })
      await loadPhotos(job._id)
      setSurvey(await api.get('/site-surveys/' + id))
    } catch (err) { setError(err.message) } finally { setBusySlot(null) }
  }
  const photosChanged = async () => { await loadPhotos(job._id); setSurvey(await api.get('/site-surveys/' + id)) }

  const saveBooking = async () => {
    setError('')
    try {
      await flush()
      const s = await api.put('/site-surveys/' + id, { scheduledAt: booking.scheduledAt ? new Date(booking.scheduledAt).toISOString() : null, surveyor: booking.surveyor || null })
      setSurvey(s)
      setNotice('Survey visit saved.')
    } catch (err) { setError(err.message) }
  }

  const complete = async () => {
    setError('')
    try {
      clearTimeout(timer.current)
      await flush()
      const s = await api.post('/site-surveys/' + id + '/complete')
      apply(s)
      setNotice('Survey completed. The job\'s "Site / roof survey" step is now ticked.')
    } catch (err) { setError(err.message) }
  }

  const downloadPdf = async () => {
    setExporting(true)
    setError('')
    try {
      await flush()
      const { exportSurveyPdf } = await import('../reports/survey')
      await exportSurveyPdf({ survey: { ...survey, answers, notes }, photos })
    } catch (err) { setError('Could not create the PDF: ' + err.message) } finally { setExporting(false) }
  }

  if (error && !survey) return <Banner>{error}</Banner>
  if (!survey) return <Loading />

  const address = [job.address || job.client?.address, job.postcode || job.client?.postcode].filter(Boolean).join(', ')
  const other = photos.filter((p) => !p.slot)
  const sectionProgress = Object.fromEntries(progress.sections.map((s) => [s.key, s]))

  return (
    <>
      <PageHeader title={'Site survey · ' + job.installNo} subtitle={[job.client?.name, address].filter(Boolean).join(' · ')}>
        <Link to="/site-survey" className="btn-secondary">Back</Link>
        <Link to={'/installations/' + job._id} className="btn-secondary">Open job</Link>
        {!survey.legacy && (
          <button type="button" className={locked ? 'btn-primary' : 'btn-secondary'} disabled={exporting} onClick={downloadPdf}
            title={locked ? 'Download the completed survey' : 'Download a draft (marked DRAFT)'}>
            {exporting ? 'Building PDF...' : locked ? 'Download PDF' : 'Download draft PDF'}
          </button>
        )}
      </PageHeader>
      <Banner onDismiss={() => setError('')}>{error}</Banner>
      <Banner kind="success" onDismiss={() => setNotice('')}>{notice}</Banner>

      {/* Summary: how much is covered, and completing it. */}
      <div className="card p-4 sm:p-5 mb-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <Badge tone={STATUS_TONE[survey.status]}>{survey.status}</Badge>
            <ProductChips products={products} size="xs" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>{progress.done} of {progress.total} required items and photos</span>
              <span className="font-semibold text-slate-800">{survey.legacy ? '100%' : progress.percent + '%'}</span>
            </div>
            <Bar percent={survey.legacy ? 100 : progress.percent} tone={locked ? 'bg-emerald-500' : 'bg-brand-500'} className="h-2.5" />
          </div>
          <div className="text-xs text-slate-500 w-20 text-right">
            {saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? 'All saved' : ''}
          </div>
          {!locked && canComplete && (
            <button type="button" className="btn-primary" disabled={progress.missing.length > 0 || job.status === 'On Hold'} onClick={complete}
              title={progress.missing.length ? progress.missing.length + ' required items left' : 'Complete the survey'}>
              Complete survey
            </button>
          )}
        </div>
        {progress.issues.length > 0 && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            <span className="font-semibold">{progress.issues.length} item{progress.issues.length === 1 ? '' : 's'} need action:</span> {progress.issues.map((i) => i.label).join('; ')}
          </p>
        )}
        {locked && (
          <p className="mt-3 text-xs text-slate-500">
            {survey.legacy ? 'Survey completed. No checklist is on file for this job.' : 'Completed ' + shortDate(survey.completedAt) + (survey.completedBy ? ' by ' + survey.completedBy : '') + '. The survey is locked.'}
          </p>
        )}
        {!locked && job.status === 'On Hold' && <p className="mt-3 text-xs text-slate-500">The job is on hold, so the survey can't be completed until it's resumed.</p>}
        {!locked && !canComplete && <p className="mt-3 text-xs text-slate-500">An engineer completes the survey once everything is filled in.</p>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        {/* Section list with each one's progress. */}
        <nav className="hidden lg:block">
          <div className="card p-2 sticky top-0">
            {sections.map((s) => {
              const p = sectionProgress[s.key]
              const full = p && p.done === p.total
              return (
                <a key={s.key} href={'#survey-' + s.key} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                  <span className="truncate">{s.title}</span>
                  <span className={'text-xs ' + (full ? 'text-emerald-600 font-semibold' : 'text-slate-400')}>{full ? '✓' : p.done + '/' + p.total}</span>
                </a>
              )
            })}
            <a href="#survey-visit" className="block rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">Visit & notes</a>
          </div>
        </nav>

        <div className="space-y-4 min-w-0">
          <Card title="Survey visit" subtitle="Book the visit and who's doing it" className="scroll-mt-4">
            <div id="survey-visit" className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
              <label className="block">
                <span className="label">Date and time</span>
                <input className="input" type="datetime-local" value={booking.scheduledAt} disabled={!canEdit} onChange={(e) => setBooking({ ...booking, scheduledAt: e.target.value })} />
              </label>
              <label className="block">
                <span className="label">Surveyor</span>
                <select className="input" value={booking.surveyor} disabled={!canEdit} onChange={(e) => setBooking({ ...booking, surveyor: e.target.value })}>
                  <option value="">{job.engineer?.name ? 'Job engineer (' + job.engineer.name + ')' : 'Unassigned'}</option>
                  {(engineers.data?.items || []).map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
                </select>
              </label>
              {canEdit && <button type="button" className="btn-secondary" onClick={saveBooking}>Save visit</button>}
            </div>
            {survey.scheduledAt && <p className={'mt-2 text-xs ' + (isOverdue(survey) ? 'text-red-600' : 'text-slate-500')}>Booked for {when(survey.scheduledAt)}{isOverdue(survey) ? ' -- overdue' : ''}</p>}
          </Card>

          {sections.map((section) => {
            const p = sectionProgress[section.key]
            return (
              <section key={section.key} id={'survey-' + section.key} className="card scroll-mt-4">
                <header className="flex flex-wrap items-start justify-between gap-2 px-5 pt-4 pb-3 border-b border-slate-100">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-slate-800">{section.title}</h2>
                    <p className="text-[11px] text-slate-400 mt-0.5">{section.reference}</p>
                  </div>
                  <span className={'text-xs font-medium ' + (p.done === p.total ? 'text-emerald-600' : 'text-slate-500')}>{p.done}/{p.total}</span>
                </header>
                <div className="p-4 sm:p-5 space-y-2">
                  {section.items.map((item) => (
                    <SurveyItem key={item.key} item={item} value={answers[item.key]} disabled={!canEdit} onChange={(v) => setAnswer(item.key, v)} />
                  ))}
                  {section.photos.length > 0 && (
                    <div className="grid gap-2 pt-2 sm:grid-cols-2">
                      {section.photos.map((slot) => (
                        <PhotoSlot key={slot.key} slot={slot} photos={photos.filter((ph) => ph.slot === slot.key)} locked={locked}
                          canAdd={canAddPhotos} busy={busySlot === slot.key} onAdd={(files) => addPhotos(slot.key, files)} onDeleted={photosChanged} />
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )
          })}

          <Card title="Other photos & notes" subtitle="Anything else worth recording on the visit">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-sm text-slate-600">Other photos ({other.length})</p>
              {!locked && canAddPhotos && <AddPhotosButton small busy={busySlot === 'extra'} onFiles={(files) => addPhotos('', files)} />}
            </div>
            <PhotoGrid photos={other} locked={locked} onDeleted={photosChanged} empty="None added." />
            <label className="block mt-4">
              <span className="label">Survey notes</span>
              <textarea className="input min-h-[90px]" value={notes} disabled={!canEdit}
                onChange={(e) => { setNotes(e.target.value); queue({ notes: e.target.value }) }} />
            </label>
          </Card>
        </div>
      </div>
    </>
  )
}

/** A date as the value of a datetime-local input (local time). */
function toLocalInput(value) {
  const d = new Date(value)
  const pad = (n) => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}
