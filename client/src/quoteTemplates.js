// The wording on quotation PDFs, by product: intro, description of works,
// basis of quotation, commercial terms and the acceptance declaration. EV is
// Watten Power's own EV quotation wording; solar and battery follow the same
// structure. A quote with several products combines them.
//
// The headline, description of works and payment terms are copied onto each
// quote when it's created (and can be edited there); the rest is used as is.

import { normaliseProducts } from './processes'

const TEMPLATES = {
  ev: {
    title: 'Ohme EV Charger Installation',
    subject: 'an EV charging unit',
    works: [
      'Supply, installation, testing and commissioning of one Ohme EV charging unit, including the associated electrical connection, protective device, standard cabling and installation accessories required for the agreed installation route.',
      'The installation will be completed by a competent electrician in accordance with the current requirements of BS 7671 and applicable requirements for electric vehicle charging installations. The charger will be commissioned and the customer will receive the relevant electrical certification and a basic demonstration of its operation.',
    ],
    basis: [
      'This quotation is based on a standard installation and is subject to confirmation following the site survey or review of the information and photographs supplied.',
      'Any additional work identified, including an extended cable route, groundworks, consumer unit upgrades, remedial electrical work, non-standard access, parking restrictions or network operator requirements, will be quoted separately before work proceeds.',
      'The customer is responsible for providing suitable access, parking and internet connectivity where required for charger setup and commissioning.',
      'The exact charger model, cable length, colour and tethered or untethered configuration will be confirmed before ordering.',
    ],
  },
  solar: {
    title: 'Solar PV System Installation',
    subject: 'a solar PV system',
    works: [
      'Supply, installation, testing and commissioning of a solar PV system, including the panels, roof mounting system, inverter, DC and AC isolation, generation meter, standard cabling and installation accessories, as set out in the system design.',
      'The installation will be completed by an MCS-certified installer in accordance with the current requirements of BS 7671 and the MCS standards. The system will be commissioned and the customer will receive the MCS certificate, the relevant electrical certification and a demonstration of the system and its monitoring.',
    ],
    basis: [
      'This quotation is based on the proposed system design and is subject to confirmation following the site survey and roof inspection.',
      'Any additional work identified, including roof or structural repairs, additional scaffolding, consumer unit upgrades, remedial electrical work or network operator (DNO) requirements, will be quoted separately before work proceeds.',
      'Connection to the grid is subject to the network operator: notification under G98, or approval under G99 where required.',
      'The customer is responsible for providing suitable access for scaffolding and internet connectivity for system monitoring.',
    ],
  },
  battery: {
    title: 'Battery Storage Installation',
    subject: 'a battery storage system',
    works: [
      'Supply, installation, testing and commissioning of a battery storage system, including the battery, associated inverter or charger where required, isolation, standard cabling and installation accessories for the agreed location.',
      'The installation will be completed by a competent, certified installer in accordance with the current requirements of BS 7671 and the manufacturer\'s instructions. The system will be commissioned and the customer will receive the relevant certification and a demonstration of the system and its monitoring.',
    ],
    basis: [
      'This quotation is based on a standard installation in the agreed location and is subject to confirmation following the site survey.',
      'Any additional work identified, including consumer unit upgrades, remedial electrical work, building work or network operator requirements, will be quoted separately before work proceeds.',
      'The customer is responsible for providing suitable access and internet connectivity for system monitoring.',
    ],
  },
}

export const DEFAULT_PAYMENT_TERMS = 'Deposit: 50% on acceptance & Balance: 50% on completion'
export const SCHEDULING = 'Installation date to be agreed following acceptance and receipt of the deposit'

/** The combined template for a quote's products. */
export function quoteTemplate(products) {
  const list = normaliseProducts(products).map((p) => TEMPLATES[p]).filter(Boolean)
  const subjects = list.map((t) => t.subject)
  return {
    title: list.map((t) => t.title).join(' + '),
    intro: 'Thank you for your recent enquiry. We are pleased to provide this quotation for the supply and installation of ' +
      (subjects.length > 1 ? subjects.slice(0, -1).join(', ') + ' and ' + subjects[subjects.length - 1] : subjects[0]) +
      '. Please contact us if you would like any changes or clarification before accepting the quotation.',
    works: list.flatMap((t) => t.works).join('\n\n'),
    basis: [...new Set(list.flatMap((t) => t.basis))],
    paymentTerms: DEFAULT_PAYMENT_TERMS,
    scheduling: SCHEDULING,
  }
}

/** The acceptance declaration. */
export const acceptanceText = (companyName) =>
  'I accept this quotation and authorise ' + companyName + ' to proceed with the works described above, subject to the stated basis and commercial terms.'
