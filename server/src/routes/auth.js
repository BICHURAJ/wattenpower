import express from 'express'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import { signToken, requireAuth } from '../middleware/auth.js'
import { rateLimit } from '../middleware/rateLimit.js'

const router = express.Router()

const MIN_PASSWORD = 10
const MAX_PASSWORD_BYTES = 72 // bcrypt ignores anything past 72 bytes
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// The same message whether the email or the password is wrong, so the form
// can't be used to find out who has an account.
const BAD_LOGIN = 'Incorrect email or password'

/** Checks a sign-up form. Returns { name, email, password } cleaned up, or { error }. */
export function validateSignup(body = {}) {
  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ')
  const email = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')
  if (name.length < 2 || name.length > 80) return { error: 'Please enter your full name (2-80 characters).' }
  if (email.length > 254 || !EMAIL.test(email)) return { error: 'Please enter a valid email address.' }
  if (password.length < MIN_PASSWORD) return { error: 'Your password must be at least ' + MIN_PASSWORD + ' characters.' }
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) return { error: 'Your password is too long (72 bytes at most).' }
  const mailbox = email.split('@')[0]
  if ((mailbox.length >= 4 && password.toLowerCase().includes(mailbox)) || /^(.)\1+$/.test(password)) {
    return { error: 'Please choose a less guessable password.' }
  }
  return { name, email, password }
}

const initialsOf = (name) => name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many sign-in attempts. Please wait 15 minutes and try again.' })
const signupLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: 'Too many accounts created from this network. Please try again later.' })

// Screen 1: Login / Sign In
router.post('/login', loginLimit, async (req, res, next) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' })

    const user = await User.findOne({ email: String(email).toLowerCase().trim() })
    const ok = user && await bcrypt.compare(String(password), user.passwordHash)
    if (!ok) return res.status(401).json({ error: BAD_LOGIN })

    // Only said once the password is right, so it reveals nothing to a guesser.
    if (user.status === 'pending' || !user.role) {
      return res.status(403).json({ error: 'Your account is waiting for an administrator to approve it.' })
    }
    if (user.status === 'disabled') return res.status(403).json({ error: 'This account has been disabled. Contact an administrator.' })

    res.json({ token: signToken(user), user: user.toSafeJSON() })
  } catch (err) { next(err) }
})

// Sign up. New accounts wait for an admin to approve them and choose their
// role -- nobody picks their own. The very first account becomes the admin,
// so a fresh install can be set up.
router.post('/signup', signupLimit, async (req, res, next) => {
  try {
    const form = validateSignup(req.body)
    if (form.error) return res.status(400).json({ error: form.error })

    if (await User.exists({ email: form.email })) {
      return res.status(409).json({ error: 'An account with that email already exists. Sign in instead.' })
    }

    const first = (await User.estimatedDocumentCount()) === 0
    const user = await User.create({
      name: form.name,
      email: form.email,
      passwordHash: await bcrypt.hash(form.password, 12),
      initials: initialsOf(form.name),
      status: first ? 'active' : 'pending',
      ...(first && { role: 'admin' }),
    })

    if (first) return res.status(201).json({ token: signToken(user), user: user.toSafeJSON() })
    res.status(201).json({ pending: true })
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'An account with that email already exists. Sign in instead.' })
    next(err)
  }
})

router.get('/me', requireAuth, (req, res) => res.json(req.user.toSafeJSON()))

export default router
