import { useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { money, qs, shortDate, timeAgo } from '../api'
import { availabilityOn, localDayKey } from '../availability'
import { useAuth } from '../auth'
import { Card, StatCard, Badge, Loading, Banner, useFetch } from '../components/ui'
import { summarise, exportOverviewPdf } from '../reports/overview'
import InstallationMap, { useInstallationLocations, pinColour, phaseOf, progressOf, LEGEND_COLOURS } from '../components/InstallationMap'

const ICONS = {
  clients: 'M16 21v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  quotes: 'M6 2h9l5 5v15H6V2Zm9 0v5h5',
  installs: 'M13 2 3 14h8l-1 8 10-12h-8l1-8Z',
  tickets: 'M18 8a6 6 0 1 0-12 0v5l-2 3h16l-2-3V8Z',
  completed: 'M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14l-3-3',
}

const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '—'

const ACTIVITY_VISIBLE = 10

/**
 * The activity timeline: shows the first 10 entries, then scrolls. The height
 * is measured from the 10th entry, since entries wrap to different heights.
 */
function ActivityList({ items, showWho }) {
  const listRef = useRef(null)
  const [maxHeight, setMaxHeight] = useState(null)

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list || items.length <= ACTIVITY_VISIBLE) { setMaxHeight(null); return }
    const measure = () => {
      const last = list.children[ACTIVITY_VISIBLE - 1]
      if (last) setMaxHeight(last.offsetTop + last.offsetHeight)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [items])

  return (
    <div
      className={maxHeight ? 'overflow-y-auto pr-1 -mr-1 overscroll-contain' : ''}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <ol ref={listRef} className="relative border-l border-slate-100 ml-1">
        {items.map((item) => (
          <li key={item._id} className="relative pl-5 pb-4 last:pb-1">
            <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-white ring-2 ring-brand-400" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-slate-700">{item.text}</p>
                {item.by && showWho && <p className="text-xs text-slate-400 mt-0.5">by {item.by}</p>}
              </div>
              <span className="text-xs text-slate-400 whitespace-nowrap">{timeAgo(item.createdAt)}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function ViewAll({ to }) {
  return (
    <Link to={to} className="icon-btn" title="View all">
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8" /></svg>
    </Link>
  )
}

// Rounds an axis ceiling up to something a person would write on a whiteboard.
function niceCeil(value) {
  if (value <= 0) return 1
  const pow = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow >= value)
  return step * pow
}

function BarChart({ data, format }) {
  const max = niceCeil(Math.max(...data.map((d) => d.value), 0))
  const peak = data.reduce((best, d) => (d.value > (best?.value ?? -1) ? d : best), null)
  const ticks = [1, 0.66, 0.33, 0].map((f) => max * f)

  return (
    <div className="flex gap-3 h-56">
      <div className="flex flex-col justify-between pb-6 text-[11px] text-slate-400 text-right w-12 shrink-0">
        {ticks.map((t) => <span key={t}>{format(t)}</span>)}
      </div>
      <div className="flex-1 flex items-end justify-around gap-2">
        {data.map((d) => {
          const pct = max ? (d.value / max) * 100 : 0
          const isPeak = d === peak && d.value > 0
          return (
            <div key={d.label} className="flex flex-col items-center h-full w-full max-w-[44px] group">
              <div className="relative flex-1 w-full rounded-full bg-brand-50 overflow-visible">
                <div
                  className={'absolute bottom-0 inset-x-0 rounded-full transition-all duration-500 ' + (isPeak ? 'bg-brand-500' : 'bg-brand-400/80 group-hover:bg-brand-500')}
                  style={{ height: Math.max(pct, d.value ? 6 : 0) + '%' }}
                >
                  <span className={'absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium text-brand-600 ' +
                    (isPeak ? '' : 'opacity-0 group-hover:opacity-100 transition-opacity')}>
                    {format(d.value)}
                  </span>
                  {isPeak && <span className="absolute top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-white ring-2 ring-brand-500" />}
                </div>
              </div>
              <span className="mt-2 text-[11px] text-slate-400">{d.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Donut({ percent, label }) {
  const r = 52
  const c = 2 * Math.PI * r
  return (
    <div className="relative w-44 h-44 mx-auto">
      <svg viewBox="0 0 128 128" className="w-full h-full -rotate-90">
        <circle cx="64" cy="64" r={r} fill="none" strokeWidth="14" className="stroke-brand-100" />
        <circle
          cx="64" cy="64" r={r} fill="none" strokeWidth="14" strokeLinecap="round"
          className="stroke-brand-500 transition-all duration-700"
          strokeDasharray={c} strokeDashoffset={c * (1 - percent / 100)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-3xl font-semibold tracking-tight text-slate-900">{percent.toFixed(1)}%</p>
          <p className="text-xs text-slate-400">{label}</p>
        </div>
      </div>
    </div>
  )
}

// Who can and can't be booked on each of the next seven days.
function buildAvailability(engineers, days = 7) {
  const start = new Date()
  start.setHours(12, 0, 0, 0) // midday, so DST changes never skip or repeat a day
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(start)
    date.setDate(start.getDate() + i)
    const rows = engineers.map((engineer) => ({ engineer, info: availabilityOn(engineer, date) }))
    return {
      key: localDayKey(date),
      label: i === 0 ? 'Today' : date.toLocaleDateString('en-GB', { weekday: 'short' }),
      dateLabel: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      available: rows.filter((r) => r.info.working),
      unavailable: rows.filter((r) => !r.info.working),
    }
  })
}

// One solid bar per day: blue fills up to the share of engineers available,
// the pale track above it is those who aren't. Hover to see who's in.
function AvailabilityChart({ days, total }) {
  return (
    <div>
      <div className="flex items-center gap-4 mb-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-brand-500" />Available</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-brand-50 ring-1 ring-inset ring-brand-200" />Not available</span>
      </div>
      <div className="flex items-end justify-around gap-2 h-56">
        {days.map((d, i) => {
          const pct = total ? (d.available.length / total) * 100 : 0
          return (
            <div key={d.key} className="relative flex flex-col items-center h-full w-full max-w-[48px] group">
              <span className={'mb-1.5 text-[11px] font-semibold ' + (d.available.length === total ? 'text-brand-600' : 'text-slate-500')}>
                {d.available.length}/{total}
              </span>
              <div className="relative flex-1 w-full rounded-full bg-brand-50 cursor-default">
                <div
                  className="absolute bottom-0 inset-x-0 rounded-full bg-brand-500 group-hover:bg-brand-600 transition-all duration-500"
                  style={{ height: pct + '%' }}
                />
              </div>
              <span className={'mt-2 text-[11px] ' + (d.label === 'Today' ? 'font-semibold text-brand-600' : 'text-slate-500')}>{d.label}</span>
              <span className="text-[10px] text-slate-400">{d.dateLabel}</span>

              {/* Hover: who is available that day */}
              {/* Hidden (display: none) until hover, so it never widens the page; edge days open inwards. */}
              <div className={'pointer-events-none absolute bottom-full mb-1 z-20 w-56 max-w-[80vw] rounded-xl bg-slate-900 text-white p-3 shadow-lg hidden group-hover:block ' +
                (i <= 1 ? 'left-0' : i >= days.length - 2 ? 'right-0' : 'left-1/2 -translate-x-1/2')}>
                <p className="text-xs font-semibold">{d.label === 'Today' ? 'Today' : d.label + ' ' + d.dateLabel}</p>
                <p className="mt-2 mb-1 text-[10px] font-medium uppercase tracking-wider text-brand-300">Available · {d.available.length}</p>
                {d.available.length === 0 && <p className="text-[11px] text-white/60">No one available.</p>}
                {d.available.map(({ engineer, info }) => (
                  <p key={engineer._id} className="flex items-center gap-1.5 text-[11px] text-white py-0.5">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-brand-400" />
                    <span className="truncate">{engineer.name}</span>
                    <span className="ml-auto text-white/60 whitespace-nowrap">{info.start}–{info.end}</span>
                  </p>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Screen 2: Dashboard (Overview)
export default function Dashboard() {
  const { data, loading, error } = useFetch('/dashboard')
  // The charts are a bonus -- if the reports call fails the dashboard still renders.
  const { data: reports } = useFetch('/dashboard/reports')
  // Also optional: without it the availability card just shows an empty state.
  const { data: engineerData } = useFetch('/engineers' + qs({ limit: 200 }))
  const { data: installData } = useFetch('/installations' + qs({ limit: 200 }))
  const [mapFilter, setMapFilter] = useState('Active')
  const { user, can } = useAuth()
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  // Where each installation is, for the map in the exported PDF (postcode lookups are cached, so this is cheap).
  const { locations } = useInstallationLocations(installData?.items || [])

  if (loading) return <Loading label="Loading dashboard..." />
  if (error) return <Banner>{error}</Banner>

  const { stats, activities, upcoming, expiring } = data

  const { byValue, pipeline, pipelineTotal, installTotal, completed, active, completedPct, tickets, ticketTotal, acceptedValue } = summarise(data, reports)
  const engineers = engineerData?.items || []
  const allInstalls = installData?.items || []
  const MAP_FILTERS = {
    Active: (i) => ['Scheduled', 'In Progress', 'On Hold'].includes(i.status),
    Completed: (i) => i.status === 'Completed',
    All: () => true,
  }
  const mapInstalls = allInstalls.filter(MAP_FILTERS[mapFilter])
  const availabilityDays = buildAvailability(engineers)
  const inToday = availabilityDays[0].available
  const offToday = availabilityDays[0].unavailable
  const fmt = byValue ? (v) => (v >= 1000 ? '£' + Math.round(v / 100) / 10 + 'k' : money(v).replace(/\.00$/, '')) : (v) => String(Math.round(v))

  // The map section of the PDF: the jobs shown on the Overview map, one pin per address.
  const pdfMap = () => {
    const groups = new Map()
    let unplaced = 0
    for (const inst of mapInstalls) {
      const where = locations.get(inst._id)
      if (!where) { unplaced++; continue }
      const key = where.lat.toFixed(5) + ',' + where.lng.toFixed(5)
      if (!groups.has(key)) groups.set(key, { lat: where.lat, lng: where.lng, items: [] })
      groups.get(key).items.push(inst)
    }
    // Same rule as the live map: a shared pin takes the colour of its least advanced job.
    const shown = new Set()
    const points = [...groups.values()].map(({ lat, lng, items }) => {
      const rank = (i) => (i.status === 'Cancelled' ? 20 : i.status === 'On Hold' ? 10 : progressOf(i))
      const lead = [...items].sort((a, b) => rank(a) - rank(b))[0]
      items.forEach((i) => shown.add(phaseOf(i)))
      return { lat, lng, count: items.length, colour: pinColour(lead) }
    })
    const legend = Object.entries(LEGEND_COLOURS).filter(([label]) => shown.has(label))
    return { points, filter: mapFilter, unplaced, legend }
  }

  const exportPdf = async () => {
    setExporting(true)
    setExportError('')
    try {
      await exportOverviewPdf({ data, reports, user, map: pdfMap() })
    } catch (err) {
      setExportError('Could not create the PDF: ' + err.message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Overview</h1>
          <p className="text-sm text-slate-400">Sales, jobs and support at a glance</p>
        </div>
        <button className="btn-primary rounded-full" onClick={exportPdf} disabled={exporting || !reports}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
          {exporting ? 'Preparing PDF...' : 'Export report'}
        </button>
      </div>
      <Banner onDismiss={() => setExportError('')}>{exportError}</Banner>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <StatCard label="Total clients" value={stats.totalClients} icon={ICONS.clients} pill="All" hint="accounts on record" />
        <StatCard label="Open quotations" value={stats.openQuotations} icon={ICONS.quotes} pill="Draft · Sent" hint="awaiting decision" />
        <StatCard label="Installs this month" value={stats.installsThisMonth} icon={ICONS.installs} pill={upcoming.length + ' next'} pillTone="green" hint="booked this month" />
        <StatCard
          label="Completed installations"
          value={stats.completedInstalls ?? 0}
          icon={ICONS.completed}
          pill={(stats.completedThisMonth ?? 0) + ' this month'}
          pillTone="green"
          hint="installed and handed over"
        />
        <StatCard label="Open tickets" value={stats.openTickets} icon={ICONS.tickets} pill={stats.openTickets ? 'Action' : 'Clear'} pillTone={stats.openTickets ? 'amber' : 'green'} hint="open or in progress" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Quote pipeline" subtitle={'By status · ' + (byValue ? 'total value' : 'number of quotes')} className="lg:col-span-2" action={<ViewAll to="/quotations" />}>
          <p className="text-2xl font-semibold tracking-tight text-slate-900 mb-6">
            {byValue ? money(pipelineTotal) : pipelineTotal}
            <span className="ml-2 text-xs font-normal text-slate-400">{byValue ? 'across all quotes' : 'quotes in total'}</span>
          </p>
          <BarChart data={pipeline} format={fmt} />
        </Card>

        <Card title="Installation health" subtitle={'Across ' + installTotal + ' installation' + (installTotal === 1 ? '' : 's')} action={<ViewAll to="/installations" />}>
          <Donut percent={completedPct} label="Completed" />
          <ul className="mt-6 space-y-3 text-sm">
            <li className="flex items-center justify-between"><span className="flex items-center gap-2 text-slate-500"><span className="w-2 h-2 rounded-full bg-brand-500" />Completed</span><span className="font-medium text-slate-800">{completed}</span></li>
            <li className="flex items-center justify-between"><span className="flex items-center gap-2 text-slate-500"><span className="w-2 h-2 rounded-full bg-brand-200" />Scheduled / in progress</span><span className="font-medium text-slate-800">{active}</span></li>
            {can('quoteValues') && (
              <li className="flex items-center justify-between"><span className="flex items-center gap-2 text-slate-500"><span className="w-2 h-2 rounded-full bg-amber-500" />Accepted quote value</span><span className="font-medium text-slate-800">{money(acceptedValue)}</span></li>
            )}
          </ul>
        </Card>
      </div>

      <Card
        title="Installations map"
        subtitle="Hover a pin for the job details · click it to open the installation"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex flex-wrap p-0.5 rounded-lg bg-slate-100">
              {Object.keys(MAP_FILTERS).map((f) => (
                <button
                  key={f}
                  onClick={() => setMapFilter(f)}
                  className={'px-2.5 py-1 text-xs font-medium rounded-md transition-colors ' + (mapFilter === f ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700')}
                >
                  {f} <span className="text-slate-400">{allInstalls.filter(MAP_FILTERS[f]).length}</span>
                </button>
              ))}
            </div>
            <ViewAll to="/installations" />
          </div>
        }
      >
        <InstallationMap installations={mapInstalls} height={380} />
      </Card>

      <Card
        title="Engineer availability"
        subtitle={engineers.length ? 'Next 7 days · ' + availabilityDays[0].available.length + ' of ' + engineers.length + ' engineers available today' : 'Next 7 days'}
        action={<ViewAll to="/engineers" />}
      >
        {engineers.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No engineers on record yet.</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 pt-2">
              <AvailabilityChart days={availabilityDays} total={engineers.length} />
            </div>
            <div className="lg:border-l lg:border-slate-100 lg:pl-6 space-y-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-3">
                  Available today <span className="ml-1 px-1.5 py-0.5 rounded-md bg-brand-500 text-white normal-case tracking-normal">{inToday.length}</span>
                </p>
                {inToday.length === 0 && <p className="text-sm text-slate-400">No one is available today.</p>}
                <div className="space-y-2.5">
                  {inToday.map(({ engineer, info }) => (
                    <div key={engineer._id} className="flex items-center gap-3">
                      <span className="grid place-items-center w-8 h-8 rounded-full bg-brand-500 text-[11px] font-semibold text-white shrink-0">{initials(engineer.name)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 truncate">{engineer.name}</p>
                        <p className="text-xs text-slate-400 truncate">{engineer.role}</p>
                      </div>
                      <span className="text-xs font-medium text-brand-600 whitespace-nowrap">{info.start}–{info.end}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-3">
                  Not available today <span className="ml-1 px-1.5 py-0.5 rounded-md bg-brand-50 text-brand-700 normal-case tracking-normal">{offToday.length}</span>
                </p>
                {offToday.length === 0 && <p className="text-sm text-slate-400">Everyone is available today.</p>}
                <div className="space-y-2.5">
                  {offToday.map(({ engineer, info }) => (
                    <div key={engineer._id} className="flex items-center gap-3">
                      <span className="grid place-items-center w-8 h-8 rounded-full bg-brand-50 ring-1 ring-inset ring-brand-100 text-[11px] font-semibold text-brand-300 shrink-0">{initials(engineer.name)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-500 truncate">{engineer.name}</p>
                        <p className="text-xs text-slate-400 truncate">{engineer.role}</p>
                      </div>
                      <Badge tone={info.tone}>{info.kind === 'time-off' ? info.label : info.reason}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Upcoming installations" subtitle="Scheduled and in-progress jobs" className="lg:col-span-2" bodyClass="pb-2" action={<ViewAll to="/installations" />}>
          {upcoming.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-400">Nothing scheduled.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th pl-5">Job</th>
                    <th className="th">Status</th>
                    <th className="th">Engineer</th>
                    <th className="th text-right pr-5">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {upcoming.map((item) => (
                    <tr key={item._id} className="hover:bg-brand-50/40 transition-colors">
                      <td className="td pl-5">
                        <Link to={'/installations/' + item._id} className="flex items-center gap-3">
                          <span className="grid place-items-center w-8 h-8 rounded-lg bg-slate-100 text-[11px] font-semibold text-slate-500">{initials(item.client?.name)}</span>
                          <span>
                            <span className="block font-medium text-slate-800">{item.client?.name || 'Unknown client'}</span>
                            <span className="block text-xs text-slate-400">{item.installNo}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="td"><Badge>{item.status}</Badge></td>
                      <td className="td text-slate-500">{item.engineer?.name || 'Unassigned'}</td>
                      <td className="td text-right pr-5 text-slate-500">{shortDate(item.installDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Tickets by priority" subtitle="Post-install support" action={<ViewAll to="/support" />}>
          {tickets.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No tickets raised.</p>}
          <div className="space-y-5">
            {tickets.map((t) => (
                <div key={t._id}>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="flex items-center gap-2 font-medium text-slate-700">
                      <span className={'w-2 h-2 rounded-full ' + (t._id === 'High' ? 'bg-red-500' : t._id === 'Medium' ? 'bg-amber-500' : 'bg-brand-500')} />
                      {t._id || 'Unset'}
                    </span>
                    <span className="font-medium text-slate-800">{t.count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-brand-50">
                    <div className="h-full rounded-full bg-brand-500 transition-all duration-500" style={{ width: (ticketTotal ? (t.count / ticketTotal) * 100 : 0) + '%' }} />
                  </div>
                </div>
              ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title={can('allActivity') ? 'Recent activity' : 'Your recent activity'}
          subtitle={can('allActivity') ? 'Live across the business' : 'What you have done lately'}
          bodyClass="px-5 pb-3"
          action={<ViewAll to="/quotations" />}
        >
          {activities.length === 0 && (
            <p className="py-6 text-sm text-slate-400">{can('allActivity') ? 'No activity recorded yet.' : "Nothing yet. Things you do, like adding a client or updating a job, will show here."}</p>
          )}
          <ActivityList items={activities} showWho={can('allActivity')} />
        </Card>

        <Card title="Compliance needing attention" subtitle="Expiring or expired" bodyClass="px-2 pb-2" action={<ViewAll to="/compliance" />}>
          {expiring.length === 0 && <p className="px-3 py-6 text-sm text-slate-400">Everything is in date.</p>}
          {expiring.map((item) => (
            <div key={item._id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">{item.title}</p>
                <p className="text-xs text-slate-400 truncate">{item.category} &middot; {item.relatedTo}</p>
              </div>
              <div className="text-right shrink-0">
                <Badge>{item.status}</Badge>
                <p className="text-[11px] text-slate-400 mt-1">{shortDate(item.expiryDate)}</p>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}
