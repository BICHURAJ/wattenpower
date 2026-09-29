import { Card, Table, Badge, Loading, Banner } from './ui'
import { shortDate } from '../api'

// Engineers > Performance: team figures and a side-by-side comparison, from
// GET /engineers/report. Colours follow simple thresholds (RATE_TONES) so a
// figure that needs attention stands out; the definitions are shown below.

/** Tone for a figure: 'good' | 'ok' | 'bad' | null (no data). */
export const RATE_TONES = {
  onTimeRate: (v) => (v == null ? null : v >= 90 ? 'good' : v >= 75 ? 'ok' : 'bad'),
  callbackRate: (v) => (v == null ? null : v <= 5 ? 'good' : v <= 15 ? 'ok' : 'bad'),
  handoverRate: (v) => (v == null ? null : v >= 90 ? 'good' : v >= 60 ? 'ok' : 'bad'),
  photoRate: (v) => (v == null ? null : v >= 90 ? 'good' : v >= 60 ? 'ok' : 'bad'),
  overdue: (v) => (v ? 'bad' : 'good'),
  load: (v) => (v == null ? null : v > 1 ? 'bad' : v > 0.7 ? 'ok' : 'good'),
}
const TEXT = { good: 'text-emerald-600', ok: 'text-amber-600', bad: 'text-red-600' }
const tone = (key, v) => TEXT[RATE_TONES[key]?.(v)] || 'text-slate-400'
const pctLabel = (v) => (v == null ? '--' : v + '%')

export const DEFINITIONS = [
  ['On time', 'completed no later than the day after the install date'],
  ['Callbacks', 'completed jobs that later had a support ticket'],
  ['Handover', 'completed jobs with a handover record'],
  ['Photos', 'completed jobs with at least one completion photo'],
  ['Load', 'installs in the next 14 days per working day (weekly schedule less time off)'],
]

function Trend({ values }) {
  const max = Math.max(1, ...values)
  return (
    <span className="inline-flex items-end gap-0.5 h-5" title={'Completed per month: ' + values.join(', ')}>
      {values.map((v, i) => <span key={i} className="w-1.5 rounded-sm bg-brand-400" style={{ height: Math.max(2, (v / max) * 20) + 'px' }} />)}
    </span>
  )
}

function Tile({ label, value, hint, className = 'text-slate-900' }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={'mt-1 text-2xl font-semibold ' + className}>{value}</p>
      <p className="mt-1 text-xs text-slate-400 truncate">{hint}</p>
    </div>
  )
}

export default function EngineerPerformance({ report, loading, error }) {
  if (loading) return <Loading />
  if (error) return <Banner>{error}</Banner>
  if (!report) return null
  const t = report.team

  const columns = [
    { key: 'name', header: 'Engineer', render: (e) => (
      <span className="block">
        <span className="block font-medium text-slate-900">{e.name}</span>
        <span className="block text-xs text-slate-400">{[e.role, e.area].filter(Boolean).join(' · ')}</span>
      </span>
    ) },
    { key: 'workload', header: 'Workload', render: (e) => (
      <span className="block text-sm">
        {e.active} active{e.onHold ? ' · ' + e.onHold + ' on hold' : ''}
        <span className={'block text-xs ' + tone('load', e.load)}>{e.upcoming} in 14 days / {e.workingDays ?? '--'} working days</span>
      </span>
    ) },
    { key: 'completed', header: 'Completed', render: (e) => (
      <span className="flex items-center gap-3">
        <span><span className="font-semibold text-slate-900">{e.completed}</span><span className="block text-xs text-slate-400">{e.completedThisMonth} this month</span></span>
        <Trend values={e.trend} />
      </span>
    ) },
    { key: 'onTime', header: 'On time', render: (e) => (
      <span className="block">
        <span className={'font-semibold ' + tone('onTimeRate', e.onTimeRate)}>{pctLabel(e.onTimeRate)}</span>
        <span className="block text-xs text-slate-400">{e.averageDaysToComplete != null ? 'avg ' + e.averageDaysToComplete + ' d' : ''}</span>
      </span>
    ) },
    { key: 'callbacks', header: 'Callbacks', render: (e) => <span className={'font-semibold ' + tone('callbackRate', e.callbackRate)}>{pctLabel(e.callbackRate)}</span> },
    { key: 'handover', header: 'Handover · photos', render: (e) => (
      <span className="block">
        <span className={tone('handoverRate', e.handoverRate)}>{pctLabel(e.handoverRate)}</span>
        <span className="text-slate-300"> · </span>
        <span className={tone('photoRate', e.photoRate)}>{pctLabel(e.photoRate)}</span>
      </span>
    ) },
    { key: 'surveys', header: 'Surveys', render: (e) => (
      <span className="block">{e.surveysCompleted}<span className="block text-xs text-slate-400">{e.averageSurveyDays != null ? 'avg ' + e.averageSurveyDays + ' d' : ''}</span></span>
    ) },
    { key: 'attention', header: 'Needs attention', render: (e) => {
      const flags = [
        e.overdue > 0 && <Badge key="o" tone="red">{e.overdue} overdue</Badge>,
        e.openTickets > 0 && <Badge key="t" tone="amber">{e.openTickets} open ticket{e.openTickets === 1 ? '' : 's'}</Badge>,
        e.certificationsExpired.length > 0 && <Badge key="x" tone="red">{e.certificationsExpired.length} cert expired</Badge>,
        e.certificationsExpiring.length > 0 && <Badge key="s" tone="amber">{e.certificationsExpiring.length} cert expiring</Badge>,
      ].filter(Boolean)
      return flags.length ? <span className="flex flex-wrap gap-1">{flags}</span> : <span className="text-xs text-emerald-600">All clear</span>
    } },
  ]

  const compliance = report.engineers.flatMap((e) => [
    ...e.certificationsExpired.map((c) => ({ engineer: e.name, ...c, expired: true })),
    ...e.certificationsExpiring.map((c) => ({ engineer: e.name, ...c, expired: false })),
  ])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <Tile label="Completed this month" value={t.completedThisMonth} hint={t.completed + ' completed in total'} />
        <Tile label="On time" value={pctLabel(t.onTimeRate)} hint="Done by the day after the install date" className={tone('onTimeRate', t.onTimeRate)} />
        <Tile label="Avg days to complete" value={t.averageDaysToComplete ?? '--'} hint="Install date to completion, 6 months" />
        <Tile label="Callbacks" value={pctLabel(t.callbackRate)} hint="Jobs with a ticket after completion" className={tone('callbackRate', t.callbackRate)} />
        <Tile label="Handover recorded" value={pctLabel(t.handoverRate)} hint={'Photos on ' + pctLabel(t.photoRate) + ' of completed jobs'} className={tone('handoverRate', t.handoverRate)} />
        <Tile label="Overdue jobs" value={t.overdue} hint={report.unassigned.active + ' active jobs unassigned'} className={tone('overdue', t.overdue)} />
      </div>

      <Card title="Performance by engineer" subtitle={'Last 6 months trend: ' + report.months[0] + ' to ' + report.months[report.months.length - 1]} bodyClass="">
        <Table columns={columns} rows={report.engineers} empty="No engineers yet." />
      </Card>

      {compliance.length > 0 && (
        <Card title="Certifications to renew" subtitle="Expired, or expiring in the next 60 days">
          <ul className="divide-y divide-slate-100 text-sm">
            {compliance.map((c, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><span className="font-medium text-slate-800">{c.engineer}</span> · {c.name}</span>
                <Badge tone={c.expired ? 'red' : 'amber'}>{c.expired ? 'Expired ' : 'Expires '}{shortDate(c.expiryDate)}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="text-xs text-slate-400">
        {DEFINITIONS.map(([k, v]) => <span key={k} className="mr-3"><span className="font-medium text-slate-500">{k}:</span> {v}.</span>)}
      </p>
    </div>
  )
}
