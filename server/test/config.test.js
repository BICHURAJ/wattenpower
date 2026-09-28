import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { loadConfig, ConfigError } from '../src/config.js'

const STRONG = 'k3Jx9vQ2pL7mN4rT8wY1zA6bC5dE0fG2hJ4kM7nP9qR'

const problemsFor = (env) => {
  try {
    loadConfig(env)
    return []
  } catch (err) {
    assert.ok(err instanceof ConfigError)
    return err.problems
  }
}

test('a missing JWT_SECRET is rejected', () => {
  assert.match(problemsFor({}).join('\n'), /JWT_SECRET is not set/)
  assert.match(problemsFor({ JWT_SECRET: '' }).join('\n'), /JWT_SECRET is not set/)
})

test('a JWT_SECRET shorter than 32 bytes is rejected', () => {
  assert.match(problemsFor({ JWT_SECRET: 'a'.repeat(31) }).join('\n'), /at least 32 bytes/)
  assert.deepEqual(problemsFor({ JWT_SECRET: 'a'.repeat(32) }), [])
})

test('placeholder secrets are rejected, including the ones this repo used to ship', () => {
  for (const value of ['secret', 'changeme', 'dev-secret', 'change-me-in-production', 'CHANGE-ME-IN-PRODUCTION', ' dev-secret ']) {
    assert.match(problemsFor({ JWT_SECRET: value }).join('\n'), /placeholder/, value)
  }
})

test('.env.example does not contain a usable secret', () => {
  const example = readFileSync(new URL('../.env.example', import.meta.url), 'utf8')
  const line = example.split(/\r?\n/).find((l) => l.startsWith('JWT_SECRET='))
  assert.ok(line, '.env.example documents JWT_SECRET')
  assert.notDeepEqual(problemsFor({ JWT_SECRET: line.slice('JWT_SECRET='.length) }), [])
})

test('a strong secret is accepted and development falls back to the Vite origin', () => {
  const config = loadConfig({ JWT_SECRET: STRONG })
  assert.equal(config.jwtSecret, STRONG)
  assert.deepEqual(config.corsOrigins, ['http://localhost:5273'])
})

test('production refuses to start without CORS_ALLOWED_ORIGINS', () => {
  assert.match(problemsFor({ NODE_ENV: 'production', JWT_SECRET: STRONG }).join('\n'), /CORS_ALLOWED_ORIGINS must list/)
  assert.match(problemsFor({ NODE_ENV: 'production', JWT_SECRET: STRONG, CORS_ALLOWED_ORIGINS: ' , ' }).join('\n'), /CORS_ALLOWED_ORIGINS must list/)
})

test('wildcards and malformed origins are rejected', () => {
  for (const value of ['*', 'https://*.example.com', 'https://app.example.com,*']) {
    assert.match(problemsFor({ NODE_ENV: 'production', JWT_SECRET: STRONG, CORS_ALLOWED_ORIGINS: value }).join('\n'), /wildcards/, value)
    assert.match(problemsFor({ JWT_SECRET: STRONG, CORS_ALLOWED_ORIGINS: value }).join('\n'), /wildcards/, value + ' (dev)')
  }
  for (const value of ['https://app.example.com/', 'https://app.example.com/login', 'app.example.com', 'null']) {
    assert.match(problemsFor({ NODE_ENV: 'production', JWT_SECRET: STRONG, CORS_ALLOWED_ORIGINS: value }).join('\n'), /not a bare origin/, value)
  }
})

test('TRUST_PROXY is off by default and accepts a small hop count', () => {
  assert.equal(loadConfig({ JWT_SECRET: STRONG }).trustProxy, false)
  assert.equal(loadConfig({ JWT_SECRET: STRONG, TRUST_PROXY: 'false' }).trustProxy, false)
  assert.equal(loadConfig({ JWT_SECRET: STRONG, TRUST_PROXY: '1' }).trustProxy, 1)
  for (const value of ['true', '-1', '99', 'nginx']) {
    assert.match(problemsFor({ JWT_SECRET: STRONG, TRUST_PROXY: value }).join('\n'), /TRUST_PROXY/, value)
  }
})

test('a comma-separated list of origins is parsed exactly', () => {
  const config = loadConfig({
    NODE_ENV: 'production',
    JWT_SECRET: STRONG,
    CORS_ALLOWED_ORIGINS: 'https://app.example.com, https://staging.example.com',
  })
  assert.deepEqual(config.corsOrigins, ['https://app.example.com', 'https://staging.example.com'])
})
