// The handover checklist: commissioning results, certificates, notifications
// and what the customer is given, recorded when a job is handed over. One place
// to change it -- the web app gets it from GET /api/public/processes, and the
// server uses it to refuse completing a handover that isn't finished.
//
// Built from:
//   BS 7671 (18th Edition): Part 6 (inspection and testing, certification),
//     Section 722 (EV charging), Section 712 (solar PV), Chapter 57 (batteries),
//     514 (warning notices and labels)
//   IET Code of Practice for Electric Vehicle Charging Equipment Installation
//   IET Code of Practice for Grid-connected Solar Photovoltaic Systems
//   IET Code of Practice for Electrical Energy Storage Systems
//   BS EN IEC 62446-1 (PV system documentation, commissioning tests)
//   MCS MIS 3002 / MIS 3012 (handover documentation and MCS certificate)
//   ENA Engineering Recommendations G98 / G99 (connection to the network)
//   The Electric Vehicles (Smart Charge Points) Regulations 2021
//   Building Regulations Part P (notifiable electrical work)
//
// Item types and flags are the same as the site survey (surveyChecklist.js).

const YES = { type: 'yesno', required: true, expect: 'yes' }

export const HANDOVER_SECTIONS = [
  {
    key: 'certification',
    title: 'Certification & notifications',
    products: ['ev', 'solar', 'battery'],
    reference: 'BS 7671 Part 6; Building Regulations Part P; ENA G98 / G99',
    items: [
      { key: 'eicNumber', label: 'Electrical Installation Certificate (EIC) number', type: 'text', required: true },
      { key: 'eicDate', label: 'EIC date', type: 'date', required: true },
      { key: 'partP', label: 'Building Regulations (Part P) notification reference', type: 'text', required: true, help: 'Via your competent person scheme' },
      { key: 'dnoNotification', label: 'Network operator (DNO) notification', type: 'select', required: true, options: ['G98 -- notified', 'G99 -- approved before connection', 'EV charge point -- notified', 'Not required'] },
      { key: 'dnoReference', label: 'DNO reference', type: 'text' },
    ],
  },
  {
    key: 'ev',
    title: 'EV charge point commissioning',
    products: ['ev'],
    reference: 'BS 7671 Section 722; IET Code of Practice for EV Charging Equipment Installation; Smart Charge Points Regulations 2021',
    items: [
      { key: 'evCharger', label: 'Charger make and model', type: 'text', required: true },
      { key: 'evSerial', label: 'Charger serial number', type: 'text', required: true },
      { key: 'evRatingKw', label: 'Rated output', type: 'number', unit: 'kW', required: true },
      { key: 'evEarthing', label: 'Earthing for the charge point (722.411.4.1)', type: 'select', required: true, options: ['Open-PEN protection in the charger', 'Earth electrode (TT)', 'TN-S earth', 'Supply not PME'] },
      { key: 'evRa', label: 'Earth electrode resistance (RA), if TT', type: 'number', unit: 'ohms' },
      { key: 'evRcdTest', label: 'RCD and DC fault detection (RDC-DD / Type B) tested and working', ...YES },
      { key: 'evSmart', label: 'Smart functions working; default off-peak schedule with randomised delay set', ...YES },
      { key: 'evLoadManagement', label: 'Load management', type: 'select', required: true, options: ['Not needed', 'CT clamp fitted and tested', 'Set to the DNO-agreed limit'] },
      { key: 'evTestCharge', label: 'Test charge done with the customer\'s vehicle (or test unit)', ...YES },
    ],
  },
  {
    key: 'pv',
    title: 'Solar PV commissioning',
    products: ['solar'],
    reference: 'BS 7671 Section 712; IET Code of Practice for Grid-connected Solar PV; BS EN IEC 62446-1',
    items: [
      { key: 'pvPanels', label: 'Panels installed', type: 'number', required: true },
      { key: 'pvInverterSerial', label: 'Inverter serial number', type: 'text', required: true },
      { key: 'pvVoc', label: 'String open-circuit voltage (Voc), string 1', type: 'number', unit: 'V', required: true },
      { key: 'pvIsc', label: 'String short-circuit current (Isc), string 1', type: 'number', unit: 'A', required: true },
      { key: 'pvStrings', label: 'Other strings (Voc / Isc)', type: 'text' },
      { key: 'pvInsulation', label: 'DC insulation resistance', type: 'number', unit: 'MΩ', required: true },
      { key: 'pvPolarity', label: 'DC polarity checked', ...YES },
      { key: 'pvIsolators', label: 'DC and AC isolators fitted, labelled and working', ...YES },
      { key: 'pvLabels', label: 'Dual supply warning labels at the meter, consumer unit and isolators', ...YES },
      { key: 'pvMeterReading', label: 'Generation meter reading at handover', type: 'number', unit: 'kWh', required: true },
      { key: 'pvExport', label: 'Export', type: 'select', required: true, options: ['Full export', 'Export limited (G100)', 'Zero export'] },
      { key: 'mcsCertificate', label: 'MCS certificate number', type: 'text', required: true },
    ],
  },
  {
    key: 'battery',
    title: 'Battery commissioning',
    products: ['battery'],
    reference: 'BS 7671 Chapter 57; IET Code of Practice for Electrical Energy Storage Systems; MCS MIS 3012; PAS 63100',
    items: [
      { key: 'batterySerial', label: 'Battery serial number(s)', type: 'text', required: true },
      { key: 'batteryLocationOk', label: 'Installed in the surveyed location, clear of escape routes (PAS 63100)', ...YES },
      { key: 'batteryLabels', label: 'Battery warning labels and isolation notices fitted', ...YES },
      { key: 'batteryCharge', label: 'Charges and discharges correctly; app monitoring set up', ...YES },
      { key: 'batteryBackup', label: 'Backup (EPS) switchover tested', type: 'yesno' },
    ],
  },
  {
    key: 'customer',
    title: 'Documents & customer handover',
    products: ['ev', 'solar', 'battery'],
    reference: 'MCS handover pack; IET Codes of Practice (user information)',
    items: [
      { key: 'docCertificates', label: 'EIC (and MCS certificate for solar / battery) given to the customer', ...YES },
      { key: 'docManuals', label: 'Manufacturer manuals and warranties given', ...YES },
      { key: 'docIsolation', label: 'Customer shown how to isolate the system safely (emergency shutdown)', ...YES },
      { key: 'docMaintenance', label: 'Maintenance and inspection advice given', ...YES },
      { key: 'docSeg', label: 'Smart Export Guarantee (SEG) information given', type: 'yesno', required: true, products: ['solar', 'battery'] },
      { key: 'docApp', label: 'Monitoring / charging app set up on the customer\'s phone', type: 'yesno' },
      { key: 'siteClean', label: 'Site left clean and safe', ...YES },
      { key: 'customerName', label: 'Customer name (received the handover)', type: 'text', required: true },
      { key: 'customerConfirmed', label: 'Customer confirms the system was demonstrated and the documents received', ...YES },
    ],
  },
]

/** The handover sections for a job with these products (items filtered by product too). */
export function handoverSectionsFor(products) {
  const chosen = products?.length ? products : ['ev']
  return HANDOVER_SECTIONS
    .filter((s) => s.products.some((p) => chosen.includes(p)))
    .map((s) => ({ ...s, items: s.items.filter((i) => !i.products || i.products.some((p) => chosen.includes(p))) }))
}

const answered = (v) => v !== undefined && v !== null && String(v).trim() !== ''

/** { done, total, percent, missing, issues } for a handover's answers. */
export function handoverProgress(products, answers) {
  const get = (key) => (typeof answers?.get === 'function' ? answers.get(key) : answers?.[key])
  const missing = []
  const issues = []
  let done = 0
  let total = 0
  for (const section of handoverSectionsFor(products)) {
    for (const item of section.items) {
      const value = get(item.key)
      if (item.expect && answered(value) && value !== item.expect) issues.push({ section: section.key, key: item.key, label: item.label })
      if (!item.required) continue
      total++
      if (answered(value)) done++
      else missing.push({ section: section.key, key: item.key, label: item.label })
    }
  }
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0, missing, issues }
}
