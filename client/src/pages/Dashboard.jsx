import { Link } from 'react-router-dom'
import { shortDate, timeAgo } from '../api'
import { Card, StatCard, Badge, Loading, Banner, useFetch } from '../components/ui'

// Screen 2: Dashboard (Overview)
export default function Dashboard() {
  const { data, loading, error } = useFetch('/dashboard')

  if (loading) return <Loading label="Loading dashboard..." />
  if (error) return <Banner>{error}</Banner>

  const { stats, activities, upcoming, expiring } = data

  return (
    <>
      <h1 className="text-xl font-semibold text-slate-900 mb-5">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6">
        <StatCard label="Total Clients" value={stats.totalClients} hint="All accounts on record" />
        <StatCard label="Open Quotations" value={stats.openQuotations} hint="Draft or sent, awaiting a decision" />
        <StatCard label="Installations (This Month)" value={stats.installsThisMonth} hint="Booked in for this calendar month" />
        <StatCard label="Post-Install Tickets" value={stats.openTickets} hint="Open or in progress" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Recent Activities"
          bodyClass="divide-y divide-slate-100"
          action={<Link to="/quotations" className="text-xs text-brand-600 hover:underline">View All</Link>}
        >
          {activities.length === 0 && <p className="p-4 text-sm text-slate-400">No activity recorded yet.</p>}
          {activities.map((item) => (
            <div key={item._id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm text-slate-700">{item.text}</p>
                {item.by && <p className="text-xs text-slate-400 mt-0.5">by {item.by}</p>}
              </div>
              <span className="text-xs text-slate-400 whitespace-nowrap">{timeAgo(item.createdAt)}</span>
            </div>
          ))}
        </Card>

        <Card
          title="Upcoming Installations"
          bodyClass="divide-y divide-slate-100"
          action={<Link to="/installations" className="text-xs text-brand-600 hover:underline">View All</Link>}
        >
          {upcoming.length === 0 && <p className="p-4 text-sm text-slate-400">Nothing scheduled.</p>}
          {upcoming.map((item) => (
            <Link key={item._id} to={'/installations/' + item._id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
              <div>
                <p className="text-sm font-medium text-slate-800">{item.installNo}</p>
                <p className="text-xs text-slate-500">{item.client?.name} &middot; {item.engineer?.name || 'Unassigned'}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">{shortDate(item.installDate)}</p>
                <Badge>{item.status}</Badge>
              </div>
            </Link>
          ))}
        </Card>
      </div>

      {expiring.length > 0 && (
        <Card
          title="Compliance needing attention"
          className="mt-4"
          bodyClass="divide-y divide-slate-100"
          action={<Link to="/compliance" className="text-xs text-brand-600 hover:underline">Compliance Hub</Link>}
        >
          {expiring.map((item) => (
            <div key={item._id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm text-slate-700">{item.title}</p>
                <p className="text-xs text-slate-500">{item.category} &middot; {item.relatedTo}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">{shortDate(item.expiryDate)}</p>
                <Badge>{item.status}</Badge>
              </div>
            </div>
          ))}
        </Card>
      )}
    </>
  )
}
