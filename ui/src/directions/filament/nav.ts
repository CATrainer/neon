import { createContext, useContext } from 'react'

/**
 * Filament's routes live in the hash after the direction, so every screen is
 * shareable: `#filament/wo/DSP-412`, `#filament/run/run_412_eval_3`.
 */
export interface Nav {
  path: string[]
  go: (path: string[]) => void
  back: () => void
}

export const NavContext = createContext<Nav>({
  path: [],
  go: () => {},
  back: () => {},
})

export const useNav = () => useContext(NavContext)
