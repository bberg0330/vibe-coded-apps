import { posterUrl } from '../api/tmdb'
import { Poster } from './Poster'
import type { CastMember } from '../types'

export function PersonCard({
  person, onOpen,
}: { person: CastMember; onOpen: (p: CastMember) => void }) {
  const photo = posterUrl(person.profilePath)
  return (
    <button className="card card-main" onClick={() => onOpen(person)}>
      <Poster src={photo} />
      <div className="card-body">
        <div className="card-title">{person.name}</div>
        <div className="card-meta">{person.character}</div>
      </div>
    </button>
  )
}
