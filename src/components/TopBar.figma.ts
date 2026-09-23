// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=11-12
// component=TopBar
// source=https://github.com/frames-by-brian/vibe-coded-apps/blob/main/src/components/TopBar.tsx

import figma from 'figma'

// The single instance in the app (App.tsx renders it once, above whichever
// screen is active), so this shows the real prop wiring rather than a
// per-instance value. The Figma component always shows the back label; the
// component's showBack=false state (the homescreen, no back arrow) has no
// design counterpart to point at.
export default {
  id: 'TopBar',
  imports: ["import { TopBar } from './TopBar'"],
  example: figma.code`<TopBar
  showBack={pointer > 0}
  onBack={goBack}
  profiles={PROFILES}
  activeProfileId={activeProfileId}
  onSelectProfile={selectProfile}
  onSettings={() => setSettingsOpen(true)}
  onHistory={() => navigate({ kind: 'history' })}
/>`,
  metadata: { nestable: true },
}
