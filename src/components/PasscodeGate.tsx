import { useState } from 'react'
import { Button } from './Button'
import { GateFrame } from './ProfileGate'
import { unlock } from '../data/session'

/**
 * Full-screen household passcode, shown once per device before "Who's
 * watching?" (Figma: "Proposal — Household passcode"). Unlocking stores a
 * session token (see data/session.ts); until then the app shows nothing else.
 */
export function PasscodeGate({ onUnlocked }: { onUnlocked: () => void }) {
  const [passcode, setPasscode] = useState('')
  const [status, setStatus] = useState<'idle' | 'checking' | 'wrong' | 'error'>('idle')

  const submit = async () => {
    if (!passcode.trim() || status === 'checking') return
    setStatus('checking')
    const result = await unlock(passcode)
    if (result === 'unlocked') onUnlocked()
    else setStatus(result)
  }

  const message = status === 'wrong' ? "That passcode didn't work. Try again."
    : status === 'error' ? "Can't reach the Movie Night server. Try again." : null

  return (
    <GateFrame>
      <div className="profile-gate-header">
        <p className="profile-gate-question">Enter the passcode</p>
        <p className="profile-gate-subtitle passcode-subtitle">
          Ask whoever set up Movie Night. You only need to do this once on this phone.
        </p>
      </div>

      <div className="passcode-form">
        <input
          className="passcode-field"
          type="password"
          inputMode="text"
          autoComplete="current-password"
          placeholder="Passcode"
          aria-label="Passcode"
          aria-invalid={status === 'wrong'}
          value={passcode}
          onChange={(e) => { setPasscode(e.target.value); if (status !== 'checking') setStatus('idle') }}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
          autoFocus
        />
        {message && <div className="error" role="alert"><p>{message}</p></div>}
      </div>

      <Button
        className="profile-gate-continue"
        disabled={!passcode.trim() || status === 'checking'}
        onClick={() => void submit()}
      >
        Unlock
      </Button>
    </GateFrame>
  )
}
