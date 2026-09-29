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

test('steps are ticked in order', async () => {
  const { progressOrderProblem } = await import('../src/processes.js')
  const ev = ['ev']
  // Survey first: fine.
  assert.equal(progressOrderProblem(ev, {}, { siteSurveyCompleted: true }), null)
  // Installation before the quote is accepted: refused, naming the missing step.
  assert.match(progressOrderProblem(ev, { siteSurveyCompleted: true }, { siteSurveyCompleted: true, installationInProgress: true }).message, /Quotation accepted/)
  // With the quote accepted it's allowed.
  const ready = { siteSurveyCompleted: true, quotationAccepted: true }
  assert.equal(progressOrderProblem(ev, ready, { ...ready, installationInProgress: true }), null)
  // Skipping a step: refused.
  assert.match(progressOrderProblem(ev, ready, { ...ready, handover: true }).message, /Installation/)
})

test('a step can only be unticked while nothing after it is done', async () => {
  const { progressOrderProblem } = await import('../src/processes.js')
  const upTo = { siteSurveyCompleted: true, quotationAccepted: true, installationInProgress: true, testingCertification: true }
  assert.match(progressOrderProblem(['ev'], upTo, { ...upTo, installationInProgress: false }).message, /Untick "Testing/)
  assert.equal(progressOrderProblem(['ev'], upTo, { ...upTo, testingCertification: false }), null)
})

test('the quote step follows the quotation and is never held up', async () => {
  const { progressOrderProblem } = await import('../src/processes.js')
  // Quote accepted before the survey is done: allowed (it isn't a hand step).
  assert.equal(progressOrderProblem(['ev'], {}, { quotationAccepted: true }), null)
  // Quote withdrawn after work started: allowed too.
  const started = { siteSurveyCompleted: true, quotationAccepted: true, installationInProgress: true }
  assert.equal(progressOrderProblem(['ev'], started, { ...started, quotationAccepted: false }), null)
})

test('Completed needs every step, including solar ones', async () => {
  const { progressOrderProblem, stepsFor } = await import('../src/processes.js')
  const all = Object.fromEntries(stepsFor(['solar']).map((s) => [s.key, true]))
  assert.equal(progressOrderProblem(['solar'], all, all, { completing: true }), null)
  const noMcs = { ...all, mcsCertificate: false, scaffoldingDown: false, handover: false }
  assert.match(progressOrderProblem(['solar'], noMcs, noMcs, { completing: true }).message, /MCS certificate/)
})
