/**
 * The key to the two score emoji, shown once under each scored list's
 * heading so cards can stay emoji-only. aria-hidden: every score already
 * carries its own screen-reader label ("critic score" / "audience score").
 * .score-legend
 */
export function ScoreLegend() {
  return (
    <p className="score-legend" aria-hidden="true" data-testid="score-legend">
      🍅 Critics  ·  ⭐ Audience
    </p>
  )
}
