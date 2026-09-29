import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, timeAgo } from '../api'
import { Banner, Modal, SearchInput } from '../components/ui'
import { desktopAlertsSupported } from '../components/MessageAlerts'

const MAX_LENGTH = 2000
// No polling: new messages and read receipts arrive over the push stream
// (see messageStream.js). Requests happen only when you open, send or read.
const ROLE_NAMES = { admin: 'Admin', finance: 'Finance', sales: 'Sales', engineer: 'Engineer' }


const timeOf = (date) => new Date(date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const dayOf = (date) => {
  const d = new Date(date)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

/** The list with `message` swapped in for its old version. */
const replaceMessage = (messages, message) => messages.map((m) => (m.id === message.id ? { ...m, ...message } : m))

const TrashIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
)

/** Hover buttons beside a message: Edit (your own, not deleted) and Delete. */
function MessageActions({ m, busy, onEdit, onDelete }) {
  return (
    <span className="flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
      {onEdit && !m.deleted && (
        <button type="button" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Edit" disabled={busy} onClick={onEdit}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
        </button>
      )}
      <button type="button" className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete" disabled={busy} onClick={onDelete}>
        <TrashIcon />
      </button>
    </span>
  )
}

function Avatar({ person, size = 'w-9 h-9' }) {
  return (
    <span className={'grid place-items-center shrink-0 rounded-full text-xs font-semibold ' + size + ' ' +
      (person?.active === false ? 'bg-slate-100 text-slate-400' : 'bg-brand-100 text-brand-700')}>
      {person?.initials || (person?.name || '?').slice(0, 2).toUpperCase()}
    </span>
  )
}

/** Pick someone to message. */
function NewMessageModal({ onClose, onPick }) {
  const [people, setPeople] = useState(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/messages/users').then((r) => setPeople(r.items)).catch((err) => setError(err.message))
  }, [])

  const term = search.trim().toLowerCase()
  const shown = (people || []).filter((p) => !term || p.name.toLowerCase().includes(term) || (ROLE_NAMES[p.role] || '').toLowerCase().includes(term))

  return (
    <Modal open title="New message" onClose={onClose}>
      <Banner onDismiss={() => setError('')}>{error}</Banner>
      <SearchInput value={search} onChange={setSearch} placeholder="Search people..." />
      <ul className="mt-3 max-h-80 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-100">
        {people === null && <li className="px-3 py-6 text-center text-sm text-slate-400">Loading...</li>}
        {people && shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-400">No one found.</li>}
        {shown.map((p) => (
          <li key={p.id}>
            <button type="button" className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50" onClick={() => onPick(p)}>
              <Avatar person={p} />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-800 truncate">{p.name}</span>
                <span className="block text-xs text-slate-400">{ROLE_NAMES[p.role] || p.role}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

/** The open conversation: messages, polling for new ones, and the reply box. */
function Thread({ conversationId }) {
  const [data, setData] = useState(null) // { with, theirReadAt, messages }
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [editing, setEditing] = useState(null) // { id, body }
  const [busyId, setBusyId] = useState(null)
  const [deleting, setDeleting] = useState(null) // the message being deleted (asks how)
  const [clearing, setClearing] = useState(false) // asking to delete the whole chat
  const navigate = useNavigate()
  const scrollRef = useRef(null)
  const stickToBottom = useRef(true)
  const latest = useRef(null)

  // Load the conversation once, then follow it through pushed events.
  useEffect(() => {
    let cancelled = false
    setData(null)
    setError('')
    latest.current = null
    stickToBottom.current = true

    // First load, or catching up with anything missed while the stream was down.
    const load = async () => {
      try {
        const after = latest.current ? '?after=' + encodeURIComponent(latest.current) : ''
        const result = await api.get('/messages/conversations/' + conversationId + after)
        if (cancelled) return
        setData((prev) => {
          const known = new Set((prev?.messages || []).map((m) => m.id))
          const messages = [...(prev?.messages || []), ...result.messages.filter((m) => !known.has(m.id))]
          return { ...result, messages }
        })
        const newest = result.messages[result.messages.length - 1]
        // (Reading marks it read on the server, which pushes the new unread count to the badge.)
        if (newest) latest.current = newest.createdAt
      } catch (err) { if (!cancelled) setError(err.message) }
    }
    const onEvent = (e) => {
      const event = e.detail
      if (event.conversationId !== String(conversationId)) return
      if (event.type === 'read') {
        setData((prev) => (prev ? { ...prev, theirReadAt: event.at } : prev))
      } else if (event.type === 'message') {
        setData((prev) => (prev && !prev.messages.some((m) => m.id === event.message.id)
          ? { ...prev, messages: [...prev.messages, event.message] }
          : prev))
        latest.current = event.message.createdAt
        // It's on screen, so it's read: tell the server (and so the sender's "Seen").
        if (!event.message.mine) api.post('/messages/conversations/' + conversationId + '/read').catch(() => {})
      } else if (event.type === 'message-updated') {
        setData((prev) => (prev ? { ...prev, messages: replaceMessage(prev.messages, event.message) } : prev))
      } else if (event.type === 'hidden') {
        setData((prev) => (prev ? { ...prev, messages: prev.messages.filter((m) => m.id !== event.messageId) } : prev))
      } else if (event.type === 'cleared') {
        navigate('/messages')
      }
    }

    load()
    window.addEventListener('wp:message-event', onEvent)
    window.addEventListener('wp:stream-open', load)
    return () => {
      cancelled = true
      window.removeEventListener('wp:message-event', onEvent)
      window.removeEventListener('wp:stream-open', load)
    }
  }, [conversationId, navigate])

  // Keep the view at the newest message, unless the user has scrolled up to read.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [data?.messages.length])
  const onScroll = () => {
    const el = scrollRef.current
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  const send = async () => {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setError('')
    try {
      const message = await api.post('/messages/conversations/' + conversationId, { body })
      stickToBottom.current = true
      setData((prev) => (prev && !prev.messages.some((m) => m.id === message.id) ? { ...prev, messages: [...prev.messages, message] } : prev))
      latest.current = message.createdAt
      setDraft('')
    } catch (err) { setError(err.message) } finally { setSending(false) }
  }

  const messageUrl = (id) => '/messages/conversations/' + conversationId + '/messages/' + id
  const applyChange = (message) => setData((prev) => (prev ? { ...prev, messages: replaceMessage(prev.messages, message) } : prev))

  const saveEdit = async () => {
    const body = editing.body.trim()
    if (!body) return
    setBusyId(editing.id)
    setError('')
    try {
      applyChange(await api.put(messageUrl(editing.id), { body }))
      setEditing(null)
    } catch (err) { setError(err.message) } finally { setBusyId(null) }
  }

  // forEveryone: the sender deletes it for both people. Otherwise it goes from your view only.
  const remove = async (m, forEveryone) => {
    setDeleting(null)
    setBusyId(m.id)
    setError('')
    try {
      if (forEveryone) {
        applyChange(await api.del(messageUrl(m.id)))
      } else {
        await api.post(messageUrl(m.id) + '/hide')
        setData((prev) => (prev ? { ...prev, messages: prev.messages.filter((x) => x.id !== m.id) } : prev))
      }
      if (editing?.id === m.id) setEditing(null)
    } catch (err) { setError(err.message) } finally { setBusyId(null) }
  }

  const clearChat = async () => {
    setClearing(false)
    setError('')
    try {
      await api.post('/messages/conversations/' + conversationId + '/clear')
      navigate('/messages')
    } catch (err) { setError(err.message) }
  }

  const onEditKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit() }
    if (e.key === 'Escape') setEditing(null)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  if (error && !data) return <div className="p-6"><Banner>{error}</Banner></div>
  if (!data) return <div className="flex-1 grid place-items-center text-sm text-slate-400">Loading...</div>

  const firstName = data.with?.name?.split(' ')[0] || 'They'
  const lastMine = [...data.messages].reverse().find((m) => m.mine)
  const seen = lastMine && data.theirReadAt && new Date(data.theirReadAt) >= new Date(lastMine.createdAt)

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
        <Link to="/messages" className="md:hidden text-slate-400 hover:text-slate-700 text-lg" title="Back">&larr;</Link>
        <Avatar person={data.with} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{data.with?.name || 'Former user'}</p>
          <p className="text-xs text-slate-400">{data.with?.active === false ? 'No longer active' : ROLE_NAMES[data.with?.role] || ''}</p>
        </div>
        {data.messages.length > 0 && (
          <button type="button" className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-slate-500 hover:bg-red-50 hover:text-red-600"
            title="Delete this chat for you" onClick={() => setClearing(true)}>
            <TrashIcon /> Delete chat
          </button>
        )}
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-4 py-4 space-y-1.5 bg-[#f8fafd]">
        {data.messages.length === 0 && (
          <p className="text-center text-sm text-slate-400 py-10">No messages yet. Say hello to {data.with?.name?.split(' ')[0] || 'them'}.</p>
        )}
        {data.messages.map((m, i) => {
          const prev = data.messages[i - 1]
          const newDay = !prev || dayOf(prev.createdAt) !== dayOf(m.createdAt)
          return (
            <div key={m.id}>
              {newDay && <p className="text-center text-[11px] font-medium text-slate-400 py-2">{dayOf(m.createdAt)}</p>}
              <div className={'group flex items-center gap-1.5 ' + (m.mine ? 'justify-end' : 'justify-start')}>
                {/* Your own messages can be edited or deleted. */}
                {m.mine && editing?.id !== m.id && (
                  <MessageActions m={m} busy={busyId === m.id} onEdit={() => setEditing({ id: m.id, body: m.body })} onDelete={() => setDeleting(m)} />
                )}
                {editing?.id === m.id ? (
                  <div className="w-full max-w-[75%] rounded-2xl bg-white p-2 ring-2 ring-brand-300 shadow-sm">
                    <textarea
                      className="input min-h-[42px] max-h-40 resize-none text-sm"
                      rows={Math.min(6, Math.max(1, editing.body.split('\n').length))}
                      value={editing.body}
                      maxLength={MAX_LENGTH}
                      onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                      onKeyDown={onEditKeyDown}
                      autoFocus
                    />
                    <div className="mt-1.5 flex items-center justify-end gap-2">
                      <span className="mr-auto text-[11px] text-slate-400">Enter to save, Esc to cancel</span>
                      <button type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={() => setEditing(null)}>Cancel</button>
                      <button type="button" className="btn-primary px-2.5 py-1 text-xs" disabled={!editing.body.trim() || busyId === m.id} onClick={saveEdit}>
                        {busyId === m.id ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : m.deleted ? (
                  <div className="max-w-[75%] rounded-2xl px-3.5 py-2 text-sm italic text-slate-400 ring-1 ring-slate-200 bg-transparent">
                    This message was deleted
                    <span className="ml-2 not-italic text-[10px]">{timeOf(m.createdAt)}</span>
                  </div>
                ) : (
                  <div className={'max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ' +
                    (m.mine ? 'bg-brand-500 text-white rounded-br-md' : 'bg-white text-slate-800 ring-1 ring-slate-100 rounded-bl-md')}>
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className={'mt-0.5 text-[10px] text-right ' + (m.mine ? 'text-white/70' : 'text-slate-400')}>
                      {m.editedAt && <span title={'Edited ' + new Date(m.editedAt).toLocaleString('en-GB')}>edited · </span>}
                      {timeOf(m.createdAt)}
                    </p>
                  </div>
                )}
                {!m.mine && <MessageActions m={m} busy={busyId === m.id} onDelete={() => setDeleting(m)} />}
              </div>
            </div>
          )
        })}
        {seen && <p className="text-right text-[11px] text-slate-400 pr-1">Seen</p>}
      </div>

      <div className="border-t border-slate-100 p-3">
        <Banner onDismiss={() => setError('')}>{error && data ? error : ''}</Banner>
        {data.with?.active === false ? (
          <p className="text-center text-sm text-slate-400 py-2">This person's account is no longer active.</p>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              className="input min-h-[42px] max-h-40 resize-none"
              rows={Math.min(6, Math.max(1, draft.split('\n').length))}
              placeholder="Write a message..."
              title="Enter to send, Shift+Enter for a new line"
              value={draft}
              maxLength={MAX_LENGTH}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              autoFocus
            />
            <button type="button" className="btn-primary h-[42px]" disabled={!draft.trim() || sending} onClick={send}>
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
        )}
      </div>

      {deleting && (
        <Modal open title="Delete message?" onClose={() => setDeleting(null)}>
          <p className="text-sm text-slate-600">
            {deleting.mine && !deleting.deleted
              ? 'Delete it for everyone, or only remove it from your view.'
              : 'It will be removed from your view. ' + firstName + ' will still see it.'}
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setDeleting(null)}>Cancel</button>
            <button type="button" className="btn-secondary text-red-600" onClick={() => remove(deleting, false)}>Delete for me</button>
            {deleting.mine && !deleting.deleted && (
              <button type="button" className="btn-primary bg-red-600 hover:bg-red-700" onClick={() => remove(deleting, true)}>Delete for everyone</button>
            )}
          </div>
        </Modal>
      )}

      {clearing && (
        <Modal open title="Delete chat?" onClose={() => setClearing(false)}>
          <p className="text-sm text-slate-600">
            All messages in this chat will be removed from your view. {firstName} will still have their copy,
            and the chat comes back if either of you sends a new message.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setClearing(false)}>Cancel</button>
            <button type="button" className="btn-primary bg-red-600 hover:bg-red-700" onClick={clearChat}>Delete chat</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

/**
 * Offers desktop notifications (for when the app is in a background tab).
 * Browsers only let a click ask for this, so it's a button, not automatic.
 */
function DesktopAlertsPrompt() {
  const [permission, setPermission] = useState(() => (desktopAlertsSupported() ? Notification.permission : 'unsupported'))
  if (permission === 'unsupported' || permission === 'granted') return null
  if (permission === 'denied') {
    return <p className="mx-4 mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">Desktop alerts are blocked in your browser settings. You'll still get pop-ups in the app.</p>
  }
  return (
    <div className="mx-4 mb-3 flex items-center justify-between gap-2 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
      <span>Get alerts even when this tab is in the background.</span>
      <button
        type="button"
        className="shrink-0 font-semibold text-brand-600 hover:underline"
        onClick={async () => setPermission(await Notification.requestPermission())}
      >
        Turn on
      </button>
    </div>
  )
}

// Messages between users: conversation list on the left, the open chat on the right.
export default function Messages() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [conversations, setConversations] = useState(null)
  const [error, setError] = useState('')
  const [picking, setPicking] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = () => api.get('/messages/conversations')
      .then((r) => { if (!cancelled) setConversations(r.items) })
      .catch((err) => { if (!cancelled) setError(err.message) })
    load()
    // Refresh only when something happened: a message sent or received, a chat read, or a reconnect.
    const events = ['wp:messages-changed', 'wp:message-event', 'wp:stream-open']
    events.forEach((name) => window.addEventListener(name, load))
    return () => { cancelled = true; events.forEach((name) => window.removeEventListener(name, load)) }
  }, [])

  const start = async (person) => {
    setPicking(false)
    try {
      const conversation = await api.post('/messages/conversations', { userId: person.id })
      navigate('/messages/' + conversation.id)
    } catch (err) { setError(err.message) }
  }

  const term = search.trim().toLowerCase()
  const shown = (conversations || []).filter((c) => !term || (c.with?.name || '').toLowerCase().includes(term))

  return (
    <div className="card overflow-hidden flex h-[calc(100vh-9rem)] lg:h-[calc(100vh-11rem)] min-h-[420px]">
      {/* Conversation list */}
      <aside className={'w-full md:w-80 shrink-0 border-r border-slate-100 flex-col ' + (id ? 'hidden md:flex' : 'flex')}>
        <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
          <h1 className="text-base font-semibold text-slate-900">Messages</h1>
          <button className="btn-primary px-3 py-1.5 text-sm" onClick={() => setPicking(true)}>+ New</button>
        </div>
        <div className="px-4 pb-3"><SearchInput value={search} onChange={setSearch} placeholder="Search conversations..." /></div>
        <DesktopAlertsPrompt />
        <Banner onDismiss={() => setError('')}>{error}</Banner>
        <ul className="flex-1 overflow-y-auto">
          {conversations === null && <li className="px-4 py-8 text-center text-sm text-slate-400">Loading...</li>}
          {conversations?.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-slate-400">
              No conversations yet.<br />
              <button className="mt-2 text-brand-600 hover:underline" onClick={() => setPicking(true)}>Start one</button>
            </li>
          )}
          {shown.map((c) => (
            <li key={c.id}>
              <Link
                to={'/messages/' + c.id}
                className={'flex items-center gap-3 px-4 py-3 border-l-2 hover:bg-slate-50 ' + (String(c.id) === id ? 'border-brand-500 bg-brand-50/50' : 'border-transparent')}
              >
                <Avatar person={c.with} />
                <span className="flex-1 min-w-0">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={'text-sm truncate ' + (c.unread ? 'font-semibold text-slate-900' : 'font-medium text-slate-800')}>{c.with?.name || 'Former user'}</span>
                    <span className="text-[11px] text-slate-400 whitespace-nowrap">{timeAgo(c.lastMessageAt)}</span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className={'text-xs truncate ' + (c.unread ? 'text-slate-700' : 'text-slate-400')}>{c.lastFromMe ? 'You: ' : ''}{c.lastMessage}</span>
                    {c.unread > 0 && <span className="min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-brand-500 text-white text-[10px] font-semibold">{c.unread}</span>}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </aside>

      {/* Open conversation */}
      <section className={'flex-1 min-w-0 flex-col ' + (id ? 'flex' : 'hidden md:flex')}>
        {id ? <Thread key={id} conversationId={id} /> : (
          <div className="flex-1 grid place-items-center p-6 text-center">
            <div>
              <p className="text-sm font-medium text-slate-700">Select a conversation</p>
              <p className="text-xs text-slate-400 mt-1">or start a new one with a colleague</p>
              <button className="btn-secondary mt-4" onClick={() => setPicking(true)}>+ New message</button>
            </div>
          </div>
        )}
      </section>

      {picking && <NewMessageModal onClose={() => setPicking(false)} onPick={start} />}
    </div>
  )
}
