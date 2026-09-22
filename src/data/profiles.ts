export type ProfileId = string
export type Profile = { id: ProfileId; name: string }

export const PROFILES: Profile[] = [
  { id: 'laura', name: 'Laura' },
  { id: 'brian', name: 'Brian' },
]
// Household edits this array directly to add/rename profiles —
// intentionally not a DB table; this is config, not user data.
