import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

afterEach(() => {
  // No DOM in the server project.
  if (typeof localStorage !== 'undefined') localStorage.clear()
})
