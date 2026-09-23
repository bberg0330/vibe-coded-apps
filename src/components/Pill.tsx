import type { ReactNode } from 'react'

/** Short nowrap status tag on the accent fill (e.g. "Watching tonight", "Watching"). .pill */
export function Pill({ children, testId }: { children: ReactNode; testId?: string }) {
  return <span className="pill" data-testid={testId}>{children}</span>
}
