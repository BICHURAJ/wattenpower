import { Link } from 'react-router-dom'
import { Card } from './ui'
import { RATE_TONES } from './EngineerPerformance'

// Overview: installations, site surveys and engineers at a glance, from the
// same endpoints as their own pages and reports. Each panel only shows for
// people who can see that area (the data is null otherwise).

const TEXT = { good: 'text-emerald-600', ok: 'text-amber-600', bad: 'text-red-600' }
const tone = (key, v) => TEXT[RATE_TONES[key]?.(v)] || 'text-slate-900'
const pct = (v) => (v == null ? '--' : v + '%')

function Row({ label, value, className = 'text-slate-900', to }) {
  const body = (
    <>
      <span className="text-slate-500">{label}</span>
      <span className={'font-semibold ' + className}>{value}</span>
    </>
  )
  return to
    ? <Link to={to} className="flex items-center justify-between py-1.5 text-sm hover:bg-slate-50 -mx-2 px-2 rounded-lg">{body}</Link>
    : <div className="flex items-center justify-between py-1.5 text-sm">{body}</div>
}

function Headline({ value, label, className = 'text-slate-900' }) {
  return (
    <p className={'text-3xl font-semibold tracking-tight ' + className}>
      {value}<span className="ml-2 text-xs font-normal text-slate-400">{label}</span>
    </p>
  )
}

function StackBar({ parts }) {
  const total = parts.reduce((n, p) => n + p.value, 0) || 1
  return (
    <>
      <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
        {parts.map((p) => <div key={p.label} className={p.colour} style={{ width: (p.value / total) * 100 + '%' }} title={p.label + ': ' + p.value} />)}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
        {parts.map((p) => <span key={p.label} className="inline-flex items-center gap-1"><span className={'w-2 h-2 rounded-full ' + p.colour} />{p.label} {p.value}</span>)}
      </div>
    </>
  )
}

const ViewAll = ({ to }) => <Link to={to} className="text-xs font-medium text-brand-600 hover:underline">View all</Link>

export default function OverviewAnalytics({ installs, surveys, engineers }) {
  if (!installs && !surveys && !engineers) return null
  const panels = [installs, surveys, engineers].filter(Boolean).length
  return (
    <div className={'grid gap-4 ' + (panels === 3 ? 'lg:grid-cols-3' : panels === 2 ? 'lg:grid-cols-2' : '')}>
      {installs && (() => {
        const s = installs.stats
        return (
          <Card title="Installations" subtitle="Jobs in progress and delivery" action={<ViewAll to="/installations" />}>
            <Headline value={s.completionRate + '%'} label={'completed · ' + s.completedThisMonth + ' this month'} className="text-emerald-600" />
            <StackBar parts={[
              { label: 'Completed', value: s.statusCounts.Completed || 0, colour: 'bg-emerald-500' },
              { label: 'In progress', value: s.statusCounts['In Progress'] || 0, colour: 'bg-amber-400' },
              { label: 'Scheduled', value: s.statusCounts.Scheduled || 0, colour: 'bg-brand-400' },
              { label: 'On hold', value: s.statusCounts['On Hold'] || 0, colour: 'bg-slate-400' },
            ]} />
            <div className="mt-3 divide-y divide-slate-100">
              <Row label="Overdue (install date passed)" value={s.overdue} className={s.overdue ? 'text-red-600' : 'text-slate-900'} to="/installations" />
              <Row label="Awaiting handover" value={s.awaitingHandover} className={s.awaitingHandover ? 'text-amber-600' : 'text-slate-900'} />
              <Row label={'DNO approval pending' + (s.dnoLongestWait != null ? ' (longest ' + s.dnoLongestWait + ' d)' : '')} value={s.dnoPending ?? 0} className={s.dnoPending ? 'text-amber-600' : 'text-slate-900'} to="/installations" />
              <Row label="Installs in the next 14 days" value={s.upcoming} />
              <Row label="Avg days to complete" value={s.averageDaysToComplete ?? '--'} />
            </div>
          </Card>
        )
      })()}

      {surveys && (
        <Card title="Site surveys" subtitle="Pre-installation survey coverage" action={<ViewAll to="/site-survey" />}>
          <Headline value={surveys.coverage + '%'} label={'surveyed · ' + surveys.pending + ' pending'} className="text-brand-700" />
          <StackBar parts={[
            { label: 'Completed', value: surveys.counts.Completed, colour: 'bg-emerald-500' },
            { label: 'In progress', value: surveys.counts['In progress'], colour: 'bg-amber-400' },
            { label: 'Booked', value: surveys.counts.Booked, colour: 'bg-brand-400' },
            { label: 'Not started', value: surveys.counts['Not started'], colour: 'bg-slate-300' },
          ]} />
          <div className="mt-3 divide-y divide-slate-100">
            <Row label="Overdue visits" value={surveys.overdue} className={surveys.overdue ? 'text-red-600' : 'text-slate-900'} to="/site-survey" />
            <Row label="Needs action (safety issues)" value={surveys.withIssues} className={surveys.withIssues ? 'text-red-600' : 'text-slate-900'} />
            <Row label="Visits in the next 7 days" value={surveys.upcoming} />
            <Row label="In progress, average covered" value={surveys.averageInProgress + '%'} />
          </div>
        </Card>
      )}

      {engineers && (() => {
        const t = engineers.team
        const attention = engineers.engineers.reduce((n, e) => n + e.certificationsExpired.length + e.certificationsExpiring.length, 0)
        return (
          <Card title="Engineers" subtitle={t.engineers + ' engineers · performance'} action={<ViewAll to="/engineers" />}>
            <Headline value={pct(t.onTimeRate)} label="on time" className={tone('onTimeRate', t.onTimeRate)} />
            <div className="mt-3 space-y-1.5">
              {[...engineers.engineers].sort((a, b) => b.completed - a.completed).slice(0, 4).map((e) => (
                <div key={e.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 min-w-0 truncate text-slate-700">{e.name}</span>
                  <span className="text-xs text-slate-400 w-16 text-right">{e.active} active</span>
                  <span className={'w-12 text-right text-xs font-semibold ' + tone('onTimeRate', e.onTimeRate)}>{pct(e.onTimeRate)}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 divide-y divide-slate-100">
              <Row label="Completed this month" value={t.completedThisMonth} />
              <Row label="Callbacks after completion" value={pct(t.callbackRate)} className={tone('callbackRate', t.callbackRate)} />
              <Row label="Certifications to renew" value={attention} className={attention ? 'text-amber-600' : 'text-slate-900'} to="/engineers" />
            </div>
          </Card>
        )
      })()}
    </div>
  )
}
