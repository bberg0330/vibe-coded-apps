import type { IconName } from '../components/icons'

/** One line in the What's new sheet: a glyph or icon, a title and one sentence. */
export interface ReleaseRow {
  /** One of the app's line icons; use `glyph` for a single character like ✓. */
  icon?: IconName
  glyph?: string
  title: string
  body: string
}

/** One release's notes. Written by hand, in the Movie Night voice (docs/VOICE.md), at most four rows. */
export interface ReleaseNote {
  /** Identifies the release; the "seen" marker stores this. */
  id: string
  /** ISO date (yyyy-mm-dd) the release went out. */
  date: string
  title: string
  subtitle: string
  rows: ReleaseRow[]
}

/**
 * Newest first. Adding an entry here is what makes the sheet appear once for
 * everyone; ship a fix with no entry and nobody is nagged.
 */
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    id: '2026-11-25',
    date: '2026-11-25',
    title: 'Now showing: what’s new',
    subtitle: 'Four upgrades, fresh off the projector',
    rows: [
      { glyph: '✓', title: 'One-tap Tonight', body: 'Tap ✓ and it’s tonight’s feature. Changed your mind? Move it to Seen before.' },
      { glyph: '＋', title: 'Log a film', body: 'Seen something that’s on no list? Add it from History.' },
      { icon: 'bell', title: 'Alerts', body: 'Ding! A film on your watchlist just became watchable.' },
      { glyph: '‹', title: 'Getting around', body: 'Back says where it’s going. Any tab takes you home in one tap.' },
    ],
  },
]

export function latestRelease(notes: ReleaseNote[] = RELEASE_NOTES): ReleaseNote | null {
  return notes[0] ?? null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-11-25" -> "25 Nov". Falls back to the input if it isn't an ISO date. */
export function formatReleaseDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ''}`.trim()
}

const seenKey = (profileId: string) => `mn.whatsNewSeen.${profileId}`

/** The release id this profile last saw on this device, or null. Never throws (private mode, blocked storage). */
export function getSeenRelease(profileId: string): string | null {
  try { return localStorage.getItem(seenKey(profileId)) } catch { return null }
}

/** Remembers the release as seen on this device for this profile. A storage failure just means it may show again. */
export function markReleaseSeen(profileId: string, releaseId: string): void {
  try { localStorage.setItem(seenKey(profileId), releaseId) } catch { /* shown again next time at worst */ }
}
