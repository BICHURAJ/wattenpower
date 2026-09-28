import 'dotenv/config'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'

import { connectDB } from './db.js'
import User from './models/User.js'
import Client from './models/Client.js'
import Lead from './models/Lead.js'
import Engineer, { defaultWeek } from './models/Engineer.js'
import Quotation from './models/Quotation.js'
import Installation from './models/Installation.js'
import Certification from './models/Certification.js'
import Ticket from './models/Ticket.js'
import Grant from './models/Grant.js'
import ComplianceItem from './models/ComplianceItem.js'
import DocumentRef from './models/DocumentRef.js'
import StockItem from './models/StockItem.js'
import Van from './models/Van.js'
import Tool from './models/Tool.js'
import Activity from './models/Activity.js'

// Demo data mirrors the sample screens. Dates are generated relative to today
// so the dashboard tiles ("this month") always have something to show.
const today = new Date()
const day = (offset) => {
  const d = new Date(today)
  d.setDate(d.getDate() + offset)
  return d
}

async function seed() {
  // This wipes every collection, so it never runs against production.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('refusing to run with NODE_ENV=production -- the seed deletes all data')
  }
  await connectDB()

  console.log('[seed] clearing existing data...')
  await Promise.all([
    User.deleteMany({}), Client.deleteMany({}), Lead.deleteMany({}), Engineer.deleteMany({}),
    Quotation.deleteMany({}), Installation.deleteMany({}), Certification.deleteMany({}),
    Ticket.deleteMany({}), Grant.deleteMany({}), ComplianceItem.deleteMany({}),
    DocumentRef.deleteMany({}), StockItem.deleteMany({}), Van.deleteMany({}),
    Tool.deleteMany({}), Activity.deleteMany({}),
  ])

  // --- Users ---------------------------------------------------------------
  // No fixed demo password: SEED_PASSWORD if set, otherwise a random one printed at the end.
  const password = process.env.SEED_PASSWORD || crypto.randomBytes(12).toString('base64url')
  if (password.length < 10) throw new Error('SEED_PASSWORD must be at least 10 characters')
  const passwordHash = await bcrypt.hash(password, 12)
  await User.create([
    { name: 'David Parker', email: 'david@wattenpower.co.uk', passwordHash, role: 'admin', initials: 'DP' },
    { name: 'Sarah Green', email: 'sarah@wattenpower.co.uk', passwordHash, role: 'sales', initials: 'SG' },
    { name: 'Mike Brown', email: 'mike@wattenpower.co.uk', passwordHash, role: 'engineer', initials: 'MB' },
    { name: 'Fiona Clarke', email: 'fiona@wattenpower.co.uk', passwordHash, role: 'finance', initials: 'FC' },
  ])

  // --- Engineers -----------------------------------------------------------
  // Start from the standard Mon-Fri week and override individual days.
  const week = (overrides = {}) => defaultWeek().map((d) => ({ ...d, ...(overrides[d.day] || {}) }))
  const engineers = await Engineer.create([
    {
      name: 'John Smith', email: 'john.smith@wattenpower.co.uk', phone: '07700 111222', status: 'On Job',
      coverageArea: 'London & South East',
      weeklySchedule: week({ Sat: { working: true, start: '09:00', end: '13:00' } }),
      certifications: [{ name: 'NICEIC Approved Contractor', body: 'NICEIC', number: 'NIC-88213', expiryDate: day(210) }],
    },
    {
      name: 'Mike Brown', email: 'mike.brown@wattenpower.co.uk', phone: '07700 333444', status: 'On Job',
      coverageArea: 'Kent & Sussex',
      weeklySchedule: week({ Mon: { start: '07:00', end: '15:30' }, Tue: { start: '07:00', end: '15:30' }, Wed: { start: '07:00', end: '15:30' }, Thu: { start: '07:00', end: '15:30' }, Fri: { working: false } }),
      timeOff: [{ from: day(14), to: day(21), reason: 'Holiday' }],
      certifications: [{ name: 'ECS Gold Card', body: 'ECS', number: 'ECS-44120', expiryDate: day(20) }],
    },
    {
      name: 'Alex Lee', email: 'alex.lee@wattenpower.co.uk', phone: '07700 555666', status: 'Available',
      coverageArea: 'Surrey & Hampshire',
      weeklySchedule: week(),
      certifications: [{ name: 'NAPIT Registered', body: 'NAPIT', number: 'NAP-70311', expiryDate: day(310) }],
    },
    {
      name: 'Sarah White', email: 'sarah.white@wattenpower.co.uk', phone: '07700 777888', status: 'Available',
      coverageArea: 'Essex & Hertfordshire',
      weeklySchedule: week({ Wed: { working: false }, Sat: { working: true, start: '08:00', end: '16:00' } }),
      timeOff: [{ from: day(-1), to: day(1), reason: 'Training course' }],
      certifications: [{ name: 'City & Guilds 2921', body: 'C&G', number: 'CG-2921-556', expiryDate: day(400) }],
    },
  ])
  const [johnSmith, mikeBrown, alexLee, sarahWhite] = engineers

  // --- Clients -------------------------------------------------------------
  const clients = await Client.create([
    {
      name: 'ABC Ltd', contactPerson: 'John Smith', email: 'john@abc.co.uk', phone: '07700 900123',
      address: '123 Business Park, London', postcode: 'NW1 1AE', status: 'Active',
      sites: [{ name: 'Head Office', address: '123 Business Park, London', postcode: 'NW1 1AE' }],
      contacts: [{ name: 'John Smith', role: 'Facilities Manager', email: 'john@abc.co.uk', phone: '07700 900123' }],
      notes: [{ body: 'Wants three more bays quoted next quarter.', author: 'David Parker' }],
    },
    {
      name: 'Green Homes Ltd', contactPerson: 'Sarah Green', email: 'sarah@greenhomes.co.uk', phone: '07771 222333',
      address: '45 Green Lane, Milton Keynes', postcode: 'MK1 1AB', status: 'Active',
      sites: [{ name: 'Green Lane Development', address: '45 Green Lane, Milton Keynes', postcode: 'MK1 1AB' }],
      contacts: [{ name: 'Sarah Green', role: 'Development Manager', email: 'sarah@greenhomes.co.uk', phone: '07771 222333' }],
    },
    {
      name: 'Mr. Johnson', contactPerson: 'Michael Johnson', email: 'michael.johnson@gmail.com', phone: '07822 333444',
      address: '12 Oak Road, Reading', postcode: 'RG1 4TT', status: 'Active',
      sites: [{ name: 'Home', address: '12 Oak Road, Reading', postcode: 'RG1 4TT' }],
    },
    {
      name: 'Acme Corp', contactPerson: 'David Brown', email: 'david@acme.com', phone: '07955 444555',
      address: '9 Industrial Way, Slough', postcode: 'SL1 3XE', status: 'Inactive',
      sites: [{ name: 'Slough Depot', address: '9 Industrial Way, Slough', postcode: 'SL1 3XE' }],
    },
  ])
  const [abc, greenHomes, johnson, acme] = clients

  // --- Quotations ----------------------------------------------------------
  // Saved one at a time so the quote-number hook runs in sequence.
  const quoteSeed = [
    {
      client: abc._id, site: '123 Business Park, London, NW1 1AE', reference: 'WP-2024-05-10024',
      quoteDate: day(-11), validUntil: day(3), status: 'Sent', financeOption: 'Pay in Full',
      items: [
        { description: 'EV Charger Installation', qty: 1, unitPrice: 1000, vat: 20 },
        { description: 'Materials', qty: 1, unitPrice: 250, vat: 20 },
      ],
      history: [{ action: 'Quotation created', by: 'David Parker' }, { action: 'Quotation sent to client', by: 'David Parker' }],
    },
    {
      client: greenHomes._id, site: '45 Green Lane, Milton Keynes', reference: 'WP-2024-05-10023',
      quoteDate: day(-9), validUntil: day(-1), status: 'Draft', financeOption: 'OLEV Grant Funded',
      items: [{ description: 'EV Charger Installation (7kW)', qty: 1, unitPrice: 816.67, vat: 20 }],
    },
    {
      client: johnson._id, site: '12 Oak Road, Reading', reference: 'WP-2024-05-10022',
      quoteDate: day(-13), validUntil: day(-3), status: 'Accepted', financeOption: 'Finance Plan',
      items: [
        { description: 'EV Charger Installation (7kW)', qty: 1, unitPrice: 1100, vat: 20 },
        { description: 'Consumer unit upgrade', qty: 1, unitPrice: 191.67, vat: 20 },
      ],
    },
    {
      client: acme._id, site: '9 Industrial Way, Slough', reference: 'WP-2024-05-10021',
      quoteDate: day(-15), validUntil: day(-5), status: 'Sent', financeOption: 'Pay in Full',
      items: [{ description: 'Dual EV Charger Installation (22kW)', qty: 1, unitPrice: 1833.33, vat: 20 }],
    },
  ]

  const quotations = []
  for (const data of quoteSeed) {
    const quote = new Quotation(data)
    await quote.save()
    quotations.push(quote)
  }

  // --- Installations -------------------------------------------------------
  const installSeed = [
    {
      client: abc._id, site: '123 Business Park, London', installDate: day(4), status: 'Scheduled',
      engineer: johnSmith._id, chargerModel: 'Zappi 7kW', supplyType: 'Single Phase',
      location: 'Car Park - Bay 3', accessNotes: 'Report to reception',
      progress: { siteSurveyCompleted: true, quotationAccepted: false },
    },
    {
      client: greenHomes._id, site: '45 Green Lane, Milton Keynes, MK1 1AB', installDate: day(-2), status: 'In Progress',
      engineer: mikeBrown._id, chargerModel: 'Zappi 7kW', supplyType: 'Single Phase',
      location: 'Garage - Right Wall', accessNotes: 'Call on arrival',
      progress: { siteSurveyCompleted: true, quotationAccepted: true, installationInProgress: true },
      tasks: [
        { title: 'Isolate supply and fit RCBO', done: true },
        { title: 'Run cable to garage', done: true },
        { title: 'Mount and commission charger', done: false },
        { title: 'Test and certify', done: false },
      ],
    },
    {
      client: johnson._id, site: '12 Oak Road, Reading', installDate: day(-5), status: 'Completed',
      engineer: alexLee._id, chargerModel: 'Ohme ePod 7kW', supplyType: 'Single Phase',
      location: 'Driveway - Front Wall', accessNotes: 'Key safe code provided',
      dnoNotified: true, dnoNotifiedAt: day(-4),
      progress: { siteSurveyCompleted: true, quotationAccepted: true, installationInProgress: true, testingCertification: true, handover: true },
    },
    {
      client: acme._id, site: '9 Industrial Way, Slough', installDate: day(9), status: 'Scheduled',
      engineer: sarahWhite._id, chargerModel: 'Rolec Zura 22kW', supplyType: 'Three Phase',
      location: 'Loading Bay', accessNotes: 'Site induction required',
      progress: { siteSurveyCompleted: false },
    },
  ]

  const installations = []
  for (const data of installSeed) {
    const install = new Installation(data)
    await install.save()
    installations.push(install)
  }
  const [insAbc, insGreen, insJohnson] = installations

  // Link the accepted quote to the job it produced.
  insJohnson.quotation = quotations[2]._id
  await insJohnson.save()

  // --- Certification (screen 11) -------------------------------------------
  await Certification.create({
    installation: insJohnson._id,
    certificateNo: 'EIC-20023',
    issueDate: day(-5),
    testedBy: 'Alex Lee',
    nextInspectionDue: day(1820),
    tests: { continuity: 'Pass', insulationResistance: 'Pass', earthElectrode: 'Pass', rcd: 'Pass', functional: 'Pass' },
    certificateFileName: 'EIC-20023.pdf',
    complete: true,
  })

  // --- Support tickets (screen 12) -----------------------------------------
  const ticketSeed = [
    { client: acme._id, issue: 'General enquiry', priority: 'Low', status: 'Closed', underWarranty: false, description: 'Asked about adding a second charge point.' },
    { client: johnson._id, installation: insJohnson._id, issue: 'RCD tripping', priority: 'Medium', status: 'Open', description: 'RCD trips when charging starts.', assignedTo: alexLee._id },
    { client: greenHomes._id, installation: insGreen._id, issue: 'App connectivity issue', priority: 'Medium', status: 'In Progress', description: 'Charger will not pair with the mobile app.', assignedTo: mikeBrown._id },
    { client: abc._id, installation: insAbc._id, issue: 'Charger not working', priority: 'High', status: 'Open', description: 'No power to unit since Tuesday.', assignedTo: johnSmith._id },
  ]
  for (const data of ticketSeed) {
    await new Ticket(data).save()
  }

  // --- OLEV grant (screen 13) ----------------------------------------------
  await Grant.create({
    installation: insGreen._id,
    grantType: 'Homecharge Scheme',
    customerConsent: true,
    documents: { invoice: true, proofOfPayment: true, eicCertificate: true, productCertificate: true, photos: false },
    comments: 'Awaiting final handover photos before submission.',
    status: 'Draft',
  })
  await Grant.create({
    installation: insJohnson._id,
    grantType: 'Homecharge Scheme',
    customerConsent: true,
    documents: { invoice: true, proofOfPayment: true, eicCertificate: true, productCertificate: true, photos: true },
    status: 'Submitted',
    submittedAt: day(-4),
  })

  // --- Compliance hub (screen 14) ------------------------------------------
  await ComplianceItem.create([
    { title: 'EIC Certificate EIC-20015', category: 'EIC Certificate', reference: 'EIC-20015', relatedTo: 'INS-20015', expiryDate: day(15) },
    { title: 'Mike Brown - ECS Card', category: 'Engineer Certification', reference: 'ECS-44120', relatedTo: 'Mike Brown', expiryDate: day(20) },
    { title: 'Oscilloscope calibration', category: 'Calibration', reference: 'CAL-1180', relatedTo: 'Test equipment', expiryDate: day(28) },
    { title: 'John Smith - NICEIC registration', category: 'Engineer Certification', reference: 'NIC-88213', relatedTo: 'John Smith', expiryDate: day(210) },
    { title: 'DNO notification - INS-20023', category: 'DNO Notification', reference: 'DNO-20023', relatedTo: 'INS-20023', expiryDate: day(365) },
  ])

  await DocumentRef.create([
    { title: 'IET Wiring Regs (18th Ed.)', category: 'Regulation', description: 'BS 7671 - the UK rulebook for safe electrical wiring.' },
    { title: 'DNO Notifications', category: 'Guidance', description: 'How and when to notify the local electricity network operator.' },
    { title: 'OLEV Guidelines', category: 'Guidance', description: 'Grant scheme rules and the paperwork each claim needs.' },
    { title: 'NIC EIC Certification', category: 'Certification', description: 'Certification requirements for signing off an installation.' },
    { title: 'Code of Practice EV 5th Edition', category: 'Regulation', description: 'The specific rulebook for installing EV charge points.' },
  ])

  // --- Stock (screen 15) ---------------------------------------------------
  await StockItem.create([
    { name: 'Zappi 7kW Charger', category: 'Chargers', stock: 12, unit: 'pcs', reorderLevel: 5, supplier: 'MyEnergi UK', unitCost: 649 },
    { name: 'Type 2 Cable (5m)', category: 'Accessories', stock: 25, unit: 'pcs', reorderLevel: 10, supplier: 'EV Parts Direct', unitCost: 89 },
    { name: 'RCBO 40A 30mA', category: 'Electrical', stock: 30, unit: 'pcs', reorderLevel: 10, supplier: 'CEF', unitCost: 22 },
    { name: 'Consumer Unit 16 Way', category: 'Electrical', stock: 8, unit: 'pcs', reorderLevel: 3, supplier: 'CEF', unitCost: 145 },
    { name: 'SWA Cable 6mm (per m)', category: 'Electrical', stock: 4, unit: 'm', reorderLevel: 50, supplier: 'Edmundson', unitCost: 4.2 },
  ])

  // --- Vans and tools (screen 16) ------------------------------------------
  const vans = await Van.create([
    {
      regNo: 'WP31 ABC', name: 'Van 1', model: 'Ford Transit', engineer: johnSmith._id, status: 'On Road', mileage: 45230,
      motDue: day(120), motCertificateNo: '1234 5678 9012',
      insurer: 'Aviva', insurancePolicyNo: 'AV-FLT-448120', insuranceType: 'Fleet Policy', insuranceExpiry: day(200),
    },
    {
      regNo: 'WP22 DEF', name: 'Van 2', model: 'Ford Transit', engineer: mikeBrown._id, status: 'On Road', mileage: 38910,
      motDue: day(60), insurer: 'Aviva', insurancePolicyNo: 'AV-FLT-448120', insuranceType: 'Fleet Policy', insuranceExpiry: day(200),
    },
    {
      regNo: 'WP23 GHI', name: 'Van 3', model: 'Ford Transit', engineer: alexLee._id, status: 'In Service', mileage: 52100,
      motDue: day(15), insurer: 'AXA', insurancePolicyNo: 'AXA-CV-90211', insuranceType: 'Comprehensive', insuranceExpiry: day(-3),
    },
  ])

  await Tool.create([
    { name: 'Megger MFT1741 Tester', serialNo: 'MG-77120', van: vans[0]._id, lastCalibration: day(-300), calibrationDue: day(65), status: 'In Service' },
    { name: 'Fluke Clamp Meter', serialNo: 'FL-2210', van: vans[1]._id, lastCalibration: day(-340), calibrationDue: day(25), status: 'Calibration Due' },
    { name: 'Oscilloscope', serialNo: 'OS-1180', van: vans[2]._id, lastCalibration: day(-337), calibrationDue: day(28), status: 'Calibration Due' },
    { name: 'Torque Screwdriver Set', serialNo: 'TQ-4410', van: vans[0]._id, lastCalibration: day(-100), calibrationDue: day(265), status: 'In Service' },
  ])

  // --- Website leads (screen 5) --------------------------------------------
  await Lead.create([
    {
      fullName: 'Priya Shah', email: 'priya.shah@gmail.com', phone: '07900 112233',
      address: '18 Elm Close, Watford', postcode: 'WD17 2BQ', leadType: 'Installation Enquiry',
      preferredContactMethod: 'Email', message: 'Looking for a 7kW home charger, driveway install.', status: 'New',
    },
    {
      fullName: 'Tom Wilkins', email: 'tom.wilkins@outlook.com', phone: '07901 445566',
      address: '3 Mill Street, Oxford', postcode: 'OX2 0JX', leadType: 'Survey Request',
      preferredContactMethod: 'Phone', message: 'Please arrange a remote survey.', status: 'Contacted',
    },
  ])

  // --- Dashboard activity feed ---------------------------------------------
  await Activity.create([
    { type: 'quotation', text: 'Quotation Q-10024 created for client ABC Ltd', by: 'David Parker' },
    { type: 'installation', text: 'Installation INS-20021 completed at 1 High Street', by: 'John Smith' },
    { type: 'ticket', text: 'Warranty ticket W-30005 raised by client ABC Ltd', by: 'David Parker' },
    { type: 'grant', text: 'Engineer John Smith submitted OLEV grant', by: 'John Smith' },
    { type: 'compliance', text: 'DNO notification submitted for INS-20023', by: 'Alex Lee' },
    { type: 'client', text: 'New client added: Green Homes Ltd', by: 'Sarah Green' },
  ])

  console.log('[seed] done.')
  console.log('[seed] demo accounts: david@ (admin), sarah@ (sales), mike@ (engineer), fiona@ (finance) -- all @wattenpower.co.uk')
  console.log('[seed] password for all of them' + (process.env.SEED_PASSWORD ? ' (from SEED_PASSWORD)' : ' (shown once, not stored anywhere)') + ':  ' + password)
  await mongoose.disconnect()
}

seed().catch((err) => {
  console.error('[seed] failed:', err)
  process.exit(1)
})
