import { useMemo, useState } from 'react'
import {
  data,
  decisionByKey,
  evidenceRuns,
  getComponent,
  getDecision,
  getUser,
} from '../../fixtures'
import type { Decision, DecisionState } from '../../fixtures'
import { initials, rel, signed } from '../../lib/format'
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
  TONE,
} from './primitives'

/*
  Screen 4 — the decision log.

  Two things this screen has to get right. Rejected alternatives are the part
  people skip and the part that matters in a year, so they are set at the same
  size as the rationale, not tucked into a footnote. And a contested decision
  has to look unsettled from across the room — two lights instead of one, and
  the settling condition given as the actionable object.
*/

const STATE_LIGHT: Record<DecisionState, string> = {
  accepted: 'var(--color-pass)',
  proposed: 'var(--color-accent-2)',
  contested: 'var(--color-contested)',
  superseded: 'var(--color-idle)',
}

/** Accepted burns as one steady light. Contested burns as two, out of phase. */
function Lamp({ state }: { state: DecisionState }) {
  if (state === 'contested') {
    return (
      <span className="flex shrink-0 items-center gap-[3px]">
        <span className="breathe">
          <Dot color="var(--color-contested)" size={6} />
        </span>
        <span className="breathe" style={{ animationDelay: '1.6s' }}>
          <Dot color="var(--color-contested)" size={6} />
        </span>
      </span>
    )
  }
  if (state === 'superseded') {
    return (
      <span className="relative flex h-[6px] w-[15px] shrink-0 items-center">
        <Dot color="var(--color-idle)" lit={false} size={6} />
        <span className="absolute inset-x-0 top-1/2 h-px bg-idle" />
      </span>
    )
  }
  return (
    <span className="flex w-[15px] shrink-0">
      <Dot color={STATE_LIGHT[state]} size={6} />
    </span>
  )
}

// ── Detail ───────────────────────────────────────────────────────────────

function DecisionDetail({ d }: { d: Decision }) {
  const { go } = useNav()
  const runs = evidenceRuns(d)
  const supersededBy = d.supersededBy ? getDecision(d.supersededBy) : undefined
  const replaces = data.decisions.find((x) => x.supersededBy === d.id)

  return (
    <main className="mx-auto w-full max-w-[760px] px-8 pt-16 pb-32">
      <div className="ignite">
        <div className="flex flex-wrap items-center gap-3">
          <Key>{d.key}</Key>
          <span
            className="text-[11px] tracking-[0.18em] uppercase"
            style={{ color: STATE_LIGHT[d.state] }}
          >
            {d.state}
          </span>
          <Lamp state={d.state} />
        </div>

        <h1 className="mt-4 text-[32px] leading-[1.18] font-medium tracking-[-0.02em] text-ink">
          {d.title}
        </h1>

        {supersededBy && (
          <p className="mt-5 text-[13px] text-ink-3">
            Superseded by{' '}
            <button
              onClick={() => go(['decisions', supersededBy.key])}
              className="text-accent-2 underline-offset-4 hover:underline"
            >
              {supersededBy.key} — {supersededBy.title}
            </button>
          </p>
        )}

        <div className="mt-6">
          <Meta>
            <span
              className="grid h-[22px] w-[22px] place-items-center rounded-full text-[9px] font-medium"
              style={{
                background: `${getUser(d.authorId)?.accent}26`,
                color: getUser(d.authorId)?.accent,
              }}
            >
              {initials(getUser(d.authorId)?.name ?? '')}
            </span>
            <span>{getUser(d.authorId)?.name}</span>
            <Sep />
            <span>{rel(d.decidedAt)} ago</span>
            <Sep />
            <span>
              {d.componentIds.length} component{d.componentIds.length === 1 ? '' : 's'} constrained
            </span>
          </Meta>
        </div>

        <Prose className="mt-9 text-[16px]">{d.rationale}</Prose>
      </div>

      {/* The part people skip. Same weight as the rationale, deliberately. */}
      <Divide>what we rejected</Divide>

      <div className="space-y-8">
        {d.rejectedAlternatives.map((alt, i) => (
          <div key={i} className="border-l border-line pl-6">
            <h3 className="text-[17px] leading-snug font-medium text-ink-2">{alt.title}</h3>
            <Prose className="mt-2.5">{alt.why}</Prose>
          </div>
        ))}
        {d.rejectedAlternatives.length === 0 && (
          <p className="text-[14px] text-ink-3">
            No alternatives recorded. That usually means the decision was never really made.
          </p>
        )}
      </div>

      {/* Contested: both positions, and the thing that would end the argument. */}
      {d.state === 'contested' && (
        <>
          <Divide>unsettled</Divide>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {d.positions?.map((p) => {
              const holder = getUser(p.holder)
              return (
                <div
                  key={p.holder}
                  className="rounded-card border border-contested/25 bg-contested/[0.05] p-5"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="grid h-[22px] w-[22px] place-items-center rounded-full text-[9px] font-medium"
                      style={{ background: `${holder?.accent}26`, color: holder?.accent }}
                    >
                      {initials(holder?.name ?? '')}
                    </span>
                    <span className="text-[12px] text-ink-2">{holder?.name}</span>
                  </div>
                  <p className="mt-3.5 text-[14px] leading-[1.6] text-ink-2">{p.summary}</p>
                </div>
              )
            })}
          </div>

          {d.settlingCondition && (
            <div className="mt-5">
              <Plate lit className="p-6">
                <Label>what would settle it</Label>
                <Prose className="mt-3.5 text-[15px]">{d.settlingCondition}</Prose>
                <div className="mt-6">
                  <Action primary>Open a work order for this</Action>
                </div>
              </Plate>
            </div>
          )}
        </>
      )}

      {/* Evidence */}
      <Divide>evidence</Divide>

      {runs.length ? (
        <div className="space-y-0.5">
          {runs.map((r) => (
            <button
              key={r.id}
              onClick={() => go(['run', r.id])}
              className="flex w-full items-center gap-4 rounded-card px-3 py-3 text-left transition-colors hover:bg-surface-2/50"
            >
              <Dot color={TONE[r.result]} lit={r.result !== 'pass'} />
              <span className="w-[170px] shrink-0 truncate font-mono text-[11px] text-ink-2">
                {r.checkId.replace(/^ck_[a-z]+_/, '')}
              </span>
              <span className="tnum w-[62px] shrink-0 text-[12px] text-ink-2">
                {r.score !== undefined ? r.score.toFixed(3) : '—'}
              </span>
              {r.delta !== undefined && (
                <span
                  className="tnum shrink-0 text-[11px]"
                  style={{ color: r.delta >= 0 ? 'var(--color-pass)' : 'var(--color-fail)' }}
                >
                  {signed(r.delta)}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-3">
                {r.artifactVersion} · {r.fixtureVersion ?? 'no fixture'}
              </span>
              <span className="w-[52px] shrink-0 text-right text-[11px] text-ink-3">
                {rel(r.startedAt)} ago
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="max-w-[62ch] text-[14px] leading-relaxed text-ink-3">
          Nothing measured is attached to this decision. That is allowed — not every choice needs a
          run behind it — but it means the next person has only the argument.
        </p>
      )}

      {/* Surface */}
      <Divide>constrains</Divide>
      <div className="flex flex-wrap gap-2">
        {d.componentIds.map((id) => (
          <Chip key={id}>{getComponent(id)?.name}</Chip>
        ))}
      </div>

      {(d.workOrderIds.length > 0 || replaces) && (
        <div className="mt-8 space-y-2">
          {d.workOrderIds.map((id) => {
            const wo = data.workOrders.find((w) => w.id === id)
            if (!wo) return null
            return (
              <button
                key={id}
                onClick={() => go(['wo', wo.key])}
                className="block text-left text-[13px] text-ink-3 transition-colors hover:text-ink-2"
              >
                came out of {wo.key} — {wo.title}
              </button>
            )
          })}
          {replaces && (
            <button
              onClick={() => go(['decisions', replaces.key])}
              className="block text-left text-[13px] text-ink-3 transition-colors hover:text-ink-2"
            >
              replaces {replaces.key} — {replaces.title}
            </button>
          )}
        </div>
      )}
    </main>
  )
}

// ── Log ──────────────────────────────────────────────────────────────────

const STATES: (DecisionState | 'all')[] = ['all', 'contested', 'proposed', 'accepted', 'superseded']

function Log() {
  const { go } = useNav()
  const [state, setState] = useState<DecisionState | 'all'>('all')
  const [componentId, setComponentId] = useState<string | null>(null)

  const list = useMemo(
    () =>
      data.decisions
        .filter((d) => (state === 'all' ? true : d.state === state))
        .filter((d) => (componentId ? d.componentIds.includes(componentId) : true))
        .sort((a, b) => {
          // Unsettled first — it is the only thing on this screen that is work.
          const rank = (d: Decision) =>
            d.state === 'contested' ? 0 : d.state === 'proposed' ? 1 : d.state === 'accepted' ? 2 : 3
          return rank(a) - rank(b) || Date.parse(b.decidedAt) - Date.parse(a.decidedAt)
        }),
    [state, componentId],
  )

  const contested = data.decisions.filter((d) => d.state === 'contested').length
  // Only components something has actually been decided about.
  const constrained = data.components.filter((c) =>
    data.decisions.some((d) => d.componentIds.includes(c.id)),
  )

  return (
    <main className="mx-auto w-full max-w-[860px] px-8 pt-16 pb-32">
      <div className="ignite">
        <h1 className="text-[32px] leading-tight font-medium tracking-[-0.02em] text-ink">
          Decisions
        </h1>
        <p className="mt-3 text-[14px] text-ink-2">
          {data.decisions.length} recorded.{' '}
          <span className="text-contested">{contested} still contested</span> — those are the ones
          that are actually work.
        </p>
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-1.5">
        {STATES.map((s) => (
          <button
            key={s}
            onClick={() => setState(s)}
            className={`rounded-chip border px-3 py-1.5 text-[12px] transition-colors ${
              s === state
                ? 'border-accent/45 bg-accent/12 text-ink'
                : 'border-line text-ink-3 hover:text-ink-2'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] tracking-[0.18em] text-ink-3 uppercase">component</span>
        <button
          onClick={() => setComponentId(null)}
          className={`rounded-chip border px-2.5 py-1 font-mono text-[10px] transition-colors ${
            componentId === null
              ? 'border-accent-2/45 text-accent-2'
              : 'border-line text-ink-3 hover:text-ink-2'
          }`}
        >
          any
        </button>
        {constrained.map((c) => (
          <button
            key={c.id}
            onClick={() => setComponentId(c.id === componentId ? null : c.id)}
            className={`rounded-chip border px-2.5 py-1 font-mono text-[10px] transition-colors ${
              componentId === c.id
                ? 'border-accent-2/45 text-accent-2'
                : 'border-line text-ink-3 hover:text-ink-2'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="mt-10 space-y-1">
        {list.map((d) => (
          <button
            key={d.id}
            onClick={() => go(['decisions', d.key])}
            className={`block w-full rounded-card px-4 py-4 text-left transition-colors hover:bg-surface-2/50 ${
              d.state === 'contested'
                ? 'border-l-2 border-contested bg-contested/[0.04]'
                : d.state === 'superseded'
                  ? 'opacity-55'
                  : ''
            }`}
          >
            <div className="flex items-start gap-4">
              <span className="mt-1.5">
                <Lamp state={d.state} />
              </span>
              <span className="w-[58px] shrink-0 pt-0.5 font-mono text-[11px] text-ink-3">
                {d.key}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-[15px] leading-snug ${
                    d.state === 'superseded' ? 'text-ink-3' : 'text-ink-2'
                  }`}
                >
                  {d.title}
                </span>
                {d.state === 'contested' && d.settlingCondition && (
                  <span className="mt-2 block max-w-[68ch] text-[12.5px] leading-relaxed text-contested/85">
                    Settles when: {d.settlingCondition.split('.')[0]}.
                  </span>
                )}
                <span className="mt-2 flex flex-wrap items-center gap-2">
                  {d.componentIds.slice(0, 3).map((id) => (
                    <span key={id} className="font-mono text-[10px] text-ink-3">
                      {getComponent(id)?.name}
                    </span>
                  ))}
                  {d.evidenceRunIds.length > 0 && (
                    <span className="text-[10px] text-ink-3">
                      · {d.evidenceRunIds.length} run{d.evidenceRunIds.length === 1 ? '' : 's'}{' '}
                      attached
                    </span>
                  )}
                  {d.rejectedAlternatives.length > 0 && (
                    <span className="text-[10px] text-ink-3">
                      · {d.rejectedAlternatives.length} alternative
                      {d.rejectedAlternatives.length === 1 ? '' : 's'} rejected
                    </span>
                  )}
                </span>
              </span>
              <span className="w-[80px] shrink-0 pt-0.5 text-right text-[11px] text-ink-3">
                {rel(d.decidedAt)} ago
              </span>
            </div>
          </button>
        ))}
        {list.length === 0 && (
          <p className="px-4 py-8 text-[14px] text-ink-3">Nothing recorded under that filter.</p>
        )}
      </div>
    </main>
  )
}

export default function DecisionLog({ decisionKey }: { decisionKey?: string }) {
  const d = decisionKey ? decisionByKey(decisionKey) : undefined

  return (
    <div className="flex min-h-screen flex-col">
      <Chrome trail={d ? ['decisions', d.key] : ['decisions']} />
      {d ? <DecisionDetail d={d} /> : <Log />}
    </div>
  )
}
