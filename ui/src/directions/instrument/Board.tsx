import { useState } from 'react'
import {
  currentUser,
  data,
  getCheck,
  getEnvironment,
  getUser,
  durationMs,
} from '../../fixtures'
import type { Run } from '../../fixtures'
import { absolute, duration, initials, rel, signed } from '../../lib/format'
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
  Direction A — Instrument.

  Hairlines instead of cards. Monospace for anything that is data. One signal
  colour, spent only on the thing you are meant to act on. Nothing is rounded,
  nothing floats, nothing glows.
*/

const RESULT_COLOR: Record<string, string> = {
  pass: 'bg-pass',
  fail: 'bg-fail',
  error: 'bg-error',
  pending: 'bg-transparent border border-ink-3',
  stale: 'bg-idle',
}

function Pips({ row }: { row: BoardRow }) {
  if (row.progress.total === 0) {
    return <span className="font-mono text-[10px] text-ink-3">no done_when</span>
  }
  return (
    <span className="flex items-center gap-[3px]">
      {row.progress.rows.map((r, i) => (
        <span
          key={i}
          title={`${r.check.name} — ${r.status}${r.thresholdNote ? ` (${r.thresholdNote})` : ''}`}
          className={`h-[9px] w-[9px] ${
            r.status === 'pass' && !r.meetsThreshold ? 'bg-warn' : RESULT_COLOR[r.status]
          }`}
        />
      ))}
      <span className="tnum ml-1.5 font-mono text-[10px] text-ink-3">
        {row.progress.passing}/{row.progress.total}
      </span>
    </span>
  )
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="flex min-w-[92px] flex-col gap-1 border-l border-line pl-3 first:border-l-0 first:pl-0">
      <span className="font-mono text-[10px] tracking-[0.18em] text-ink-3 uppercase">{label}</span>
      <span className={`tnum font-mono text-lg leading-none ${tone ?? 'text-ink'}`}>{value}</span>
    </div>
  )
}

function Row({ row, selected, onSelect }: { row: BoardRow; selected: boolean; onSelect: () => void }) {
  const { wo } = row
  return (
    <button
      onClick={onSelect}
      className={`group grid w-full grid-cols-[14px_70px_minmax(0,1fr)_124px_82px] items-center gap-2.5 border-b border-line/70 px-3 py-2 text-left transition-colors hover:bg-surface-2 xl:grid-cols-[14px_70px_minmax(0,1fr)_124px_112px_92px_46px] ${
        selected ? 'bg-surface-2' : ''
      }`}
    >
      <span
        className={`h-4 w-[3px] ${
          row.failingCount > 0
            ? 'bg-fail'
            : wo.state === 'blocked'
              ? 'bg-warn'
              : wo.state === 'ready'
                ? 'bg-accent'
                : wo.state === 'done'
                  ? 'bg-idle/60'
                  : 'bg-line-strong'
        }`}
      />
      <span className="tnum font-mono text-[11px] text-ink-3 group-hover:text-accent">{wo.key}</span>
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-[13px] text-ink">{wo.title}</span>
        {row.blockedByKeys.length > 0 && (
          <span className="shrink-0 border border-warn/40 px-1 font-mono text-[9px] tracking-wider text-warn uppercase">
            blocked · {row.blockedByKeys.join(' ')}
          </span>
        )}
      </span>
      <Pips row={row} />
      <span className="hidden truncate font-mono text-[10px] text-ink-3 xl:block">
        {row.repoNames.length ? row.repoNames.join(' · ') : '—'}
      </span>
      <span className="flex items-center gap-1.5">
        {row.assignee ? (
          <>
            <span
              className="grid h-[18px] w-[18px] place-items-center font-mono text-[9px]"
              style={{ background: `${row.assignee.accent}22`, color: row.assignee.accent }}
            >
              {initials(row.assignee.name)}
            </span>
            <span className="truncate font-mono text-[10px] text-ink-3">{row.assignee.short}</span>
          </>
        ) : (
          <span className="font-mono text-[10px] text-accent">unclaimed</span>
        )}
      </span>
      <span className="tnum hidden text-right font-mono text-[10px] text-ink-3 xl:block">
        {rel(wo.updatedAt)}
      </span>
    </button>
  )
}

function Group({
  state,
  selected,
  onSelect,
}: {
  state: Parameters<typeof rowsByState>[0]
  selected: string
  onSelect: (id: string) => void
}) {
  const items = rowsByState(state)
  if (!items.length) return null
  return (
    <section>
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-bg/95 px-3 py-2 backdrop-blur-sm">
        <span
          className={`font-mono text-[10px] tracking-[0.22em] uppercase ${
            state === 'ready' ? 'text-accent' : 'text-ink-2'
          }`}
        >
          {STATE_LABEL[state]}
        </span>
        <span className="tnum font-mono text-[10px] text-ink-3">{items.length}</span>
        <span className="h-px flex-1 bg-line" />
      </header>
      {items.map((r) => (
        <Row key={r.wo.id} row={r} selected={selected === r.wo.id} onSelect={() => onSelect(r.wo.id)} />
      ))}
    </section>
  )
}

function Readout({ run }: { run: Run }) {
  const check = getCheck(run.checkId)!
  const env = getEnvironment(run.environmentId)
  const wo = data.workOrders.find((w) => w.id === run.workOrderId)
  const pins: [string, string | undefined][] = [
    ['artifact', run.artifactVersion],
    ['config', run.configCommit],
    ['fixture', run.fixtureVersion],
    ['params', run.paramsHash],
    ['env', env?.name],
  ]
  return (
    <div className="border border-line-strong bg-surface">
      <div className="flex items-center justify-between border-b border-line-strong bg-surface-2 px-3 py-2">
        <span className="font-mono text-[10px] tracking-[0.22em] text-ink-2 uppercase">
          latest failing evidence
        </span>
        <span className="font-mono text-[10px] text-fail uppercase">{run.result}</span>
      </div>

      <div className="border-b border-line px-3 py-3">
        <div className="font-mono text-[13px] text-ink">{check.name}</div>
        <div className="mt-1 font-mono text-[10px] text-ink-3">
          {wo?.key} · {run.trigger} · {rel(run.startedAt)} ago · {duration(durationMs(run))}
        </div>
      </div>

      {run.score !== undefined && (
        <div className="border-b border-line px-3 py-3">
          <div className="flex items-end justify-between">
            <span className="tnum font-mono text-[42px] leading-none text-fail">
              {run.score.toFixed(3)}
            </span>
            <div className="text-right">
              <div className="tnum font-mono text-[13px] text-fail">{signed(run.delta ?? 0)}</div>
              <div className="font-mono text-[9px] tracking-wider text-ink-3 uppercase">
                vs baseline {featuredBaseline?.score?.toFixed(3)}
              </div>
            </div>
          </div>
          <div className="relative mt-3 h-[6px] w-full bg-surface-3">
            <div className="h-full bg-fail" style={{ width: `${run.score * 100}%` }} />
            {featuredThreshold !== undefined && (
              <div
                className="absolute top-0 h-[6px] w-px bg-accent"
                style={{ left: `${featuredThreshold * 100}%` }}
                title={`threshold ${featuredThreshold}`}
              />
            )}
          </div>
          <div className="mt-1 flex justify-between font-mono text-[9px] text-ink-3">
            <span>0.000</span>
            {featuredThreshold !== undefined && (
              <span className="text-accent">threshold {featuredThreshold.toFixed(3)}</span>
            )}
            <span>1.000</span>
          </div>
        </div>
      )}

      {run.failureSummary && (
        <div className="border-b border-line px-3 py-3">
          <div className="mb-1.5 font-mono text-[9px] tracking-[0.2em] text-ink-3 uppercase">
            why it failed
          </div>
          <p className="text-[12px] leading-relaxed text-ink-2">{run.failureSummary}</p>
        </div>
      )}

      <div className="border-b border-line px-3 py-3">
        <div className="mb-2 font-mono text-[9px] tracking-[0.2em] text-ink-3 uppercase">
          pinned · {run.citable ? 'citable' : 'not citable'}
        </div>
        <dl className="space-y-1">
          {pins.map(([k, v]) => (
            <div key={k} className="flex gap-3 font-mono text-[10px]">
              <dt className="w-[52px] shrink-0 text-ink-3">{k}</dt>
              <dd className={v ? 'text-ink-2' : 'text-ink-3/60'}>{v ?? '— unpinned'}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="px-3 py-3">
        <div className="mb-2 font-mono text-[9px] tracking-[0.2em] text-ink-3 uppercase">
          artifacts
        </div>
        <ul className="space-y-1">
          {run.artifacts.map((a) => (
            <li key={a.id} className="flex justify-between font-mono text-[10px]">
              <span className="text-info">{a.name}</span>
              <span className="tnum text-ink-3">{(a.sizeBytes / 1024).toFixed(0)} KB</span>
            </li>
          ))}
        </ul>
        {run.artifacts[1]?.preview && (
          <pre className="mt-3 max-h-[132px] overflow-auto border-l-2 border-line-strong bg-bg-deep p-2 font-mono text-[10px] leading-[1.55] whitespace-pre text-ink-2">
            {run.artifacts[1].preview}
          </pre>
        )}
      </div>
    </div>
  )
}

export default function InstrumentBoard() {
  const [selected, setSelected] = useState(attention[0]?.wo.id ?? '')

  return (
    <div className="min-h-screen bg-bg text-ink">
      {/* Top chrome */}
      <header className="flex h-11 items-center gap-4 border-b border-line px-4">
        <span className="font-mono text-[13px] tracking-[0.3em] text-accent uppercase">neon</span>
        <span className="font-mono text-[11px] text-ink-3">
          meridian <span className="text-line-strong">/</span> work board
        </span>
        <div className="ml-auto flex items-center gap-4 font-mono text-[10px] text-ink-3">
          <span>
            <span className="text-ink-2">{summary.runs24h}</span> runs 24h
          </span>
          <span>
            <span className="text-ink-2">{summary.envsClaimed}</span> env claimed
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="grid h-[18px] w-[18px] place-items-center text-[9px]"
              style={{ background: `${currentUser.accent}22`, color: currentUser.accent }}
            >
              {initials(currentUser.name)}
            </span>
            {currentUser.githubLogin}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 items-start lg:grid-cols-[1fr_minmax(316px,376px)]">
        <main className="min-w-0 border-r border-line">
          {/* Signal bar */}
          <div className="flex items-center gap-5 border-b border-line px-4 py-3">
            <Stat label="ready" value={summary.ready} tone="text-accent" />
            <Stat label="active" value={summary.inProgress} />
            <Stat label="review" value={summary.review} />
            <Stat label="blocked" value={summary.blocked} tone="text-warn" />
            <Stat label="failing" value={summary.failingChecks} tone="text-fail" />
            <Stat label="open prs" value={summary.openChanges} />
          </div>

          {/* The three-second answer */}
          <div className="border-b border-line bg-surface/60 px-4 py-3">
            <div className="mb-2 flex items-baseline gap-3">
              <span className="font-mono text-[10px] tracking-[0.22em] text-accent uppercase">
                pick up next
              </span>
              <span className="font-mono text-[10px] text-ink-3">
                ready, unclaimed, ordered by size of the completion definition
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {pickUpNext.map((r) => (
                <button
                  key={r.wo.id}
                  onClick={() => setSelected(r.wo.id)}
                  className="border border-line bg-bg p-3 text-left transition-colors hover:border-accent/60"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-accent">{r.wo.key}</span>
                    <span className="font-mono text-[10px] text-ink-3">
                      {r.progress.total} check{r.progress.total === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-ink-2">
                    {r.wo.title}
                  </div>
                  <div className="mt-2 font-mono text-[9px] text-ink-3">
                    {r.componentNames.slice(0, 3).join(' · ')}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Board */}
          <div className="pb-16">
            {(['in_progress', 'review', 'ready', 'blocked', 'draft', 'done', 'abandoned'] as const).map(
              (s) => (
                <Group key={s} state={s} selected={selected} onSelect={setSelected} />
              ),
            )}
          </div>
        </main>

        <aside className="space-y-4 p-4 lg:sticky lg:top-0">
          <Readout run={featuredRun} />

          <div className="border border-line">
            <div className="border-b border-line bg-surface-2 px-3 py-2 font-mono text-[10px] tracking-[0.22em] text-ink-2 uppercase">
              needs a human
            </div>
            {attention.map((r) => (
              <button
                key={r.wo.id}
                onClick={() => setSelected(r.wo.id)}
                className="flex w-full items-center gap-2 border-b border-line/60 px-3 py-2 text-left last:border-0 hover:bg-surface-2"
              >
                <span className={`h-3 w-[3px] ${r.failingCount ? 'bg-fail' : 'bg-warn'}`} />
                <span className="font-mono text-[10px] text-ink-3">{r.wo.key}</span>
                <span className="truncate text-[11px] text-ink-2">{r.wo.title}</span>
                <span className="ml-auto shrink-0 font-mono text-[10px] text-fail">
                  {r.failingCount > 0 ? `${r.failingCount} failing` : 'blocked'}
                </span>
              </button>
            ))}
          </div>

          <div className="border border-line">
            <div className="border-b border-line bg-surface-2 px-3 py-2 font-mono text-[10px] tracking-[0.22em] text-ink-2 uppercase">
              lab
            </div>
            {data.environments
              .filter((e) => e.state !== 'destroyed')
              .map((e) => {
                const expiring =
                  e.expiresAt && Date.parse(e.expiresAt) - Date.parse(data.now) < 3_600_000
                return (
                  <div
                    key={e.id}
                    className="flex items-center gap-2 border-b border-line/60 px-3 py-2 last:border-0"
                  >
                    <span
                      className={`h-[7px] w-[7px] ${
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
                        className={`tnum w-[52px] text-right font-mono text-[10px] ${
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

          <div className="px-1 font-mono text-[9px] leading-relaxed text-ink-3">
            board reflects {data.runs.length} runs · fixture pinned at {absolute(data.now)}
          </div>
        </aside>
      </div>
    </div>
  )
}
