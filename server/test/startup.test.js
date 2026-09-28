import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const serverDir = fileURLToPath(new URL('..', import.meta.url))

// An empty .env, so the developer's own server/.env can't fill in the gaps.
const emptyEnvFile = join(mkdtempSync(join(tmpdir(), 'wp-env-')), '.env')
writeFileSync(emptyEnvFile, '')

/** Starts the real server with the given settings; it should exit before touching the database. */
function start(env) {
  const base = { ...process.env }
  for (const key of ['JWT_SECRET', 'CORS_ALLOWED_ORIGINS', 'NODE_ENV']) delete base[key]
  return spawnSync(process.execPath, ['src/index.js'], {
    cwd: serverDir,
    env: { ...base, DOTENV_CONFIG_PATH: emptyEnvFile, MONGODB_URI: 'mongodb://127.0.0.1:1/unused', ...env },
    encoding: 'utf8',
    timeout: 15000,
  })
}

test('the server exits at startup when JWT_SECRET is missing', () => {
  const run = start({})
  assert.equal(run.status, 1)
  assert.match(run.stderr, /JWT_SECRET is not set/)
  assert.doesNotMatch(run.stdout + run.stderr, /\[db\]/, 'it stopped before connecting to the database')
})

test('the server exits at startup when JWT_SECRET is weak', () => {
  for (const [secret, message] of [['dev-secret', /placeholder/], ['short-but-not-a-placeholder', /at least 32 bytes/]]) {
    const run = start({ JWT_SECRET: secret })
    assert.equal(run.status, 1, secret)
    assert.match(run.stderr, message, secret)
  }
})

test('the server exits at startup in production without CORS_ALLOWED_ORIGINS, or with a wildcard', () => {
  const secret = 'k3Jx9vQ2pL7mN4rT8wY1zA6bC5dE0fG2hJ4kM7nP9qR'
  for (const origins of [undefined, '*']) {
    const run = start({ NODE_ENV: 'production', JWT_SECRET: secret, ...(origins && { CORS_ALLOWED_ORIGINS: origins }) })
    assert.equal(run.status, 1, String(origins))
    assert.match(run.stderr, /CORS_ALLOWED_ORIGINS/, String(origins))
  }
})
