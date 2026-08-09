import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SettingsSheet } from './SettingsSheet'
import { resetStoreForTests, getStoreSnapshot } from '../data/store'
import { applyOp } from '../../vite-plugins/store-ops'
import type { StoreOp } from '../types'

/** A fake server: applies the op to the current snapshot and echoes it back. */
function stubStoreServer() {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
    const op = JSON.parse(String(init?.body)) as StoreOp
    const next = applyOp(getStoreSnapshot(), op)
    return { ok: true, status: 200, json: async () => next }
  }))
}

beforeEach(() => {
  resetStoreForTests()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SettingsSheet', () => {
  it('clears a previous error once a later toggle succeeds', async () => {
    let shouldFail = true
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (shouldFail) return { ok: false, status: 500, json: async () => ({ error: 'boom' }) }
      const op = JSON.parse(String(init?.body)) as StoreOp
      const next = applyOp(getStoreSnapshot(), op)
      return { ok: true, status: 200, json: async () => next }
    }))

    render(<SettingsSheet onClose={() => {}} />)

    fireEvent.click(screen.getByLabelText('Netflix'))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save that change.")
    })

    shouldFail = false
    fireEvent.click(screen.getByLabelText('Netflix'))

    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull()
    })
  })

  it('never shows an error when every toggle succeeds', async () => {
    stubStoreServer()
    render(<SettingsSheet onClose={() => {}} />)

    fireEvent.click(screen.getByLabelText('Netflix'))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })
})
