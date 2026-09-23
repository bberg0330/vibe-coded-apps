import iconPopcorn from '../assets/profile-gate/20641.svg'
import iconSparkles from '../assets/profile-gate/36027.svg'
import iconStar from '../assets/profile-gate/0159f.svg'
import iconClapperboard from '../assets/profile-gate/ce7e7.svg'
import iconTicket from '../assets/profile-gate/03377.svg'
import iconProjector from '../assets/homescreen/projector.svg'
import marqueeDot from '../assets/header/marquee-dot.svg'
import type { CSSProperties } from 'react'

/**
 * Reuses the profile-gate's decorative icon set (popcorn, sparkles, star,
 * clapperboard, ticket — each already at 28% opacity baked into the asset)
 * as an ambient frame around the wordmark. The projector is the one icon
 * this adds to that set.
 */
/** Masked rather than an <img> — see .icon-mask. Size is required: a mask has no intrinsic one. */
function Deco({ src, size, className = '' }: { src: string; size: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`mn-header-icon icon-mask ${className}`.trim()}
      style={{ width: size, height: size, '--icon': `url("${src}")` } as CSSProperties}
    />
  )
}

export function MovieNightHeader() {
  return (
    <div className="mn-header">
      <Deco src={iconProjector} size={32} className="mn-header-projector" />
      <Deco src={iconTicket} size={36} className="mn-header-ticket" />
      <div className="mn-header-row">
        <div className="mn-header-cluster">
          <Deco src={iconPopcorn} size={38} />
          <Deco src={iconSparkles} size={32} />
        </div>
        <div className="mn-marquee">
          <img className="mn-marquee-dot mn-marquee-dot-tl" src={marqueeDot} alt="" aria-hidden="true" />
          <img className="mn-marquee-dot mn-marquee-dot-tr" src={marqueeDot} alt="" aria-hidden="true" />
          <img className="mn-marquee-dot mn-marquee-dot-bl" src={marqueeDot} alt="" aria-hidden="true" />
          <img className="mn-marquee-dot mn-marquee-dot-br" src={marqueeDot} alt="" aria-hidden="true" />
          <h1 className="mn-header-title">Movie Night</h1>
        </div>
        <div className="mn-header-cluster">
          <Deco src={iconStar} size={48} />
          <Deco src={iconClapperboard} size={32} />
        </div>
      </div>
    </div>
  )
}
