import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { loadConfig } from '../src/config.js'
import { createApp } from '../src/app.js'

process.env.NODE_ENV = 'test' // quiet request logging

const ALLOWED = 'https://app.example.com'
let server
let port

before(async () => {
  const config = loadConfig({
    NODE_ENV: 'production',
    JWT_SECRET: 'k3Jx9vQ2pL7mN4rT8wY1zA6bC5dE0fG2hJ4kM7nP9qR',
    CORS_ALLOWED_ORIGINS: ALLOWED + ',https://staging.example.com',
  })
  server = createApp(config).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  port = server.address().port
})

after(() => server.close())

// node:http rather than fetch, so the Origin header is sent exactly as given.
const request = (method, path, headers) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
    res.resume()
    res.on('end', () => resolve(res))
  })
  req.on('error', reject)
  req.end()
})

test('an allowed origin gets CORS headers for its own origin only', async () => {
  const res = await request('GET', '/api/health', { Origin: ALLOWED })
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['access-control-allow-origin'], ALLOWED)
  assert.match(res.headers.vary || '', /Origin/)
  assert.equal(res.headers['access-control-allow-credentials'], undefined)
})

test('a disallowed origin gets no CORS headers', async () => {
  for (const origin of [
    'https://evil.example.org',
    'https://app.example.com.evil.org', // allowed origin as a prefix
    'https://evilapp.example.com', // allowed origin as a suffix
    'http://app.example.com', // wrong scheme
    'https://app.example.com:8443', // wrong port
    'null',
  ]) {
    const res = await request('GET', '/api/health', { Origin: origin })
    assert.equal(res.headers['access-control-allow-origin'], undefined, origin)
  }
})

test('a preflight from an allowed origin lists only the methods and headers the app uses', async () => {
  const res = await request('OPTIONS', '/api/clients', {
    Origin: ALLOWED,
    'Access-Control-Request-Method': 'DELETE',
    'Access-Control-Request-Headers': 'authorization,content-type',
  })
  assert.equal(res.statusCode, 204)
  assert.equal(res.headers['access-control-allow-origin'], ALLOWED)
  assert.equal(res.headers['access-control-allow-methods'], 'GET,POST,PUT,DELETE')
  assert.equal(res.headers['access-control-allow-headers'], 'Content-Type,Authorization')
})

test('a preflight from a disallowed origin gets no CORS headers', async () => {
  const res = await request('OPTIONS', '/api/clients', {
    Origin: 'https://evil.example.org',
    'Access-Control-Request-Method': 'DELETE',
  })
  assert.equal(res.headers['access-control-allow-origin'], undefined)
})
