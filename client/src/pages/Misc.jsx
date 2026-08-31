import { money } from '../api'
import { useAuth } from '../auth'
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
        <StatCard label="Accepted Quotation Value" value={money(data.acceptedValue)} hint="Total of every quote marked accepted" />
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

export function Settings() {
  const { user } = useAuth()

  return (
    <>
      <PageHeader title="Settings" subtitle="Your account and how this prototype is wired up" />

      <div className="grid gap-4 lg:grid-cols-2 max-w-4xl">
        <Card title="Your Account">
          <dl className="space-y-2 text-sm">
            <Row label="Name">{user?.name}</Row>
            <Row label="Email">{user?.email}</Row>
            <Row label="Role"><span className="capitalize">{user?.role}</span></Row>
          </dl>
        </Card>

        <Card title="System">
          <dl className="space-y-2 text-sm">
            <Row label="Frontend">React + Vite (this web app)</Row>
            <Row label="Backend">Express REST API on port 4000</Row>
            <Row label="Database">MongoDB via Mongoose</Row>
            <Row label="Sign-in">JSON Web Token, kept in browser storage</Row>
          </dl>
          <p className="text-xs text-slate-400 mt-4">
            Demo accounts all use the password <code className="bg-slate-100 px-1 rounded">password123</code>.
            Re-run <code className="bg-slate-100 px-1 rounded">npm run seed</code> to reset the sample data.
          </p>
        </Card>
      </div>
    </>
  )
}

const Row = ({ label, children }) => (
  <div className="flex justify-between gap-3">
    <dt className="text-slate-500">{label}</dt>
    <dd className="text-slate-800 text-right">{children}</dd>
  </div>
)
