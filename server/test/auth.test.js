import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { loadConfig } from '../src/config.js'
import { signToken, verifyToken } from '../src/middleware/auth.js'

const SECRET = 'k3Jx9vQ2pL7mN4rT8wY1zA6bC5dE0fG2hJ4kM7nP9qR'
const USER = { _id: '66f000000000000000000001' }
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')

before(() => loadConfig({ JWT_SECRET: SECRET }))

test('tokens are signed with HS256 and carry an expiry', () => {
  const token = signToken(USER)
  const { header, payload } = jwt.decode(token, { complete: true })
  assert.equal(header.alg, 'HS256')
  assert.equal(typeof payload.exp, 'number')
  assert.ok(payload.exp > Date.now() / 1000)
  assert.equal(verifyToken(token).sub, USER._id)
})

test('an alg:none token is rejected', () => {
  const now = Math.floor(Date.now() / 1000)
  const token = b64({ alg: 'none', typ: 'JWT' }) + '.' + b64({ sub: USER._id, iat: now, exp: now + 3600 }) + '.'
  assert.throws(() => verifyToken(token))
})

test('a token signed with a different algorithm is rejected, even with the right secret', () => {
  const token = jwt.sign({ sub: USER._id }, SECRET, { algorithm: 'HS512', expiresIn: '1h' })
  assert.throws(() => verifyToken(token), /invalid algorithm/)
})

test('a token signed with another secret (e.g. the old dev-secret) is rejected', () => {
  for (const secret of ['dev-secret', 'change-me-in-production']) {
    const forged = jwt.sign({ sub: USER._id }, secret, { algorithm: 'HS256', expiresIn: '1h' })
    assert.throws(() => verifyToken(forged), /invalid signature/)
  }
})

test('an expired token is rejected', () => {
  const token = jwt.sign({ sub: USER._id, exp: Math.floor(Date.now() / 1000) - 10 }, SECRET, { algorithm: 'HS256' })
  assert.throws(() => verifyToken(token), /jwt expired/)
})

test('a token without an expiry is rejected', () => {
  const token = jwt.sign({ sub: USER._id }, SECRET, { algorithm: 'HS256' })
  assert.throws(() => verifyToken(token), /no expiry/)
})
