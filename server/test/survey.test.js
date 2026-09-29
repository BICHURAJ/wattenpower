import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SURVEY_SECTIONS, surveySectionsFor, surveyProgress, PHOTO_STAGE_KEYS } from '../src/surveyChecklist.js'
import { can } from '../src/permissions.js'

test('the checklist follows the job\'s products', () => {
  const keys = (p) => surveySectionsFor(p).map((s) => s.key)
  assert.deepEqual(keys(['ev']), ['property', 'supply', 'existing', 'ev', 'signoff'])
  assert.ok(keys(['solar']).includes('roof') && keys(['solar']).includes('shading') && !keys(['solar']).includes('ev'))
  assert.ok(keys(['battery']).includes('battery') && !keys(['battery']).includes('roof'))
  assert.deepEqual(keys([]), keys(['ev'])) // no products: EV by default
})

test('every item and photo key is unique, and every section cites its standard', () => {
  const items = SURVEY_SECTIONS.flatMap((s) => s.items.map((i) => i.key))
  const photos = SURVEY_SECTIONS.flatMap((s) => s.photos.map((p) => p.key))
  assert.equal(new Set(items).size, items.length)
  assert.equal(new Set(photos).size, photos.length)
  for (const s of SURVEY_SECTIONS) assert.ok(s.reference, s.key)
})

test('progress counts required answers and photos; optional ones do not block', () => {
  const empty = surveyProgress(['ev'], {})
  assert.equal(empty.done, 0)
  assert.ok(empty.total > 20)
  assert.equal(empty.percent, 0)
  // Fill every required item and photo.
  const answers = {}
  const slots = new Set()
  for (const s of surveySectionsFor(['ev'])) {
    for (const i of s.items) if (i.required) answers[i.key] = i.type === 'yesno' ? 'yes' : i.options ? i.options[0] : '1'
    for (const p of s.photos) slots.add(p.key)
  }
  const full = surveyProgress(['ev'], answers, slots)
  assert.equal(full.percent, 100)
  assert.equal(full.missing.length, 0)
  assert.equal(full.issues.length, 0)
  // A missing photo shows as missing.
  slots.delete('consumerUnit')
  assert.ok(surveyProgress(['ev'], answers, slots).missing.some((m) => m.key === 'consumerUnit' && m.photo))
})

test('unsafe answers are flagged as issues (e.g. no main bonding)', () => {
  const p = surveyProgress(['ev'], new Map([['mainBonding', 'no'], ['capacityOk', 'yes']]))
  assert.deepEqual(p.issues.map((i) => i.key), ['mainBonding'])
})

test('photo stages run from survey to handover', () => {
  assert.deepEqual(PHOTO_STAGE_KEYS, ['survey', 'pre-install', 'installation', 'completion'])
})

test('who can survey and add photos', () => {
  assert.equal(can('engineer', 'siteSurveys', 'update'), true)
  assert.equal(can('engineer', 'photos', 'create'), true)
  assert.equal(can('engineer', 'photos', 'delete'), false) // only their own (checked in the route)
  assert.equal(can('sales', 'siteSurveys', 'update'), true)
  assert.equal(can('finance', 'siteSurveys', 'update'), false)
  assert.equal(can('finance', 'photos', 'read'), true)
  assert.equal(can('admin', 'photos', 'delete'), true)
})
