import { useState } from 'react'
import { currentUser, data, getCheck, getEnvironment, getUser, durationMs } from '../../fixtures'
import type { Run, WorkOrderState } from '../../fixtures'
import { duration, initials, rel, signed } from '../../lib/format'
import type { BoardRow } from '../../screens/boardModel'
import {
  STATE_LABEL,
  attention,
  featuredBaseline,
  featuredRun,
  featuredThreshold,
  pickUpNext,
  rowsByState,
  summary,
} from '../../screens/boardModel'

/*
  Direction C — Halo.

  One light source, top of the page. Surfaces are glass; state is carried by
  luminance as well as hue, so a failing check reads before you have parsed a
  word. The object under attention is the only thing emitting light.
*/

const DOT: Record<string, string> = {
  pass: 'bg-pass shadow-[0_0_6px_var(--color-pass)]',
  fail: 'bg-fail shadow-[0_0_8px_var(--color-fail)]',
  error: 'bg-error shadow-[0_0_8px_var(--color-error)]',
  pending: 'bg-ink-3/30 ring-1 ring-inset ring-ink-3/60',
  stale: 'bg-idle',
}

const COLUMNS: WorkOrderState[] = ['in_progress', 'review', 'ready', 'blocked', 'done']

function Glass({
  children,
  lit,
  className = '',
  onClick,
}: {
  children: React.ReactNode
  lit?: boolean
  className?: string
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden rounded-card border bg-surface/80 backdrop-blur-xl transition-all duration-200 ${
        lit
          ? 'border-accent/45 shadow-[0_0_0_1px_rgba(124,108,255,0.12),0_18px_50px_-20px_rgba(124,108,255,0.65)]'
          : 'border-line hover:border-line-strong'
      } ${className}`}
    >
      {/* rim light */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
      />
      {children}
    </div>
  )
}

function Checks({ row }: { row: BoardRow }) {
  if (!row.progress.total) {
    return <span className="text-[10px] text-ink-3">completion undefined</span>
  }
  return (
    <span className="flex items-center gap-1">
      {row.progress.rows.map((r, i) => (
        <span
          key={i}
          title={`${r.check.name} — ${r.status}${r.thresholdNote ? ` (${r.thresholdNote})` : ''}`}
          className={`h-1.5 w-1.5 rounded-full ${
            r.status === 'pass' && !r.meetsThreshold ? 'bg-warn' : DOT[r.status]
          }`}
        />
      ))}
      <span className="tnum ml-1 text-[10px] text-ink-3">
        {row.progress.passing}/{row.progress.total}
      </span>
    </span>
  )
}

function Card({ row, selected, onSelect }: { row: BoardRow; selected: boolean; onSelect: () => void }) {
  const { wo } = row
  return (
    <Glass lit={selected || row.failingCount > 0} onClick={onSelect} className="cursor-pointer p-3.5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] tracking-wider text-accent">{wo.key}</span>
        {row.failingCount > 0 && (
          <span className="rounded-chip bg-fail/15 px-1.5 py-px text-[9px] font-medium tracking-wide text-fail uppercase">
            {row.failingCount} failing
          </span>
        )}
        {row.blockedByKeys.length > 0 && (
          <span className="rounded-chip bg-warn/12 px-1.5 py-px text-[9px] font-medium tracking-wide text-warn uppercase">
            blocked
          </span>
        )}
        <span className="ml-auto text-[10px] text-ink-3">{rel(wo.updatedAt)}</span>
      </div>

      <h3 className="mt-2 text-[13px] leading-[1.35] font-medium text-ink">{wo.title}</h3>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {row.componentNames.slice(0, 2).map((c) => (
          <span
            key={c}
            className="rounded-chip border border-line px-1.5 py-px font-mono text-[9px] text-ink-3"
          >
            {c}
          </span>
        ))}
        {row.componentNames.length > 2 && (
          <span className="font-mono text-[9px] text-ink-3">+{row.componentNames.length - 2}</span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-line/70 pt-2.5">
        <Checks row={row} />
        <div className="flex items-center gap-1.5">
          {row.openPrs > 0 && (
            <span className="font-mono text-[9px] text-ink-3">{row.openPrs} PR</span>
          )}
          {row.assignee ? (
            <span
              className="grid h-5 w-5 place-items-center rounded-full text-[9px] font-medium"
              style={{ background: `${row.assignee.accent}26`, color: row.assignee.accent }}
              title={row.assignee.name}
            >
              {initials(row.assignee.name)}
            </span>
          ) : (
            <span className="rounded-chip bg-accent/15 px-2 py-0.5 text-[9px] font-medium text-accent">
              free
            </span>
          )}
        </div>
      </div>
    </Glass>
  )
}

function EvidencePanel({ run }: { run: Run }) {
  const check = getCheck(run.checkId)!
  const env = getEnvironment(run.environmentId)
  const wo = data.workOrders.find((w) => w.id === run.workOrderId)
  const score = run.score ?? 0
  const pins: [string, string | undefined][] = [
    ['artifact', run.artifactVersion],
    ['config', run.configCommit],
    ['fixture', run.fixtureVersion],
    ['params', run.paramsHash],
    ['environment', env?.name],
  ]
  const circumference = 2 * Math.PI * 44

  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-6 rounded-[32px] bg-fail/10 blur-3xl"
      />
      <Glass lit className="relative p-5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium tracking-[0.18em] text-ink-3 uppercase">
            evidence
          </span>
          <span className="rounded-chip bg-fail/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-fail uppercase">
            {run.result}
          </span>
        </div>

        <div className="mt-4 flex items-center gap-5">
          <div className="relative h-[104px] w-[104px] shrink-0">
            <svg viewBox="0 0 100 100" className="-rotate-90">
              <circle cx="50" cy="50" r="44" fill="none" stroke="var(--color-surface-3)" strokeWidth="7" />
              <circle
                cx="50"
                cy="50"
                r="44"
                fill="none"
                stroke="var(--color-fail)"
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={`${score * circumference} ${circumference}`}
                style={{ filter: 'drop-shadow(0 0 6px var(--color-fail))' }}
              />
              {featuredThreshold !== undefined && (
                <circle
                  cx="50"
                  cy="50"
                  r="44"
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth="7"
                  strokeDasharray={`1.5 ${circumference}`}
                  strokeDashoffset={-featuredThreshold * circumference}
                />
              )}
            </svg>
            <div className="absolute inset-0 grid place-items-center">
              <span className="tnum text-[24px] leading-none font-semibold text-ink">
                {score.toFixed(3)}
              </span>
            </div>
          </div>
          <div className="min-w-0">
            <div className="font-mono text-[12px] text-ink">{check.name}</div>
            <div className="mt-1 truncate text-[11px] text-ink-2">
              {wo?.key} · {wo?.title}
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="tnum text-[18px] font-semibold text-fail">{signed(run.delta ?? 0)}</span>
              <span className="text-[10px] text-ink-3">
                vs baseline {featuredBaseline?.score?.toFixed(3)}
              </span>
            </div>
            {featuredThreshold !== undefined && (
              <div className="mt-1 text-[10px] text-ink-3">
                threshold <span className="text-accent">{featuredThreshold.toFixed(3)}</span> ·
                shortfall{' '}
                <span className="text-fail">{(featuredThreshold - score).toFixed(3)}</span>
              </div>
            )}
          </div>
        </div>

        {run.failureSummary && (
          <p className="mt-4 rounded-card bg-fail/8 p-3 text-[12px] leading-relaxed text-ink-2 ring-1 ring-fail/15 ring-inset">
            {run.failureSummary}
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          {pins.map(([k, v]) => (
            <div key={k} className="rounded-card bg-surface-2/70 px-2.5 py-1.5">
              <div className="text-[9px] tracking-[0.16em] text-ink-3 uppercase">{k}</div>
              <div className={`truncate font-mono text-[10px] ${v ? 'text-ink-2' : 'text-ink-3/60'}`}>
                {v ?? 'unpinned'}
              </div>
            </div>
          ))}
          <div className="flex items-center gap-1.5 rounded-card bg-pass/10 px-2.5 py-1.5 ring-1 ring-pass/20 ring-inset">
            <span className="h-1.5 w-1.5 rounded-full bg-pass shadow-[0_0_6px_var(--color-pass)]" />
            <span className="text-[10px] font-medium text-pass">
              {run.citable ? 'citable' : 'not citable'}
            </span>
          </div>
        </div>

        <div className="mt-4 space-y-1">
          {run.artifacts.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-card px-2 py-1 hover:bg-surface-2"
            >
              <span className="font-mono text-[10px] text-info">{a.name}</span>
              <span className="tnum font-mono text-[10px] text-ink-3">
                {(a.sizeBytes / 1024).toFixed(0)} KB
              </span>
            </div>
          ))}
        </div>

        <div className="mt-3 border-t border-line pt-3 text-[10px] text-ink-3">
          {run.trigger} · {duration(durationMs(run))} · {rel(run.startedAt)} ago
        </div>
      </Glass>
    </div>
  )
}

export default function HaloBoard() {
  const [selected, setSelected] = useState(attention[0]?.wo.id ?? '')

  return (
    <div className="page-wash min-h-screen bg-bg">
      <header className="flex h-14 items-center gap-5 px-6">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_10px_var(--color-accent)]" />
          <span className="text-[15px] font-semibold tracking-tight text-ink">Neon</span>
        </span>
        <nav className="flex items-center gap-1 rounded-chip border border-line bg-surface/60 p-1 backdrop-blur">
          {['Board', 'Decisions', 'Evidence', 'Components', 'Lab'].map((n, i) => (
            <span
              key={n}
              className={`cursor-pointer rounded-chip px-3 py-1 text-[12px] ${
                i === 0 ? 'bg-accent/20 text-ink' : 'text-ink-3 hover:text-ink-2'
              }`}
            >
              {n}
            </span>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-4 text-[11px] text-ink-3">
          <span>{summary.runs24h} runs · 24h</span>
          <span
            className="grid h-6 w-6 place-items-center rounded-full text-[9px] font-medium"
            style={{ background: `${currentUser.accent}26`, color: currentUser.accent }}
          >
            {initials(currentUser.name)}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 px-6 pb-16 xl:grid-cols-[1fr_minmax(320px,384px)]">
        <main className="min-w-0">
          {/* Answer strip */}
          <Glass className="mb-5 p-5">
            <div className="flex items-start justify-between gap-6">
              <div>
                <h1 className="text-[19px] font-semibold tracking-tight text-ink">
                  Three things are ready. One is blocked on you.
                </h1>
                <p className="mt-1 text-[12px] text-ink-2">
                  {summary.inProgress} in progress · {summary.review} in review ·{' '}
                  <span className="text-fail">{summary.failingChecks} checks failing</span> ·{' '}
                  {summary.envsClaimed} environments claimed
                </p>
              </div>
              <button className="shrink-0 rounded-chip bg-accent px-4 py-2 text-[12px] font-medium text-on-accent shadow-[0_8px_24px_-8px_var(--color-accent)]">
                Claim next work order
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              {pickUpNext.map((r) => (
                <button
                  key={r.wo.id}
                  onClick={() => setSelected(r.wo.id)}
                  className="rounded-card border border-line bg-surface-2/60 p-3 text-left transition-colors hover:border-accent/40"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-accent">{r.wo.key}</span>
                    <span className="text-[10px] text-ink-3">{r.progress.total} checks</span>
                  </div>
                  <div className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-ink-2">
                    {r.wo.title}
                  </div>
                </button>
              ))}
            </div>
          </Glass>

          {/* Kanban */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {COLUMNS.map((state) => {
              const items = rowsByState(state)
              return (
                <section key={state} className="min-w-0">
                  <header className="mb-2.5 flex items-center gap-2 px-0.5">
                    <span className="text-[11px] font-medium tracking-wide text-ink-2">
                      {STATE_LABEL[state]}
                    </span>
                    <span className="tnum rounded-chip bg-surface-2 px-1.5 text-[10px] text-ink-3">
                      {items.length}
                    </span>
                  </header>
                  <div className="space-y-2.5">
                    {items.slice(0, 5).map((r) => (
                      <Card
                        key={r.wo.id}
                        row={r}
                        selected={selected === r.wo.id}
                        onSelect={() => setSelected(r.wo.id)}
                      />
                    ))}
                    {items.length > 5 && (
                      <div className="px-1 text-[10px] text-ink-3">+{items.length - 5} more</div>
                    )}
                  </div>
                </section>
              )
            })}
          </div>
        </main>

        <aside className="sticky top-4 space-y-5 self-start">
          <EvidencePanel run={featuredRun} />

          <Glass className="p-4">
            <div className="mb-3 text-[10px] font-medium tracking-[0.18em] text-ink-3 uppercase">
              lab
            </div>
            <div className="space-y-2">
              {data.environments
                .filter((e) => e.state !== 'destroyed')
                .map((e) => {
                  const expiring =
                    e.expiresAt && Date.parse(e.expiresAt) - Date.parse(data.now) < 3_600_000
                  return (
                    <div key={e.id} className="flex items-center gap-2">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          e.state === 'in_use'
                            ? 'bg-pass shadow-[0_0_6px_var(--color-pass)]'
                            : e.state === 'provisioning'
                              ? 'bg-info shadow-[0_0_6px_var(--color-info)]'
                              : e.state === 'reaping'
                                ? 'bg-error'
                                : 'bg-idle'
                        }`}
                      />
                      <span className="font-mono text-[10px] text-ink-2">{e.name}</span>
                      <span className="ml-auto text-[10px] text-ink-3">
                        {getUser(e.claimedBy)?.short ?? 'free'}
                      </span>
                      {e.expiresAt && (
                        <span
                          className={`tnum w-11 text-right font-mono text-[10px] ${
                            expiring ? 'text-warn' : 'text-ink-3'
                          }`}
                        >
                          {rel(e.expiresAt)}
                        </span>
                      )}
                    </div>
                  )
                })}
            </div>
          </Glass>

          <Glass className="p-4">
            <div className="mb-3 text-[10px] font-medium tracking-[0.18em] text-ink-3 uppercase">
              needs a human
            </div>
            <div className="space-y-2.5">
              {attention.map((r) => (
                <button
                  key={r.wo.id}
                  onClick={() => setSelected(r.wo.id)}
                  className="block w-full text-left"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[10px] text-ink-3">{r.wo.key}</span>
                    <span className="ml-auto text-[9px] font-medium tracking-wide text-fail uppercase">
                      {r.failingCount > 0 ? `${r.failingCount} failing` : 'blocked'}
                    </span>
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-ink-2">
                    {r.wo.title}
                  </div>
                </button>
              ))}
            </div>
          </Glass>
        </aside>
      </div>
    </div>
  )
}
