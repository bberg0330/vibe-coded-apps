/**
 * One choice in a picker sheet (Sort by, Genre). Single-select: the selected
 * row's label turns --accent-text with a trailing ✓. 43px tall, like the
 * Settings toggle-row. .sheet-option
 */
export function SheetOption({
  label, selected, onSelect,
}: { label: string; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={selected ? 'sheet-option selected' : 'sheet-option'}
      onClick={onSelect}
    >
      <span>{label}</span>
      {selected && <span aria-hidden="true">✓</span>}
    </button>
  )
}
