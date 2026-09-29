import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STEPS, stepsFor, normaliseProducts, progressOf, stepDone, HAND_STEP_KEYS } from '../src/processes.js'

const keys = (steps) => steps.map((s) => s.key)

test('an EV job has exactly the original five steps, in order', () => {
  assert.deepEqual(keys(stepsFor(['ev'])), [
    'siteSurveyCompleted', 'quotationAccepted', 'installationInProgress', 'testingCertification', 'handover',
  ])
})

test('solar adds design, DNO, scaffolding and MCS steps', () => {
  assert.deepEqual(keys(stepsFor(['solar'])), [
    'siteSurveyCompleted', 'systemDesigned', 'quotationAccepted', 'dnoApplication', 'scaffoldingUp',
    'installationInProgress', 'testingCertification', 'mcsCertificate', 'scaffoldingDown', 'handover',
  ])
})

test('a battery-only job has no scaffolding', () => {
  const k = keys(stepsFor(['battery']))
  assert.ok(k.includes('dnoApplication') && k.includes('mcsCertificate'))
  assert.ok(!k.includes('scaffoldingUp') && !k.includes('scaffoldingDown'))
})

test('a combined job lists shared steps once, in catalogue order', () => {
  const combo = keys(stepsFor(['ev', 'battery', 'solar']))
  assert.deepEqual(combo, keys(stepsFor(['solar']))) // solar already covers every EV and battery step
  assert.equal(new Set(combo).size, combo.length)
  assert.deepEqual(combo, STEPS.map((s) => s.key).filter((k) => combo.includes(k)))
})

test('products are cleaned up: known keys, no duplicates, EV by default', () => {
  assert.deepEqual(normaliseProducts(['battery', 'solar', 'solar', 'rocket']), ['solar', 'battery'])
  assert.deepEqual(normaliseProducts(undefined), ['ev'])
  assert.deepEqual(normaliseProducts(['nope']), ['ev'])
  assert.deepEqual(normaliseProducts('solar'), ['solar'])
  assert.deepEqual(normaliseProducts([], { allowEmpty: true }), [])
})

test('progress counts only the job\'s own steps, plus Completed', () => {
  const ev = { products: ['ev'], progress: { siteSurveyCompleted: true, quotationAccepted: true, scaffoldingUp: true } }
  assert.deepEqual(progressOf(ev), { done: 2, total: 6 }) // scaffolding isn't an EV step
  const solar = { products: ['solar'], progress: new Map([['siteSurveyCompleted', true], ['scaffoldingUp', true]]) }
  assert.deepEqual(progressOf(solar), { done: 2, total: 11 })
  assert.deepEqual(progressOf({ products: ['solar'], status: 'Completed' }), { done: 11, total: 11 })
  assert.deepEqual(progressOf({}), { done: 0, total: 6 }) // old records: treated as EV
})

test('stepDone reads Maps, plain objects and nothing', () => {
  assert.equal(stepDone(new Map([['handover', true]]), 'handover'), true)
  assert.equal(stepDone({ handover: true }, 'handover'), true)
  assert.equal(stepDone(undefined, 'handover'), false)
})

test('the quotation step is never a hand step', () => {
  assert.ok(!HAND_STEP_KEYS.includes('quotationAccepted'))
  assert.ok(HAND_STEP_KEYS.includes('scaffoldingUp'))
})
