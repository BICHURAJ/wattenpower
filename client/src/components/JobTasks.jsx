import { useState } from 'react'
import { api, shortDate, inputDate } from '../api'
import { Banner } from './ui'

// Installation > Tasks: the job's to-do list. Add, edit, assign, date, tick off
// and remove tasks; "Add standard tasks" fills in the usual checklist for the
// job's products. Open tasks first, then done ones.

const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
const isOverdue = (t) => !t.done && t.dueDate && new Date(t.dueDate) < today()

function TaskForm({ initial = {}, engineers, onSave, onCancel, busy, submitLabel }) {
  const [title, setTitle] = useState(initial.title || '')
  const [dueDate, setDueDate] = useState(initial.dueDate ? inputDate(initial.dueDate) : '')
  const [assignedTo, setAssignedTo] = useState(initial.assignedTo || '')
  const submit = (e) => {
    e.preventDefault()
    if (title.trim()) onSave({ title: title.trim(), dueDate: dueDate || null, assignedTo: assignedTo || null })
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <label className="flex-1 min-w-[200px]">
        <span className="label">Task</span>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Book scaffolding" maxLength={200} autoFocus={Boolean(initial.title)} />
      </label>
      <label className="w-40">
        <span className="label">Due</span>
        <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </label>
      <label className="w-44">
        <span className="label">Assigned to</span>
        <select className="input" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
          <option value="">Anyone</option>
          {engineers.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
        </select>
      </label>
      {onCancel && <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>}
      <button className="btn-primary" disabled={busy || !title.trim()}>{busy ? 'Saving...' : submitLabel}</button>
    </form>
  )
}

export default function JobTasks({ install, engineers = [], canEdit, onChanged }) {
  const [tasks, setTasks] = useState(install.tasks || [])
  const [editing, setEditing] = useState(null) // task id
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const base = '/installations/' + install._id + '/tasks'
  const nameOf = (id) => engineers.find((e) => e._id === String(id))?.name

  const run = async (fn) => {
    setBusy(true)
    setError('')
    try { setTasks(await fn()); onChanged?.() } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const add = (values) => run(async () => { const r = await api.post(base, values); setAdding(false); return r })
  const addStandard = () => run(() => api.post(base, { standard: true }))
  const update = (task, values) => run(async () => { const r = await api.put(base + '/' + task._id, values); setEditing(null); return r })
  const remove = (task) => { if (window.confirm('Remove the task "' + task.title + '"?')) run(() => api.del(base + '/' + task._id)) }

  const open = tasks.filter((t) => !t.done).sort((a, b) => new Date(a.dueDate || 8.64e15) - new Date(b.dueDate || 8.64e15))
  const done = tasks.filter((t) => t.done).sort((a, b) => new Date(b.doneAt || 0) - new Date(a.doneAt || 0))
  const percent = tasks.length ? Math.round((done.length / tasks.length) * 100) : 0

  const row = (task) => (editing === task._id ? (
    <li key={task._id} className="py-3">
      <TaskForm initial={task} engineers={engineers} busy={busy} submitLabel="Save" onCancel={() => setEditing(null)} onSave={(v) => update(task, v)} />
    </li>
  ) : (
    <li key={task._id} className="group flex items-start gap-3 py-2.5">
      <input type="checkbox" className="mt-1 rounded border-slate-300" checked={task.done} disabled={!canEdit || busy}
        onChange={() => update(task, { done: !task.done })} aria-label={'Mark "' + task.title + '" ' + (task.done ? 'not done' : 'done')} />
      <div className="flex-1 min-w-0">
        <p className={'text-sm ' + (task.done ? 'line-through text-slate-400' : 'text-slate-800')}>{task.title}</p>
        <p className="text-xs text-slate-400 mt-0.5 flex flex-wrap gap-x-3">
          {task.dueDate && <span className={isOverdue(task) ? 'text-red-600 font-medium' : ''}>{isOverdue(task) ? 'Overdue · ' : 'Due '}{shortDate(task.dueDate)}</span>}
          {task.assignedTo && <span>{nameOf(task.assignedTo) || 'Assigned'}</span>}
          {task.done && task.doneBy && <span>Done by {task.doneBy}{task.doneAt ? ', ' + shortDate(task.doneAt) : ''}</span>}
          {!task.done && task.createdBy && <span>Added by {task.createdBy}</span>}
        </p>
      </div>
      {canEdit && (
        <span className="flex gap-2 text-xs opacity-100 sm:opacity-0 group-hover:opacity-100 focus-within:opacity-100">
          {!task.done && <button type="button" className="text-brand-600 hover:underline" onClick={() => setEditing(task._id)}>Edit</button>}
          <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => remove(task)}>Remove</button>
        </span>
      )}
    </li>
  ))

  return (
    <div className="py-2 space-y-4">
      <Banner onDismiss={() => setError('')}>{error}</Banner>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[180px]">
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>{done.length} of {tasks.length} done{open.some(isOverdue) ? ' · ' + open.filter(isOverdue).length + ' overdue' : ''}</span>
            <span className="font-semibold text-slate-800">{percent}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: percent + '%' }} />
          </div>
        </div>
        {canEdit && (
          <>
            <button type="button" className="btn-secondary text-sm" disabled={busy} onClick={addStandard}>Add standard tasks</button>
            {!adding && <button type="button" className="btn-primary text-sm" onClick={() => setAdding(true)}>+ Add task</button>}
          </>
        )}
      </div>

      {adding && (
        <div className="rounded-xl bg-slate-50 p-3">
          <TaskForm engineers={engineers} busy={busy} submitLabel="Add task" onCancel={() => setAdding(false)} onSave={add} />
        </div>
      )}

      {tasks.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">
          No tasks on this job yet.{canEdit && ' Add one, or add the standard tasks for this job.'}
        </p>
      ) : (
        <>
          {open.length > 0 && <ul className="divide-y divide-slate-100">{open.map(row)}</ul>}
          {done.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Done ({done.length})</p>
              <ul className="divide-y divide-slate-100">{done.map(row)}</ul>
            </div>
          )}
        </>
      )}
      {!canEdit && <p className="text-xs text-slate-400">View only -- your account can't change this job.</p>}
    </div>
  )
}
