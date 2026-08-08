import { useState } from 'react'
import { SearchScreen } from './screens/SearchScreen'
import type { Movie, CastMember } from './types'

export type Screen =
  | { kind: 'search' }
  | { kind: 'cast'; movie: Movie }
  | { kind: 'filmography'; actor: CastMember; fromMovie: Movie }
  | { kind: 'history' }

export default function App() {
  const [stack, setStack] = useState<Screen[]>([{ kind: 'search' }])
  const current = stack[stack.length - 1]

  const push = (screen: Screen) => setStack((s) => [...s, screen])
  const pop = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s))

  return (
    <div className="app">
      <nav className="topbar">
        {stack.length > 1
          ? <button className="link" onClick={pop}>← Back</button>
          : <span />}
        <button className="link" onClick={() => push({ kind: 'history' })}>History</button>
      </nav>

      {current.kind === 'search' && (
        <SearchScreen onOpenMovie={(movie) => push({ kind: 'cast', movie })} />
      )}
      {current.kind !== 'search' && <p className="empty">Coming in the next task.</p>}
    </div>
  )
}
