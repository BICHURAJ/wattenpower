import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { connectMessageStream } from '../messageStream'

const TOAST_MS = 8000
const MAX_TOASTS = 3

/** Whether desktop notifications can be used at all in this browser. */
export const desktopAlertsSupported = () => typeof window !== 'undefined' && 'Notification' in window

/**
 * New-message alerts, driven by the server's push stream (no polling).
 * Returns the total unread count, plus a pop-up for each new message (and a
 * desktop notification when the app is in the background and the user allowed
 * them). The chat already open on screen doesn't pop up.
 */
export function useMessageAlerts(pathname) {
  const navigate = useNavigate()
  const [unread, setUnread] = useState(0)
  const [toasts, setToasts] = useState([])
  const pathRef = useRef(pathname)
  pathRef.current = pathname

  const dismiss = (id) => setToasts((list) => list.filter((t) => t.id !== id))

  useEffect(() => {
    let cancelled = false
    // The unread total is only fetched when something changed, not on a timer.
    const refreshUnread = () => api.get('/messages/unread')
      .then((r) => { if (!cancelled) setUnread(r.unread) })
      .catch(() => {})

    const onEvent = (e) => {
      const event = e.detail
      if (event.type === 'read-self') { refreshUnread(); return }
      if (event.type !== 'message' || event.message.mine) return
      // Reading that chat right now: it marks itself read, nothing to announce.
      if (pathRef.current === '/messages/' + event.conversationId) return

      setUnread((n) => n + 1)
      setToasts((list) => {
        const earlier = list.find((t) => t.conversationId === event.conversationId)
        const toast = {
          id: event.message.id,
          conversationId: event.conversationId,
          name: event.from?.name || 'Someone',
          initials: event.from?.initials,
          text: event.message.body,
          count: (earlier?.count || 0) + 1,
        }
        return [toast, ...list.filter((t) => t.conversationId !== event.conversationId)].slice(0, MAX_TOASTS)
      })

      if (document.hidden && desktopAlertsSupported() && Notification.permission === 'granted') {
        try {
          const note = new Notification('Message from ' + (event.from?.name || 'a colleague'), { body: event.message.body, tag: 'wp-msg-' + event.conversationId })
          note.onclick = () => { window.focus(); navigate('/messages/' + event.conversationId); note.close() }
        } catch { /* some browsers only allow notifications from a service worker */ }
      }
    }

    refreshUnread()
    const release = connectMessageStream()
    window.addEventListener('wp:message-event', onEvent)
    window.addEventListener('wp:stream-open', refreshUnread) // catch up after a reconnect
    window.addEventListener('wp:messages-changed', refreshUnread)
    return () => {
      cancelled = true
      release()
      window.removeEventListener('wp:message-event', onEvent)
      window.removeEventListener('wp:stream-open', refreshUnread)
      window.removeEventListener('wp:messages-changed', refreshUnread)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reading a chat hides its pop-up.
  useEffect(() => {
    setToasts((list) => list.filter((t) => pathname !== '/messages/' + t.conversationId))
  }, [pathname])

  return { unread, toasts, dismiss }
}

function Toast({ toast, onOpen, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, TOAST_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.id])

  return (
    <div
      role="status"
      className="pointer-events-auto w-80 max-w-[calc(100vw-2rem)] flex items-start gap-3 rounded-2xl bg-white p-3 shadow-[0_16px_40px_-10px_rgba(15,35,75,0.45)] ring-1 ring-slate-900/5 animate-[wp-toast-in_.2s_ease-out]"
    >
      <button type="button" className="flex flex-1 min-w-0 items-start gap-3 text-left" onClick={onOpen}>
        <span className="grid place-items-center w-9 h-9 shrink-0 rounded-full bg-brand-100 text-brand-700 text-xs font-semibold">
          {toast.initials || toast.name.slice(0, 2).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-slate-900 truncate">
            {toast.name}{toast.count > 1 && <span className="ml-1.5 text-xs font-normal text-slate-400">{toast.count} new</span>}
          </span>
          <span className="block text-sm text-slate-600 line-clamp-2 break-words">{toast.text}</span>
          <span className="block mt-1 text-xs font-medium text-brand-600">Reply</span>
        </span>
      </button>
      <button type="button" className="text-slate-300 hover:text-slate-600 text-lg leading-none" title="Dismiss" onClick={onClose}>&times;</button>
    </div>
  )
}

/** New-message pop-ups, stacked in the bottom-right corner. */
export function MessageToasts({ toasts, onDismiss }) {
  const navigate = useNavigate()
  if (!toasts.length) return null
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[1000] flex flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <Toast
          key={t.id}
          toast={t}
          onOpen={() => { onDismiss(t.id); navigate('/messages/' + t.conversationId) }}
          onClose={() => onDismiss(t.id)}
        />
      ))}
    </div>
  )
}
