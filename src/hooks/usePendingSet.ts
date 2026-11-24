import { useRef, useState } from 'react'

/**
 * Keys with a save in flight, so a second tap on the same film is dropped
 * until the first finishes. The ref makes the check synchronous (two taps in
 * one tick both see the first); the state copy re-renders the buttons as
 * disabled.
 */
export function usePendingSet<K>() {
  const ref = useRef<Set<K>>(new Set())
  const [pending, setPending] = useState<Set<K>>(new Set())
  const sync = () => setPending(new Set(ref.current))
  return {
    /** Snapshot for rendering. */
    pending,
    /** Claims `key`; false if a save for it is already in flight. */
    start(key: K): boolean {
      if (ref.current.has(key)) return false
      ref.current.add(key)
      sync()
      return true
    },
    finish(key: K): void {
      ref.current.delete(key)
      sync()
    },
  }
}
