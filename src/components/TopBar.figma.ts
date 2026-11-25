// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=370-59
// component=TopBar
// source=https://github.com/bberg0330/vibe-coded-apps/blob/main/src/components/TopBar.tsx

import figma from 'figma'

// The single instance in the app (App.tsx renders it once, above whichever
// screen is active), so this shows the real prop wiring. Screens are reached
// from the bottom TabBar now; the bell (onAlerts) arrives with watchlist
// alerts. The Figma component's "Current" variants predate the tab bar and
// no longer map to a prop. Figma's backLabel text ("‹ Search") is not mapped:
// the code derives the name of the screen Back returns to (backLabelFor in
// App.tsx) and the component adds the "‹ " itself, so the snippet shows a
// representative value.

export default {
  id: 'TopBar',
  imports: ["import { TopBar } from './TopBar'"],
  example: figma.code`<TopBar
  showBack={pointer > 0}
  backLabel={backLabelFor(entries[pointer - 1])}
  onBack={goBack}
  profile={activeProfile}
  onSwitchProfile={() => setProfileSheetOpen(true)}
  onSettings={() => setSettingsOpen(true)}
/>`,
  metadata: { nestable: true },
}
