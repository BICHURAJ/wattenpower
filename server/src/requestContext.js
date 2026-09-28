import { AsyncLocalStorage } from 'node:async_hooks'

// Remembers who is making the current request, so code deep inside it (e.g.
// the Activity model logging "who did this") can find out without every
// caller passing the user along.
const storage = new AsyncLocalStorage()

/** Runs `fn` (and everything it awaits) with `user` as the current user. */
export const runWithUser = (user, fn) => storage.run({ user }, fn)

/** The signed-in user for the current request, if any. */
export const currentUser = () => storage.getStore()?.user
