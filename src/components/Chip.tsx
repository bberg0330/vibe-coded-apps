/** Profile-switcher pill in the top bar. .chip / .chip[aria-pressed="true"] */
export function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className="chip" aria-pressed={active} onClick={onClick}>
      {label}
    </button>
  )
}
