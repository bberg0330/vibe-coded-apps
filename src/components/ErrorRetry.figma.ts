// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=11-27
// component=ErrorRetry
// source=https://github.com/frames-by-brian/vibe-coded-apps/blob/main/src/components/ErrorRetry.tsx

import figma from 'figma'

// Connects the ErrorBanner set, not a single variant — Code Connect rejects
// variant nodes. Retry=Yes is the ErrorRetry component; Retry=No has no
// component, since ErrorRetry always renders a retry button. The app writes that
// case as a bare .error div inline (App.tsx:363, SettingsSheet.tsx:34), so the
// snippet shows that markup rather than a component that would add a retry action.
let template

if (figma.selectedInstance.getPropertyValue('Retry') === 'Yes') {
  template = {
    id: 'ErrorRetry',
    imports: ["import { ErrorRetry } from './ErrorRetry'"],
    example: figma.code`<ErrorRetry message="Couldn't load the cast." onRetry={onRetry} />`,
    metadata: { nestable: true },
  }
} else {
  template = {
    id: 'ErrorRetry',
    imports: [],
    example: figma.code`<div className="error" role="alert">{message}</div>`,
    metadata: { nestable: true },
  }
}

export default template
