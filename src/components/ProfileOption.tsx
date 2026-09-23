/** One selectable profile on the "who's watching" gate. .profile-card */
export function ProfileOption({ name, selected, onClick }: {
  name: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="profile-card"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
    >
      {name}
    </button>
  )
}
