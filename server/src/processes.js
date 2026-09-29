import { SURVEY_SECTIONS, PHOTO_STAGES } from './surveyChecklist.js'
import { HANDOVER_SECTIONS } from './handoverChecklist.js'

// The products Watten Power installs and the steps each job goes through.
// This is the one place to change a process: pages, lists, the map and the
// server rules all read it (the web app gets it from GET /api/public/processes).
//
// A job can combine products (e.g. solar + battery + EV charger); it then gets
// the union of their steps, in the order below, with shared steps listed once.
//
// Keys of the original five EV steps are kept exactly, so existing jobs keep
// their progress. To add a step: add it here with the products it applies to.

export const PRODUCTS = {
  ev: 'EV charger',
  solar: 'Solar PV',
  battery: 'Battery storage',
}
export const PRODUCT_KEYS = Object.keys(PRODUCTS)

/**
 * Every step, in the order jobs go through them.
 *   fromQuote: set from the linked quotation's status, never ticked by hand
 *   final:     can't be unticked once done
 */
export const STEPS = [
  { key: 'siteSurveyCompleted', label: 'Site / roof survey', products: ['ev', 'solar', 'battery'], final: true },
  { key: 'systemDesigned', label: 'System design', products: ['solar', 'battery'] },
  { key: 'quotationAccepted', label: 'Quotation accepted', products: ['ev', 'solar', 'battery'], fromQuote: true },
  { key: 'dnoApplication', label: 'DNO application (G98/G99)', products: ['solar', 'battery'] },
  { key: 'scaffoldingUp', label: 'Scaffolding up', products: ['solar'] },
  { key: 'installationInProgress', label: 'Installation', products: ['ev', 'solar', 'battery'] },
  { key: 'testingCertification', label: 'Testing & commissioning (EIC)', products: ['ev', 'solar', 'battery'] },
  { key: 'mcsCertificate', label: 'MCS certificate issued', products: ['solar', 'battery'] },
  { key: 'scaffoldingDown', label: 'Scaffolding removed', products: ['solar'] },
  { key: 'handover', label: 'Handover (SEG / app setup)', products: ['ev', 'solar', 'battery'] },
]
export const STEP_KEYS = STEPS.map((s) => s.key)

/** Steps ticked by hand (everything except the one set from the quotation). */
export const HAND_STEP_KEYS = STEPS.filter((s) => !s.fromQuote).map((s) => s.key)

/** Known product keys only, no duplicates, in catalogue order. Empty/unknown -> ['ev'] unless allowEmpty. */
export function normaliseProducts(list, { allowEmpty = false } = {}) {
  const given = Array.isArray(list) ? list : list ? [list] : []
  const clean = PRODUCT_KEYS.filter((key) => given.includes(key))
  return clean.length || allowEmpty ? clean : ['ev']
}

/** The steps for a job with these products: union in catalogue order, shared steps once. */
export function stepsFor(products) {
  const chosen = normaliseProducts(products)
  return STEPS.filter((step) => step.products.some((p) => chosen.includes(p)))
}

/** Reads a progress value from a Mongoose Map, a plain object, or nothing. */
export function stepDone(progress, key) {
  if (!progress) return false
  return Boolean(typeof progress.get === 'function' ? progress.get(key) : progress[key])
}

/**
 * How far a job has got: { done, total }. The last step of every job is
 * "Completed" (the job's status), so total is steps + 1.
 */
export function progressOf(install) {
  const steps = stepsFor(install?.products)
  if (install?.status === 'Completed') return { done: steps.length + 1, total: steps.length + 1 }
  return { done: steps.filter((s) => stepDone(install?.progress, s.key)).length, total: steps.length + 1 }
}

/**
 * Steps are done in order. Given a job's progress before and after a change,
 * returns what's wrong ({ key, message }) or null:
 *   - a step can only be ticked once every step before it is done;
 *   - a step can only be unticked while no later step is done;
 *   - the job can only be Completed once every step is done.
 * Only the steps that changed are checked, so older jobs ticked out of order
 * aren't blocked from other edits.
 */
export function progressOrderProblem(products, before, after, { completing = false } = {}) {
  const steps = stepsFor(products)
  for (let i = 0; i < steps.length; i++) {
    const { key, label, fromQuote } = steps[i]
    // Follows the quotation, so it's never held up (but later steps still wait for it).
    if (fromQuote) continue
    const was = stepDone(before, key)
    const now = stepDone(after, key)
    if (!was && now) {
      const missing = steps.slice(0, i).find((s) => !stepDone(after, s.key))
      if (missing) return { key, message: 'Complete "' + missing.label + '" before "' + label + '".' }
    }
    if (was && !now) {
      const later = steps.slice(i + 1).find((s) => stepDone(after, s.key))
      if (later) return { key, message: 'Untick "' + later.label + '" before "' + label + '".' }
    }
  }
  if (completing) {
    const missing = steps.find((s) => !stepDone(after, s.key))
    if (missing) return { key: 'status', message: 'Complete "' + missing.label + '" before marking the job Completed.' }
  }
  return null
}

/** Choices for the solar / battery system design (models/SystemDesign.js). */
export const DESIGN_OPTIONS = {
  orientations: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
  mounting: ['On-roof', 'In-roof', 'Flat roof', 'Ground'],
}

/** What the web app needs (GET /api/public/processes). Configuration only, nothing private. */
export const processesForClient = () => ({
  products: PRODUCTS,
  steps: STEPS,
  designOptions: DESIGN_OPTIONS,
  survey: { sections: SURVEY_SECTIONS, photoStages: PHOTO_STAGES },
  handover: { sections: HANDOVER_SECTIONS },
})
