import { useState } from 'react'
import type { Profile, ProfileId } from '../data/profiles'

import iconPopcorn from '../assets/profile-gate/20641.svg'
import iconStar from '../assets/profile-gate/0159f.svg'
import iconSparkles from '../assets/profile-gate/36027.svg'
import iconTicket from '../assets/profile-gate/03377.svg'
import iconFilm from '../assets/profile-gate/4eb03.svg'
import iconStar1 from '../assets/profile-gate/e5ab0.svg'
import iconPopcorn1 from '../assets/profile-gate/b6c82.svg'
import iconClapperboard from '../assets/profile-gate/ce7e7.svg'
import iconTicket1 from '../assets/profile-gate/2f092.svg'
import iconFilm1 from '../assets/profile-gate/9bb46.svg'
import iconStar2 from '../assets/profile-gate/531a2.svg'
import iconPopcorn2 from '../assets/profile-gate/ba740.svg'
import iconSparkles1 from '../assets/profile-gate/3dbde.svg'
import iconTicket2 from '../assets/profile-gate/da86c.svg'
import iconClapperboard1 from '../assets/profile-gate/519e7.svg'
import iconEllipse from '../assets/profile-gate/ccf4b.svg'
import iconEllipse1 from '../assets/profile-gate/8cced.svg'
import iconEllipse2 from '../assets/profile-gate/61e5f.svg'
import iconEllipse3 from '../assets/profile-gate/f22ee.svg'

type Props = {
  profiles: Profile[]
  onSelect: (id: ProfileId) => void
}

// Decorative background icons, positioned exactly as designed on the
// 375x812 reference frame in Figma (Page 05 — "Who's watching - Landing" /
// "Who's watching - Profile selected"). Purely ambient — never interactive,
// hence aria-hidden and pointer-events: none on the whole layer.
const DECORATIONS = [
  { src: iconPopcorn, left: 14, top: 60, size: 52 },
  { src: iconStar, left: 290, top: 44, size: 44 },
  { src: iconSparkles, left: 320, top: 110, size: 32 },
  { src: iconTicket, left: 22, top: 160, size: 36 },
  { src: iconFilm, left: 310, top: 180, size: 40 },
  { src: iconStar1, left: 8, top: 300, size: 48 },
  { src: iconPopcorn1, left: 320, top: 290, size: 38 },
  { src: iconClapperboard, left: 10, top: 390, size: 34 },
  { src: iconTicket1, left: 328, top: 400, size: 30 },
  { src: iconFilm1, left: 30, top: 620, size: 42 },
  { src: iconStar2, left: 300, top: 610, size: 36 },
  { src: iconPopcorn2, left: 150, top: 700, size: 28 },
  { src: iconSparkles1, left: 70, top: 730, size: 24 },
  { src: iconTicket2, left: 260, top: 740, size: 26 },
  { src: iconClapperboard1, left: 330, top: 680, size: 32 },
  { src: iconEllipse, left: -40, top: 40, size: 110 },
  { src: iconEllipse1, left: 300, top: 620, size: 90 },
  { src: iconEllipse2, left: -20, top: 660, size: 70 },
  { src: iconEllipse3, left: 320, top: 100, size: 60 },
]

/**
 * Full-screen "who's watching" gate shown instead of the homepage until a
 * profile is picked for this device — Netflix-style, but deliberately
 * without avatars or profile management, since there's nothing to manage
 * beyond the two names in PROFILES. Tapping a name only highlights it
 * locally; onSelect (the same handler the topbar chips use) only fires on
 * "Continue", so a mis-tap doesn't immediately commit a session.
 */
export function ProfileGate({ profiles, onSelect }: Props) {
  const [pending, setPending] = useState<ProfileId | null>(null)

  return (
    <div className="profile-gate">
      <div className="profile-gate-frame">
        <div className="profile-gate-deco" aria-hidden="true">
          {DECORATIONS.map((d, i) => (
            <img key={i} src={d.src} alt=""
              style={{ left: d.left, top: d.top, width: d.size, height: d.size }} />
          ))}
        </div>

        <p className="profile-gate-title">Welcome to<br />Movie Night</p>

        <div className="profile-gate-header">
          <p className="profile-gate-question">Who's watching?</p>
          <p className="profile-gate-subtitle">Select a profile to continue</p>
        </div>

        <div className="profile-gate-options" role="radiogroup" aria-label="Who's watching">
          {profiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              className="profile-card"
              role="radio"
              aria-checked={pending === profile.id}
              onClick={() => setPending(profile.id)}
            >
              {profile.name}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="btn profile-gate-continue"
          disabled={!pending}
          onClick={() => pending && onSelect(pending)}
        >
          Continue
        </button>
      </div>
    </div>
  )
}
