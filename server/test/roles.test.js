import { test } from 'node:test'
import assert from 'node:assert/strict'
import { can, ROLES, PERMISSIONS, roleAccess, cleanAccess, permissionsFor, userCan } from '../src/permissions.js'
import { actionFor, authorize } from '../src/middleware/auth.js'
import { validateSignup } from '../src/routes/auth.js'

test('every role has a permission row, and unknown roles get nothing', () => {
  for (const role of ROLES) assert.ok(PERMISSIONS[role], role)
  assert.equal(can(undefined, 'clients', 'read'), false)
  assert.equal(can('technical', 'clients', 'read'), false)
  assert.equal(can('admin', 'no-such-area', 'read'), false)
})

test('only admins manage user accounts', () => {
  assert.equal(can('admin', 'users', 'update'), true)
  for (const role of ['finance', 'sales', 'engineer']) {
    assert.equal(can(role, 'users', 'read'), false, role)
    assert.equal(can(role, 'users', 'update'), false, role)
  }
})

test('the activity log is read-only for everyone, admins included', () => {
  for (const role of ROLES) {
    assert.equal(can(role, 'activities', 'read'), true, role)
    for (const action of ['create', 'update', 'delete']) assert.equal(can(role, 'activities', action), false, role + ' ' + action)
  }
})

test('engineers work on jobs but never see prices', () => {
  assert.equal(can('engineer', 'installations', 'update'), true)
  assert.equal(can('engineer', 'installations', 'delete'), false)
  assert.equal(can('engineer', 'quotations', 'read'), false)
  assert.equal(can('engineer', 'leads', 'read'), false)
  assert.equal(can('engineer', 'grants', 'read'), false)
})

test('sales run quotes, finance handles grants, only admins delete clients', () => {
  assert.equal(can('sales', 'quotations', 'create'), true)
  assert.equal(can('sales', 'grants', 'update'), false)
  assert.equal(can('finance', 'grants', 'update'), true)
  assert.equal(can('finance', 'quotations', 'create'), false)
  for (const role of ['finance', 'sales', 'engineer']) assert.equal(can(role, 'clients', 'delete'), false, role)
  assert.equal(can('admin', 'clients', 'delete'), true)
})

test('only admin and finance see quote values on the Overview', () => {
  assert.equal(can('admin', 'quoteValues'), true)
  assert.equal(can('finance', 'quoteValues'), true)
  assert.equal(can('sales', 'quoteValues'), false)
  assert.equal(can('engineer', 'quoteValues'), false)
})

test('without overrides a user gets exactly their role', () => {
  assert.deepEqual(permissionsFor({ role: 'sales' }), PERMISSIONS.sales)
  assert.deepEqual(permissionsFor({ role: 'sales', access: null }), PERMISSIONS.sales)
  assert.deepEqual(permissionsFor({ role: 'sales', access: {} }), PERMISSIONS.sales)
  assert.deepEqual(roleAccess('engineer').quotations, [])
  assert.deepEqual(roleAccess('finance').quotations, ['read', 'update'])
})

test('each access level grants exactly its actions', () => {
  const on = (level, action) => userCan({ role: 'engineer', access: { quotations: level } }, 'quotations', action)
  assert.deepEqual(['read', 'create', 'update', 'delete'].map((a) => on('none', a)), [false, false, false, false])
  assert.deepEqual(['read', 'create', 'update', 'delete'].map((a) => on('view', a)), [true, false, false, false])
  assert.deepEqual(['read', 'create', 'update', 'delete'].map((a) => on('edit', a)), [true, true, true, false])
  assert.deepEqual(['read', 'create', 'update', 'delete'].map((a) => on('full', a)), [true, true, true, true])
})

test('overrides only touch their own tab; untouched tabs keep the exact role rights', () => {
  const user = { role: 'finance', access: { clients: 'none' } }
  assert.equal(userCan(user, 'clients', 'read'), false)
  assert.deepEqual(permissionsFor(user).quotations, ['read', 'update']) // finance's own, not widened
  // Not tabs, so unaffected: the activity log and quote values follow the role.
  assert.equal(userCan(user, 'activities', 'read'), true)
  assert.equal(userCan(user, 'quoteValues'), true)
})

test('Vans & Tools covers both resources', () => {
  const user = { role: 'sales', access: { vans: 'edit' } }
  assert.equal(userCan(user, 'vans', 'update'), true)
  assert.equal(userCan(user, 'tools', 'update'), true)
  assert.equal(userCan({ role: 'engineer', access: { vans: 'none' } }, 'tools', 'read'), false)
})

test('unknown tabs and levels are ignored, and admins always get everything', () => {
  assert.deepEqual(permissionsFor({ role: 'sales', access: { bogus: 'full', clients: 'godmode' } }), PERMISSIONS.sales)
  assert.equal(cleanAccess({ bogus: 'full' }), undefined)
  assert.deepEqual(permissionsFor({ role: 'admin', access: { clients: 'none' } }), PERMISSIONS.admin)
})

test('only engineers and admins change job progress, whatever their tab access', () => {
  assert.equal(can('engineer', 'installationProgress', 'update'), true)
  assert.equal(can('admin', 'installationProgress', 'update'), true)
  assert.equal(can('sales', 'installationProgress', 'update'), false)
  assert.equal(can('finance', 'installationProgress', 'update'), false)
  // Full access to the Installations tab still doesn't include progress.
  assert.equal(userCan({ role: 'sales', access: { installations: 'full' } }, 'installationProgress', 'update'), false)
})

test('HTTP requests map to the right action', () => {
  assert.equal(actionFor({ method: 'GET', path: '/abc' }), 'read')
  assert.equal(actionFor({ method: 'POST', path: '/' }), 'create')
  assert.equal(actionFor({ method: 'POST', path: '/abc/accept' }), 'update') // workflow step on a record
  assert.equal(actionFor({ method: 'PUT', path: '/abc' }), 'update')
  assert.equal(actionFor({ method: 'DELETE', path: '/abc' }), 'delete')
  assert.equal(actionFor({ method: 'TRACE', path: '/' }), null)
})

test('authorize() lets allowed requests through and answers 403 otherwise', () => {
  const run = (role, method, path) => {
    let status = 200
    let passed = false
    const res = { status(code) { status = code; return this }, json() { return this } }
    authorize('quotations')({ method, path, user: role && { role } }, res, () => { passed = true })
    return passed ? 200 : status
  }
  assert.equal(run('sales', 'POST', '/abc/accept'), 200)
  assert.equal(run('engineer', 'GET', '/'), 403)
  assert.equal(run('finance', 'DELETE', '/abc'), 403)
  assert.equal(run(null, 'GET', '/'), 403)
})

test('sign-up checks name, email and password strength', () => {
  const good = { name: '  Jo   Bloggs ', email: ' Jo@Example.co.uk ', password: 'correct horse battery' }
  assert.deepEqual(validateSignup(good), { name: 'Jo Bloggs', email: 'jo@example.co.uk', password: 'correct horse battery' })
  assert.match(validateSignup({ ...good, name: 'J' }).error, /full name/)
  assert.match(validateSignup({ ...good, email: 'not-an-email' }).error, /valid email/)
  assert.match(validateSignup({ ...good, password: 'short' }).error, /at least 10/)
  assert.match(validateSignup({ ...good, password: 'a'.repeat(73) }).error, /too long/)
  assert.match(validateSignup({ ...good, password: 'aaaaaaaaaaaa' }).error, /less guessable/)
  assert.match(validateSignup({ ...good, email: 'jonathan@example.com', password: 'jonathan2024!' }).error, /less guessable/)
  // Role is never taken from the form.
  assert.equal(validateSignup({ ...good, role: 'admin' }).role, undefined)
})
