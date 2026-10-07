import { useState } from 'react'
import {
  data,
  durationMs,
  getCheck,
  getEnvironment,
  getRun,
  getUser,
  runsFor,
} from '../../fixtures'
import { absolute, bytes, duration, rel, signed } from '../../lib/format'
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
  ScoreRing,
  Sep,
  TONE,
} from './primitives'

/*
  Screen 3 — a single run.

  A run is the most valuable object in the system, so it gets the light. The
  test for this screen is whether a failure is diagnosable without leaving it,
  which is why the artifact preview is inline and the provenance is stated as
  the reason the run can or cannot be cited.
*/

export default function RunScreen({ runId }: { runId: string }) {
  const { go } = useNav()
  const run = getRun(runId)
  const [artifactId, setArtifactId] = useState<string | null>(null)

  if (!run) {
    return (
      <div className="flex min-h-screen flex-col">
        <Chrome />
        <div className="grid flex-1 place-items-center">
          <p className="text-[14px] text-ink-3">No run {runId}.</p>
        </div>
      </div>
    )
  }

  const check = getCheck(run.checkId)!
  const wo = data.workOrders.find((w) => w.id === run.workOrderId)
  const change = data.changes.find((c) => c.id === run.changeId)
  const env = getEnvironment(run.environmentId)
  const baseline = run.baselineRunId ? getRun(run.baselineRunId) : undefined
  const threshold = wo?.doneWhen.find((d) => d.checkId === run.checkId)?.threshold?.minScore
  const failed = run.result !== 'pass'
  const artifact = run.artifacts.find((a) => a.id === artifactId) ?? run.artifacts[0]
  const siblings = wo ? runsFor(wo.id).filter((r) => r.checkId === run.checkId && r.id !== run.id) : []

  /* Provenance is not decoration: `citable` is derived from exactly these. */
  const pins: { k: string; v?: string; required: boolean }[] = [
    { k: 'artifact', v: run.artifactVersion, required: true },
    { k: 'config commit', v: run.configCommit, required: true },
    { k: 'fixture', v: run.fixtureVersion, required: check.requiresFixture },
    { k: 'params hash', v: run.paramsHash, required: true },
    { k: 'environment', v: env?.name, required: check.requiresEnvironment },
  ]

  return (
    <div className="flex min-h-screen flex-col">
      <Chrome trail={[wo?.key ?? 'run', check.name]} />

      <main className="mx-auto w-full max-w-[820px] px-8 pt-16 pb-32">
        <div className="ignite">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[13px] text-ink">{check.name}</span>
            <span
              className="text-[11px] tracking-[0.2em] uppercase"
              style={{ color: TONE[run.result] }}
            >
              {run.result}
            </span>
            <span className="text-[11px] text-ink-3">{check.kind}</span>
          </div>

          {wo && (
            <button
              onClick={() => go(['wo', wo.key])}
              className="mt-4 block max-w-[62ch] text-left text-[22px] leading-[1.25] font-medium tracking-[-0.01em] text-ink transition-colors hover:text-white"
            >
              <Key>{wo.key}</Key>
              <span className="mt-1 block">{wo.title}</span>
            </button>
          )}

          <div className="mt-5">
            <Meta>
              <span>{run.trigger}</span>
              {run.triggeredBy && (
                <>
                  <Sep />
                  <span>{getUser(run.triggeredBy)?.name}</span>
                </>
              )}
              <Sep />
              <span>{duration(durationMs(run))}</span>
              <Sep />
              <span title={absolute(run.startedAt)}>{rel(run.startedAt)} ago</span>
              {change && (
                <>
                  <Sep />
                  <span className="font-mono">{change.branch}</span>
                </>
              )}
            </Meta>
          </div>
        </div>

        {/* ── The verdict ───────────────────────────────────────────────── */}
        <div className="mt-12">
          <Plate lit tone={failed ? 'fail' : 'pass'} className="p-8">
            {run.score !== undefined ? (
              <div className="flex flex-wrap items-center gap-8">
                <ScoreRing
                  score={run.score}
                  threshold={threshold}
                  tone={failed ? 'fail' : 'pass'}
                  size={132}
                />
                <div className="min-w-[260px] flex-1">
                  {run.delta !== undefined && baseline && (
                    <div className="tnum text-[16px]" style={{ color: TONE[run.result] }}>
                      {signed(run.delta)} against baseline {baseline.score?.toFixed(3)}
                    </div>
                  )}
                  {threshold !== undefined && (
                    <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
                      {run.score >= threshold ? 'Clears' : `${(threshold - run.score).toFixed(3)} short of`}{' '}
                      the <span className="text-accent-2">{threshold.toFixed(2)}</span> this work
                      order asked for.
                    </p>
                  )}
                  <p className="mt-4 text-[12px] text-ink-3">
                    The cyan tick on the ring is the threshold, not a target.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-5">
                <Dot color={TONE[run.result]} size={12} />
                <div>
                  <div
                    className="text-[20px] font-medium"
                    style={{ color: TONE[run.result] }}
                  >
                    {run.result === 'pass' ? 'Passed' : run.result === 'fail' ? 'Failed' : 'Errored'}
                  </div>
                  <p className="mt-1 text-[13px] text-ink-3">
                    {check.name} is not a scored check — it is a verdict.
                  </p>
                </div>
              </div>
            )}

            {run.failureSummary && (
              <Prose className="mt-8 border-t border-line pt-7">{run.failureSummary}</Prose>
            )}
          </Plate>
        </div>

        {/* ── Provenance ────────────────────────────────────────────────── */}
        <Divide>what this run was pinned to</Divide>

        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-card bg-line sm:grid-cols-2">
          {pins.map((p) => (
            <div key={p.k} className="bg-surface/70 px-4 py-3">
              <div className="text-[10px] tracking-[0.18em] text-ink-3 uppercase">{p.k}</div>
              <div
                className={`mt-1 font-mono text-[12px] ${
                  p.v ? 'text-ink-2' : p.required ? 'text-fail' : 'text-ink-3/50'
                }`}
              >
                {p.v ?? (p.required ? 'unpinned — required' : 'not required')}
              </div>
            </div>
          ))}
          <div className="bg-surface/70 px-4 py-3">
            <div className="text-[10px] tracking-[0.18em] text-ink-3 uppercase">citable</div>
            <div
              className={`mt-1 flex items-center gap-2 font-mono text-[12px] ${
                run.citable ? 'text-pass' : 'text-fail'
              }`}
            >
              <Dot color={run.citable ? 'var(--color-pass)' : 'var(--color-fail)'} size={5} />
              {run.citable ? 'yes' : 'no'}
            </div>
          </div>
        </div>

        <p className="mt-4 max-w-[62ch] text-[13px] leading-relaxed text-ink-3">
          {run.citable
            ? 'Everything this check requires is pinned, so this run can be attached to a decision as evidence.'
            : 'Something this check requires was not pinned, so this run cannot be attached to a decision. Re-run it against a versioned fixture to make it citable.'}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Action primary={run.citable}>
            {run.citable ? 'Cite on a decision' : 'Re-run pinned'}
          </Action>
          {baseline && (
            <Action onClick={() => go(['run', baseline.id])}>Open the baseline run →</Action>
          )}
        </div>

        {/* ── Artifacts ─────────────────────────────────────────────────── */}
        {run.artifacts.length > 0 && (
          <>
            <Divide>artifacts</Divide>

            <div className="flex flex-wrap gap-2">
              {run.artifacts.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setArtifactId(a.id)}
                  className={`rounded-chip border px-3 py-1.5 font-mono text-[11px] transition-colors ${
                    a.id === artifact?.id
                      ? 'border-accent-2/45 bg-accent-2/10 text-accent-2'
                      : 'border-line text-ink-3 hover:text-ink-2'
                  }`}
                >
                  {a.name}
                  <span className="ml-2 text-ink-3">{bytes(a.sizeBytes)}</span>
                </button>
              ))}
            </div>

            {artifact && (
              <div className="mt-5">
                {artifact.preview ? (
                  <pre className="overflow-x-auto rounded-card border border-line bg-bg-deep/70 p-5 font-mono text-[11.5px] leading-[1.7] whitespace-pre text-ink-2">
                    {artifact.preview}
                  </pre>
                ) : (
                  <div className="rounded-card border border-line bg-bg-deep/40 px-5 py-8 text-center">
                    <p className="text-[13px] text-ink-3">
                      {bytes(artifact.sizeBytes)} — too large to inline.
                    </p>
                    <div className="mt-4">
                      <Action>Download {artifact.name}</Action>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── The same check, over time ─────────────────────────────────── */}
        {siblings.length > 0 && (
          <>
            <Divide>the same check on this work order</Divide>
            <div className="space-y-0.5">
              {siblings.slice(0, 6).map((r) => (
                <button
                  key={r.id}
                  onClick={() => go(['run', r.id])}
                  className="flex w-full items-center gap-4 rounded-card px-3 py-2.5 text-left transition-colors hover:bg-surface-2/50"
                >
                  <Dot color={TONE[r.result]} lit={r.result !== 'pass'} />
                  <span className="tnum w-[62px] shrink-0 text-[12px] text-ink-2">
                    {r.score !== undefined ? r.score.toFixed(3) : '—'}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-3">
                    {r.artifactVersion}
                  </span>
                  {r.delta !== undefined && (
                    <span
                      className="tnum shrink-0 text-[11px]"
                      style={{ color: r.delta >= 0 ? 'var(--color-pass)' : 'var(--color-fail)' }}
                    >
                      {signed(r.delta)}
                    </span>
                  )}
                  <span className="w-[52px] shrink-0 text-right text-[11px] text-ink-3">
                    {rel(r.startedAt)} ago
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="mt-16">
          <Label>run id</Label>
          <div className="mt-2 flex items-center gap-3">
            <Chip>{run.id}</Chip>
            <span className="text-[11px] text-ink-3">quote this in a PR body or a decision</span>
          </div>
        </div>
      </main>
    </div>
  )
}
