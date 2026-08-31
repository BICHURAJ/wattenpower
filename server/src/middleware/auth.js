import jwt from 'jsonwebtoken'
import User from '../models/User.js'

const SECRET = () => process.env.JWT_SECRET || 'dev-secret'

export function signToken(user) {
  return jwt.sign({ sub: String(user._id) }, SECRET(), { expiresIn: '7d' })
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Not signed in' })
  try {
    const payload = jwt.verify(token, SECRET())
    const user = await User.findById(payload.sub)
    if (!user) return res.status(401).json({ error: 'Session no longer valid' })
    req.user = user
    next()
  } catch {
    return res.status(401).json({ error: 'Session expired, please sign in again' })
  }
}
