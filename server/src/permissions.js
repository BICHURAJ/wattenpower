// Who can do what. Every API route is checked against this table (see
// authorize() in middleware/auth.js), and the web app receives the signed-in
// user's row to decide which menus and pages to show. Change access here only.
//
// Resources are the API areas (/api/<resource>). Actions: read, create,
// update (includes workflow steps such as accepting a quote or putting a job
// on hold) and delete.
//
// Two entries aren't API areas and aren't changed by per-user tab access:
// - quoteValues: whether the Overview and Reports show money or just counts.
// - installationProgress: moving a job along -- progress steps, tasks, status,
//   hold/resume and completing the certificate. Engineers (and admins) only.
// - allActivity: seeing everyone's recent activity. Others see only their own.
// - systemDesign: the solar/battery system design on a job (MCS) and the System
//   Design page (read = see it, update = design). Engineers and admins.

export const ROLES = ['admin', 'finance', 'sales', 'engineer']

export const ROLE_LABELS = {
  admin: 'Admin',
  finance: 'Finance',
  sales: 'Sales',
  engineer: 'Engineer',
}

const R = ['read']
const RU = ['read', 'update']
const RCU = ['read', 'create', 'update']
const ALL = ['read', 'create', 'update', 'delete']

export const PERMISSIONS = {
  // Everything, including user accounts. The activity log is read-only for
  // everyone so it stays a trustworthy record.
  admin: {
    dashboard: R, clients: ALL, leads: ALL, quotations: ALL, installations: ALL, tickets: ALL, grants: ALL,
    engineers: ALL, compliance: ALL, documents: ALL, stock: ALL, vans: ALL, tools: ALL, activities: R, users: ALL,
    quoteValues: R, installationProgress: ['update'], allActivity: R, systemDesign: RU,
  },
  // Money: grant claims, quote values and payment terms, stock costs.
  finance: {
    dashboard: R, clients: R, leads: R, quotations: RU, installations: R, tickets: R, grants: RCU,
    engineers: R, compliance: R, documents: R, stock: RU, vans: R, tools: R, activities: R,
    quoteValues: R,
  },
  // Enquiry to accepted quote, and booking the job.
  sales: {
    dashboard: R, clients: RCU, leads: ALL, quotations: RCU, installations: RCU, tickets: RCU, grants: R,
    engineers: R, compliance: R, documents: R, stock: R, vans: R, tools: R, activities: R,
  },
  // Doing the work: job progress, certificates, support visits, kit. No prices.
  engineer: {
    dashboard: R, clients: R, installations: RU, tickets: RCU,
    engineers: R, compliance: RU, documents: R, stock: RU, vans: RU, tools: RU, activities: R,
    installationProgress: ['update'], systemDesign: RU,
  },
}

/** Whether `role` may do `action` on `resource`. Unknown roles, resources and actions are denied. */
export function can(role, resource, action = 'read') {
  return Boolean(PERMISSIONS[role]?.[resource]?.includes(action))
}

// --- Per-user access to each tab ----------------------------------------------------
// Each tab (sidebar area) covers one or more resources. An admin can override a
// user's access to any tab with one of the LEVELS below (user.access, e.g.
// { quotations: 'view', clients: 'none' }). Tabs without an override keep the
// role's exact rights. Admins always get everything.
export const AREAS = [
  { key: 'dashboard', label: 'Overview & Reports', resources: ['dashboard'] },
  { key: 'clients', label: 'Clients', resources: ['clients'] },
  { key: 'leads', label: 'Website Leads', resources: ['leads'] },
  { key: 'quotations', label: 'Quotations', resources: ['quotations'] },
  { key: 'installations', label: 'Installations', resources: ['installations'] },
  { key: 'tickets', label: 'Post-Install Support', resources: ['tickets'] },
  { key: 'grants', label: 'OZEV Grants', resources: ['grants'] },
  { key: 'engineers', label: 'Engineers', resources: ['engineers'] },
  { key: 'compliance', label: 'Compliance Hub', resources: ['compliance'] },
  { key: 'documents', label: 'Documents', resources: ['documents'] },
  { key: 'stock', label: 'Stock & Inventory', resources: ['stock'] },
  { key: 'vans', label: 'Vans & Tools', resources: ['vans', 'tools'] },
]
export const AREA_KEYS = AREAS.map((a) => a.key)

export const LEVELS = {
  none: { label: 'No access', actions: [] },
  view: { label: 'Read only', actions: R },
  edit: { label: 'Read & write', actions: RCU },
  full: { label: 'Read, write & delete', actions: ALL },
}

/** What a role can do on each tab by default, e.g. { clients: ['read'], ... }. */
export function roleAccess(role) {
  return Object.fromEntries(AREAS.map((a) => [a.key, PERMISSIONS[role]?.[a.resources[0]] || []]))
}

/** Only valid { tab: level } pairs, or undefined when there are none. */
export function cleanAccess(access) {
  if (!access || typeof access !== 'object') return undefined
  const entries = Object.entries(access).filter(([key, level]) => AREA_KEYS.includes(key) && LEVELS[level])
  return entries.length ? Object.fromEntries(entries) : undefined
}

/** A user's actual permissions: their role's, with any per-tab overrides applied. */
export function permissionsFor(user) {
  const base = PERMISSIONS[user?.role] || {}
  const access = cleanAccess(user?.access)
  if (user?.role === 'admin' || !access) return base
  const result = { ...base }
  for (const area of AREAS) {
    const level = access[area.key]
    if (!level) continue
    for (const resource of area.resources) {
      if (level === 'none') delete result[resource]
      else result[resource] = LEVELS[level].actions
    }
  }
  return result
}

/** Whether this user (role plus any overrides) may do `action` on `resource`. */
export function userCan(user, resource, action = 'read') {
  return Boolean(permissionsFor(user)[resource]?.includes(action))
}
