// The numbers behind the customer proposal: how much of the MCS generation the
// home uses itself, what that saves over 25 years, when it pays back, and the
// CO2 it avoids. Plain functions (no React) so they can be unit-tested.
//
// Generation is always the MCS estimate (kWp x Kk x SF, MIS 3002). Everything
// else here is guidance for the customer, and the PDF says so.

/** Defaults, in line with the figures installers commonly quote (Q3 2026). */
export const ASSUMPTIONS = {
  consumptionKwh: 3000, // a typical UK home
  occupancy: 'home all day',
  importTariff: 26.11, // p/kWh, Ofgem price cap GB average
  exportTariff: 12, // p/kWh, UK average SEG tariff
  years: 25,
  degradation: 0.005, // panel output lost per year
  inflation: 0.035, // energy prices rise with inflation
  discount: 0.04, // future money in today's terms
  gridCo2: 0.207, // kg CO2 per kWh of grid electricity
  carCo2PerMile: 0.2798, // average diesel car (UK GHG conversion factors 2024)
  treeCo2: 22, // kg CO2 a tree absorbs per year
  batteryCycles: 250, // full cycles a year a home battery typically does
  batteryEfficiency: 0.9,
  batteryWeatherCap: 0.8,
}

/**
 * How much PV electricity a home uses directly (before any battery), by who's
 * in during the day. Approximates the MCS self-consumption tables: at low
 * generation nearly all of it is used; it levels off at `share` of the home's
 * use. `share` is calibrated so 1,986 kWh from a 3,000 kWh "home all day"
 * household gives ~800 kWh used directly, as MCS-based tools report.
 */
export const OCCUPANCY = {
  'home all day': { label: 'Home all day', share: 0.30 },
  'in half the day': { label: 'In half the day', share: 0.25 },
  'out all day': { label: 'Out during the day', share: 0.20 },
}

/** Monthly share of a year's PV generation for a typical UK system. */
export const MONTHLY_SHARE = [0.028, 0.047, 0.083, 0.111, 0.131, 0.131, 0.132, 0.114, 0.09, 0.065, 0.038, 0.03]
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** Compass orientation to MCS "degrees from south" (east negative, west positive). */
export const DEGREES_FROM_SOUTH = { S: 0, SW: 45, W: 90, NW: 135, N: 180, SE: -45, E: -90, NE: -135 }

const num = (v, fallback) => (v === '' || v == null || Number.isNaN(Number(v)) ? fallback : Number(v))
const round = (v) => Math.round(v)

/**
 * Where the electricity goes in a year.
 *   generation: MCS kWh / year
 *   consumption: the home's use, kWh / year
 *   batteryKwh: usable battery capacity (optional)
 */
export function energySplit({ generation, consumption, occupancy, batteryKwh }) {
  const share = (OCCUPANCY[occupancy] || OCCUPANCY[ASSUMPTIONS.occupancy]).share
  const gen = Math.max(0, generation || 0)
  const use = Math.max(0, consumption || 0)
  let direct = use > 0 ? use * share * (1 - Math.exp(-gen / (use * share))) : 0
  direct = Math.min(direct, gen, use)
  // A battery stores surplus for the evening. Worked out month by month, since
  // winter has little surplus to store: each month it can shift at most one
  // charge a day, the month's surplus (less losses), and what the home still
  // needs after direct use.
  const eff = ASSUMPTIONS.batteryEfficiency
  let fromBattery = 0
  if (batteryKwh > 0 && gen > 0) {
    MONTHLY_SHARE.forEach((share, i) => {
      const genM = gen * share
      const directM = direct * share // direct use follows generation through the year
      // Dull days leave the battery part-empty, so it covers at most 80% of the rest.
      const needM = (use / 12 - directM) * ASSUMPTIONS.batteryWeatherCap
      const cycles = Math.min(DAYS[i], ASSUMPTIONS.batteryCycles * DAYS[i] / 365)
      fromBattery += Math.max(0, Math.min(batteryKwh * eff * cycles, (genM - directM) * eff, needM))
    })
  }
  const intoBattery = fromBattery / eff
  const selfUse = direct + fromBattery
  const exported = gen - direct - intoBattery
  return {
    generation: round(gen),
    consumption: round(use),
    direct: round(direct),
    fromBattery: round(fromBattery),
    selfUse: round(selfUse),
    exported: round(Math.max(0, exported)),
    imported: round(Math.max(0, use - selfUse)),
    selfSufficiency: use ? selfUse / use : 0, // share of the home's use met by solar
  }
}

/**
 * Money and CO2 over the system's life. `price` is the system price inc VAT,
 * or null when it isn't known (then there's no payback).
 */
export function proposalFigures(design, { price = null } = {}) {
  const a = ASSUMPTIONS
  const consumption = num(design?.consumptionKwh, a.consumptionKwh)
  const importP = num(design?.importTariff, a.importTariff) / 100
  const exportP = num(design?.exportTariff, a.exportTariff) / 100
  const occupancy = OCCUPANCY[design?.occupancy] ? design.occupancy : a.occupancy
  const generation = num(design?.estimatedAnnualKwh, 0)
  const energy = energySplit({ generation, consumption, occupancy, batteryKwh: num(design?.batteryKwh, 0) })

  const billBefore = consumption * importP
  const billAfter = energy.imported * importP
  const importSaving = billBefore - billAfter
  const exportIncome = energy.exported * exportP

  // Year by year: output falls with age, prices rise with inflation, and
  // everything is discounted back to today's money.
  const rows = []
  let cumulative = 0
  let payback = null
  for (let year = 1; year <= a.years; year++) {
    const age = year - 1
    const benefit = (importSaving + exportIncome) * (1 - a.degradation) ** age * (1 + a.inflation) ** age / (1 + a.discount) ** age
    cumulative += benefit
    const saving = importSaving * (1 - a.degradation) ** age * (1 + a.inflation) ** age / (1 + a.discount) ** age
    rows.push({
      year,
      cost: year === 1 && price ? price : 0,
      saving,
      exportIncome: benefit - saving,
      benefit,
      cumulative,
      cashflow: price ? cumulative - price : null,
    })
    if (price && payback == null && cumulative >= price) payback = year
  }

  const co2Before = consumption * a.gridCo2
  const co2Self = energy.selfUse * a.gridCo2
  const co2Export = energy.exported * a.gridCo2
  const co2Total = co2Self + co2Export

  return {
    assumptions: { ...a, consumptionKwh: consumption, importTariff: importP * 100, exportTariff: exportP * 100, occupancy },
    energy,
    firstYear: {
      billBefore, billAfter, importSaving, exportIncome,
      effectiveCost: billAfter - exportIncome,
      total: importSaving + exportIncome,
    },
    rows,
    lifetimeBenefit: cumulative,
    price,
    payback, // years, or null
    co2: {
      before: co2Before,
      selfUse: co2Self,
      exported: co2Export,
      total: co2Total,
      carMiles: co2Total / a.carCo2PerMile,
      trees: co2Total / a.treeCo2,
    },
    monthly: MONTHS.map((m, i) => ({ month: m, kwh: generation * MONTHLY_SHARE[i] })),
  }
}
