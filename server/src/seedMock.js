import 'dotenv/config'
import mongoose from 'mongoose'

import { connectDB } from './db.js'
import Client from './models/Client.js'
import Engineer, { defaultWeek } from './models/Engineer.js'
import Quotation from './models/Quotation.js'
import Installation from './models/Installation.js'
import Certification from './models/Certification.js'
import Ticket from './models/Ticket.js'
import Grant from './models/Grant.js'
import { stepsFor } from './processes.js'

// Adds a realistic batch of mock data on top of what is already there:
// 5 engineers (one per region), 42 clients, and 50 installations, each with
// its own quotation. Unlike seed.js it never wipes the database.
//
//   npm run seed:mock          add the mock data (refuses if it is already there)
//   npm run seed:mock:clear    remove only the mock data
//
// Mock records are tagged so they can be found again: engineers by their
// email domain, clients by a note from MOCK_AUTHOR. Quotations, installations
// and certificates are found through those clients.
//
// Needs internet access: real postcodes (and their map points) come from postcodes.io.

const MOCK_DOMAIN = '@mock.wattenpower.test'
const MOCK_AUTHOR = 'mock-data'

// --- Small helpers --------------------------------------------------------------
// Seeded random numbers, so the same run gives the same names, prices and dates.
let seed = 20260928
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = (list) => list[Math.floor(rand() * list.length)]
const between = (min, max) => min + Math.floor(rand() * (max - min + 1))
const chance = (p) => rand() < p

const today = new Date()
today.setHours(9, 0, 0, 0)
const day = (offset) => {
  const d = new Date(today)
  d.setDate(d.getDate() + offset)
  return d
}

// --- Regions: one engineer each, and the postcode districts they cover --------------
const REGIONS = [
  {
    area: 'London', outcodes: ['SW11', 'SE22', 'N16', 'E17', 'W5', 'NW3', 'SW19', 'SE10'],
    engineer: { name: 'Daniel Okafor', phone: '07700 900111', role: 'Senior Engineer', status: 'On Job' },
  },
  {
    area: 'South East & Thames Valley', outcodes: ['RG1', 'RG30', 'OX4', 'GU1', 'SL6', 'HP13', 'MK9', 'KT1'],
    engineer: { name: 'Priya Sharma', phone: '07700 900222', role: 'Installation Engineer', status: 'Available' },
  },
  {
    area: 'Midlands', outcodes: ['B15', 'B30', 'CV1', 'LE2', 'NG5', 'DE22', 'WV3'],
    engineer: { name: 'Tom Hughes', phone: '07700 900333', role: 'Installation Engineer', status: 'On Job' },
  },
  {
    area: 'North West', outcodes: ['M20', 'M14', 'L18', 'WA14', 'SK4', 'PR1'],
    engineer: { name: 'Chloe Whitfield', phone: '07700 900444', role: 'Electrician', status: 'Available' },
  },
  {
    area: 'Yorkshire', outcodes: ['LS6', 'LS17', 'S10', 'YO24', 'HG1', 'HD1'],
    engineer: { name: 'Ryan McAllister', phone: '07700 900555', role: 'Surveyor', status: 'Off Duty' },
  },
]

const FIRST = ['Oliver', 'Amelia', 'George', 'Isla', 'Harry', 'Ava', 'Jack', 'Mia', 'Noah', 'Grace', 'Leo', 'Sophie', 'Arthur', 'Emily', 'Oscar',
  'Freya', 'Charlie', 'Lily', 'Thomas', 'Ella', 'James', 'Hannah', 'William', 'Zara', 'Samuel', 'Ruby', 'Ethan', 'Poppy', 'Aisha', 'Mohammed', 'Chen', 'Anya']
const LAST = ['Taylor', 'Wilson', 'Davies', 'Evans', 'Thomas', 'Roberts', 'Walker', 'Wright', 'Robinson', 'Thompson', 'White', 'Hughes', 'Edwards',
  'Green', 'Hall', 'Wood', 'Harris', 'Clarke', 'Patel', 'Khan', 'Jackson', 'Turner', 'Hill', 'Moore', 'Cooper', 'Ward', 'Morris', 'Kaur', 'Nowak', 'Li']
const STREETS = ['Oak Road', 'Church Lane', 'Station Road', 'Victoria Street', 'Park Avenue', 'Mill Lane', 'The Crescent', 'Kingsway',
  'Elm Grove', 'Manor Road', 'Queens Drive', 'Orchard Close', 'Highfield Road', 'Willow Way', 'Chestnut Avenue', 'York Road']
const FIT_POINTS = ['Garage - right wall', 'Garage - left wall', 'Driveway - front wall', 'Side of house by meter', 'Car port post',
  'Rear of house by back door', 'Front porch wall', 'Detached garage - gable end']
const ACCESS = ['Call on arrival', 'Key safe code provided', 'Customer working from home', 'Dog on site - please ring first',
  'Park on the drive', 'Side gate unlocked', 'Customer out after 2pm', '']
const HOLD_REASONS = ['Awaiting DNO approval for supply upgrade', 'Customer rearranging - moving house', 'Waiting on consumer unit parts',
  'Landlord permission needed']

const DOMESTIC_CHARGERS = [
  { model: 'Zappi 7kW', price: 849 },
  { model: 'Ohme ePod 7kW', price: 799 },
  { model: 'Hypervolt Home 3 Pro', price: 829 },
  { model: 'Pod Point Solo 3S', price: 779 },
  { model: 'Easee One 7kW', price: 899 },
  { model: 'Wallbox Pulsar Plus', price: 749 },
]
const COMMERCIAL_CHARGERS = [
  { model: 'Rolec Zura 22kW (dual)', price: 1650 },
  { model: 'Alfen Eve Double Pro-line 22kW', price: 2150 },
  { model: 'Easee Charge Core 22kW', price: 1380 },
]
const EXTRAS = [
  { description: 'Additional cable run (per metre)', unitPrice: 12, qty: () => between(5, 20) },
  { description: 'Consumer unit upgrade', unitPrice: 450, qty: () => 1 },
  { description: 'Earth rod installation', unitPrice: 95, qty: () => 1 },
  { description: 'Surge protection device (SPD)', unitPrice: 120, qty: () => 1 },
  { description: 'Groundworks / trenching (per metre)', unitPrice: 45, qty: () => between(3, 10) },
]

// Business customers: several sites each, one installation per site.
const BUSINESSES = [
  { name: 'Northgate Logistics Ltd', contact: 'Helen Price', sites: 3 },
  { name: 'Greenleaf Housing Association', contact: 'Marcus Bell', sites: 3 },
  { name: 'Brightside Dental Group', contact: 'Dr. Aisha Rahman', sites: 3 },
  { name: 'Kestrel Hotels Ltd', contact: 'Owen Fletcher', sites: 3 },
]
const DOMESTIC_CLIENTS = 38
const INACTIVE_DOMESTIC = 2 // older customers whose jobs are long finished

// How the 50 jobs are spread across the workflow.
const JOB_STATUSES = [
  ...Array(18).fill('Completed'),
  ...Array(10).fill('In Progress'),
  ...Array(14).fill('Scheduled'),
  ...Array(4).fill('On Hold'),
  ...Array(4).fill('Cancelled'),
]

// --- Postcodes ----------------------------------------------------------------------
async function randomPostcode(outcode) {
  const res = await fetch('https://api.postcodes.io/random/postcodes?outcode=' + encodeURIComponent(outcode))
  if (!res.ok) throw new Error('postcodes.io returned ' + res.status + ' for ' + outcode)
  const { result } = await res.json()
  if (!result) throw new Error('no postcodes found for ' + outcode)
  return {
    postcode: result.postcode,
    town: result.admin_district || result.parish || '',
    area: result.admin_ward || '',
    location: { lat: result.latitude, lng: result.longitude },
  }
}

const address = (place) => between(1, 180) + ' ' + pick(STREETS) + ', ' + [place.area, place.town].filter((v, i, a) => v && a.indexOf(v) === i).join(', ')
const phone = () => '07' + between(100, 999) + ' ' + between(100000, 999999)

// --- Quotation lines ---------------------------------------------------------------------
function quoteItems(commercial) {
  const charger = pick(commercial ? COMMERCIAL_CHARGERS : DOMESTIC_CHARGERS)
  const items = [
    { description: charger.model + ' charger (supply only)', qty: 1, unitPrice: charger.price, vat: 20 },
    { description: 'Installation, testing & commissioning', qty: 1, unitPrice: commercial ? 650 : 350, vat: 20 },
  ]
  for (const extra of EXTRAS) {
    if (chance(commercial ? 0.45 : 0.3)) items.push({ description: extra.description, qty: extra.qty(), unitPrice: extra.unitPrice, vat: 20 })
  }
  return { charger, items }
}

// --- Solar PV and batteries ------------------------------------------------------------
// Most homes still want a charger; a good share now want solar, often with a battery.
const DOMESTIC_MIX = [['ev'], ['ev'], ['ev'], ['solar'], ['solar', 'battery'], ['solar', 'battery'], ['solar', 'battery', 'ev'], ['battery']]
const COMMERCIAL_MIX = [['ev'], ['ev'], ['solar'], ['solar', 'ev']]
const PANELS = [
  { make: 'Aiko', model: 'Neostar 2P 450W', watts: 450 },
  { make: 'JA Solar', model: 'JAM54D40 435W', watts: 435 },
  { make: 'Longi', model: 'Hi-MO 6 430W', watts: 430 },
  { make: 'REC', model: 'Alpha Pure-R 410W', watts: 410 },
]
const INVERTERS = [
  { make: 'SolarEdge', model: 'SE3680H', kw: 3.68 },
  { make: 'GivEnergy', model: 'Gen 3 Hybrid 5.0', kw: 5 },
  { make: 'Fox ESS', model: 'H1-5.0-E', kw: 5 },
  { make: 'SolarEdge', model: 'SE10K', kw: 10 },
]
const BATTERIES = [
  { make: 'GivEnergy', model: 'Giv-Bat 9.5', kwh: 9.5 },
  { make: 'Tesla', model: 'Powerwall 3', kwh: 13.5 },
  { make: 'Fox ESS', model: 'EP5', kwh: 5.2 },
]
const ROOF_FACING = ['S', 'S', 'SE', 'SW', 'E', 'W']

/** A realistic system design for the chosen products. */
function systemDesign(products, commercial) {
  const design = {}
  if (products.includes('solar')) {
    const panel = pick(PANELS)
    const count = commercial ? between(24, 80) : between(8, 16)
    const facing = pick(ROOF_FACING)
    // Roughly what the MCS tables give for a pitched roof in England (kWh/kWp).
    const kk = { S: 950, SE: 900, SW: 900, E: 780, W: 780 }[facing] + between(-40, 40)
    Object.assign(design, {
      panelMake: panel.make, panelModel: panel.model, panelCount: count, panelWatts: panel.watts,
      orientation: facing, pitch: commercial ? between(5, 15) : between(30, 45),
      mounting: commercial ? 'Flat roof' : pick(['On-roof', 'On-roof', 'In-roof']),
      mcsZone: pick(['2', '3', '4', '5E', '5W', '6', '7E', '8E']),
      kk,
      shadingFactor: pick([1, 1, 1, 0.95, 0.9, 0.85]),
    })
    const inverter = commercial ? INVERTERS[3] : pick(INVERTERS.slice(0, 3))
    Object.assign(design, { inverterMake: inverter.make, inverterModel: inverter.model, inverterKw: inverter.kw })
  }
  if (products.includes('battery')) {
    const battery = pick(BATTERIES)
    Object.assign(design, { batteryMake: battery.make, batteryModel: battery.model, batteryKwh: battery.kwh })
    if (!design.inverterMake) Object.assign(design, { inverterMake: 'GivEnergy', inverterModel: 'AC Coupled 3.0', inverterKw: 3 })
  }
  return design
}

/** Quote lines for solar / battery. Residential solar and batteries are 0% VAT (to March 2027). */
function solarItems(products, design, commercial) {
  const vat = commercial ? 20 : 0
  const items = []
  if (products.includes('solar')) {
    items.push({ description: design.panelCount + ' x ' + design.panelMake + ' ' + design.panelModel + ' panels', qty: 1, unitPrice: design.panelCount * between(95, 130), vat })
    items.push({ description: design.inverterMake + ' ' + design.inverterModel + ' inverter', qty: 1, unitPrice: Math.round(design.inverterKw * 180), vat })
    items.push({ description: 'Mounting, cabling, isolators & installation', qty: 1, unitPrice: commercial ? 4200 : between(1800, 2600), vat })
    items.push({ description: 'Scaffolding', qty: 1, unitPrice: commercial ? 1500 : between(550, 900), vat })
  }
  if (products.includes('battery')) {
    items.push({ description: design.batteryMake + ' ' + design.batteryModel + ' battery (' + design.batteryKwh + ' kWh)', qty: 1, unitPrice: Math.round(design.batteryKwh * between(420, 520)), vat })
  }
  items.push({ description: 'MCS certification & DNO application', qty: 1, unitPrice: 250, vat })
  return items
}

const SOLAR_TASKS = ['Erect scaffolding', 'Fit roof mounting rails', 'Mount panels and run strings', 'Install inverter and isolators', 'Test, commission and label', 'Customer handover & app setup']

/** Ticks this job's steps up to (and including) `lastKey`, in process order. */
function progressThrough(products, lastKey, extra = {}) {
  const progress = {}
  for (const step of stepsFor(products)) {
    progress[step.key] = true
    if (step.key === lastKey) break
  }
  return { ...progress, ...extra }
}

// Progress that matches each job status, for the job's own steps.
function productProgress(products, status, quoteAccepted) {
  switch (status) {
    case 'Completed':
      return progressThrough(products, 'handover')
    case 'In Progress':
      return progressThrough(products, chance(0.5) ? 'installationInProgress' : 'testingCertification')
    case 'On Hold':
      return progressThrough(products, products.includes('solar') ? 'dnoApplication' : 'quotationAccepted')
    case 'Cancelled':
      return { siteSurveyCompleted: true, quotationAccepted: false }
    default: { // Scheduled
      const surveyed = quoteAccepted || chance(0.5)
      return { siteSurveyCompleted: surveyed, systemDesigned: surveyed && products.some((p) => p !== 'ev'), quotationAccepted: quoteAccepted }
    }
  }
}

function jobDate(status) {
  switch (status) {
    case 'Completed': return day(-between(4, 200))
    case 'In Progress': return day(-between(0, 3))
    case 'On Hold': return day(between(-10, 14))
    case 'Cancelled': return day(-between(5, 90))
    default: return day(between(2, 45))
  }
}

const TASKS = ['Isolate supply and fit RCBO', 'Run cable to charger position', 'Mount and commission charger', 'Test and certify', 'Customer walkthrough & app setup']

// --- Clear ------------------------------------------------------------------------------
async function findMock() {
  const clients = await Client.find({ 'notes.author': MOCK_AUTHOR }).select('_id').lean()
  const clientIds = clients.map((c) => c._id)
  const installIds = (await Installation.find({ client: { $in: clientIds } }).select('_id').lean()).map((i) => i._id)
  const engineers = await Engineer.countDocuments({ email: { $regex: MOCK_DOMAIN.replace(/\./g, '\\.') + '$' } })
  return { clientIds, installIds, engineers }
}

async function clearMock() {
  const { clientIds, installIds, engineers } = await findMock()
  const results = await Promise.all([
    Certification.deleteMany({ installation: { $in: installIds } }),
    Ticket.deleteMany({ installation: { $in: installIds } }),
    Grant.deleteMany({ installation: { $in: installIds } }),
    Installation.deleteMany({ _id: { $in: installIds } }),
    Quotation.deleteMany({ client: { $in: clientIds } }),
    Client.deleteMany({ _id: { $in: clientIds } }),
    Engineer.deleteMany({ email: { $regex: MOCK_DOMAIN.replace(/\./g, '\\.') + '$' } }),
  ])
  console.log('[mock] removed ' + clientIds.length + ' clients, ' + results[4].deletedCount + ' quotations, ' +
    installIds.length + ' installations, ' + results[0].deletedCount + ' certificates and ' + engineers + ' engineers')
}

// --- Create ------------------------------------------------------------------------------
async function createMock() {
  const existing = await findMock()
  if (existing.clientIds.length || existing.engineers) {
    console.log('[mock] mock data is already in the database. Run "npm run seed:mock:clear" first to replace it.')
    return
  }

  // Engineers, one per region.
  const certs = (name) => [
    { name: 'NICEIC Approved Contractor', body: 'NICEIC', number: 'NIC-' + between(10000, 99999), expiryDate: day(between(60, 500)) },
    { name: 'EV Charging Installer (C&G 2921-34)', body: 'City & Guilds', number: 'CG-' + between(100000, 999999), expiryDate: day(between(120, 900)) },
  ].slice(0, name.length % 2 ? 2 : 1)
  for (const region of REGIONS) {
    const e = region.engineer
    region.engineerDoc = await Engineer.create({
      ...e,
      email: e.name.toLowerCase().replace(/[^a-z]+/g, '.') + MOCK_DOMAIN,
      coverageArea: region.area,
      weeklySchedule: defaultWeek().map((d) => (d.day === 'Sat' && chance(0.5) ? { ...d, working: true, start: '09:00', end: '13:00' } : d)),
      timeOff: chance(0.5) ? [{ from: day(between(10, 30)), to: day(between(31, 40)), reason: pick(['Holiday', 'Training course', 'Annual leave']) }] : [],
      certifications: certs(e.name),
    })
  }
  console.log('[mock] 5 engineers added')

  // Places: one per job, spread round the regions (round robin keeps it even).
  const jobCount = DOMESTIC_CLIENTS + BUSINESSES.reduce((n, b) => n + b.sites, 0)
  const places = []
  for (let i = 0; i < jobCount; i++) {
    const region = REGIONS[i % REGIONS.length]
    const place = await randomPostcode(pick(region.outcodes))
    places.push({ ...place, region })
  }
  console.log('[mock] ' + places.length + ' real postcodes looked up')

  // Jobs: status per job, shuffled so every region gets a mix. The inactive
  // clients come first and are old customers, so they take Completed jobs.
  const shuffled = [...JOB_STATUSES].sort(() => rand() - 0.5)
  for (let i = 0; i < INACTIVE_DOMESTIC; i++) {
    shuffled.splice(shuffled.indexOf('Completed'), 1)
  }
  const statuses = [...Array(INACTIVE_DOMESTIC).fill('Completed'), ...shuffled]
  const note = { body: 'Mock data -- remove with "npm run seed:mock:clear".', author: MOCK_AUTHOR }
  let placeIndex = 0
  let jobIndex = 0
  let certificates = 0

  const createJob = async ({ client, place, site, commercial }) => {
    const status = statuses[jobIndex++]
    const installDate = jobDate(status)
    const quoteDate = new Date(installDate)
    quoteDate.setDate(quoteDate.getDate() - between(14, 40))

    // Scheduled jobs are sometimes still waiting on the customer to accept.
    const quoteStatus = status === 'Cancelled' ? 'Declined' : status === 'Scheduled' && chance(0.3) ? 'Sent' : 'Accepted'
    const products = pick(commercial ? COMMERCIAL_MIX : DOMESTIC_MIX)
    const hasEv = products.includes('ev')
    const design = products.some((p) => p !== 'ev') ? systemDesign(products, commercial) : undefined
    const ev = hasEv ? quoteItems(commercial) : { charger: null, items: [] }
    const charger = ev.charger
    const items = [...ev.items, ...(design ? solarItems(products, design, commercial) : [])]
    const history = [
      { action: 'Quotation created', by: 'David Parker', at: quoteDate },
      { action: 'Quotation sent to client', by: 'David Parker', at: new Date(quoteDate.getTime() + 864e5) },
    ]
    if (quoteStatus !== 'Sent') history.push({ action: 'Quotation ' + quoteStatus.toLowerCase() + ' by client', by: 'David Parker', at: new Date(quoteDate.getTime() + between(2, 10) * 864e5) })
    const validUntil = new Date(quoteDate)
    validUntil.setDate(validUntil.getDate() + 30)

    const quote = await Quotation.create({
      client: client._id,
      site: site ? site.name : [place.address, place.postcode].join(', '),
      quoteDate,
      validUntil,
      reference: 'WP-' + quoteDate.getFullYear() + '-' + between(10000, 99999),
      items,
      products,
      status: quoteStatus,
      financeOption: pick(commercial || !hasEv ? ['Pay in Full', 'Pay in Full', 'Finance Plan'] : ['Pay in Full', 'Pay in Full', 'Finance Plan', 'OLEV Grant Funded']),
      history,
    })

    const progress = productProgress(products, status, quoteStatus === 'Accepted')
    const taskList = products.includes('solar') ? SOLAR_TASKS : TASKS
    const tasks = status === 'In Progress'
      ? taskList.map((title, i) => ({ title, done: i < between(1, 3) }))
      : status === 'Completed' ? taskList.map((title) => ({ title, done: true })) : []

    const install = await Installation.create({
      client: client._id,
      quotation: quote._id,
      site: site ? site.name : place.address,
      installDate,
      status,
      engineer: status === 'Scheduled' && chance(0.15) ? undefined : place.region.engineerDoc._id,
      products,
      design,
      chargerModel: charger?.model,
      supplyType: commercial ? 'Three Phase' : chance(0.1) ? 'Three Phase' : 'Single Phase',
      address: site ? site.address : place.address,
      postcode: place.postcode,
      coordinates: place.location,
      location: !hasEv ? undefined : commercial ? pick(['Staff car park - bays 1-2', 'Visitor parking', 'Loading bay wall', 'Rear car park']) : pick(FIT_POINTS),
      accessNotes: commercial ? pick(['Sign in at reception', 'Site induction required', 'Access via rear gate']) : pick(ACCESS),
      progress,
      tasks,
      dnoNotified: ['Completed', 'In Progress'].includes(status) || (status === 'On Hold' && chance(0.5)),
      dnoNotifiedAt: ['Completed', 'In Progress'].includes(status) ? new Date(installDate.getTime() - 5 * 864e5) : undefined,
      completedAt: status === 'Completed' ? new Date(installDate.getTime() + between(0, 2) * 864e5) : undefined,
      hold: status === 'On Hold' ? { reason: pick(HOLD_REASONS), since: day(-between(1, 12)), previousStatus: progress.installationInProgress ? 'In Progress' : 'Scheduled' } : undefined,
    })

    if (status === 'Completed') {
      await Certification.create({
        installation: install._id,
        certificateNo: 'EIC-' + install.installNo.replace('INS-', ''),
        issueDate: install.completedAt,
        testedBy: place.region.engineer.name,
        nextInspectionDue: new Date(install.completedAt.getTime() + 5 * 365 * 864e5),
        tests: { continuity: 'Pass', insulationResistance: 'Pass', earthElectrode: chance(0.6) ? 'Pass' : 'N/A', rcd: 'Pass', functional: 'Pass' },
        complete: true,
      })
      certificates++
    }
  }

  // Domestic customers: one home, one job.
  const usedNames = new Set()
  for (let i = 0; i < DOMESTIC_CLIENTS; i++) {
    let name
    do { name = pick(FIRST) + ' ' + pick(LAST) } while (usedNames.has(name))
    usedNames.add(name)
    const place = places[placeIndex++]
    place.address = address(place)
    const client = await Client.create({
      name,
      contactPerson: name,
      email: name.toLowerCase().replace(/[^a-z]+/g, '.') + '@example.co.uk',
      phone: phone(),
      address: place.address,
      postcode: place.postcode,
      location: place.location,
      status: i < INACTIVE_DOMESTIC ? 'Inactive' : 'Active',
      notes: [note],
    })
    await createJob({ client, place, commercial: false })
  }

  // Businesses: head office at the first site, one job per site.
  for (const business of BUSINESSES) {
    const sitePlaces = places.slice(placeIndex, placeIndex + business.sites)
    placeIndex += business.sites
    const sites = sitePlaces.map((place) => {
      place.address = address(place)
      return { name: (place.town || place.area) + ' site', address: place.address, postcode: place.postcode }
    })
    const domain = business.name.toLowerCase().replace(/\b(ltd|group|association)\b/g, '').replace(/[^a-z]+/g, '') + '.example.co.uk'
    const client = await Client.create({
      name: business.name,
      contactPerson: business.contact,
      email: 'facilities@' + domain,
      phone: '0' + between(1000, 2999) + ' ' + between(100000, 999999),
      address: sites[0].address,
      postcode: sites[0].postcode,
      location: sitePlaces[0].location,
      status: 'Active',
      sites,
      contacts: [{ name: business.contact, role: 'Facilities Manager', email: 'facilities@' + domain, phone: phone() }],
      notes: [note],
    })
    for (let s = 0; s < sitePlaces.length; s++) {
      await createJob({ client, place: sitePlaces[s], site: sites[s], commercial: true })
    }
  }

  const clientCount = DOMESTIC_CLIENTS + BUSINESSES.length
  console.log('[mock] added ' + clientCount + ' clients, ' + jobIndex + ' quotations, ' + jobIndex + ' installations and ' + certificates + ' certificates')
}

async function main() {
  await connectDB()
  if (process.argv.includes('--clear')) await clearMock()
  else await createMock()
}

main()
  .catch((err) => {
    console.error('[mock] failed:', err.message)
    process.exitCode = 1
  })
  .finally(() => mongoose.disconnect())
