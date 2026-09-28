import { getToken } from './api'

// One push connection to the server for the whole app (Server-Sent Events,
// read with fetch so the login token goes in a header, not the URL).
// Every event is re-broadcast as a window event, so any page can listen:
//
//   window.addEventListener('wp:message-event', (e) => e.detail)  // { type, conversationId, ... }
//   window.addEventListener('wp:stream-open', ...)                // (re)connected: catch up once
//
// Nothing is polled: the connection stays quiet until something happens.

const RETRY_MIN_MS = 2000
const RETRY_MAX_MS = 60000

let controller = null
let users = 0 // components using the stream; it closes when the last one goes

function emit(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

async function run(signal) {
  let delay = RETRY_MIN_MS
  while (!signal.aborted) {
    const token = getToken()
    if (!token) return // signed out
    try {
      const res = await fetch('/api/messages/stream', { headers: { Authorization: 'Bearer ' + token }, signal })
      if (res.status === 401 || res.status === 403) return // session over: don't retry
      if (!res.ok || !res.body) throw new Error('stream ' + res.status)
      delay = RETRY_MIN_MS
      emit('wp:stream-open')

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
      let buffer = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += value
        let end
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          const data = frame.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n')
          if (!data) continue // heartbeat or comment
          try { emit('wp:message-event', JSON.parse(data)) } catch { /* ignore a malformed frame */ }
        }
      }
    } catch (err) {
      if (signal.aborted) return
    }
    // Dropped (e.g. server restarted): wait, then reconnect, backing off up to a minute.
    await new Promise((resolve) => setTimeout(resolve, delay))
    delay = Math.min(delay * 2, RETRY_MAX_MS)
  }
}

/** Starts the shared stream (if not already running). Returns a function to release it. */
export function connectMessageStream() {
  users++
  if (!controller) {
    controller = new AbortController()
    run(controller.signal)
  }
  return () => {
    users--
    if (users <= 0 && controller) {
      controller.abort()
      controller = null
      users = 0
    }
  }
}
