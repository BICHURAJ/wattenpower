import express from 'express'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import { signToken, requireAuth } from '../middleware/auth.js'

const router = express.Router()

// Screen 1: Login / Sign In
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' })

    const user = await User.findOne({ email: String(email).toLowerCase().trim() })
    if (!user) return res.status(401).json({ error: 'No account found with that email address' })

    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) return res.status(401).json({ error: 'Incorrect password' })

    res.json({ token: signToken(user), user: user.toSafeJSON() })
  } catch (err) { next(err) }
})

router.get('/me', requireAuth, (req, res) => res.json(req.user.toSafeJSON()))

export default router
