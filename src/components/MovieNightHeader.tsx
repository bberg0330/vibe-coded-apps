import iconPopcorn from '../assets/profile-gate/20641.svg'
import iconSparkles from '../assets/profile-gate/36027.svg'
import iconStar from '../assets/profile-gate/0159f.svg'
import iconClapperboard from '../assets/profile-gate/ce7e7.svg'
import iconTicket from '../assets/profile-gate/03377.svg'
import iconProjector from '../assets/homescreen/projector.svg'

/**
 * Reuses the profile-gate's decorative icon set (popcorn, sparkles, star,
 * clapperboard, ticket — each already at 28% opacity baked into the asset)
 * as an ambient frame around the wordmark. The projector is the one icon
 * this adds to that set.
 */
export function MovieNightHeader() {
  return (
    <div className="mn-header">
      <img src={iconProjector} alt="" className="mn-header-icon mn-header-projector" aria-hidden="true" />
      <img src={iconTicket} alt="" className="mn-header-icon mn-header-ticket" aria-hidden="true" />
      <div className="mn-header-row">
        <div className="mn-header-cluster">
          <img src={iconPopcorn} alt="" className="mn-header-icon" width={38} height={38} aria-hidden="true" />
          <img src={iconSparkles} alt="" className="mn-header-icon" width={32} height={32} aria-hidden="true" />
        </div>
        <h1 className="mn-header-title">Movie Night</h1>
        <div className="mn-header-cluster">
          <img src={iconStar} alt="" className="mn-header-icon" width={48} height={48} aria-hidden="true" />
          <img src={iconClapperboard} alt="" className="mn-header-icon" width={32} height={32} aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}
