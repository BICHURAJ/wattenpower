// Pushes message events to signed-in users over Server-Sent Events, so the
// web app doesn't have to keep asking the server for news.
//
// Connections live in this process's memory. That's fine for one server; if
// the API ever runs as several instances, events need sharing between them
// (e.g. Redis pub/sub) or a user connected to one instance won't hear another.

const clients = new Map() // user id -> Set of open responses

/** Registers an open stream for a user. Returns a function that removes it. */
export function subscribe(userId, res) {
  const key = String(userId)
  if (!clients.has(key)) clients.set(key, new Set())
  clients.get(key).add(res)
  return () => {
    const set = clients.get(key)
    if (!set) return
    set.delete(res)
    if (!set.size) clients.delete(key)
  }
}

/** Sends `event` ({ type, ... }) to every open stream of each of the given users. */
export function publish(userIds, event) {
  const frame = 'event: ' + event.type + '\ndata: ' + JSON.stringify(event) + '\n\n'
  for (const id of userIds) {
    for (const res of clients.get(String(id)) || []) {
      try { res.write(frame) } catch { /* closed; cleaned up by its own close handler */ }
    }
  }
}

/** How many streams are open, for tests and diagnostics. */
export const openStreams = () => [...clients.values()].reduce((n, set) => n + set.size, 0)
