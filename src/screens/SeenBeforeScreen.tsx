import { useState } from 'react'
import { getSeenBefore } from '../data/history'
import type { WatchEntry } from '../types'

/** Years with more films than this start collapsed. */
export const COLLAPSE_OVER = 5

type Group = { year: number | null; entries: WatchEntry[] }

/** Newest release year first; films with no year last. Titles A–Z within a year. */
export function groupByYear(entries: WatchEntry[]): Group[] {
  const byYear = new Map<number | null, WatchEntry[]>()
  for (const e of entries) byYear.set(e.movie.year ?? null, [...(byYear.get(e.movie.year ?? null) ?? []), e])
  return [...byYear.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : b - a))
    .map(([year, list]) => ({ year, entries: list.sort((x, y) => x.movie.title.localeCompare(y.movie.title)) }))
}

/**
 * Films marked as watched from Rewind, with no date, grouped by release
 * year (Figma: "History — Seen before list"). Each film's ⋯ menu can unmark
 * it or add a date, which turns it into a movie night on History.
 */
export function SeenBeforeScreen({ version, onUnmark, onAddDate }: {
  /** Bumped by the parent after a history write, to re-read history. */
  version?: number
  onUnmark: (entry: WatchEntry) => void
  /** `date` is yyyy-mm-dd from the date picker. */
  onAddDate: (entry: WatchEntry, date: string) => void
}) {
  void version
  const entries = getSeenBefore()
  const [expanded, setExpanded] = useState<Set<number | null>>(new Set())
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const [datingFor, setDatingFor] = useState<number | null>(null)
  const [date, setDate] = useState('')
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="screen">
      <h1 className="rewind-title">Seen before</h1>
      <p className="empty rewind-sub">
        {entries.length === 0
          ? 'Nothing here yet. Films you mark as watched in Rewind collect here.'
          : `${entries.length} ${entries.length === 1 ? 'film' : 'films'} · grouped by release year`}
      </p>
      {groupByYear(entries).map(({ year, entries: films }) => {
        const label = year === null ? 'Year unknown' : String(year)
        const collapsed = films.length > COLLAPSE_OVER && !expanded.has(year)
        return (
          <section className="seen-year" key={label} aria-label={label}>
            <button
              className="seen-year-head"
              aria-expanded={!collapsed}
              onClick={() => setExpanded((s) => { const n = new Set(s); if (collapsed) n.add(year); else n.delete(year); return n })}
            >
              <span className="seen-year-label">{label}</span>
              <span className={collapsed ? 'seen-year-count more' : 'seen-year-count'}>
                {films.length} {films.length === 1 ? 'film' : 'films'} {collapsed ? '›' : '▾'}
              </span>
            </button>
            {!collapsed && films.map((e) => {
              const id = e.movie.tmdbId
              return (
                <div className="seen-film" key={id}>
                  <span className="seen-film-title">{e.movie.title}</span>
                  {datingFor === id ? (
                    <form
                      className="seen-date"
                      onSubmit={(ev) => { ev.preventDefault(); if (date) { onAddDate(e, date); setDatingFor(null) } }}
                    >
                      <input type="date" aria-label={`Date you watched ${e.movie.title}`} max={today} value={date} onChange={(ev) => setDate(ev.target.value)} required />
                      <button className="link" type="submit">Save</button>
                      <button className="link" type="button" onClick={() => setDatingFor(null)}>Cancel</button>
                    </form>
                  ) : (
                    <span className="seen-film-menu">
                      <button
                        className="icon-btn-bare seen-more"
                        aria-label={`Menu for ${e.movie.title}`}
                        aria-expanded={menuFor === id}
                        onClick={() => setMenuFor(menuFor === id ? null : id)}
                      >⋯</button>
                      {menuFor === id && (
                        <div className="history-menu" role="menu">
                          <button role="menuitem" onClick={() => { setMenuFor(null); onUnmark(e) }}>Unmark</button>
                          <button role="menuitem" onClick={() => { setMenuFor(null); setDate(''); setDatingFor(id) }}>Add a date</button>
                        </div>
                      )}
                    </span>
                  )}
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}
