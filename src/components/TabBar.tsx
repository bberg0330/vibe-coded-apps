import { Icon, type IconName } from './icons'

export type Tab = 'search' | 'rewind' | 'watchlist' | 'history'

const TABS: { tab: Tab; label: string; icon: IconName }[] = [
  { tab: 'search', label: 'Search', icon: 'search' },
  { tab: 'rewind', label: 'Rewind', icon: 'rewind' },
  { tab: 'watchlist', label: 'Watchlist', icon: 'bookmark' },
  { tab: 'history', label: 'History', icon: 'history' },
]

/**
 * The bottom tab bar: Search · Rewind · Watchlist · History. Each item is a
 * 24px icon over a label, 52px tall (TabItem in Figma). The current tab is
 * in --accent-text with aria-current="page". `current` is null on drill-down
 * screens (Cast, Filmography): no tab is highlighted, so every tab is a way
 * home. Every tap reports the tab, the current one too: the app decides that
 * tapping it on its first screen does nothing and from deeper in returns to
 * its first screen. `alert` puts the dot on one tab's icon. .tabbar
 */
export function TabBar({ current, alert, onSelect }: {
  current: Tab | null
  alert?: Tab
  onSelect: (tab: Tab) => void
}) {
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map(({ tab, label, icon }) => {
        const isCurrent = tab === current
        return (
          <button
            key={tab}
            className={isCurrent ? 'tab-item current' : 'tab-item'}
            aria-current={isCurrent ? 'page' : undefined}
            onClick={() => onSelect(tab)}
          >
            <span className="tab-icon">
              <Icon name={icon} />
              {alert === tab && <span className="alert-dot" data-testid="alert-dot" />}
            </span>
            <span className="tab-label">{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
