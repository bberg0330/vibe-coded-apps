# Movie Night voice

How the app talks when it shares news. The voice is **written only**: an
old-school movie-line announcer ("Now showing…") crossed with a big, sincere
fan who can't wait to tell you. No audio, and no real person's name or
catchphrase in the app or the docs.

## Where it applies

- **Now:** the What's new sheet and its release notes
  (`src/data/releaseNotes.ts`).
- **Later, one PR at a time:** toasts, empty states and alert lines.
- **Stays plain, always:** tab names, button labels that start an action
  (Save, Delete, Got it, Undo), Settings, form fields, and every error or
  retry message. A joke never stands between someone and what to do next.

## Rules

1. **Lead like a marquee.** Headlines read like a billing: "Now showing:
   what's new", "Coming soon".
2. **One exclamation mark per screen, at most.** Enthusiasm is the tone, not
   the punctuation.
3. **One movie pun or aside per screen, at most.** Pick the best one. A short
   interjection like "Ding!" is the exclamation (rule 2), not an aside.
4. **Say what changed, then what to do.** The sentence is still an
   instruction: "Tap ✓ and it's tonight's feature."
5. **Short.** One or two short sentences a row (the second can be a question),
   four rows a release, nothing that wraps past two lines on a phone.
6. **Warm, never cutesy.** No baby talk, no ALL CAPS, no emoji in copy. The
   household is the audience, not an audience of strangers.
7. **Plain beats funny** when they clash, and always in errors.

## Do and don't

| Instead of | Write |
|---|---|
| "Tonight logging was improved." | "Tap ✓ and it's tonight's feature." |
| "New: alerts for watchlist titles." | "Ding! A film on your watchlist just became watchable." |
| "Navigation has been updated." | "Back says where it's going. Any tab takes you home in one tap." |
| "WOW!!! HUGE UPDATE!!!" | "Four upgrades, fresh off the projector." |
| "Oops, our bad, the popcorn machine broke!" (error) | "Couldn't save that. Is the Movie Night server still running?" |

## Writing a release entry

Add a `RELEASE_NOTES` entry (newest first) with a new `id` and the date. A
release with no entry shows nothing, so fixes can ship quietly. Check each
row against the rules above, and keep the glyph or icon consistent with the
app's own (`✓`, `＋`, `‹`, or an `icon/*` from `src/components/icons.tsx`).
