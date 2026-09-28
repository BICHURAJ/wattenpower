import Installation from './models/Installation.js'
import Quotation from './models/Quotation.js'

// An installation's "Quotation Accepted" step follows the quotation linked to
// it, and only that one: a job with no linked quote is never ticked.

/** The quotation linked to an installation, as { _id, quoteNo, status }, or null. */
export async function linkedQuotation(install) {
  const quoteId = install.quotation?._id || install.quotation
  if (!quoteId) return null
  return Quotation.findById(quoteId).select('quoteNo status').lean()
}

/**
 * Brings one installation's stored "Quotation Accepted" step in line with its
 * linked quote, updating `install.progress` too. Returns the linked quotation.
 */
export async function syncInstallation(install) {
  const quote = await linkedQuotation(install)
  const accepted = quote?.status === 'Accepted'
  if (Boolean(install.progress?.quotationAccepted) !== accepted) {
    await Installation.updateOne({ _id: install._id }, { $set: { 'progress.quotationAccepted': accepted } })
    if (install.progress) install.progress.quotationAccepted = accepted
  }
  return quote
}

/** After a quotation's status changes, update the jobs linked to it. */
export async function syncAfterQuotationChange(quote) {
  await Installation.updateMany(
    { quotation: quote._id },
    { $set: { 'progress.quotationAccepted': quote.status === 'Accepted' } },
  )
}

/**
 * Clears the step on jobs with no linked quote. Jobs used to be ticked from
 * their client's quotations, so run at start-up to correct those stored values.
 */
export async function clearUnlinkedQuoteSteps() {
  const { modifiedCount } = await Installation.updateMany(
    { quotation: null, 'progress.quotationAccepted': true }, // null also matches a missing field
    { $set: { 'progress.quotationAccepted': false } },
  )
  if (modifiedCount) console.log('[db] cleared "Quotation Accepted" on ' + modifiedCount + ' installation(s) with no linked quotation')
}
