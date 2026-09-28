import crypto from 'node:crypto'
import express from 'express'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import Activity from '../models/Activity.js'
import { ROLES, AREAS, AREA_KEYS, LEVELS, roleAccess } from '../permissions.js'
import { validateSignup } from './auth.js'

// User accounts (admins only -- see permissions.js): approve people who signed
// up, set their role, disable or remove accounts.
const router = express.Router()

const STATUSES = ['pending', 'active', 'disabled']

/** Would this change leave the business with no active admin? */
async function removesLastAdmin(user, next) {
  const wasActiveAdmin = user.role === 'admin' && user.status === 'active'
  const staysActiveAdmin = next.role === 'admin' && next.status === 'active'
  if (!wasActiveAdmin || staysActiveAdmin) return false
  const others = await User.countDocuments({ _id: { $ne: user._id }, role: 'admin', status: 'active' })
  return others === 0
}

const initialsOf = (name) => name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

// Add a user directly (no sign-up needed), with their role. If no password is
// given, a temporary one is generated and returned once so the admin can pass it on.
router.post('/', async (req, res, next) => {
  try {
    const generated = !req.body.password
    const check = (password) => validateSignup({ name: req.body.name, email: req.body.email, password })
    let form = check(req.body.password)
    // A random password only fails the rules by chance (e.g. it contains the email name), so try again.
    for (let i = 0; generated && i < 5 && (!form.password || form.error); i++) form = check(crypto.randomBytes(12).toString('base64url'))
    const password = form.password
    if (form.error) return res.status(400).json({ error: form.error })
    if (!ROLES.includes(req.body.role)) return res.status(400).json({ error: 'Choose a role for this user.' })
    const status = req.body.status === 'disabled' ? 'disabled' : 'active'
    if (await User.exists({ email: form.email })) return res.status(409).json({ error: 'A user with that email already exists.' })

    const user = await User.create({
      name: form.name,
      email: form.email,
      passwordHash: await bcrypt.hash(form.password, 12),
      initials: initialsOf(form.name),
      role: req.body.role,
      status,
    })
    await Activity.create({ type: 'client', text: 'User ' + user.email + ' added as ' + user.role, by: req.user.name })
    res.status(201).json({ user: user.toSafeJSON(), ...(generated && { temporaryPassword: password }) })
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'A user with that email already exists.' })
    next(err)
  }
})

router.get('/', async (req, res, next) => {
  try {
    const users = await User.find({}).sort({ status: 1, name: 1 })
    res.json({
      items: users.map((u) => u.toSafeJSON()),
      // For the access picker: every tab, the levels, and what each role gets by default.
      areas: AREAS.map(({ key, label }) => ({ key, label })),
      levels: Object.entries(LEVELS).map(([key, { label, actions }]) => ({ key, label, actions })),
      roleDefaults: Object.fromEntries(ROLES.map((role) => [role, roleAccess(role)])),
    })
  } catch (err) { next(err) }
})

// Change role, status and/or tab access. Only these fields can be changed here.
// access: { tab: level } overrides (see LEVELS), or null to go back to the
// role's usual access. Changing the role also goes back to the new role's access.
router.put('/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    if (String(user._id) === String(req.user._id)) {
      return res.status(400).json({ error: "You can't change your own role or status. Ask another admin." })
    }

    const role = req.body.role === undefined ? user.role : req.body.role
    const status = req.body.status === undefined ? user.status : req.body.status
    if (role != null && !ROLES.includes(role)) return res.status(400).json({ error: 'Unknown role: ' + role })
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status: ' + status })
    if (status === 'active' && !role) return res.status(400).json({ error: 'Choose a role before activating this account.' })

    let access = user.access
    if (role !== user.role) access = undefined
    if (req.body.access !== undefined) {
      const given = req.body.access
      if (given === null) access = undefined
      else if (typeof given !== 'object' || Array.isArray(given) ||
          Object.entries(given).some(([key, level]) => !AREA_KEYS.includes(key) || !LEVELS[level])) {
        return res.status(400).json({ error: 'Unknown tab or access level.' })
      } else if (role === 'admin') {
        return res.status(400).json({ error: 'Admins always have full access to every tab.' })
      } else {
        // Store only real overrides, in menu order.
        access = Object.fromEntries(AREA_KEYS.filter((key) => given[key]).map((key) => [key, given[key]]))
        if (!Object.keys(access).length) access = undefined
      }
    }
    if (await removesLastAdmin(user, { role, status })) {
      return res.status(400).json({ error: 'There must always be at least one active admin.' })
    }

    const before = user.status + ' / ' + (user.role || 'no role')
    const accessChanged = JSON.stringify(access ?? null) !== JSON.stringify(user.access ?? null)
    user.role = role || undefined
    user.status = status
    user.access = access
    await user.save()
    await Activity.create({
      type: 'client',
      text: 'User ' + user.email + ' changed from ' + before + ' to ' + status + ' / ' + (role || 'no role') +
        (accessChanged
          ? (access ? '; access: ' + Object.entries(access).map(([k, l]) => k + ' ' + LEVELS[l].label).join(', ') : '; access reset to role default')
          : ''),
      by: req.user.name,
    })
    res.json(user.toSafeJSON())
  } catch (err) { next(err) }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    if (String(user._id) === String(req.user._id)) return res.status(400).json({ error: "You can't delete your own account." })
    if (await removesLastAdmin(user, { role: null, status: 'disabled' })) {
      return res.status(400).json({ error: 'There must always be at least one active admin.' })
    }
    await user.deleteOne()
    await Activity.create({ type: 'client', text: 'User ' + user.email + ' deleted', by: req.user.name })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

export default router
