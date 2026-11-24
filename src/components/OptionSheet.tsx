import { SectionHeading } from './SectionHeading'
import { SheetOption } from './SheetOption'
import { useDialogFocus } from '../hooks/useDialogFocus'

/**
 * A bottom sheet with one single-select list — the Settings sheet's shell
 * (scrim, title, Done) around SheetOption rows. Picking a row applies it
 * and closes; Done, the scrim or Escape closes without change. Focus is
 * held inside while open (useDialogFocus).
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
  const dialogRef = useDialogFocus<HTMLDivElement>(onClose)
  return (
    <>
      <button className="scrim" aria-label={`Close ${title}`} tabIndex={-1} onClick={onClose} />
      <div className="sheet" role="dialog" tabIndex={-1} ref={dialogRef} aria-modal="true" aria-label={title}>
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
