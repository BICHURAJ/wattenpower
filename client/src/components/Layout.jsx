import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'

// The sidebar mirrors the sections of the workflow diagram, in the order a job
// actually moves: enquiry -> quote -> install -> certify -> support.
const NAV = [
  { to: '/', label: 'Dashboard', end: true, icon: 'M3 12h7V3H3v9Zm11 9h7v-9h-7v9ZM3 21h7v-6H3v6Zm11-12h7V3h-7v6Z' },
  { to: '/clients', label: 'Clients', icon: 'M16 21v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z' },
  { to: '/leads', label: 'Website Leads', icon: 'M4 4h16v12H5.2L4 17.2V4Z' },
  { to: '/quotations', label: 'Quotations', icon: 'M6 2h9l5 5v15H6V2Zm9 0v5h5' },
  { to: '/installations', label: 'Installations', icon: 'M13 2 3 14h8l-1 8 10-12h-8l1-8Z' },
  { to: '/support', label: 'Post-Install Support', icon: 'M18 8a6 6 0 1 0-12 0v5l-2 3h16l-2-3V8Z' },
  { to: '/grants', label: 'OZEV Grants', icon: 'M12 2 2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5' },
  { to: '/engineers', label: 'Engineers', icon: 'M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z' },
  { to: '/compliance', label: 'Compliance Hub', icon: 'M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z' },
  { to: '/documents', label: 'Documents', icon: 'M6 2h9l5 5v15H6V2Z' },
  { to: '/stock', label: 'Stock & Inventory', icon: 'M3 7h18v13H3V7Zm0 0 2-4h14l2 4M12 7v13' },
  { to: '/vans', label: 'Vans & Tools', icon: 'M3 16V6h11v10M14 9h4l3 4v3h-7V9ZM7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z' },
  { to: '/reports', label: 'Reports', icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
  { to: '/settings', label: 'Settings', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-3a8 8 0 0 1-.1 1.2l2 1.6-2 3.4-2.4-1a8 8 0 0 1-2 1.2l-.4 2.6h-4l-.4-2.6a8 8 0 0 1-2-1.2l-2.4 1-2-3.4 2-1.6A8 8 0 0 1 4 12c0-.4 0-.8.1-1.2l-2-1.6 2-3.4 2.4 1a8 8 0 0 1 2-1.2L8.9 3h4l.4 2.6a8 8 0 0 1 2 1.2l2.4-1 2 3.4-2 1.6c.1.4.1.8.1 1.2Z' },
]

function Icon({ path }) {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d={path} />
    </svg>
  )
}

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const signOut = () => { logout(); navigate('/login') }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className={'fixed lg:static inset-y-0 left-0 z-40 w-60 bg-white border-r border-slate-200 flex flex-col transition-transform ' +
        (sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0')}>
        <div className="flex items-center gap-2 px-4 h-14 border-b border-slate-200">
          <span className="grid place-items-center w-7 h-7 rounded bg-brand-500 text-white text-sm">&#9889;</span>
          <span className="font-semibold text-sm text-slate-900 tracking-tight">WATTEN POWER LTD</span>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => 'nav-link ' + (isActive ? 'nav-link-active' : '')}
            >
              <Icon path={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-200 text-[11px] text-slate-400">
          Sales CRM &amp; Job Management
        </div>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main column */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 bg-white border-b border-slate-200 flex items-center gap-3 px-4 shrink-0">
          <button className="btn-ghost px-2 lg:hidden" onClick={() => setSidebarOpen(true)}>&#9776;</button>
          <div className="flex-1 max-w-md hidden sm:block">
            <input className="input" placeholder="Search clients, quotations, installations..." disabled />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <NavLink to="/lead-capture" className="btn-secondary hidden md:inline-flex">New Lead</NavLink>
            <div className="relative">
              <button className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-100" onClick={() => setMenuOpen((v) => !v)}>
                <span className="grid place-items-center w-7 h-7 rounded-full bg-brand-500 text-white text-xs font-semibold">
                  {user?.initials || 'WP'}
                </span>
                <span className="text-sm text-slate-700 hidden sm:inline">{user?.name}</span>
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-1 w-52 card p-1 z-50">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <p className="text-sm font-medium text-slate-800">{user?.name}</p>
                    <p className="text-xs text-slate-500">{user?.email}</p>
                    <p className="text-xs text-slate-400 mt-1 capitalize">{user?.role}</p>
                  </div>
                  <button className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded" onClick={signOut}>
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6" onClick={() => menuOpen && setMenuOpen(false)}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
