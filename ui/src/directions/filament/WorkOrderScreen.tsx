import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  blockers,
  blocking,
  changesFor,
  componentIdsTouchedBy,
  constrainingDecisions,
  doneWhenProgress,
  environmentsForWorkOrder,
  getComponent,
  getRepo,
  getUser,
  runsFor,
  workOrderByKey,
} from '../../fixtures'
import type { Change, DoneWhenStatus, Run } from '../../fixtures'
import { initials, rel } from '../../lib/format'
import { useNav } from './nav'
import {
  Action,
  Chip,
  Chrome,
  Divide,
  Dot,
  Key,
  Label,
  Meta,
  Plate,
  Prose,
  Sep,
  StateWord,
  TONE,
} from './primitives'

/*
  Screen 2 — work order detail.

  This is the screen most likely to turn into a wall. The rule it follows:
  intent and the definition of done are always open, because they are why you
  came. Changes, constraints and run history are one line each until you ask
  for them.
*/

function Section({
  label,
  summary,
  children,
  open: initial = false,
}: {
  label: string
  summary: ReactNode
  children: ReactNode
  open?: boolean
}) {
  const [open, setOpen] = useState(initial)
  return (
    <section>
      <Divide>{label}</Divide>
      <button
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full items-center gap-3 text-left"
      >
        <span className="text-[14px] text-ink-2 transition-colors group-hover:text-ink">
          {summary}
        </span>
        <span className="text-[11px] text-ink-3 transition-colors group-hover:text-ink-2">
          {open ? '− hide' : '+ show'}
        </span>
      </button>
      {open && <div className="ignite mt-6">{children}</div>}
    </section>
  )
}

function DoneWhenRow({ r }: { r: DoneWhenStatus }) {
  const { go } = useNav()
  const bad = r.status === 'fail' || r.status === 'error'
  const good = r.status === 'pass' && r.meetsThreshold
  const tone = bad ? 'var(--color-fail)' : good ? 'var(--color-pass)' : r.status === 'pass' ? 'var(--color-warn)' : 'var(--color-idle)'
  return (
    <button
      onClick={() => r.run && go(['run', r.run.id])}
      disabled={!r.run}
      className="flex w-full items-start gap-4 rounded-card px-3 py-3 text-left transition-colors enabled:hover:bg-surface-2/50"
    >
      <span className="flex h-[20px] shrink-0 items-center">
        <span
          className={`h-[3px] w-9 rounded-full ${bad ? 'breathe' : ''}`}
          style={{
            background: tone,
            boxShadow: r.status === 'pending' ? undefined : `0 0 10px ${tone}`,
            opacity: r.status === 'pending' ? 0.3 : 1,
          }}
        />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-3">
          <span className="font-mono text-[12px] whitespace-nowrap text-ink">{r.check.name}</span>
          {r.thresholdNote && (
            <span className="tnum text-[12px] text-ink-3">{r.thresholdNote}</span>
          )}
        </span>
        {(r.check.requiresEnvironment || r.entry.threshold) && (
          <span className="mt-2 flex flex-wrap items-center gap-1.5">
            {r.check.requiresEnvironment && <Chip>needs an environment</Chip>}
            {r.entry.threshold?.minScore !== undefined && (
              <Chip tone="accent">≥ {r.entry.threshold.minScore.toFixed(2)}</Chip>
            )}
            {r.entry.threshold?.noRegressionVs && <Chip tone="accent">no regression</Chip>}
          </span>
        )}
      </span>

      <span
        className="w-[62px] shrink-0 self-start text-right text-[11px] tracking-[0.16em] uppercase"
        style={{ color: r.status === 'pending' ? 'var(--color-ink-3)' : tone }}
      >
        {r.status}
      </span>
      <span className="w-[58px] shrink-0 self-start text-right text-[11px] text-ink-3">
        {r.run ? `${rel(r.run.startedAt)} ago` : '—'}
      </span>
    </button>
  )
}

function ChangeRow({ c }: { c: Change }) {
  const repo = getRepo(c.repoId)
  return (
    <div className="rounded-card px-3 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-[12px] text-ink">{repo?.name}</span>
        <span className="font-mono text-[11px] text-ink-3">{c.branch}</span>
        {c.prNumber ? (
          <span className="font-mono text-[11px] text-accent-2">#{c.prNumber}</span>
        ) : (
          <span className="text-[11px] text-ink-3">no PR yet</span>
        )}
        <span className="ml-auto text-[11px] tracking-[0.16em] text-ink-3 uppercase">
          {c.state.replace('_', ' ')}
        </span>
      </div>
      {c.prTitle && <p className="mt-1.5 text-[13px] text-ink-2">{c.prTitle}</p>}
      {c.commits.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-l border-line pl-4">
          {c.commits.slice(-3).map((commit) => (
            <li key={commit.sha} className="flex items-baseline gap-3">
              <span className="font-mono text-[10px] text-ink-3">{commit.sha}</span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-ink-2">
                {commit.message}
              </span>
              <span className="text-[10px] text-ink-3">{rel(commit.at)} ago</span>
            </li>
          ))}
        </ul>
      )}
      {c.dependsOn.length > 0 && (
        <p className="mt-2.5 text-[11px] text-warn">lands behind {c.dependsOn.length} other change</p>
      )}
    </div>
  )
}

function RunRow({ run }: { run: Run }) {
  const { go } = useNav()
  return (
    <button
      onClick={() => go(['run', run.id])}
      className="flex w-full items-center gap-4 rounded-card px-3 py-2.5 text-left transition-colors hover:bg-surface-2/50"
    >
      <Dot color={TONE[run.result]} lit={run.result !== 'pass'} />
      <span className="w-[168px] shrink-0 truncate font-mono text-[11px] text-ink-2">
        {run.checkId.replace(/^ck_[a-z]+_/, '')}
      </span>
      <span className="tnum w-[62px] shrink-0 text-[12px] text-ink-2">
        {run.score !== undefined ? run.score.toFixed(3) : ''}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3">
        {run.failureSummary ?? run.artifactVersion ?? ''}
      </span>
      <span className="shrink-0 text-[11px] text-ink-3">{run.trigger}</span>
      <span className="w-[52px] shrink-0 text-right text-[11px] text-ink-3">
        {rel(run.startedAt)} ago
      </span>
    </button>
  )
}

export default function WorkOrderScreen({ woKey }: { woKey: string }) {
  const { go } = useNav()
  const wo = workOrderByKey(woKey)

  if (!wo) {
    return (
      <div className="flex min-h-screen flex-col">
        <Chrome />
        <div className="grid flex-1 place-items-center">
          <p className="text-[14px] text-ink-3">No work order {woKey}.</p>
        </div>
      </div>
    )
  }

  const progress = doneWhenProgress(wo)
  const changes = changesFor(wo.id)
  const runs = runsFor(wo.id)
  const decisions = constrainingDecisions(wo)
  const components = componentIdsTouchedBy(wo)
  const envs = environmentsForWorkOrder(wo.id)
  const blockedBy = blockers(wo)
  const isBlocking = blocking(wo)
  const assignee = getUser(wo.assignedTo)
  const repos = Array.from(new Set(changes.map((c) => getRepo(c.repoId)?.name))).filter(Boolean)

  return (
    <div className="flex min-h-screen flex-col">
      <Chrome trail={[wo.key]} />

      <main className="mx-auto w-full max-w-[760px] px-8 pt-16 pb-32">
        <div className="ignite">
          <div className="flex flex-wrap items-center gap-3">
            <Key>{wo.key}</Key>
            <StateWord state={wo.state} />
            {progress.failing > 0 && (
              <span className="breathe text-[11px] tracking-[0.18em] text-fail uppercase">
                {progress.failing} failing
              </span>
            )}
          </div>

          <h1 className="mt-4 text-[34px] leading-[1.15] font-medium tracking-[-0.02em] text-ink">
            {wo.title}
          </h1>

          {blockedBy.length > 0 && (
            <div className="mt-6 flex items-start gap-3 rounded-card border border-warn/25 bg-warn/[0.06] px-4 py-3">
              <span className="mt-1.5">
                <Dot color="var(--color-warn)" />
              </span>
              <p className="text-[13px] leading-relaxed text-ink-2">
                Blocked by{' '}
                {blockedBy.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => go(['wo', b.key])}
                    className="text-warn underline-offset-4 hover:underline"
                  >
                    {b.key} — {b.title}
                  </button>
                ))}
              </p>
            </div>
          )}

          {/* The why. The reason this screen exists. */}
          <Prose className="mt-8 text-[16px]">{wo.intent}</Prose>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Action primary>
              {wo.state === 'ready' ? 'Claim and start' : wo.state === 'draft' ? 'Define done' : 'Open in agent'}
            </Action>
            <Action>Copy context pack</Action>
          </div>

          <div className="mt-8">
            <Meta>
              {assignee ? (
                <>
                  <span
                    className="grid h-[22px] w-[22px] place-items-center rounded-full text-[9px] font-medium"
                    style={{ background: `${assignee.accent}26`, color: assignee.accent }}
                  >
                    {initials(assignee.name)}
                  </span>
                  <span>{assignee.name}</span>
                </>
              ) : (
                <span className="text-accent-2">unclaimed</span>
              )}
              <Sep />
              <span>opened by {getUser(wo.createdBy)?.short}</span>
              <Sep />
              <span>{rel(wo.createdAt)} old</span>
              <Sep />
              <span>updated {rel(wo.updatedAt)} ago</span>
            </Meta>
          </div>
        </div>

        {/* ── What "done" means ─────────────────────────────────────────── */}
        <Divide>what done means</Divide>

        {progress.total === 0 ? (
          <Plate className="p-6">
            <p className="text-[14px] leading-relaxed text-ink-2">
              This work order has no <span className="font-mono text-[13px]">done_when</span>. It
              cannot leave draft until it has one — an agent would have nothing to satisfy and no
              way to know it had finished.
            </p>
            <div className="mt-5">
              <Action primary>Add the first check</Action>
            </div>
          </Plate>
        ) : (
          <Plate lit={progress.failing > 0} tone={progress.failing > 0 ? 'fail' : 'pass'} className="p-3">
            {progress.rows.map((r, i) => (
              <DoneWhenRow key={i} r={r} />
            ))}
          </Plate>
        )}

        {wo.acceptanceCriteria.length > 0 && (
          <div className="mt-10">
            <Label>in plain language</Label>
            <ul className="mt-4 space-y-3">
              {wo.acceptanceCriteria.map((c, i) => (
                <li key={i} className="flex gap-3.5">
                  <span className="flex h-[24px] shrink-0 items-center">
                    <Dot color="var(--color-ink-3)" lit={false} size={4} />
                  </span>
                  <span className="max-w-[62ch] text-[14px] leading-[1.6] text-ink-2">{c}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Everything else, one line until asked ─────────────────────── */}
        <Section
          label="changes"
          summary={
            changes.length
              ? `${changes.length} changes across ${repos.length} ${repos.length === 1 ? 'repo' : 'repos'} — ${repos.join(', ')}`
              : 'No changes yet'
          }
        >
          <div className="space-y-2">
            {changes.map((c) => (
              <ChangeRow key={c.id} c={c} />
            ))}
          </div>
        </Section>

        <Section
          label="what constrains this"
          summary={
            decisions.length
              ? `${decisions.length} decisions constrain the components this touches${
                  decisions.some((d) => d.state === 'contested') ? ' — one is contested' : ''
                }`
              : 'Nothing recorded constrains these components'
          }
        >
          <div className="space-y-1">
            {decisions.map((d) => (
              <button
                key={d.id}
                onClick={() => go(['decisions', d.key])}
                className="flex w-full items-center gap-4 rounded-card px-3 py-3 text-left transition-colors hover:bg-surface-2/50"
              >
                <Dot
                  color={
                    d.state === 'contested'
                      ? 'var(--color-contested)'
                      : d.state === 'proposed'
                        ? 'var(--color-accent-2)'
                        : 'var(--color-pass)'
                  }
                  lit={d.state !== 'superseded'}
                />
                <span className="w-[62px] shrink-0 font-mono text-[11px] text-ink-3">{d.key}</span>
                <span className="min-w-0 flex-1 text-[13px] leading-snug text-ink-2">{d.title}</span>
                <span className="shrink-0 text-[11px] tracking-[0.16em] text-ink-3 uppercase">
                  {d.state}
                </span>
              </button>
            ))}
          </div>
        </Section>

        <Section
          label="evidence"
          summary={
            runs.length
              ? `${runs.length} run${runs.length === 1 ? '' : 's'}, last ${rel(runs[0]!.startedAt)} ago`
              : 'Nothing has run against this yet'
          }
        >
          <div className="space-y-0.5">
            {runs.slice(0, 12).map((r) => (
              <RunRow key={r.id} run={r} />
            ))}
            {runs.length > 12 && (
              <p className="px-3 pt-3 text-[11px] text-ink-3">
                {runs.length - 12} older runs not shown
              </p>
            )}
          </div>
        </Section>

        <Section
          label="surface"
          summary={`${components.length} components declared${
            envs.length ? `, ${envs.length} environment${envs.length === 1 ? '' : 's'} claimed` : ''
          }`}
        >
          <div className="flex flex-wrap gap-2">
            {components.map((id) => (
              <Chip key={id}>{getComponent(id)?.name}</Chip>
            ))}
          </div>
          {envs.length > 0 && (
            <div className="mt-5 space-y-1">
              {envs.map((e) => (
                <div key={e.id} className="flex items-center gap-3 px-3 py-2">
                  <Dot
                    color={e.state === 'in_use' ? 'var(--color-pass)' : 'var(--color-info)'}
                    lit={e.state !== 'destroyed'}
                  />
                  <span className="font-mono text-[11px] text-ink-2">{e.name}</span>
                  <span className="text-[11px] text-ink-3">{e.topology}</span>
                  {e.expiresAt && (
                    <span className="ml-auto text-[11px] text-warn">expires {rel(e.expiresAt)}</span>
                  )}
                </div>
              ))}
            </div>
          )}
          {isBlocking.length > 0 && (
            <p className="mt-5 px-3 text-[12px] text-ink-3">
              Blocking {isBlocking.map((b) => b.key).join(', ')}.
            </p>
          )}
        </Section>
      </main>
    </div>
  )
}
