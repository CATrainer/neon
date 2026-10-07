import type { CheckKind } from '@neon/core'
import { commandAdapter } from './command.js'
import { noopAdapter } from './noop.js'
import { schemaAdapter } from './schema.js'
import type { CheckAdapter } from './types.js'

/**
 * Adapters are registered, not switched on. A new evidence kind is a new file
 * and one line here — never a change to the schema or to the runner.
 */
const adapters = new Map<CheckKind, CheckAdapter>()

export function registerAdapter(adapter: CheckAdapter): void {
  adapters.set(adapter.kind, adapter)
}

export function getAdapter(kind: CheckKind): CheckAdapter | undefined {
  return adapters.get(kind)
}

export function registeredKinds(): CheckKind[] {
  return [...adapters.keys()]
}

registerAdapter(noopAdapter)
registerAdapter(commandAdapter)
registerAdapter(schemaAdapter)
