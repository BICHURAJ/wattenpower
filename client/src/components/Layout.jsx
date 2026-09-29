import { useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { BrandLogo } from './ui'
import { useMessageAlerts, MessageToasts } from './MessageAlerts'
import { useProcesses } from '../processes'

const MESSAGE_ICON = 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z'

// The sidebar mirrors the sections of the workflow diagram, in the order a job
// actually moves: enquiry -> quote -> install -> certify -> support.
const NAV_GROUPS = [
  {
    label: 'Monitor',
    items: [
      { to: '/', label: 'Overview', end: true, resource: 'dashboard', icon: 'M3 12h7V3H3v9Zm11 9h7v-9h-7v9ZM3 21h7v-6H3v6Zm11-12h7V3h-7v6Z' },
      { to: '/reports', label: 'Reports', resource: 'dashboard', icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
    ],
  },
  {
    label: 'Sales',
    items: [
      { to: '/clients', label: 'Clients', resource: 'clients', icon: 'M16 21v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z' },
      { to: '/leads', label: 'Website Leads', resource: 'leads', icon: 'M4 4h16v12H5.2L4 17.2V4Z' },
      { to: '/quotations', label: 'Quotations', resource: 'quotations', icon: 'M6 2h9l5 5v15H6V2Zm9 0v5h5' },
    ],
  },
  {
    label: 'Jobs',
    items: [
      { to: '/installations', label: 'Installations', resource: 'installations', icon: 'M13 2 3 14h8l-1 8 10-12h-8l1-8Z' },
      { to: '/support', label: 'Post-Install Support', resource: 'tickets', icon: 'M18 8a6 6 0 1 0-12 0v5l-2 3h16l-2-3V8Z' },
      { to: '/grants', label: 'OZEV Grants', resource: 'grants', icon: 'M12 2 2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/engineers', label: 'Engineers', resource: 'engineers', icon: 'M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z' },
      { to: '/system-design', label: 'System Design', resource: 'systemDesign', icon: 'M12 3v2m0 14v2M5.6 5.6l1.4 1.4m10 10 1.4 1.4M3 12h2m14 0h2M5.6 18.4 7 17m10-10 1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z' },
      { to: '/compliance', label: 'Compliance Hub', resource: 'compliance', icon: 'M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z' },
      { to: '/documents', label: 'Documents', resource: 'documents', icon: 'M6 2h9l5 5v15H6V2Z' },
      { to: '/stock', label: 'Stock & Inventory', resource: 'stock', icon: 'M3 7h18v13H3V7Zm0 0 2-4h14l2 4M12 7v13' },
      { to: '/vans', label: 'Vans & Tools', resource: 'vans', icon: 'M3 16V6h11v10M14 9h4l3 4v3h-7V9ZM7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z' },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { to: '/messages', label: 'Messages', icon: MESSAGE_ICON },
      { to: '/users', label: 'Users', resource: 'users', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8' },
    ],
  },
]

const ALL_ITEMS = NAV_GROUPS.flatMap((group) => group.items)

export function Icon({ path, className = 'w-4 h-4' }) {
  return (
    <svg className={className + ' shrink-0'} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d={path} />
    </svg>
  )
}

// Header title follows the section you're in, so deep pages keep their context.
function sectionFor(pathname) {
  if (pathname === '/') return ALL_ITEMS[0]
  return ALL_ITEMS.find((item) => item.to !== '/' && (pathname === item.to || pathname.startsWith(item.to + '/'))) || ALL_ITEMS[0]
}

const ROLE_NAMES = { admin: 'Admin', finance: 'Finance', sales: 'Sales', engineer: 'Engineer' }

/** Shown instead of a page the user's role can't open (the server refuses its data anyway). */
function NoAccess({ label, home }) {
  return (
    <div className="card max-w-lg mx-auto mt-10 p-8 text-center">
      <div className="grid place-items-center w-12 h-12 mx-auto rounded-full bg-slate-100 text-slate-400 mb-3">
        <Icon path="M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5V11Z" className="w-5 h-5" />
      </div>
      <h2 className="font-semibold text-slate-900">No access to {label}</h2>
      <p className="text-sm text-slate-500 mt-1">Your role doesn't include this area. Ask an admin if you need it.</p>
      {home && <Link to={home.to} className="btn-secondary mt-5">Go to {home.label}</Link>}
    </div>
  )
}

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function Layout() {
  const { user, logout, can } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Unread count for the badges, and pop-ups when a new message arrives.
  const { unread, toasts, dismiss } = useMessageAlerts(pathname)
  // Product/process definitions: pages use them directly, so wait for them.
  const { processes, error: processesError } = useProcesses()

  const signOut = () => { logout(); navigate('/login') }
  const section = sectionFor(pathname)
  // Menu items without a resource are open to everyone; groups left empty are dropped.
  const visibleGroups = NAV_GROUPS
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.resource || can(item.resource)) }))
    .filter((group) => group.items.length)
  const allowed = !section.resource || can(section.resource)
  // First tab this user has -- where they go if the Overview tab is switched off for them.
  const home = visibleGroups[0]?.items[0]
  const firstName = (user?.name || '').split(' ')[0]
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="h-screen bg-gradient-to-br from-[#cfe1ff] via-[#dcebff] to-[#e4f7d4] lg:p-6 xl:p-8">
      <div className="flex h-full overflow-hidden bg-white lg:rounded-[28px] lg:shadow-panel">
        {/* Sidebar */}
        <aside className={'fixed lg:static inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-100 flex flex-col transition-transform ' +
          (sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0')}>
          <Link to="/" className="block px-5 pt-5 pb-2 shrink-0" title="Watten Power - Overview">
            <BrandLogo className="w-full" />
            <p className="mt-1.5 text-[10px] font-medium text-slate-400 tracking-wider">SALES CRM &amp; JOBS</p>
          </Link>

          <nav className="flex-1 overflow-y-auto px-3 pb-3">
            {visibleGroups.map((group) => (
              <div key={group.label}>
                <p className="nav-section">{group.label}</p>
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={() => setSidebarOpen(false)}
                      className={({ isActive }) => 'nav-link ' + (isActive ? 'nav-link-active' : '')}
                    >
                      <Icon path={item.icon} />
                      {item.label}
                      {item.to === '/messages' && unread > 0 && (
                        <span className="ml-auto min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-red-500 text-white text-[10px] font-semibold">
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          {/* Profile */}
          <div className="relative px-3 py-3 shrink-0 border-t border-slate-100">
            <button className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-slate-50 text-left" onClick={() => setMenuOpen((v) => !v)}>
              <span className="grid place-items-center w-9 h-9 rounded-full bg-brand-100 text-brand-700 text-xs font-semibold">
                {user?.initials || 'WP'}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-slate-800 truncate">{user?.name}</span>
                <span className="block text-xs text-slate-400 truncate">{ROLE_NAMES[user?.role] || user?.role}</span>
              </span>
              <span className="text-slate-400">&#8942;</span>
            </button>
            {menuOpen && (
              <div className="absolute bottom-full left-3 right-3 mb-1 card p-1 z-50">
                <div className="px-3 py-2 border-b border-slate-100">
                  <p className="text-sm font-medium text-slate-800">{user?.name}</p>
                  <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                </div>
                <button className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg" onClick={signOut}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </aside>

        {sidebarOpen && <div className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden" onClick={() => setSidebarOpen(false)} />}

        {/* Main column */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <header className="h-16 bg-white border-b border-slate-100 flex items-center gap-3 px-4 sm:px-6 shrink-0">
            <button className="btn-ghost px-2 lg:hidden" onClick={() => setSidebarOpen(true)}>&#9776;</button>
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 truncate">{section.label}</p>
              <p className="text-xs text-slate-400 truncate hidden sm:block">
                {greeting()}{firstName ? ', ' + firstName : ''} &middot; {today}
              </p>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <div className="relative hidden md:block w-64">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
                </svg>
                <input className="input rounded-full bg-slate-50 border-transparent pl-10 pr-12" placeholder="Search clients, jobs..." disabled />
                <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium text-slate-400">&#8984;K</kbd>
              </div>
              <Link
                to="/messages"
                className="relative grid place-items-center w-9 h-9 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
                title={unread ? unread + ' unread message' + (unread === 1 ? '' : 's') : 'Messages'}
              >
                <Icon path={MESSAGE_ICON} />
                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-red-500 text-white text-[10px] font-semibold ring-2 ring-white">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </Link>
              {can('tickets') && (
                <Link to="/support" className="relative grid place-items-center w-9 h-9 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50" title="Support tickets">
                  <Icon path="M18 8a6 6 0 1 0-12 0v5l-2 3h16l-2-3V8Zm-8 12a2 2 0 0 0 4 0" />
                  <span className="absolute top-2 right-2.5 w-1.5 h-1.5 rounded-full bg-brand-500 ring-2 ring-white" />
                </Link>
              )}
              {can('leads', 'create') && (
                <Link to="/lead-capture" className="btn-primary rounded-full hidden sm:inline-flex">
                  <span className="text-base leading-none">+</span> New Lead
                </Link>
              )}
            </div>
          </header>

          <main className="flex-1 overflow-y-auto bg-[#f5f8fd] p-4 sm:p-6" onClick={() => menuOpen && setMenuOpen(false)}>
            {!processes ? (
              <div className="py-12 text-center text-sm text-slate-400">{processesError ? 'Could not load the app setup: ' + processesError + '. Refresh to try again.' : 'Loading...'}</div>
            ) : allowed ? <Outlet />
              : pathname === '/' && home && home.to !== '/' ? <Navigate to={home.to} replace />
              : <NoAccess label={section.label} home={home} />}
          </main>
        </div>
      </div>
      <MessageToasts toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}
