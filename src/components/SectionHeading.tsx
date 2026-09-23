import type { ReactNode } from 'react'

/** Muted, uppercase section label (e.g. "Cast", "Streaming now"). Bare <h2> in the CSS. */
export function SectionHeading({ children }: { children: ReactNode }) {
  return <h2>{children}</h2>
}
