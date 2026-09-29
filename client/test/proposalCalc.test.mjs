import { test } from 'node:test'
import assert from 'node:assert/strict'
import { energySplit, proposalFigures, DEGREES_FROM_SOUTH, MONTHLY_SHARE } from '../src/solar/proposalCalc.js'

// The sample proposal: 3.24 kWp, 1,986 kWh/yr, 3,000 kWh home all day, £1,847.
const sample = { estimatedAnnualKwh: 1986, consumptionKwh: 3000, occupancy: 'home all day', importTariff: 26.11, exportTariff: 12 }

test('self-consumption matches MCS-based tools for the sample home', () => {
  const e = energySplit({ generation: 1986, consumption: 3000, occupancy: 'home all day' })
  assert.ok(e.direct >= 760 && e.direct <= 820, 'direct use ' + e.direct) // sample: 775-802 kWh
  assert.equal(e.direct + e.exported, 1986)
  assert.equal(e.selfUse + e.imported, 3000)
})

test('less is used directly when nobody is home in the day', () => {
  const home = energySplit({ generation: 3000, consumption: 3000, occupancy: 'home all day' })
  const out = energySplit({ generation: 3000, consumption: 3000, occupancy: 'out all day' })
  assert.ok(out.direct < home.direct)
})

test('a battery raises self-use, never beyond the surplus or the home\'s needs', () => {
  const none = energySplit({ generation: 4000, consumption: 3500, occupancy: 'out all day' })
  const batt = energySplit({ generation: 4000, consumption: 3500, occupancy: 'out all day', batteryKwh: 5 })
  assert.ok(batt.selfUse > none.selfUse)
  assert.ok(batt.selfUse <= 3500)
  assert.ok(batt.exported >= 0)
  const huge = energySplit({ generation: 1000, consumption: 5000, occupancy: 'out all day', batteryKwh: 100 })
  assert.ok(huge.selfUse <= 1000 && huge.exported >= 0)
})

test('first-year money and payback line up with the sample proposal', () => {
  const f = proposalFigures(sample, { price: 1847.27 })
  assert.equal(Math.round(f.firstYear.billBefore), 783) // 3,000 kWh x 26.11p
  assert.ok(Math.abs(f.firstYear.total - 347) < 10, 'first-year benefit ' + f.firstYear.total) // sample: £347
  assert.ok(Math.abs(f.rows[0].benefit - 346) < 10, 'year 1 ' + f.rows[0].benefit)
  assert.equal(f.payback, 6)
  assert.equal(f.rows.length, 25)
  assert.ok(f.rows[1].benefit < f.rows[0].benefit) // discounting beats inflation less degradation
})

test('no price, no payback', () => {
  const f = proposalFigures(sample)
  assert.equal(f.payback, null)
  assert.equal(f.rows[0].cashflow, null)
})

test('CO2 savings follow the grid factor (sample: 411 kg, 1,469 miles, 19 trees)', () => {
  const f = proposalFigures(sample)
  assert.ok(Math.abs(f.co2.before - 621) < 1)
  assert.ok(Math.abs(f.co2.total - 411) < 2, 'total ' + f.co2.total)
  assert.ok(Math.abs(f.co2.carMiles - 1469) < 10)
  assert.equal(Math.round(f.co2.trees), 19)
})

test('orientation and monthly profile helpers', () => {
  assert.equal(DEGREES_FROM_SOUTH.S, 0)
  assert.equal(DEGREES_FROM_SOUTH.E, -90)
  assert.ok(Math.abs(MONTHLY_SHARE.reduce((a, b) => a + b, 0) - 1) < 0.001)
})

test('a big battery on a big array stays realistic (not 100% self-sufficient)', () => {
  const e = energySplit({ generation: 5119, consumption: 3000, occupancy: 'home all day', batteryKwh: 13.5 })
  assert.ok(e.selfSufficiency > 0.5 && e.selfSufficiency < 0.9, 'self-sufficiency ' + e.selfSufficiency)
  assert.equal(e.selfUse + e.imported, 3000)
  assert.ok(e.exported > 0)
})
