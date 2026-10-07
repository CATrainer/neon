import { useEffect, useMemo, useState } from 'react'
import { getUser, runsFor } from '../../fixtures'
import type { WorkOrderState } from '../../fixtures'
import { initials, rel } from '../../lib/format'
import type { BoardRow } from '../../screens/boardModel'
import { rows, summary } from '../../screens/boardModel'
import { useNav } from './nav'
import {
  Action,
  CheckFilaments,
  Chrome,
  Dot,
  Key,
  Meta,
  Prose,
  Sep,
  StateWord,
} from './primitives'
import Wire, { orderRows } from './Wire'

/*
  Screen 1 — the work board.

  It answers one question and shows one work order. The other seventeen are
  beads of light on the wire; everything else is disclosed on demand.
*/

const ACTION: Record<WorkOrderState, string> = {
  ready: 'Claim it',
  in_progress: 'Continue',
  review: 'Review',
  blocked: 'See the blocker',
  draft: 'Finish the definition',
  done: 'Open',
  abandoned: 'Open',
}

function firstSentence(text: string): string {
  const m = text.match(/^.*?[.?!](\s|$)/)
  return (m ? m[0] : text).trim()
}

function Hero({ row }: { row: BoardRow }) {
  const { go } = useNav()
  const { wo } = row
  const failing = runsFor(wo.id).find((r) => r.result === 'fail' || r.result === 'error')

  return (
    <div key={wo.id} className="ignite w-full max-w-[680px]">
      <div className="flex flex-wrap items-center gap-3">
        <Key>{wo.key}</Key>
        <StateWord state={wo.state} />
        {row.failingCount > 0 && (
          <span className="breathe text-[11px] tracking-[0.18em] text-fail uppercase">
            {row.failingCount} failing
          </span>
        )}
        {row.blockedByKeys.length > 0 && (
          <span className="text-[11px] tracking-[0.18em] text-warn uppercase">
            waiting on {row.blockedByKeys.join(', ')}
          </span>
        )}
      </div>

      <h1
        onClick={() => go(['wo', wo.key])}
        className="mt-4 cursor-pointer text-[30px] leading-[1.18] font-medium tracking-[-0.02em] text-ink transition-colors hover:text-white"
      >
        {wo.title}
      </h1>

      <Prose className="mt-4">{firstSentence(wo.intent)}</Prose>

      <div className="mt-7">
        {row.progress.total ? (
          <div className="flex items-center gap-4">
            <CheckFilaments rows={row.progress.rows} />
            <span className="text-[13px] text-ink-2">
              {row.progress.passing} of {row.progress.total} checks clear
            </span>
          </div>
        ) : (
          <p className="text-[13px] text-ink-3">
            No completion definition yet — this cannot leave draft without one.
          </p>
        )}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Action primary onClick={() => go(['wo', wo.key])}>
          {ACTION[wo.state]}
        </Action>
        {failing && <Action onClick={() => go(['run', failing.id])}>Why it failed →</Action>}
      </div>

      <div className="mt-8">
        <Meta>
          {row.assignee ? (
            <>
              <span
                className="grid h-[22px] w-[22px] place-items-center rounded-full text-[9px] font-medium"
                style={{ background: `${row.assignee.accent}26`, color: row.assignee.accent }}
              >
                {initials(row.assignee.name)}
              </span>
              <span>{row.assignee.name}</span>
            </>
          ) : (
            <span className="text-accent-2">unclaimed</span>
          )}
          <Sep />
          <span>{row.repoNames.length ? row.repoNames.join(', ') : 'no branch yet'}</span>
          <Sep />
          <span>{rel(wo.updatedAt)} ago</span>
        </Meta>
      </div>
    </div>
  )
}

export default function Board() {
  const { go } = useNav()
  const [selected, setSelected] = useState(
    rows.find((r) => r.failingCount > 0)?.wo.id ?? rows[0]!.wo.id,
  )
  const [hovered, setHovered] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const activeId = hovered ?? selected
  const active = useMemo(() => rows.find((r) => r.wo.id === activeId)!, [activeId])
  const ordered = useMemo(() => orderRows(rows), [])

  // Travel the wire from the keyboard. `e` opens the evidence behind a failure.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showAll) {
        setShowAll(false)
        return
      }
      if (showAll) return
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault()
        const i = ordered.findIndex((r) => r.wo.id === activeId)
        const next = e.key === 'ArrowRight' ? i + 1 : i - 1
        const target = ordered[Math.max(0, Math.min(ordered.length - 1, next))]
        if (target) {
          setHovered(null)
          setSelected(target.wo.id)
        }
      }
      if (e.key === 'e') {
        const failing = runsFor(activeId).find((r) => r.result === 'fail' || r.result === 'error')
        if (failing) go(['run', failing.id])
      }
      if (e.key === 'Enter') go(['wo', active.wo.key])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeId, ordered, showAll, active, go])

  return (
    <div className="flex min-h-screen flex-col">
      <Chrome
        right={
          <button
            onClick={() => setShowAll(true)}
            className="text-[12px] text-ink-3 transition-colors hover:text-ink-2"
          >
            All {rows.length} work orders
          </button>
        }
      />

      <main className="flex flex-1 flex-col items-center justify-center px-8 pt-10 pb-4">
        <div className="w-full max-w-[680px]">
          {/* One sentence of orientation. Not a stat bar. */}
          <p className="mb-12 text-[13px] text-ink-3">
            <span className="text-accent-2">{summary.ready} ready to pick up</span>.{' '}
            {summary.inProgress} in flight, {summary.blocked} blocked,{' '}
            <button
              onClick={() => go(['decisions'])}
              className="text-fail underline-offset-4 hover:underline"
            >
              {summary.failingChecks} checks failing
            </button>
            .
          </p>
          <Hero row={active} />
        </div>
      </main>

      <footer className="px-4 pb-3">
        <Wire rows={rows} activeId={activeId} onHover={setHovered} onSelect={setSelected} />
        <p className="pt-1 text-center text-[10px] tracking-[0.16em] text-ink-3/45 uppercase">
          ← → along the wire · enter to open · e for the evidence
        </p>
      </footer>

      {showAll && (
        <div
          className="fixed inset-0 z-30 overflow-y-auto bg-bg-deep/85 px-6 py-16 backdrop-blur-md"
          onClick={() => setShowAll(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="ignite mx-auto max-w-[760px] space-y-1"
          >
            <p className="px-4 pb-4 text-[11px] tracking-[0.16em] text-ink-3 uppercase">
              in pipeline order · pick one to focus it · esc to close
            </p>
            {ordered.map((r) => (
              <button
                key={r.wo.id}
                onClick={() => {
                  setSelected(r.wo.id)
                  setShowAll(false)
                }}
                className="flex w-full items-center gap-4 rounded-card px-4 py-3 text-left transition-colors hover:bg-surface-2/70"
              >
                <Dot
                  color={
                    r.failingCount > 0
                      ? 'var(--color-fail)'
                      : r.wo.state === 'ready'
                        ? 'var(--color-accent-2)'
                        : r.wo.state === 'done' || r.wo.state === 'abandoned'
                          ? 'var(--color-idle)'
                          : 'var(--color-accent)'
                  }
                  lit={r.wo.state !== 'done' && r.wo.state !== 'abandoned'}
                />
                <span className="w-[62px] shrink-0 font-mono text-[11px] text-ink-3">{r.wo.key}</span>
                <span className="min-w-0 flex-1 truncate text-[14px] text-ink-2">{r.wo.title}</span>
                <span className="w-[84px] shrink-0 text-right text-[11px] text-ink-3/70">
                  {r.wo.state.replace('_', ' ')}
                </span>
                <span className="w-[76px] shrink-0 text-right text-[11px] text-ink-3">
                  {getUser(r.wo.assignedTo)?.short ?? '—'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
