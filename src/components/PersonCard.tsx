import { posterUrl } from '../api/tmdb'
import type { CastMember } from '../types'

export function PersonCard({
  person, onOpen,
}: { person: CastMember; onOpen: (p: CastMember) => void }) {
  const photo = posterUrl(person.profilePath)
  return (
    <button className="card card-main" onClick={() => onOpen(person)}>
      {photo
        ? <img className="poster" src={photo} alt="" loading="lazy" />
        : <div className="poster poster-empty" aria-hidden="true" />}
      <div className="card-body">
        <div className="card-title">{person.name}</div>
        <div className="card-meta">{person.character}</div>
      </div>
    </button>
  )
}
