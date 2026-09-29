import mongoose from 'mongoose'
import { DESIGN_OPTIONS } from '../processes.js'

// The design of a solar PV and/or battery system, done by the engineer to MCS
// rules after the sale (it isn't part of the quotation). Only engineers and
// admins can change it (the systemDesign right in permissions.js).
//
// The generation estimate follows the MCS method (MIS 3002):
//   annual kWh = kWp x Kk x SF
//   Kk  from the MCS tables for the site's irradiance zone, roof pitch and orientation
//   SF  shading factor from the MCS shade assessment (1 = no shading)
const { orientations: ORIENTATIONS, mounting: MOUNTING } = DESIGN_OPTIONS

const optionalEnum = (values) => ({ type: String, enum: ['', ...values], default: '' })
const amount = { type: Number, min: 0 }

export const SystemDesignSchema = new mongoose.Schema({
  // Solar panels
  panelMake: String,
  panelModel: String,
  panelCount: { ...amount, max: 500 },
  panelWatts: { ...amount, max: 1000 }, // per panel, W
  // Inverter
  inverterMake: String,
  inverterModel: String,
  inverterKw: { ...amount, max: 100 },
  // Battery
  batteryMake: String,
  batteryModel: String,
  batteryKwh: { ...amount, max: 200 },
  // Roof / array
  orientation: optionalEnum(ORIENTATIONS),
  pitch: { ...amount, max: 90 }, // degrees from horizontal
  mounting: optionalEnum(MOUNTING),
  // MCS performance estimate inputs
  mcsZone: { type: String, trim: true, maxlength: 10 }, // irradiance zone from the site postcode
  kk: { ...amount, max: 2000 }, // kWh/kWp from the MCS table
  shadingFactor: { ...amount, max: 1 }, // SF, 0-1
  // kWp x Kk x SF, worked out on save (kWh / year)
  estimatedAnnualKwh: { ...amount, max: 1000000 },
  // Customer proposal: the home's use and tariffs, for the self-consumption,
  // savings and payback figures (client/src/solar/proposalCalc.js).
  consumptionKwh: { ...amount, max: 1000000 }, // kWh / year
  occupancy: { type: String, enum: ['', 'home all day', 'in half the day', 'out all day'], default: '' },
  importTariff: { ...amount, max: 500 }, // p/kWh
  exportTariff: { ...amount, max: 500 }, // p/kWh
  notes: String,
}, { _id: false, toJSON: { virtuals: true }, toObject: { virtuals: true } })

const kWpOf = (d) => (d.panelCount && d.panelWatts ? Math.round(d.panelCount * d.panelWatts) / 1000 : undefined)

// Array size in kW peak: panels x watts.
SystemDesignSchema.virtual('kWp').get(function () { return kWpOf(this) })

// The MCS estimate is always calculated, never typed in, so it can't drift from its inputs.
SystemDesignSchema.pre('validate', function (next) {
  const kWp = kWpOf(this)
  this.estimatedAnnualKwh = kWp && this.kk && this.shadingFactor != null && this.shadingFactor !== ''
    ? Math.round(kWp * this.kk * this.shadingFactor)
    : undefined
  next()
})
