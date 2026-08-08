import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { clearHttpCache } from './api/http'
import { getHistory } from './data/history'

beforeEach(() => {
  clearHttpCache()
  vi.stubEnv('VITE_TMDB_TOKEN', 'test-token')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, status: 200,
    json: async () => ({
      results: [{
        id: 1585, title: 'Rushmore', release_date: '1998-10-09',
        poster_path: null, popularity: 18,
      }],
    }),
  }))
})

// The watch button's label reflects real lifetime watchCount (via MovieCard's
// `watched` prop), not session state — so after a remount with existing
// history it already reads "Undo watched", even though tapping it must
// append (this session hasn't logged it) rather than delete.
async function tapWatchButton() {
  await userEvent.type(screen.getByRole('searchbox'), 'rushmore')
  const button = await screen.findByRole(
    'button',
    { name: /^(mark rushmore as watched|undo watched for rushmore)$/i },
  )
  await userEvent.click(button)
}

describe('App - toggleWatched session scoping', () => {
  it('undoes a same-session tap, removing the entry it just added', async () => {
    render(<App />)
    await tapWatchButton()
    expect(getHistory()).toHaveLength(1)

    await userEvent.click(await screen.findByRole('button', { name: /undo watched for rushmore/i }))
    expect(getHistory()).toHaveLength(0)
  })

  it(
    'appends rather than deletes when the film was logged in a PREVIOUS session ' +
    '(the exact data-loss bug: logging last year then tapping tonight must not erase last year\'s entry)',
    async () => {
      const { unmount } = render(<App />)
      await tapWatchButton()
      expect(getHistory()).toHaveLength(1)

      // Simulate a new session: unmount and remount, which resets the
      // in-session "logged this session" tracking but leaves localStorage
      // history intact — exactly what happens when the app is reopened later.
      unmount()
      render(<App />)

      await tapWatchButton()

      // The critical assertion: two entries, not zero. A previous-session
      // watch must never be silently undone by a later tap.
      expect(getHistory()).toHaveLength(2)
    },
  )
})
