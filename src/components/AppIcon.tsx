import appIcon from '../assets/app-icon/app-icon.svg'

/**
 * The Movie Night app icon (Popcorn Party / Midnight Marquee). The same SVG the
 * favicon and home-screen icons in public/ are rendered from. Full-bleed and
 * square; the platform applies its own corner mask. Decorative, so it has no alt
 * text. .app-icon
 */
export function AppIcon({ size = 64 }: { size?: number }) {
  return <img className="app-icon" src={appIcon} width={size} height={size} alt="" />
}
