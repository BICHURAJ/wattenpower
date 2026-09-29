// The site survey checklist: what an engineer records on a survey visit, by
// product. One place to change it -- the web app gets it from
// GET /api/public/processes, and the server uses it to work out how complete a
// survey is and to refuse completing one that isn't.
//
// Built from:
//   BS 7671 (IET Wiring Regulations, 18th Edition): Part 3 (assessment of
//     general characteristics), 132.16 (additions and alterations), Section 722
//     (EV charging), Section 712 (solar PV), Chapter 57 (stationary batteries)
//   IET Code of Practice for Electric Vehicle Charging Equipment Installation
//   IET Code of Practice for Grid-connected Solar Photovoltaic Systems
//   IET Code of Practice for Electrical Energy Storage Systems
//   MCS MIS 3002 (solar PV), MIS 3012 (battery storage), MCS 012 (roof fixings)
//   PAS 63100 (fire safety of home battery systems)
//   ENA Engineering Recommendations G98 / G99 / G100 (connection to the network)
//   The Electric Vehicles (Smart Charge Points) Regulations 2021
//
// Item types: yesno ('yes' | 'no' | 'na'), select, number, text, textarea.
//   required: needed before the survey can be completed
//   expect:   the safe answer ('yes'); anything else is flagged as needing action
// Photos listed in a section are required shots for that section.

const YES = { type: 'yesno', required: true, expect: 'yes' }

export const SURVEY_SECTIONS = [
  {
    key: 'property',
    title: 'Customer & property',
    products: ['ev', 'solar', 'battery'],
    reference: 'MCS MIS 3002 / 3012 pre-installation survey',
    items: [
      { key: 'propertyType', label: 'Property type', type: 'select', required: true, options: ['Detached', 'Semi-detached', 'Terraced', 'Bungalow', 'Flat', 'Commercial'] },
      { key: 'ownership', label: 'Ownership', type: 'select', required: true, options: ['Owner-occupier', 'Tenant (landlord permission needed)', 'Leasehold (freeholder permission needed)', 'Business premises'] },
      { key: 'permissionHeld', label: 'Permission from the owner / freeholder is held (where needed)', type: 'yesno', required: true, expect: 'yes' },
      { key: 'listedConservation', label: 'Listed building or conservation area (planning check needed)', type: 'yesno', required: true },
      { key: 'siteAccess', label: 'Site access, parking and any restrictions', type: 'textarea' },
    ],
    photos: [{ key: 'frontElevation', label: 'Front of the property' }],
  },
  {
    key: 'supply',
    title: 'Electrical supply & earthing',
    products: ['ev', 'solar', 'battery'],
    reference: 'BS 7671 Part 3 (assessment of general characteristics), Chapter 54',
    items: [
      { key: 'supplyType', label: 'Supply', type: 'select', required: true, options: ['Single phase', 'Three phase'] },
      { key: 'earthingSystem', label: 'Earthing arrangement', type: 'select', required: true, options: ['TN-C-S (PME)', 'TN-S', 'TT', 'Unknown -- DNO to confirm'] },
      { key: 'mainFuseA', label: 'DNO main fuse rating', type: 'number', unit: 'A', required: true },
      // Optional on the survey: can come from the DNO, and are measured at installation for the EIC.
      { key: 'zeOhms', label: 'External earth fault loop impedance (Ze), if measured', type: 'number', unit: 'Ω' },
      { key: 'pfcKa', label: 'Prospective fault current (PFC), if measured', type: 'number', unit: 'kA' },
      { key: 'tailsSize', label: 'Meter tails', type: 'select', required: true, options: ['16 mm²', '25 mm²', '35 mm²'] },
      { key: 'mainIsolator', label: 'Main isolator (switch) fitted', type: 'yesno', required: true },
      { key: 'mainBonding', label: 'Main protective bonding to gas / water present and adequate', ...YES },
      { key: 'meterType', label: 'Meter', type: 'select', options: ['Smart (SMETS2)', 'Smart (SMETS1)', 'Standard', 'Economy 7 / dual rate'] },
      { key: 'mpan', label: 'MPAN (supply number)', type: 'text' },
      { key: 'dno', label: 'Network operator (DNO)', type: 'text' },
    ],
    photos: [
      { key: 'meterFuse', label: 'Meter and main fuse' },
      { key: 'earthing', label: 'Main earthing terminal and bonding' },
    ],
  },
  {
    key: 'existing',
    title: 'Existing installation & capacity',
    products: ['ev', 'solar', 'battery'],
    reference: 'BS 7671 311.1 (maximum demand), 132.16 (additions and alterations)',
    items: [
      { key: 'cuType', label: 'Consumer unit', type: 'select', required: true, options: ['Metal (non-combustible)', 'Plastic', 'Old fuse board / rewireable fuses'] },
      { key: 'cuSpareWays', label: 'Spare ways in the consumer unit', type: 'number', required: true },
      { key: 'rcdProtection', label: 'RCD protection', type: 'select', required: true, options: ['RCBOs', 'Dual RCD board', 'Single RCD', 'No RCD'] },
      { key: 'maxDemandA', label: 'Assessed maximum demand, including the new equipment', type: 'number', unit: 'A', required: true },
      { key: 'capacityOk', label: 'Supply and existing installation adequate for the new load (132.16)', ...YES },
      { key: 'loadManagement', label: 'Load management or a supply upgrade is needed', type: 'yesno', required: true },
      { key: 'defects', label: 'Defects in the existing installation (record and tell the customer)', type: 'textarea' },
    ],
    photos: [{ key: 'consumerUnit', label: 'Consumer unit (cover off)' }],
  },
  {
    key: 'ev',
    title: 'EV charger',
    products: ['ev'],
    reference: 'BS 7671 Section 722; IET Code of Practice for EV Charging Equipment Installation; Smart Charge Points Regulations 2021',
    items: [
      { key: 'offStreetParking', label: 'Dedicated off-street parking', type: 'yesno', required: true },
      { key: 'chargerLocation', label: 'Proposed charger location', type: 'text', required: true },
      { key: 'mountingSurface', label: 'Mounting surface', type: 'select', required: true, options: ['Brick / block', 'Render', 'Timber / cladding', 'Post or bollard'] },
      { key: 'cableRunM', label: 'Cable run from the consumer unit', type: 'number', unit: 'm', required: true },
      { key: 'cableRoute', label: 'Cable route, containment and any drilling', type: 'textarea', required: true },
      { key: 'pmeSolution', label: 'Earthing for the charge point (PME, 722.411.4.1)', type: 'select', required: true, options: ['Open-PEN protection built into the charger', 'Separate earth electrode (TT)', 'TN-S earth available', 'Supply is not PME'] },
      { key: 'rcdType', label: 'RCD protection for the charge point', type: 'select', required: true, options: ['Type A + 6 mA DC detection (RDC-DD)', 'Type B RCD'] },
      { key: 'externalInfluences', label: 'Location suits external influences (weather, IP rating, impact from vehicles)', ...YES },
      { key: 'noTrailingCable', label: 'Charging cable will not trail across a footpath', ...YES },
      { key: 'signal', label: 'Wi-Fi or mobile signal at the charger (smart charging)', ...YES },
      { key: 'ozev', label: 'OZEV grant', type: 'select', options: ['Not applicable', 'Eligible', 'Not eligible'] },
    ],
    photos: [
      { key: 'evLocation', label: 'Proposed charger location' },
      { key: 'evCableRoute', label: 'Cable route' },
    ],
  },
  {
    key: 'roof',
    title: 'Roof & structure',
    products: ['solar'],
    reference: 'MCS MIS 3002; MCS 012 (roof mounting); IET Code of Practice for Grid-connected Solar PV',
    items: [
      { key: 'roofType', label: 'Roof', type: 'select', required: true, options: ['Pitched -- concrete tiles', 'Pitched -- clay / plain tiles', 'Pitched -- slate', 'Flat', 'Metal sheet', 'Other'] },
      { key: 'orientation', label: 'Orientation', type: 'select', required: true, options: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] },
      { key: 'pitch', label: 'Pitch', type: 'number', unit: '°', required: true },
      { key: 'usableArea', label: 'Usable roof area', type: 'number', unit: 'm²', required: true },
      { key: 'rafters', label: 'Rafter size and spacing', type: 'text', required: true },
      { key: 'structure', label: 'Roof structure', type: 'select', required: true, options: ['Good', 'Fair -- check before install', 'Poor -- structural engineer needed'] },
      { key: 'noAsbestos', label: 'No suspected asbestos (soffits, roof sheets, flues)', ...YES },
      { key: 'scaffold', label: 'Scaffold access and restrictions', type: 'text', required: true },
      { key: 'birdProtection', label: 'Bird protection needed', type: 'yesno' },
    ],
    photos: [
      { key: 'roofElevation', label: 'Roof (whole elevation)' },
      { key: 'roofCovering', label: 'Roof covering close-up' },
      { key: 'loft', label: 'Loft / rafters' },
    ],
  },
  {
    key: 'shading',
    title: 'Shading & yield (MCS)',
    products: ['solar'],
    reference: 'MCS MIS 3002 performance estimate and shade assessment',
    items: [
      { key: 'mcsZone', label: 'MCS irradiance zone (from the postcode)', type: 'text', required: true },
      { key: 'obstructions', label: 'Obstructions (trees, chimneys, buildings) with direction and height', type: 'textarea' },
      { key: 'shadingFactor', label: 'Shading factor (SF, 1.00 = no shading)', type: 'number', required: true },
      { key: 'annualKwh', label: 'Customer\'s annual electricity use', type: 'number', unit: 'kWh', required: true },
      { key: 'occupancy', label: 'Occupancy', type: 'select', required: true, options: ['Home all day', 'In half the day', 'Out during the day'] },
    ],
    photos: [{ key: 'shadingView', label: 'View from the array (shading)' }],
  },
  {
    key: 'pv',
    title: 'PV electrical & grid connection',
    products: ['solar'],
    reference: 'BS 7671 Section 712; IET Code of Practice for Grid-connected Solar PV; ENA G98 / G99 / G100',
    items: [
      { key: 'inverterLocation', label: 'Inverter location', type: 'text', required: true },
      { key: 'dcRoute', label: 'DC cable route (clear of escape routes; fire-resistant fixings)', type: 'textarea', required: true },
      { key: 'acIsolator', label: 'AC isolator location', type: 'text', required: true },
      { key: 'genMeter', label: 'Generation meter location', type: 'text', required: true },
      { key: 'gridConnection', label: 'Connection to the network', type: 'select', required: true, options: ['G98 -- notify within 28 days', 'G99 -- apply before installing', 'G100 -- export limitation'] },
    ],
    photos: [{ key: 'inverterSpot', label: 'Inverter location' }],
  },
  {
    key: 'battery',
    title: 'Battery storage',
    products: ['battery'],
    reference: 'BS 7671 Chapter 57; IET Code of Practice for Electrical Energy Storage Systems; MCS MIS 3012; PAS 63100',
    items: [
      { key: 'batteryLocation', label: 'Battery location', type: 'select', required: true, options: ['Garage', 'Outbuilding', 'Utility room', 'External wall', 'Loft', 'Other'] },
      { key: 'notEscapeRoute', label: 'Not in an escape route or sleeping area (PAS 63100)', ...YES },
      { key: 'ambientOk', label: 'Ambient temperature within the manufacturer\'s range', ...YES },
      { key: 'ventilationOk', label: 'Adequate ventilation and clearances', ...YES },
      { key: 'structureOk', label: 'Wall / floor takes the weight; non-combustible surface', ...YES },
      { key: 'floodClear', label: 'Clear of flood risk', ...YES },
      { key: 'coupling', label: 'Coupling', type: 'select', required: true, options: ['AC coupled', 'DC coupled (hybrid inverter)'] },
      { key: 'backup', label: 'Backup power', type: 'select', options: ['None', 'Essential circuits', 'Whole house'] },
    ],
    photos: [{ key: 'batterySpot', label: 'Battery location' }],
  },
  {
    key: 'signoff',
    title: 'Summary & sign-off',
    products: ['ev', 'solar', 'battery'],
    reference: 'MCS survey record; site risk assessment',
    items: [
      { key: 'riskAssessment', label: 'Site risk assessment done (working at height, access, hazards)', ...YES },
      { key: 'customerBriefed', label: 'Customer talked through the proposal and next steps', ...YES },
      { key: 'recommendation', label: 'Summary and recommendation', type: 'textarea', required: true },
    ],
    photos: [],
  },
]

/** Photo stages, start to finish. Survey photos belong to the survey's checklist. */
export const PHOTO_STAGES = [
  { key: 'survey', label: 'Site survey' },
  { key: 'pre-install', label: 'Before installation' },
  { key: 'installation', label: 'During installation' },
  { key: 'completion', label: 'Completion & handover' },
]
export const PHOTO_STAGE_KEYS = PHOTO_STAGES.map((s) => s.key)

/** The sections for a job with these products. */
export function surveySectionsFor(products) {
  const chosen = products?.length ? products : ['ev']
  return SURVEY_SECTIONS.filter((s) => s.products.some((p) => chosen.includes(p)))
}

const answered = (value) => value !== undefined && value !== null && String(value).trim() !== ''

/**
 * How far a survey has got. `answers` is { itemKey: value } (a Map or object),
 * `photoSlots` the set of photo slot keys that have at least one photo.
 * Returns { done, total, percent, sections: [{ key, done, total }], missing, issues }.
 */
export function surveyProgress(products, answers, photoSlots = new Set()) {
  const get = (key) => (typeof answers?.get === 'function' ? answers.get(key) : answers?.[key])
  const sections = []
  const missing = []
  const issues = []
  for (const section of surveySectionsFor(products)) {
    let done = 0
    let total = 0
    for (const item of section.items) {
      const value = get(item.key)
      if (item.expect && answered(value) && value !== item.expect) issues.push({ section: section.key, key: item.key, label: item.label })
      if (!item.required) continue
      total++
      if (answered(value)) done++
      else missing.push({ section: section.key, key: item.key, label: item.label })
    }
    for (const photo of section.photos) {
      total++
      if (photoSlots.has(photo.key)) done++
      else missing.push({ section: section.key, key: photo.key, label: 'Photo: ' + photo.label, photo: true })
    }
    sections.push({ key: section.key, done, total })
  }
  const done = sections.reduce((n, s) => n + s.done, 0)
  const total = sections.reduce((n, s) => n + s.total, 0)
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0, sections, missing, issues }
}
