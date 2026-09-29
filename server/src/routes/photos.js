import express from 'express'
import mongoose from 'mongoose'
import SitePhoto, { MAX_IMAGE_BYTES, MAX_THUMB_BYTES } from '../models/SitePhoto.js'
import SiteSurvey from '../models/SiteSurvey.js'
import Installation from '../models/Installation.js'
import { userCan } from '../permissions.js'
import { PHOTO_STAGE_KEYS, surveySectionsFor } from '../surveyChecklist.js'
import { refreshSurvey } from '../surveyService.js'

// Job photos, from the site survey to handover (stages in surveyChecklist.js).
// Access is checked here rather than by authorize(): anyone who can add photos
// may remove their own; removing other people's needs the delete right.
const router = express.Router()

// Photos arrive as base64 JSON, so this route takes bigger bodies than the rest of the API.
router.use(express.json({ limit: '8mb' }))

const isId = (id) => mongoose.isValidObjectId(id)
const need = (action) => (req, res, next) => (userCan(req.user, 'photos', action)
  ? next()
  : res.status(403).json({ error: "Your account doesn't allow you to " + action + ' photos.' }))

const meta = (p) => ({
  id: p._id,
  installation: p.installation,
  stage: p.stage,
  slot: p.slot || null,
  caption: p.caption || '',
  width: p.width,
  height: p.height,
  size: p.size,
  uploadedBy: p.uploadedBy,
  uploadedByName: p.uploadedByName,
  createdAt: p.createdAt,
})

/** Decodes a base64 image (a data URL or bare base64); only JPEG, PNG and WebP. */
function decodeImage(value) {
  if (typeof value !== 'string') return null
  const base64 = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value
  const buf = Buffer.from(base64, 'base64')
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
  const png = buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  const webp = buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP'
  if (!jpeg && !png && !webp) return null
  return { buf, type: jpeg ? 'image/jpeg' : png ? 'image/png' : 'image/webp' }
}

/** Survey photos can't change once the survey is completed. */
async function surveyLocked(installationId) {
  const survey = await SiteSurvey.findOne({ installation: installationId }).select('status').lean()
  return survey?.status === 'Completed'
}

async function refreshSurveyFor(installationId) {
  const survey = await SiteSurvey.findOne({ installation: installationId })
  if (survey && survey.status !== 'Completed') await refreshSurvey(survey)
}

// A job's photos (no image data): ?installation=ID&stage=survey
router.get('/', need('read'), async (req, res, next) => {
  try {
    if (!isId(req.query.installation)) return res.status(400).json({ error: 'Choose an installation.' })
    const filter = { installation: req.query.installation }
    if (PHOTO_STAGE_KEYS.includes(req.query.stage)) filter.stage = req.query.stage
    const photos = await SitePhoto.find(filter).sort({ createdAt: 1 }).lean()
    res.json({ items: photos.map(meta) })
  } catch (err) { next(err) }
})

// The picture itself (full size, or ?size=thumb).
router.get('/:id/image', need('read'), async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ error: 'Photo not found' })
    const wantThumb = req.query.size === 'thumb'
    let photo = await SitePhoto.findById(req.params.id).select(wantThumb ? '+thumb contentType' : '+data contentType')
    if (!photo) return res.status(404).json({ error: 'Photo not found' })
    res.set('Cache-Control', 'private, max-age=86400')
    if (wantThumb && photo.thumb?.length) return res.type('image/jpeg').send(photo.thumb)
    // No thumbnail stored: send the full picture instead.
    if (wantThumb) photo = await SitePhoto.findById(req.params.id).select('+data contentType')
    res.type(photo.contentType).send(photo.data)
  } catch (err) { next(err) }
})

// Add a photo: { installation, stage, slot?, caption?, image, thumb?, width?, height? }
router.post('/', need('create'), async (req, res, next) => {
  try {
    const b = req.body || {}
    if (!isId(b.installation)) return res.status(400).json({ error: 'Choose an installation.' })
    if (!PHOTO_STAGE_KEYS.includes(b.stage)) return res.status(400).json({ error: 'Choose a stage for the photo.' })
    const job = await Installation.findById(b.installation).select('products installNo').lean()
    if (!job) return res.status(404).json({ error: 'Installation not found' })

    let slot = ''
    if (b.stage === 'survey') {
      if (await surveyLocked(job._id)) return res.status(409).json({ error: 'The site survey is completed and locked.' })
      if (b.slot) {
        const slots = surveySectionsFor(job.products).flatMap((s) => s.photos.map((p) => p.key))
        if (!slots.includes(b.slot)) return res.status(400).json({ error: 'That photo isn\'t on this job\'s survey.' })
        slot = b.slot
      }
    }

    const image = decodeImage(b.image)
    if (!image) return res.status(400).json({ error: 'Upload a JPEG, PNG or WebP picture.' })
    if (image.buf.length > MAX_IMAGE_BYTES) return res.status(413).json({ error: 'That picture is too large (4 MB max).' })
    const thumb = b.thumb ? decodeImage(b.thumb) : null
    if (thumb && thumb.buf.length > MAX_THUMB_BYTES) return res.status(413).json({ error: 'Thumbnail too large.' })

    const photo = await SitePhoto.create({
      installation: job._id,
      stage: b.stage,
      slot,
      caption: String(b.caption || '').slice(0, 300),
      contentType: image.type,
      width: Number(b.width) || undefined,
      height: Number(b.height) || undefined,
      size: image.buf.length,
      data: image.buf,
      thumb: thumb?.buf,
      uploadedBy: req.user._id,
      uploadedByName: req.user.name,
    })
    if (b.stage === 'survey') await refreshSurveyFor(job._id)
    res.status(201).json(meta(photo))
  } catch (err) { next(err) }
})

/** Your own photo (with the add right), or anyone's with `action` on photos. */
async function ownOr(req, res, action) {
  if (!isId(req.params.id)) { res.status(404).json({ error: 'Photo not found' }); return null }
  const photo = await SitePhoto.findById(req.params.id)
  if (!photo) { res.status(404).json({ error: 'Photo not found' }); return null }
  const own = String(photo.uploadedBy) === String(req.user._id) && userCan(req.user, 'photos', 'create')
  if (!own && !userCan(req.user, 'photos', action)) {
    res.status(403).json({ error: 'You can only change your own photos.' })
    return null
  }
  if (photo.stage === 'survey' && await surveyLocked(photo.installation)) {
    res.status(409).json({ error: 'The site survey is completed and locked.' })
    return null
  }
  return photo
}

// Change a caption.
router.put('/:id', async (req, res, next) => {
  try {
    const photo = await ownOr(req, res, 'update')
    if (!photo) return
    photo.caption = String(req.body?.caption || '').slice(0, 300)
    await photo.save()
    res.json(meta(photo))
  } catch (err) { next(err) }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const photo = await ownOr(req, res, 'delete')
    if (!photo) return
    await photo.deleteOne()
    if (photo.stage === 'survey') await refreshSurveyFor(photo.installation)
    res.json({ ok: true })
  } catch (err) { next(err) }
})

export default router
