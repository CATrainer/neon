import { useCallback, useEffect, useMemo, useState } from 'react'
import Filament from './directions/filament/Filament'
import FoundryBoard from './directions/foundry/Board'
import HaloBoard from './directions/halo/Board'
import InstrumentBoard from './directions/instrument/Board'

type DirectionId = 'filament' | 'instrument' | 'foundry' | 'halo'

const DIRECTIONS: {
  id: DirectionId
  name: string
  claim: string
  Screen: (props: { path: string[] }) => React.JSX.Element
}[] = [
  {
    id: 'filament',
    name: 'Filament',
    claim: 'One work order lit; the rest are beads on a wire.',
    Screen: Filament,
  },
  {
    id: 'instrument',
    name: 'Instrument',
    claim: 'Hairlines, monospace, one signal colour.',
    Screen: InstrumentBoard,
  },
  {
    id: 'foundry',
    name: 'Foundry',
    claim: 'Warm charcoal and editorial serif.',
    Screen: FoundryBoard,
  },
  {
    id: 'halo',
    name: 'Halo',
    claim: 'One light source; evidence is the lit object.',
    Screen: HaloBoard,
  },
]

/** `#filament/wo/DSP-412` → direction `filament`, path `['wo','DSP-412']`. */
function parse(hash: string): { id: DirectionId; path: string[] } {
  const segs = hash.replace(/^#/, '').split('/').filter(Boolean)
  const known = DIRECTIONS.find((d) => d.id === segs[0])
  return known ? { id: known.id, path: segs.slice(1) } : { id: 'filament', path: [] }
}

export default function App() {
  const [hash, setHash] = useState(() => window.location.hash)

  useEffect(() => {
    const onHash = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const { id, path } = useMemo(() => parse(hash), [hash])

  useEffect(() => {
    document.documentElement.dataset.direction = id
  }, [id])

  const setId = useCallback((next: DirectionId) => {
    window.location.hash = next
  }, [])

  const active = DIRECTIONS.find((d) => d.id === id)!

  return (
    <>
      <active.Screen path={path} />

      {/* Review affordance only — not part of any direction. Parked top-right so
          it never sits on top of the design being judged, and dropped entirely
          for screenshots with ?bare. */}
      <div
        className={`fixed top-3 right-3 z-50 flex-col items-end gap-1 ${
          window.location.search.includes('bare') ? 'hidden' : 'flex'
        }`}
      >
        <div className="flex items-stretch gap-0.5 rounded-full border border-white/10 bg-black/60 p-0.5 backdrop-blur-xl">
          {DIRECTIONS.map((d) => (
            <button
              key={d.id}
              onClick={() => setId(d.id)}
              title={d.claim}
              className={`rounded-full px-3 py-1 text-[11px] transition-colors ${
                d.id === id
                  ? 'bg-white/85 font-medium text-black'
                  : 'text-white/45 hover:bg-white/10 hover:text-white/80'
              }`}
            >
              {d.name}
            </button>
          ))}
        </div>
        <span className="hidden max-w-[340px] px-2 text-right text-[10px] leading-snug text-white/35 xl:block">
          {active.claim}
        </span>
      </div>
    </>
  )
}
