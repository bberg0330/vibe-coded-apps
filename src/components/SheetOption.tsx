import { useId } from 'react'

/**
 * One choice in a picker sheet (Sort by, Genre, Mark as watched).
 * Single-select: the selected row's label turns --accent-text with a
 * trailing ✓. 43px tall, like the Settings toggle-row; with a `description`
 * it gets a muted second line and grows to 63px. .sheet-option
 */
export function SheetOption({
  label, selected, onSelect, description,
}: { label: string; selected: boolean; onSelect: () => void; description?: string }) {
  const labelId = useId()
  const descriptionId = useId()
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={`sheet-option${selected ? ' selected' : ''}${description ? ' has-description' : ''}`}
      onClick={onSelect}
      // The accessible name stays the label; the description is read after it.
      aria-labelledby={description ? labelId : undefined}
      aria-describedby={description ? descriptionId : undefined}
    >
      {description ? (
        <span className="sheet-option-text">
          <span id={labelId}>{label}</span>
          <span id={descriptionId} className="sheet-option-description">{description}</span>
        </span>
      ) : (
        <span>{label}</span>
      )}
      {selected && <span aria-hidden="true">✓</span>}
    </button>
  )
}
