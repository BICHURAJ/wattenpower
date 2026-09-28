import { money } from '../api'
import { PageHeader, Card, StatCard, Badge, Banner, Loading, useFetch } from '../components/ui'

export function Reports() {
  const { data, loading, error } = useFetch('/dashboard/reports')
  if (loading) return <Loading />
  if (error) return <Banner>{error}</Banner>

  const total = (rows) => rows.reduce((sum, row) => sum + row.count, 0)

  return (
    <>
      <PageHeader title="Reports" subtitle="A quick read on where the work sits" />

      <div className="grid gap-4 sm:grid-cols-3 mb-4">
        {data.acceptedValue !== undefined && (
          <StatCard label="Accepted Quotation Value" value={money(data.acceptedValue)} hint="Total of every quote marked accepted" />
        )}
        <StatCard label="Quotations Raised" value={total(data.quotesByStatus)} />
        <StatCard label="Installations Logged" value={total(data.installsByStatus)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <BreakdownCard title="Quotations by status" rows={data.quotesByStatus} showValue />
        <BreakdownCard title="Installations by status" rows={data.installsByStatus} />
        <BreakdownCard title="Support tickets by priority" rows={data.ticketsByPriority} />
      </div>
    </>
  )
}

function BreakdownCard({ title, rows, showValue }) {
  const max = Math.max(...rows.map((row) => row.count), 1)
  return (
    <Card title={title}>
      {rows.length === 0 && <p className="text-sm text-slate-400">Nothing recorded yet.</p>}
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row._id || 'none'}>
            <div className="flex items-center justify-between text-sm mb-1">
              <Badge>{row._id || 'Unspecified'}</Badge>
              <span className="text-slate-600">
                {row.count}{showValue && row.value ? ' · ' + money(row.value) : ''}
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-brand-500 rounded-full" style={{ width: (row.count / max) * 100 + '%' }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
