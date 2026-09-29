import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HANDOVER_SECTIONS, handoverSectionsFor, handoverProgress } from '../src/handoverChecklist.js'

test('the handover follows the job\'s products', () => {
  const keys = (p) => handoverSectionsFor(p).map((s) => s.key)
  assert.deepEqual(keys(['ev']), ['certification', 'ev', 'customer'])
  assert.deepEqual(keys(['solar', 'battery']), ['certification', 'pv', 'battery', 'customer'])
  // SEG information only for solar / battery jobs.
  const items = (p) => handoverSectionsFor(p).flatMap((s) => s.items.map((i) => i.key))
  assert.ok(!items(['ev']).includes('docSeg'))
  assert.ok(items(['solar']).includes('docSeg') && items(['solar']).includes('mcsCertificate'))
})

test('item keys are unique and every section cites its standard', () => {
  const keys = HANDOVER_SECTIONS.flatMap((s) => s.items.map((i) => i.key))
  assert.equal(new Set(keys).size, keys.length)
  for (const s of HANDOVER_SECTIONS) assert.ok(s.reference, s.key)
})

test('progress needs every required item; a failed safety check is an issue', () => {
  const answers = {}
  for (const s of handoverSectionsFor(['ev'])) for (const i of s.items) if (i.required) answers[i.key] = i.type === 'yesno' ? 'yes' : i.options ? i.options[0] : '1'
  const full = handoverProgress(['ev'], answers)
  assert.equal(full.percent, 100)
  assert.equal(full.issues.length, 0)
  const failed = handoverProgress(['ev'], { ...answers, evRcdTest: 'no' })
  assert.deepEqual(failed.issues.map((i) => i.key), ['evRcdTest'])
  assert.equal(handoverProgress(['ev'], {}).percent, 0)
})
