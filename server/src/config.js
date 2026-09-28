// Security settings the server cannot run without, checked once at startup so
// a bad deploy fails immediately instead of on the first login.

// Values that have been used as example secrets (in this repo or commonly
// elsewhere). They are public, so they can never sign real tokens.
const PLACEHOLDER_SECRETS = [
  'secret', 'changeme', 'change-me', 'change_me', 'change-me-in-production', 'dev-secret', 'devsecret',
  'jwt-secret', 'jwt_secret', 'jwtsecret', 'your-secret', 'your_secret', 'your-jwt-secret', 'your_jwt_secret',
  'mysecret', 'my-secret', 'supersecret', 'super-secret', 'secretkey', 'secret-key', 'password', 'default', 'test',
]
const MIN_SECRET_BYTES = 32

// Used for CORS_ALLOWED_ORIGINS outside production when it isn't set: the Vite dev server.
const DEV_ORIGINS = ['http://localhost:5273']

export class ConfigError extends Error {
  constructor(problems) {
    super('Invalid server configuration:\n  - ' + problems.join('\n  - '))
    this.name = 'ConfigError'
    this.problems = problems
  }
}

function checkJwtSecret(secret, problems) {
  if (!secret) {
    problems.push('JWT_SECRET is not set. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"')
  } else if (PLACEHOLDER_SECRETS.includes(secret.trim().toLowerCase())) {
    problems.push('JWT_SECRET is a known placeholder value. Replace it with a random secret.')
  } else if (Buffer.byteLength(secret, 'utf8') < MIN_SECRET_BYTES) {
    problems.push('JWT_SECRET must be at least ' + MIN_SECRET_BYTES + ' bytes long (it is ' + Buffer.byteLength(secret, 'utf8') + ').')
  }
}

/**
 * Exact origins a browser may call the API from. Each entry must be a bare
 * origin (scheme://host[:port]) as browsers send it in the Origin header, so a
 * plain string comparison is enough -- no wildcards, no patterns.
 */
function parseOrigins(value, isProduction, problems) {
  const entries = String(value || '').split(',').map((o) => o.trim()).filter(Boolean)
  if (!entries.length) {
    if (isProduction) problems.push('CORS_ALLOWED_ORIGINS must list the site(s) allowed to call the API, e.g. https://app.example.com')
    return isProduction ? [] : DEV_ORIGINS
  }
  const origins = []
  for (const entry of entries) {
    if (entry.includes('*')) {
      problems.push('CORS_ALLOWED_ORIGINS must not contain wildcards ("' + entry + '"). List each origin exactly.')
      continue
    }
    let origin = null
    try { origin = new URL(entry).origin } catch { /* reported below */ }
    if (!origin || origin === 'null' || origin !== entry) {
      problems.push('CORS_ALLOWED_ORIGINS entry "' + entry + '" is not a bare origin like https://app.example.com (no path or trailing slash).')
      continue
    }
    origins.push(origin)
  }
  return origins
}

/**
 * How many reverse proxies (e.g. nginx) sit in front of the API, so req.ip is
 * the real visitor rather than the proxy -- the sign-in rate limit counts per IP.
 * Unset, empty, "0" or "false" = none (the API is reached directly).
 */
function parseTrustProxy(value, problems) {
  const text = String(value ?? '').trim().toLowerCase()
  if (!text || text === '0' || text === 'false') return false
  const hops = Number(text)
  if (!Number.isInteger(hops) || hops < 1 || hops > 5) {
    problems.push('TRUST_PROXY must be the number of proxies in front of the API (1-5), or empty for none.')
    return false
  }
  return hops
}

let current = null

/** Reads and checks the environment. Throws a ConfigError listing every problem. */
export function loadConfig(env = process.env) {
  const isProduction = env.NODE_ENV === 'production'
  const problems = []
  checkJwtSecret(env.JWT_SECRET, problems)
  const corsOrigins = parseOrigins(env.CORS_ALLOWED_ORIGINS, isProduction, problems)
  const trustProxy = parseTrustProxy(env.TRUST_PROXY, problems)
  if (problems.length) throw new ConfigError(problems)
  current = Object.freeze({ isProduction, jwtSecret: env.JWT_SECRET, corsOrigins: Object.freeze(corsOrigins), trustProxy })
  return current
}

/** The config loaded at startup. */
export function getConfig() {
  if (!current) throw new Error('Server config not loaded: call loadConfig() at startup')
  return current
}
