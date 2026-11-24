// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=370-59
// component=TopBar
// source=https://github.com/bberg0330/vibe-coded-apps/blob/main/src/components/TopBar.tsx

import figma from 'figma'

const current = figma.selectedInstance.getEnum('Current', {
  None: 'null',
  History: "'history'",
  Watchlist: "'watchlist'",
})

// The single instance in the app (App.tsx renders it once, above whichever
// screen is active), so this shows the real prop wiring rather than a
// per-instance value — except `current`, which follows the Current variant. The Figma component always shows the back label; the
// component's showBack=false state (the homescreen, no back arrow) has no
// design counterpart to point at.
export default {
  id: 'TopBar',
  imports: ["import { TopBar } from './TopBar'"],
  example: figma.code`<TopBar
  current={${current}}
  showBack={pointer > 0}
  onBack={goBack}
  profiles={PROFILES}
  activeProfileId={activeProfileId}
  onSelectProfile={selectProfile}
  onSettings={() => setSettingsOpen(true)}
  onHistory={() => navigate({ kind: 'history' })}
  onWatchlist={() => navigate({ kind: 'watchlist' })}
/>`,
  metadata: { nestable: true },
}
