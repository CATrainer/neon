import type { DoneWhenClause, WorkOrderState } from './domain.js'

/**
 * The maturity ladder's gates. Structure is earned on promotion, never demanded
 * at the door: an idea needs a title and a body and nothing else, a draft work
 * order needs an intent and acceptance criteria, and a ready one needs an
 * executable definition of done.
 *
 * These are the only places structure is enforced. Keep them here, pure and
 * tested, so every entry point enforces the same thing.
 */

export interface LadderSubject {
  intent: string
  acceptanceCriteria: string[]
  doneWhen: DoneWhenClause[]
}

/** States at or beyond `ready` — everything that implies someone committed. */
const COMMITTED: ReadonlySet<WorkOrderState> = new Set<WorkOrderState>([
  'ready',
  'in_progress',
  'review',
  'done',
])

/**
 * Why `subject` may not enter `target`. Empty means the transition is allowed.
 * All violations are reported together: fixing them one round trip at a time is
 * how a funnel becomes a chore.
 */
export function gateViolations(target: WorkOrderState, subject: LadderSubject): string[] {
  const violations: string[] = []

  // Draft is the first point at which anyone claimed this is worth doing.
  if (target !== 'abandoned') {
    if (subject.intent.trim() === '') {
      violations.push('a work order needs an intent: why we are doing this')
    }
    if (subject.acceptanceCriteria.filter((c) => c.trim() !== '').length === 0) {
      violations.push('a work order needs at least one acceptance criterion')
    }
  }

  // Ready is a commitment, and a commitment without a definition of done is a
  // wish. This applies equally to inquiry work — thinking without a definition
  // of done is where rigour usually collapses.
  if (COMMITTED.has(target) && subject.doneWhen.length === 0) {
    violations.push(
      'a work order cannot leave draft with an empty done_when: state at least one check that must pass',
    )
  }

  return violations
}

export function canEnter(target: WorkOrderState, subject: LadderSubject): boolean {
  return gateViolations(target, subject).length === 0
}
