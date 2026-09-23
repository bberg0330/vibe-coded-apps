import iconSearch from '../assets/homescreen/search.svg'

/** The search field on the homescreen: magnifier icon + text input. .search-field */
export function SearchInput({ value, onChange, placeholder, autoFocus }: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  autoFocus?: boolean
}) {
  return (
    <div className="search-field">
      <img src={iconSearch} alt="" className="search-icon" aria-hidden="true" />
      <input
        type="search"
        className="search-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
      />
    </div>
  )
}
