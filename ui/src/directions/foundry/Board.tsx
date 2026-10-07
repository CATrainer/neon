import { useState } from 'react'
import { currentUser, data, getCheck, getEnvironment, getUser, durationMs } from '../../fixtures'
import type { Run } from '../../fixtures'
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
  Direction B — Foundry.

  The premise: the reasoning is the valuable object, so prose gets typographic
  weight and metadata gets set small and quiet. Warm charcoal, printed grain,
  copper for the one thing you should act on. Evidence is a specimen plate,
  not a table row.
*/

const DOT: Record<string, string> = {
  pass: 'bg-pass',
  fail: 'bg-fail',
  error: 'bg-error',
  pending: 'border border-ink-3 bg-transparent',
  stale: 'bg-idle',
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[9px] tracking-[0.24em] text-ink-3 uppercase">{children}</span>
  )
}

function Checks({ row }: { row: BoardRow }) {
  if (!row.progress.total) return <Label>completion undefined</Label>
  return (
    <span className="flex items-center gap-1.5">
      {row.progress.rows.map((r, i) => (
        <span
          key={i}
          title={`${r.check.name} — ${r.status}${r.thresholdNote ? ` (${r.thresholdNote})` : ''}`}
          className={`h-1.5 w-6 rounded-full ${
            r.status === 'pass' && !r.meetsThreshold ? 'bg-warn' : DOT[r.status]
          }`}
        />
      ))}
      <span className="tnum ml-1 font-mono text-[10px] text-ink-3">
        {row.progress.passing}/{row.progress.total}
      </span>
    </span>
  )
}

function Entry({ row, onSelect, selected }: { row: BoardRow; onSelect: () => void; selected: boolean }) {
  const { wo } = row
  const intent = wo.intent.split('. ')[0] + '.'
  return (
    <article
      onClick={onSelect}
      className={`grain group cursor-pointer border-t border-line px-5 py-4 transition-colors hover:bg-surface ${
        selected ? 'bg-surface' : ''
      }`}
    >
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[10px] tracking-widest text-accent">{wo.key}</span>
        {row.blockedByKeys.length > 0 && (
          <span className="font-mono text-[9px] tracking-[0.2em] text-warn uppercase">
            blocked by {row.blockedByKeys.join(', ')}
          </span>
        )}
        {row.failingCount > 0 && (
          <span className="font-mono text-[9px] tracking-[0.2em] text-fail uppercase">
            {row.failingCount} check{row.failingCount === 1 ? '' : 's'} failing
          </span>
        )}
        <span className="ml-auto font-mono text-[10px] text-ink-3">{rel(wo.updatedAt)}</span>
      </div>

      <h3 className="mt-1.5 font-display text-[21px] leading-[1.2] text-ink group-hover:text-accent">
        {wo.title}
      </h3>

      <p className="mt-2 max-w-[64ch] font-display text-[14px] leading-[1.55] text-ink-2">{intent}</p>

      <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line/60 pt-3">
        <Checks row={row} />
        <span className="font-mono text-[10px] text-ink-3">
          {row.repoNames.length ? row.repoNames.join(' · ') : 'no changes yet'}
        </span>
        <span className="font-mono text-[10px] text-ink-3">
          {row.componentNames.slice(0, 3).join(' · ')}
          {row.componentNames.length > 3 ? ` +${row.componentNames.length - 3}` : ''}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {row.assignee ? (
            <>
              <span
                className="grid h-5 w-5 place-items-center rounded-full font-mono text-[9px]"
                style={{ background: `${row.assignee.accent}26`, color: row.assignee.accent }}
              >
                {initials(row.assignee.name)}
              </span>
              <span className="font-mono text-[10px] text-ink-2">{row.assignee.short}</span>
            </>
          ) : (
            <span className="border border-accent/40 px-1.5 py-0.5 font-mono text-[9px] tracking-[0.16em] text-accent uppercase">
              unclaimed
            </span>
          )}
        </span>
      </div>
    </article>
  )
}

function Plate({ run }: { run: Run }) {
  const check = getCheck(run.checkId)!
  const env = getEnvironment(run.environmentId)
  const wo = data.workOrders.find((w) => w.id === run.workOrderId)
  const pins: [string, string | undefined][] = [
    ['artifact', run.artifactVersion],
    ['config', run.configCommit],
    ['fixture', run.fixtureVersion],
    ['params', run.paramsHash],
    ['environment', env?.name],
  ]
  return (
    <figure className="grain border border-line-strong bg-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <figcaption className="flex items-center justify-between border-b border-line-strong px-4 py-2.5">
        <Label>evidence · specimen</Label>
        <span className="font-mono text-[9px] tracking-[0.2em] text-fail uppercase">
          {run.result}
        </span>
      </figcaption>

      <div className="px-4 pt-4">
        <div className="font-mono text-[11px] text-ink-2">{check.name}</div>
        <div className="mt-0.5 line-clamp-2 font-display text-[15px] leading-snug text-ink-2">
          {wo?.key} — {wo?.title}
        </div>
      </div>

      {run.score !== undefined && (
        <div className="flex items-end gap-5 px-4 py-5">
          <span className="font-display text-[64px] leading-[0.85] text-ink">
            {run.score.toFixed(3)}
          </span>
          <span className="pb-1">
            <span className="block font-display text-[22px] leading-none text-fail">
              {signed(run.delta ?? 0)}
            </span>
            <span className="mt-1 block font-mono text-[9px] tracking-[0.16em] text-ink-3 uppercase">
              against {featuredBaseline?.score?.toFixed(3)} baseline
            </span>
          </span>
        </div>
      )}

      <div className="px-4">
        <div className="relative h-[3px] w-full bg-surface-3">
          <div className="h-full bg-fail" style={{ width: `${(run.score ?? 0) * 100}%` }} />
          {featuredThreshold !== undefined && (
            <>
              <div
                className="absolute top-[-4px] h-[11px] w-px bg-accent"
                style={{ left: `${featuredThreshold * 100}%` }}
              />
              <span
                className="absolute top-3 font-mono text-[9px] whitespace-nowrap text-accent"
                style={{ left: `${featuredThreshold * 100}%`, transform: 'translateX(-100%)' }}
              >
                required {featuredThreshold.toFixed(3)}
              </span>
            </>
          )}
        </div>
      </div>

      {run.failureSummary && (
        <p className="mt-8 border-t border-line px-4 py-3 font-display text-[14px] leading-[1.55] text-ink-2">
          {run.failureSummary}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line px-4 py-3">
        {pins.map(([k, v]) => (
          <div key={k}>
            <dt className="font-mono text-[9px] tracking-[0.18em] text-ink-3 uppercase">{k}</dt>
            <dd className={`font-mono text-[10px] ${v ? 'text-ink-2' : 'text-ink-3/60'}`}>
              {v ?? 'unpinned'}
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
        <Label>{run.citable ? 'citable as evidence' : 'not citable'}</Label>
        <span className="font-mono text-[10px] text-ink-3">
          {run.trigger} · {duration(durationMs(run))} · {rel(run.startedAt)} ago
        </span>
      </div>
    </figure>
  )
}

export default function FoundryBoard() {
  const [selected, setSelected] = useState(attention[0]?.wo.id ?? '')

  return (
    <div className="page-wash min-h-screen bg-bg">
      <div className="grid grid-cols-[196px_1fr]">
        {/* Rail */}
        <nav className="sticky top-0 h-screen border-r border-line px-5 py-6">
          <div className="font-display text-[26px] leading-none tracking-tight text-ink">Neon</div>
          <div className="mt-1 font-mono text-[9px] tracking-[0.24em] text-ink-3 uppercase">
            meridian
          </div>

          <ul className="mt-9 space-y-1.5">
            {['Work board', 'Decisions', 'Evidence', 'Components', 'Lab', 'Repos'].map((item, i) => (
              <li key={item}>
                <span
                  className={`block cursor-pointer border-l-2 py-1 pl-3 font-display text-[15px] ${
                    i === 0
                      ? 'border-accent text-ink'
                      : 'border-transparent text-ink-3 hover:text-ink-2'
                  }`}
                >
                  {item}
                </span>
              </li>
            ))}
          </ul>

          <div className="absolute bottom-6 left-5 flex items-center gap-2">
            <span
              className="grid h-6 w-6 place-items-center rounded-full font-mono text-[9px]"
              style={{ background: `${currentUser.accent}26`, color: currentUser.accent }}
            >
              {initials(currentUser.name)}
            </span>
            <span className="font-mono text-[10px] text-ink-3">{currentUser.githubLogin}</span>
          </div>
        </nav>

        <div className="grid grid-cols-1 items-start xl:grid-cols-[1fr_minmax(300px,352px)]">
          <main className="min-w-0 border-r border-line pb-24">
            <header className="grain border-b border-line px-5 pt-8 pb-6">
              <h1 className="font-display text-[40px] leading-none text-ink">Work board</h1>
              <p className="mt-3 max-w-[58ch] font-display text-[15px] leading-[1.5] text-ink-2">
                {summary.inProgress} in progress, {summary.review} waiting on review,{' '}
                {summary.ready} ready to pick up.{' '}
                <span className="text-fail">{summary.failingChecks} checks failing</span> across
                active work.
              </p>
            </header>

            <section className="border-b border-line px-5 py-5">
              <div className="mb-3 flex items-baseline gap-3">
                <span className="font-display text-[17px] whitespace-nowrap text-accent">
                  Pick up next
                </span>
                <span className="hidden lg:block">
                  <Label>ready · unclaimed · smallest completion definition first</Label>
                </span>
              </div>
              <div className="grid grid-cols-1 gap-px bg-line md:grid-cols-3">
                {pickUpNext.map((r) => (
                  <button
                    key={r.wo.id}
                    onClick={() => setSelected(r.wo.id)}
                    className="group bg-bg p-4 text-left transition-colors hover:bg-surface"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] tracking-widest text-accent">
                        {r.wo.key}
                      </span>
                      <span className="font-mono text-[9px] text-ink-3">
                        {r.progress.total} checks
                      </span>
                    </div>
                    <div className="mt-2 font-display text-[16px] leading-[1.25] text-ink-2 group-hover:text-ink">
                      {r.wo.title}
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {(['in_progress', 'review', 'ready', 'blocked', 'draft', 'done', 'abandoned'] as const).map(
              (state) => {
                const items = rowsByState(state)
                if (!items.length) return null
                return (
                  <section key={state}>
                    <header className="flex items-baseline gap-3 px-5 pt-8 pb-1">
                      <h2 className="font-display text-[22px] text-ink">{STATE_LABEL[state]}</h2>
                      <span className="tnum font-mono text-[11px] text-ink-3">{items.length}</span>
                      <span className="h-px flex-1 bg-line-strong" />
                    </header>
                    {items.map((r) => (
                      <Entry
                        key={r.wo.id}
                        row={r}
                        selected={selected === r.wo.id}
                        onSelect={() => setSelected(r.wo.id)}
                      />
                    ))}
                  </section>
                )
              },
            )}
          </main>

          <aside className="space-y-5 p-5 xl:sticky xl:top-0">
            <Plate run={featuredRun} />

            <div className="border border-line">
              <div className="border-b border-line px-4 py-2.5">
                <Label>needs a human</Label>
              </div>
              {attention.map((r) => (
                <button
                  key={r.wo.id}
                  onClick={() => setSelected(r.wo.id)}
                  className="block w-full border-b border-line/60 px-4 py-3 text-left last:border-0 hover:bg-surface"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[10px] text-ink-3">{r.wo.key}</span>
                    <span className="ml-auto font-mono text-[9px] tracking-[0.16em] text-fail uppercase">
                      {r.failingCount > 0 ? `${r.failingCount} failing` : 'blocked'}
                    </span>
                  </div>
                  <div className="mt-1 font-display text-[14px] leading-snug text-ink-2">
                    {r.wo.title}
                  </div>
                </button>
              ))}
            </div>

            <div className="border border-line">
              <div className="border-b border-line px-4 py-2.5">
                <Label>lab</Label>
              </div>
              {data.environments
                .filter((e) => e.state !== 'destroyed')
                .map((e) => {
                  const expiring =
                    e.expiresAt && Date.parse(e.expiresAt) - Date.parse(data.now) < 3_600_000
                  return (
                    <div key={e.id} className="flex items-center gap-2 px-4 py-2">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          e.state === 'in_use'
                            ? 'bg-pass'
                            : e.state === 'provisioning'
                              ? 'bg-info'
                              : e.state === 'reaping'
                                ? 'bg-error'
                                : 'bg-idle'
                        }`}
                      />
                      <span className="font-mono text-[10px] text-ink-2">{e.name}</span>
                      <span className="ml-auto font-mono text-[10px] text-ink-3">
                        {getUser(e.claimedBy)?.short ?? 'free'}
                      </span>
                      {e.expiresAt && (
                        <span
                          className={`tnum w-12 text-right font-mono text-[10px] ${
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
          </aside>
        </div>
      </div>
    </div>
  )
}
