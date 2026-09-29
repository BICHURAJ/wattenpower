import Client from './models/Client.js'
import Engineer from './models/Engineer.js'
import Quotation from './models/Quotation.js'
import Installation from './models/Installation.js'

// Installation and client search. Every word typed must match something about the job:
// its own fields, the client (name, contact, email, phone, address, postcode,
// other sites), the engineer, the linked quote number, or the products
// ("ev", "solar", "battery" and their everyday names). So "solar leeds" finds
// the solar jobs in Leeds and "smith hold" finds Mr Smith's jobs that are on hold.

const JOB_FIELDS = [
  'installNo', 'site', 'address', 'postcode', 'location', 'status', 'supplyType',
  'chargerModel', 'notes', 'accessNotes', 'hold.reason',
  'design.panelMake', 'design.panelModel', 'design.inverterMake', 'design.inverterModel',
  'design.batteryMake', 'design.batteryModel', 'design.orientation', 'design.mounting',
]
const CLIENT_FIELDS = [
  'name', 'contactPerson', 'email', 'phone', 'address', 'postcode',
  'sites.name', 'sites.address', 'sites.postcode', 'contacts.name', 'contacts.email', 'contacts.phone',
]
const POSTCODE_FIELDS = new Set(['postcode', 'sites.postcode'])
const PHONE_FIELDS = new Set(['phone', 'contacts.phone'])

// Everyday words for each product.
const PRODUCT_WORDS = {
  ev: ['ev', 'evs', 'charger', 'chargers', 'charging', 'charge', 'chargepoint', 'car', 'vehicle'],
  solar: ['solar', 'pv', 'panel', 'panels', 'photovoltaic'],
  battery: ['battery', 'batteries', 'storage', 'bess'],
}

const MAX_WORDS = 8

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Splits a query into words; "quoted phrases" stay together. */
export function searchWords(q) {
  const words = []
  const text = String(q || '').slice(0, 200)
  for (const match of text.matchAll(/"([^"]+)"|(\S+)/g)) {
    const word = (match[1] || match[2]).trim().replace(/^[,;]+|[,;]+$/g, '')
    if (word) words.push(word)
  }
  return words.slice(0, MAX_WORDS)
}

/** The product a word names, if any ("pv" -> solar). */
export function productFor(word) {
  const w = word.toLowerCase()
  return Object.keys(PRODUCT_WORDS).find((key) => PRODUCT_WORDS[key].includes(w))
}

/** Regex for one word on one field. Postcodes and phone numbers ignore spacing. */
export function wordRegex(word, field) {
  const compact = word.replace(/\s+/g, '')
  if (POSTCODE_FIELDS.has(field) && /^[a-z0-9]+$/i.test(compact)) {
    return new RegExp(compact.split('').map(escapeRegex).join('\\s*'), 'i')
  }
  if (PHONE_FIELDS.has(field) && /^\+?[\d\s-]{4,}$/.test(word)) {
    const digits = word.replace(/\D/g, '')
    return new RegExp(digits.split('').join('[\\s-]*'), 'i')
  }
  return new RegExp(escapeRegex(word), 'i')
}

const anyField = (fields, word) => fields.map((field) => ({ [field]: wordRegex(word, field) }))

/**
 * Mongo filter for the installations matching `q` (every word must match),
 * or null when there is nothing to search for.
 */
export async function installationSearch(q) {
  const words = searchWords(q)
  if (!words.length) return null

  const clauses = await Promise.all(words.map(async (word) => {
    // A product word means the product ("ev" shouldn't also find "Kevin" or "Devon").
    const product = productFor(word)
    if (product) return { products: product }

    const [clients, engineers, quotes] = await Promise.all([
      Client.find({ $or: anyField(CLIENT_FIELDS, word) }).distinct('_id'),
      Engineer.find({ $or: anyField(['name', 'email', 'phone'], word) }).distinct('_id'),
      Quotation.find({ $or: anyField(['quoteNo', 'reference'], word) }).distinct('_id'),
    ])
    const or = anyField(JOB_FIELDS, word)
    if (clients.length) or.push({ client: { $in: clients } })
    if (engineers.length) or.push({ engineer: { $in: engineers } })
    if (quotes.length) or.push({ quotation: { $in: quotes } })
    return { $or: or }
  }))
  return { $and: clauses }
}

/**
 * Mongo filter for the clients matching `q` (every word must match), or null.
 * Words can match the client's own details (name, contacts, address, postcode,
 * phone, sites, notes), a product they have ("solar" -> clients with a solar
 * job or quote), or one of their job / quote numbers.
 */
export async function clientSearch(q) {
  const words = searchWords(q)
  if (!words.length) return null

  const clauses = await Promise.all(words.map(async (word) => {
    const product = productFor(word)
    if (product) {
      const [jobs, quotes] = await Promise.all([
        Installation.find({ products: product }).distinct('client'),
        Quotation.find({ products: product }).distinct('client'),
      ])
      return { _id: { $in: [...jobs, ...quotes] } }
    }

    const [jobs, quotes] = await Promise.all([
      Installation.find({ $or: anyField(['installNo', 'site', 'address', 'postcode'], word) }).distinct('client'),
      Quotation.find({ $or: anyField(['quoteNo', 'reference'], word) }).distinct('client'),
    ])
    const or = anyField([...CLIENT_FIELDS, 'notes.body'], word)
    if (jobs.length || quotes.length) or.push({ _id: { $in: [...jobs, ...quotes] } })
    return { $or: or }
  }))
  return { $and: clauses }
}
