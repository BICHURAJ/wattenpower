import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import { getConfig } from '../config.js'
import { userCan } from '../permissions.js'
import { runWithUser } from '../requestContext.js'

// Pinned so a token can't choose its own algorithm (e.g. "none").
const ALGORITHM = 'HS256'
const EXPIRES_IN = '7d'

export function signToken(user) {
  return jwt.sign({ sub: String(user._id) }, getConfig().jwtSecret, { algorithm: ALGORITHM, expiresIn: EXPIRES_IN })
}

/** The token's payload if it is genuine and in date; throws otherwise. */
export function verifyToken(token) {
  const payload = jwt.verify(token, getConfig().jwtSecret, { algorithms: [ALGORITHM] })
  // jwt.verify only checks exp when it is present; every token we issue has one.
  if (typeof payload.exp !== 'number') throw new jwt.JsonWebTokenError('token has no expiry')
  return payload
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Not signed in' })
  try {
    const payload = verifyToken(token)
    const user = await User.findById(payload.sub)
    if (!user) return res.status(401).json({ error: 'Session no longer valid' })
    // Disabling an account (or it never being approved) ends its sessions straight away.
    if (user.status !== 'active' || !user.role) return res.status(401).json({ error: 'Your account is not active' })
    req.user = user
    // The rest of the request knows who is signed in (e.g. to log who did what).
    runWithUser(user, next)
  } catch {
    return res.status(401).json({ error: 'Session expired, please sign in again' })
  }
}

/**
 * The permission an API request needs on `resource`: GET reads, DELETE
 * deletes, PUT/PATCH update. POST to the collection creates; POST to a record
 * (e.g. /:id/accept, /:id/hold) is a workflow step on it, so it updates.
 */
export function actionFor(req) {
  switch (req.method) {
    case 'GET':
    case 'HEAD':
      return 'read'
    case 'DELETE':
      return 'delete'
    case 'PUT':
    case 'PATCH':
      return 'update'
    case 'POST':
      return req.path === '/' || req.path === '' ? 'create' : 'update'
    default:
      return null
  }
}

/** Only lets through users whose role (and tabs) allow this request on `resource` (see permissions.js). */
export function authorize(resource) {
  return (req, res, next) => {
    const action = actionFor(req)
    if (req.user && action && userCan(req.user, resource, action)) return next()
    return res.status(403).json({ error: "Your account doesn't allow you to " + (action || 'do that') + ' ' + resource + '.' })
  }
}

/** For routes that also touch a second resource (e.g. converting a lead creates a client). */
export function requirePermission(resource, action) {
  return (req, res, next) => (userCan(req.user, resource, action)
    ? next()
    : res.status(403).json({ error: "Your account doesn't allow you to " + action + ' ' + resource + '.' }))
}
