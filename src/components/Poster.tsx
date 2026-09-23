/** Card artwork, 54x81. Falls back to an empty placeholder when there's no image. .poster */
export function Poster({ src }: { src: string | null }) {
  return src
    ? <img className="poster" src={src} alt="" loading="lazy" />
    : <div className="poster poster-empty" aria-hidden="true" />
}
