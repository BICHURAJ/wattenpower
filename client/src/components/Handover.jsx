import { useEffect, useRef, useState } from 'react'
import { api, shortDate } from '../api'
import { useAuth } from '../auth'
import { Banner } from './ui'
import { normaliseProducts, handoverSectionsFor, handoverProgressOf } from '../processes'
import { SurveyItem } from '../pages/SiteSurvey'

// The job's handover (Installation > Handover tab): commissioning results,
// certificates, notifications and what the customer was given, to the IET
// Codes of Practice, BS 7671 and MCS (server/src/handoverChecklist.js).
// Answers save as you go; completing it ticks the job's Handover step.

export default function HandoverPanel({ install, onChanged }) {
  const { can, user } = useAuth()
  const [record, setRecord] = useState(null)
  const [answers, setAnswers] = useState({})
  const [saveState, setSaveState] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef({})
  const timer = useRef(null)
  const products = normaliseProducts(install.products)
  const canRecord = can('installationProgress', 'update')

  useEffect(() => {
    api.get('/installations/' + install._id + '/handover')
      .then((r) => { setRecord(r); setAnswers(r.answers || {}) })
      .catch((err) => setError(err.message))
    return () => clearTimeout(timer.current)
  }, [install._id])

  const flush = async () => {
    const changes = pending.current
    pending.current = {}
    if (!Object.keys(changes).length) return
    setSaveState('saving')
    try {
      setRecord(await api.put('/installations/' + install._id + '/handover', { answers: changes }))
      setSaveState('saved')
    } catch (err) { setError(err.message); setSaveState('') }
  }
  const setAnswer = (key, value) => {
    setAnswers((a) => ({ ...a, [key]: value }))
    pending.current = { ...pending.current, [key]: value }
    setSaveState('saving')
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, 700)
  }

  const complete = async () => {
    setBusy(true)
    setError('')
    try {
      clearTimeout(timer.current)
      await flush()
      const r = await api.post('/installations/' + install._id + '/handover/complete')
      setRecord(r)
      setNotice(r.jobCompleted ? 'Handed over. The job is now completed.' : 'Handover recorded and the Handover step ticked.')
      onChanged?.()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const downloadPack = async () => {
    setBusy(true)
    setError('')
    try {
      await flush()
      const [{ exportHandoverPdf }, photos] = await Promise.all([
        import('../reports/handover'),
        can('photos') ? api.get('/photos?installation=' + install._id + '&stage=completion').then((r) => r.items).catch(() => []) : [],
      ])
      await exportHandoverPdf({ install, handover: { ...record, answers }, photos, preparedBy: user?.name })
    } catch (err) { setError('Could not create the handover pack: ' + err.message) } finally { setBusy(false) }
  }

  if (!record) return <p className="text-sm text-slate-400 py-4">{error || 'Loading handover...'}</p>

  const locked = Boolean(record.completedAt)
  const editable = canRecord && !locked && install.status !== 'On Hold'
  const progress = handoverProgressOf(products, answers)
  const blockers = progress.missing.length + progress.issues.length

  return (
    <div className="space-y-4 py-2">
      <Banner onDismiss={() => setError('')}>{error}</Banner>
      <Banner kind="success" onDismiss={() => setNotice('')}>{notice}</Banner>

      <div className="rounded-xl bg-slate-50 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[180px]">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>{locked ? 'Handed over ' + shortDate(record.completedAt) + (record.completedBy ? ' by ' + record.completedBy : '') : progress.done + ' of ' + progress.total + ' required items recorded'}</span>
              <span className="font-semibold text-slate-800">{locked ? '100%' : progress.percent + '%'}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-white overflow-hidden ring-1 ring-slate-200">
              <div className={'h-full rounded-full ' + (locked ? 'bg-emerald-500' : 'bg-brand-500')} style={{ width: (locked ? 100 : progress.percent) + '%' }} />
            </div>
          </div>
          <span className="text-xs text-slate-500 w-16 text-right">{saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? 'Saved' : ''}</span>
          <button type="button" className="btn-secondary" disabled={busy} onClick={downloadPack}>
            {busy ? 'Working...' : locked ? 'Download handover pack' : 'Download draft pack'}
          </button>
          {canRecord && !locked && (
            <button type="button" className="btn-primary" disabled={busy || blockers > 0 || !record.ready || install.status === 'On Hold'} onClick={complete}
              title={!record.ready ? 'Earlier steps must be done first' : blockers ? blockers + ' item(s) to sort out' : 'Complete the handover'}>
              Complete handover
            </button>
          )}
        </div>
        {!locked && !record.ready && (
          <p className="mt-2 text-xs text-amber-700">The job's earlier steps (installation, testing{products.includes('solar') ? ', MCS certificate, scaffolding' : ''}) must be ticked before handover can be completed. You can record the details now.</p>
        )}
        {progress.issues.length > 0 && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            <span className="font-semibold">Resolve before handing over:</span> {progress.issues.map((i) => i.label).join('; ')}
          </p>
        )}
        {!canRecord && !locked && <p className="mt-2 text-xs text-slate-500">The engineer records the handover on site.</p>}
      </div>

      {handoverSectionsFor(products).map((section) => (
        <section key={section.key} className="rounded-xl ring-1 ring-slate-200">
          <header className="px-4 pt-3 pb-2 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">{section.title}</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">{section.reference}</p>
          </header>
          <div className="p-3 space-y-2">
            {section.items.map((item) => (
              <SurveyItem key={item.key} item={item} value={answers[item.key]} disabled={!editable} onChange={(v) => setAnswer(item.key, v)}
                issueText="This must be put right before the system is handed over." />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
