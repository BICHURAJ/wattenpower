import Installation from './models/Installation.js'
import Quotation from './models/Quotation.js'

/**
 * Before solar and batteries were added every quote and job was an EV charger
 * one, so records without products are tagged ['ev']. Safe to run on every start.
 * (Leads without products are "not sure yet", which is valid, so they're left alone.)
 */
export async function migrateProducts() {
  const missing = { $or: [{ products: { $exists: false } }, { products: { $size: 0 } }] }
  const [jobs, quotes] = await Promise.all([
    Installation.updateMany(missing, { $set: { products: ['ev'] } }),
    Quotation.updateMany(missing, { $set: { products: ['ev'] } }),
  ])
  const changed = jobs.modifiedCount + quotes.modifiedCount
  if (changed) console.log('[db] tagged ' + jobs.modifiedCount + ' installation(s) and ' + quotes.modifiedCount + ' quotation(s) as EV charger jobs')
}
