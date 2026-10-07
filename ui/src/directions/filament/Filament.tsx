import { useCallback, useMemo } from 'react'
import Board from './Board'
import ComponentScreen from './ComponentScreen'
import DecisionLog from './DecisionLog'
import LabScreen from './LabScreen'
import RunScreen from './RunScreen'
import SetupScreen from './SetupScreen'
import WorkOrderScreen from './WorkOrderScreen'
import { NavContext } from './nav'
import { Aurora } from './primitives'

/**
 * Filament's screens. Routing is deliberately trivial — this is a design
 * prototype, and a real router would be one more thing to swap out later.
 */
export default function Filament({ path }: { path: string[] }) {
  const go = useCallback((next: string[]) => {
    window.location.hash = ['filament', ...next].join('/')
    window.scrollTo({ top: 0 })
  }, [])

  const back = useCallback(() => window.history.back(), [])

  const nav = useMemo(() => ({ path, go, back }), [path, go, back])

  let screen
  switch (path[0]) {
    case 'wo':
      screen = <WorkOrderScreen woKey={path[1] ?? ''} />
      break
    case 'run':
      screen = <RunScreen runId={path[1] ?? ''} />
      break
    case 'decisions':
      screen = <DecisionLog decisionKey={path[1]} />
      break
    case 'lab':
      screen = <LabScreen />
      break
    case 'components':
      screen = <ComponentScreen name={path[1]} />
      break
    case 'setup':
      screen = <SetupScreen />
      break
    default:
      screen = <Board />
  }

  return (
    <NavContext.Provider value={nav}>
      <div className="relative min-h-screen overflow-hidden">
        <Aurora />
        <div className="relative">{screen}</div>
      </div>
    </NavContext.Provider>
  )
}
