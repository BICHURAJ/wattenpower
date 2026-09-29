import mongoose from 'mongoose'
import { PHOTO_STAGE_KEYS } from '../surveyChecklist.js'

// A photo of a job, from the survey to handover. The web app shrinks photos
// before upload (about 1600 px JPEG, plus a small thumbnail), so they're kept
// in the database: nothing extra to back up or mount in Docker.
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024
export const MAX_THUMB_BYTES = 200 * 1024

const SitePhotoSchema = new mongoose.Schema({
  installation: { type: mongoose.Schema.Types.ObjectId, ref: 'Installation', required: true, index: true },
  stage: { type: String, enum: PHOTO_STAGE_KEYS, required: true },
  slot: String, // survey checklist photo (e.g. 'consumerUnit'); empty for extra photos
  caption: { type: String, trim: true, maxlength: 300 },
  contentType: { type: String, default: 'image/jpeg' },
  width: Number,
  height: Number,
  size: Number,
  data: { type: Buffer, required: true, select: false },
  thumb: { type: Buffer, select: false },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  uploadedByName: String,
}, { timestamps: true })

SitePhotoSchema.index({ installation: 1, stage: 1, createdAt: 1 })

export default mongoose.model('SitePhoto', SitePhotoSchema)
