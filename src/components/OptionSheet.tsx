import { SectionHeading } from './SectionHeading'
import { SheetOption } from './SheetOption'

/**
 * A bottom sheet with one single-select list — the Settings sheet's shell
 * (scrim, title, Done) around SheetOption rows. Picking a row applies it
 * and closes; Done or the scrim closes without change.
 */
export function OptionSheet<T extends string>({
  title, options, selected, onSelect, onClose,
}: {
  title: string
  options: { value: T; label: string }[]
  selected: T
  onSelect: (value: T) => void
  onClose: () => void
}) {
  return (
    <>
      <button className="scrim" aria-label={`Close ${title}`} onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="topbar">
          <SectionHeading>{title}</SectionHeading>
          <button className="link" onClick={onClose}>Done</button>
        </div>
        <div role="radiogroup" aria-label={title}>
          {options.map((o) => (
            <SheetOption
              key={o.value}
              label={o.label}
              selected={o.value === selected}
              onSelect={() => { onSelect(o.value); onClose() }}
            />
          ))}
        </div>
      </div>
    </>
  )
}
