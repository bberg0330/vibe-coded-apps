# Watchlist Alerts — Design

**Date:** 2026-11-24
**Status:** Approved, design in Figma (03 Screens → section 08)

## Problem

We add films to the shared watchlist that aren't streaming or rentable yet,
then never notice when they become watchable.

## Goal

Tell the household when a watchlist film becomes watchable, inside the app.

## Triggers

- A watchlist film becomes watchable: it arrives on one of the household's
  streaming services (`SERVICES`) **or** becomes rentable (`RENT_SERVICES`).
- An alert fires on the change from **not watchable → watchable**, whatever the
  service. A film already on Netflix arriving on Max doesn't alert. A film that
  leaves everything and later comes back alerts again.
- Films leaving a service don't alert (TMDB has no leaving dates).

## Baseline

- When a film is added to the watchlist, record whether it's watchable. Only
  films that were **not** watchable when added can alert.
- At launch, the first nightly run records the current state of every film
  already on the watchlist as its baseline, with no alerts for that run.

## Check

- Runs **nightly** on the existing Vercel schedule, alongside the ratings sync.
- One run produces **one grouped alert** ("3 watchlist films are now
  watchable"), listing each film and where it's available.

## Who sees alerts

- Alerts belong to the **household**, like the watchlist.
- **Seen/cleared per profile:** each profile clears alerts for itself, one at
  a time or with **Clear all**.
- An alert also disappears after **30 days**, or once the film is watched or
  removed from the watchlist.

## Actions on an alert

- **Open** the film.
- **Watch tonight**, reusing the existing tonight/watching state
  (`src/data/watching.ts`, `TonightRow`).
- **Dismiss** without opening.

## Delivery

- **In-app only** for now. The existing `Toast` (#39) is a transient undo
  message, so alerts need their own place that persists.
- **Web push** is a later step (needs a service worker, permission prompts,
  and Home Screen install on iPhone).

## Where alerts appear

Decided in the header/navigation critique and approved in Figma (option B1):

- A **bell** in the top bar, with a dot while the active profile has unseen
  alerts. The bar is now 🔔 ⚙ and a profile avatar (see the Rewind spec's
  *Navigation* section).
- The bell opens a **"Now watchable" panel**: one `AlertRow` per film (poster,
  title, Stream/Rent pill, **Watch tonight**, **Dismiss**) and **Clear all**.
- Figma: `AlertRow` on 02 Components (section 09); "Alerts — bell panel open"
  on 03 Screens (section 08).

## Related

- `docs/superpowers/specs/2026-11-24-rewind-design.md` — Rewind's "Add to
  watchlist" feeds this.
