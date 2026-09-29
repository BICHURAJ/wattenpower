import { useEffect, useRef, useState } from 'react'
import { api, getToken } from '../api'
import { useAuth } from '../auth'
import { photoStages } from '../processes'
import { Banner } from './ui'

// Job photos, from the site survey to handover. Pictures are shrunk in the
// browser before upload (phones take 4-12 MB photos) and loaded with the
// user's sign-in, since the API needs it.

const MAX_SIDE = 1600
const THUMB_SIDE = 360

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(file.name + ' is not a picture this browser can read.')) }
    img.src = url
  })
}

function drawScaled(img, maxSide, quality) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
  const width = Math.round(img.naturalWidth * scale)
  const height = Math.round(img.naturalHeight * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').drawImage(img, 0, 0, width, height)
  return { dataUrl: canvas.toDataURL('image/jpeg', quality), width, height }
}

/** Shrinks a picture to a JPEG (max 1600 px) plus a thumbnail. */
export async function preparePhoto(file) {
  const img = await loadImage(file)
  const full = drawScaled(img, MAX_SIDE, 0.82)
  const thumb = drawScaled(img, THUMB_SIDE, 0.7)
  return { image: full.dataUrl, thumb: thumb.dataUrl, width: full.width, height: full.height }
}

/** Uploads files as photos of a job. Returns the saved photos. */
export async function uploadPhotos(files, { installation, stage, slot }) {
  const saved = []
  for (const file of files) {
    const prepared = await preparePhoto(file)
    saved.push(await api.post('/photos', { installation, stage, slot, ...prepared }))
  }
  return saved
}

// Loaded pictures, kept as object URLs so revisiting a page doesn't download them again.
const imageCache = new Map()

/** An object URL for a photo, fetched with the user's sign-in. */
export function usePhotoUrl(id, size) {
  const key = id + (size === 'thumb' ? ':thumb' : '')
  const [url, setUrl] = useState(() => imageCache.get(key) || null)
  useEffect(() => {
    if (!id || imageCache.has(key)) { setUrl(imageCache.get(key) || null); return }
    let cancelled = false
    fetch('/api/photos/' + id + '/image' + (size === 'thumb' ? '?size=thumb' : ''), { headers: { Authorization: 'Bearer ' + getToken() } })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!blob) return
        const objectUrl = URL.createObjectURL(blob)
        imageCache.set(key, objectUrl)
        if (!cancelled) setUrl(objectUrl)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [id, key, size])
  return url
}

function Thumb({ photo, onOpen, onDelete, canDelete }) {
  const url = usePhotoUrl(photo.id, 'thumb')
  return (
    <figure className="group relative aspect-square overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200">
      <button type="button" className="block w-full h-full" onClick={() => onOpen(photo)} title={photo.caption || 'Open photo'}>
        {url
          ? <img src={url} alt={photo.caption || ''} className="w-full h-full object-cover" />
          : <span className="grid w-full h-full place-items-center text-[10px] text-slate-400">Loading...</span>}
      </button>
      {canDelete && (
        <button
          type="button"
          className="absolute top-1 right-1 grid place-items-center w-6 h-6 rounded-full bg-black/55 text-white text-xs opacity-100 sm:opacity-0 group-hover:opacity-100 focus:opacity-100"
          title="Remove photo"
          onClick={() => onDelete(photo)}
        >
          &times;
        </button>
      )}
    </figure>
  )
}

/** Full-screen view of one photo, with left/right through the set. */
export function PhotoViewer({ photos, start, onClose }) {
  const [index, setIndex] = useState(Math.max(0, photos.findIndex((p) => p.id === start?.id)))
  const photo = photos[index]
  const url = usePhotoUrl(photo?.id)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(photos.length - 1, i + 1))
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [photos.length, onClose])
  if (!photo) return null
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-950/95" onClick={onClose}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-white/80" onClick={(e) => e.stopPropagation()}>
        <span className="min-w-0 truncate">
          {photo.caption || 'Photo'} · {photo.uploadedByName || ''} · {new Date(photo.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
        </span>
        <span className="shrink-0 flex items-center gap-3">
          {url && <a href={url} download={'photo-' + photo.id + '.jpg'} className="hover:text-white">Download</a>}
          <button type="button" className="text-2xl leading-none hover:text-white" onClick={onClose}>&times;</button>
        </span>
      </div>
      <div className="relative flex-1 min-h-0 grid place-items-center px-2 pb-4">
        {url ? <img src={url} alt={photo.caption || ''} className="max-w-full max-h-full object-contain" onClick={(e) => e.stopPropagation()} />
          : <span className="text-white/60 text-sm">Loading...</span>}
        {index > 0 && (
          <button type="button" className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/15 text-white text-xl"
            onClick={(e) => { e.stopPropagation(); setIndex(index - 1) }}>&lsaquo;</button>
        )}
        {index < photos.length - 1 && (
          <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/15 text-white text-xl"
            onClick={(e) => { e.stopPropagation(); setIndex(index + 1) }}>&rsaquo;</button>
        )}
      </div>
    </div>
  )
}

/** "Add photos" button: opens the camera on phones, the file picker elsewhere. */
export function AddPhotosButton({ onFiles, busy, label = 'Add photos', small = false }) {
  const input = useRef(null)
  return (
    <>
      <button type="button" className={(small ? 'btn-secondary px-2.5 py-1 text-xs' : 'btn-secondary') + ' whitespace-nowrap'} disabled={busy} onClick={() => input.current?.click()}>
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M4 8h3l2-3h6l2 3h3v11H4V8Z" /><circle cx="12" cy="13" r="3.5" />
        </svg>
        {busy ? 'Uploading...' : label}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => { const files = [...e.target.files]; e.target.value = ''; if (files.length) onFiles(files) }}
      />
    </>
  )
}

/** A grid of photos with the viewer and (where allowed) remove. */
export function PhotoGrid({ photos, onDeleted, locked = false, empty = 'No photos yet.' }) {
  const { user, can } = useAuth()
  const [open, setOpen] = useState(null)
  const [error, setError] = useState('')
  const canDelete = (p) => !locked && (can('photos', 'delete') || (can('photos', 'create') && String(p.uploadedBy) === String(user?.id || user?._id)))
  const remove = async (p) => {
    if (!window.confirm('Remove this photo?')) return
    setError('')
    try { await api.del('/photos/' + p.id); onDeleted?.(p) } catch (err) { setError(err.message) }
  }
  return (
    <>
      <Banner onDismiss={() => setError('')}>{error}</Banner>
      {photos.length === 0 ? <p className="text-xs text-slate-400">{empty}</p> : (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {photos.map((p) => <Thumb key={p.id} photo={p} onOpen={setOpen} onDelete={remove} canDelete={canDelete(p)} />)}
        </div>
      )}
      {open && <PhotoViewer photos={photos} start={open} onClose={() => setOpen(null)} />}
    </>
  )
}

/**
 * All of a job's photos by stage (survey to handover), with upload for each
 * stage. Survey photos are added on the site survey itself.
 */
export function JobPhotos({ installationId, surveyLocked = false }) {
  const { can } = useAuth()
  const [photos, setPhotos] = useState(null)
  const [busyStage, setBusyStage] = useState(null)
  const [error, setError] = useState('')
  const load = () => api.get('/photos?installation=' + installationId).then((r) => setPhotos(r.items)).catch((err) => setError(err.message))
  useEffect(() => { load() }, [installationId]) // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (stage, files) => {
    setBusyStage(stage)
    setError('')
    try { await uploadPhotos(files, { installation: installationId, stage }); await load() } catch (err) { setError(err.message) } finally { setBusyStage(null) }
  }

  if (!photos) return <p className="text-sm text-slate-400 py-4">{error || 'Loading photos...'}</p>
  return (
    <div className="space-y-5">
      <Banner onDismiss={() => setError('')}>{error}</Banner>
      {photoStages().map((stage) => {
        const list = photos.filter((p) => p.stage === stage.key)
        const survey = stage.key === 'survey'
        return (
          <section key={stage.key}>
            <div className="flex items-center justify-between gap-3 mb-2">
              <h3 className="text-sm font-semibold text-slate-800">
                {stage.label} <span className="font-normal text-slate-400">({list.length})</span>
              </h3>
              {survey
                ? <span className="text-xs text-slate-400">Added on the site survey</span>
                : can('photos', 'create') && <AddPhotosButton small busy={busyStage === stage.key} onFiles={(files) => add(stage.key, files)} />}
            </div>
            <PhotoGrid photos={list} locked={survey && surveyLocked} onDeleted={load} empty={survey ? 'No survey photos yet.' : 'No photos for this stage yet.'} />
          </section>
        )
      })}
    </div>
  )
}
