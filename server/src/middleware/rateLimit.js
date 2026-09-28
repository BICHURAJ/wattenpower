// A small in-memory rate limiter for the sign-in and sign-up forms, so they
// can't be hammered with password guesses or fake accounts. Counts are per
// client IP and reset on restart; behind a proxy, set Express's "trust proxy"
// so req.ip is the real client.

export function rateLimit({ windowMs, max, message }) {
  const hits = new Map() // ip -> { count, resetAt }

  return (req, res, next) => {
    const now = Date.now()
    if (hits.size > 10000) {
      for (const [ip, entry] of hits) if (entry.resetAt <= now) hits.delete(ip)
    }
    const ip = req.ip || req.socket?.remoteAddress || 'unknown'
    let entry = hits.get(ip)
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs }
      hits.set(ip, entry)
    }
    entry.count++
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)))
      return res.status(429).json({ error: message })
    }
    next()
  }
}
