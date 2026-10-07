import {
  contractsFor,
  data,
  decisionsForComponent,
  getComponent,
  getRepo,
  getUser,
  openQuestionsForComponent,
  workOrdersForComponent,
} from '../../fixtures'
import type { Component } from '../../fixtures'
import { rel } from '../../lib/format'
import { useNav } from './nav'
import { Chip, Chrome, Divide, Dot, Key, Label, Plate, Prose } from './primitives'

/*
  Screen 6 — a component.

  A component is a junction: contracts arrive from the left, contracts leave to
  the right, and decisions are the constraints wired to it. The diagram is the
  screen's answer to "what will I break", which is the only question anyone
  arrives here with.
*/

const STATE_LIGHT: Record<string, string> = {
  accepted: 'var(--color-pass)',
  proposed: 'var(--color-accent-2)',
  contested: 'var(--color-contested)',
  superseded: 'var(--color-idle)',
}

function Junction({ c }: { c: Component }) {
  const { go } = useNav()
  const all = contractsFor(c.id)
  const consumed = all.filter((x) => x.publisherComponentId !== c.id)
  const published = all.filter((x) => x.publisherComponentId === c.id)

  /** A lit lead running into or out of the node, with the spark at the node end. */
  const Wire = ({ side }: { side: 'in' | 'out' }) => {
    const color = side === 'in' ? 'var(--color-accent-2)' : 'var(--color-accent)'
    const spark = (
      <span
        className="h-[3px] w-[3px] shrink-0 rounded-full"
        style={{ background: color, boxShadow: `0 0 6px ${color}` }}
      />
    )
    return (
      <span aria-hidden className="flex shrink-0 items-center px-3">
        {side === 'out' && spark}
        <span
          className="h-px w-7"
          style={{
            background:
              side === 'in'
                ? `linear-gradient(to right, transparent, ${color})`
                : `linear-gradient(to right, ${color}, transparent)`,
            boxShadow: `0 0 6px ${color}`,
          }}
        />
        {side === 'in' && spark}
      </span>
    )
  }

  return (
    <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[1fr_auto_1fr]">
      {/* consumed */}
      <div className="space-y-3 lg:text-right">
        <Label>consumes</Label>
        {consumed.length === 0 && <p className="text-[12.5px] text-ink-3">nothing</p>}
        {consumed.map((x) => (
          <div key={x.id} className="flex items-center gap-0 lg:justify-end">
            <span className="min-w-0">
              <span className="block truncate font-mono text-[11.5px] text-ink-2">
                {x.name} <span className="text-accent-2">{x.version}</span>
              </span>
              <span className="block truncate text-[11px] text-ink-3">
                from {getComponent(x.publisherComponentId)?.name}
              </span>
            </span>
            <span className="hidden lg:block">
              <Wire side="in" />
            </span>
          </div>
        ))}
      </div>

      {/* the component */}
      <Plate lit className="px-7 py-6 text-center">
        <div className="font-mono text-[14px] text-ink">{c.name}</div>
        <div className="mt-1.5 text-[11px] text-ink-3">{getRepo(c.repoId)?.name}</div>
        <div className="mt-4 flex justify-center gap-1.5">
          {c.pathGlobs.map((g) => (
            <Chip key={g}>{g}</Chip>
          ))}
        </div>
      </Plate>

      {/* published */}
      <div className="space-y-3">
        <Label>publishes</Label>
        {published.length === 0 && <p className="text-[12.5px] text-ink-3">nothing</p>}
        {published.map((x) => (
          <div key={x.id} className="flex items-center">
            <span className="hidden lg:block">
              <Wire side="out" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-mono text-[11.5px] text-ink-2">
                {x.name} <span className="text-accent-2">{x.version}</span>
              </span>
              <button
                onClick={() =>
                  x.consumerComponentIds[0] && go(['components', getComponent(x.consumerComponentIds[0])!.name])
                }
                className="block truncate text-left text-[11px] text-ink-3 transition-colors hover:text-ink-2"
              >
                {x.consumerComponentIds.length} consumer
                {x.consumerComponentIds.length === 1 ? '' : 's'}
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Detail({ c }: { c: Component }) {
  const { go } = useNav()
  const decisions = decisionsForComponent(c.id)
  const questions = openQuestionsForComponent(c.id)
  const orders = workOrdersForComponent(c.id)
  const contested = decisions.filter((d) => d.state === 'contested')

  return (
    <main className="mx-auto w-full max-w-[880px] px-8 pt-16 pb-32">
      <div className="ignite">
        <div className="flex flex-wrap items-center gap-3">
          <Key>{getRepo(c.repoId)?.name}</Key>
          <span className="text-[11px] tracking-[0.18em] text-ink-3 uppercase">component</span>
        </div>
        <h1 className="mt-4 font-mono text-[28px] leading-tight font-medium tracking-[-0.01em] text-ink">
          {c.name}
        </h1>
        <Prose className="mt-5 text-[16px]">{c.description}</Prose>
      </div>

      <Divide>what it is wired to</Divide>
      <Junction c={c} />

      <Divide>what constrains it</Divide>
      {decisions.length === 0 ? (
        <p className="max-w-[62ch] text-[14px] leading-relaxed text-ink-3">
          Nothing recorded constrains this component. Either it is genuinely unopinionated, or the
          reasoning behind it never got written down.
        </p>
      ) : (
        <div className="space-y-1">
          {decisions.map((d) => (
            <button
              key={d.id}
              onClick={() => go(['decisions', d.key])}
              className={`flex w-full items-start gap-4 rounded-card px-4 py-3.5 text-left transition-colors hover:bg-surface-2/50 ${
                d.state === 'contested' ? 'border-l-2 border-contested bg-contested/[0.04]' : ''
              } ${d.state === 'superseded' ? 'opacity-55' : ''}`}
            >
              <span className="flex h-[20px] shrink-0 items-center">
                <Dot color={STATE_LIGHT[d.state]!} lit={d.state !== 'superseded'} />
              </span>
              <span className="w-[58px] shrink-0 font-mono text-[11px] text-ink-3">{d.key}</span>
              <span className="min-w-0 flex-1 text-[14px] leading-snug text-ink-2">{d.title}</span>
              <span className="shrink-0 text-[11px] tracking-[0.16em] text-ink-3 uppercase">
                {d.state}
              </span>
            </button>
          ))}
        </div>
      )}
      {contested.length > 0 && (
        <p className="mt-5 text-[12.5px] text-contested">
          {contested.length} of these is unsettled — anything you build here may have to move.
        </p>
      )}

      {questions.length > 0 && (
        <>
          <Divide>open questions</Divide>
          <div className="space-y-6">
            {questions.map((q) => (
              <div key={q.id} className="border-l border-line pl-6">
                <Prose>{q.question}</Prose>
                <p className="mt-2 text-[11.5px] text-ink-3">
                  {getUser(q.raisedBy)?.name} · {rel(q.raisedAt)} ago
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      <Divide>work that touched it</Divide>
      <div className="space-y-1">
        {orders.slice(0, 8).map((w) => (
          <button
            key={w.id}
            onClick={() => go(['wo', w.key])}
            className="flex w-full items-center gap-4 rounded-card px-4 py-3 text-left transition-colors hover:bg-surface-2/50"
          >
            <span className="w-[58px] shrink-0 font-mono text-[11px] text-ink-3">{w.key}</span>
            <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink-2">{w.title}</span>
            <span className="w-[84px] shrink-0 text-right text-[11px] text-ink-3/70">
              {w.state.replace('_', ' ')}
            </span>
            <span className="w-[52px] shrink-0 text-right text-[11px] text-ink-3">
              {rel(w.updatedAt)} ago
            </span>
          </button>
        ))}
        {orders.length === 0 && (
          <p className="px-4 text-[14px] text-ink-3">No recorded work has touched this.</p>
        )}
      </div>
    </main>
  )
}

function Index() {
  const { go } = useNav()
  return (
    <main className="mx-auto w-full max-w-[880px] px-8 pt-16 pb-32">
      <div className="ignite">
        <h1 className="text-[32px] leading-tight font-medium tracking-[-0.02em] text-ink">
          Components
        </h1>
        <p className="mt-3 text-[14px] text-ink-2">
          {data.components.length} across {data.repos.length} repos, with{' '}
          {data.contracts.length} contracts between them.
        </p>
      </div>

      {data.repos.map((repo) => {
        const items = data.components.filter((c) => c.repoId === repo.id)
        if (!items.length) return null
        return (
          <section key={repo.id}>
            <Divide>{repo.name}</Divide>
            <div className="space-y-1">
              {items.map((c) => {
                const decisions = decisionsForComponent(c.id)
                const contested = decisions.filter((d) => d.state === 'contested').length
                const questions = openQuestionsForComponent(c.id).length
                return (
                  <button
                    key={c.id}
                    onClick={() => go(['components', c.name])}
                    className="block w-full rounded-card px-4 py-4 text-left transition-colors hover:bg-surface-2/50"
                  >
                    <div className="flex items-baseline gap-3">
                      <span className="font-mono text-[13px] text-ink">{c.name}</span>
                      {contested > 0 && (
                        <span className="text-[10px] tracking-[0.16em] text-contested uppercase">
                          {contested} contested
                        </span>
                      )}
                      {questions > 0 && (
                        <span className="text-[10px] tracking-[0.16em] text-ink-3 uppercase">
                          {questions} open question{questions === 1 ? '' : 's'}
                        </span>
                      )}
                      <span className="ml-auto text-[11px] text-ink-3">
                        {decisions.length} constraint{decisions.length === 1 ? '' : 's'} ·{' '}
                        {contractsFor(c.id).length} contracts
                      </span>
                    </div>
                    <p className="mt-1.5 max-w-[76ch] text-[13px] leading-relaxed text-ink-3">
                      {c.description}
                    </p>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </main>
  )
}

export default function ComponentScreen({ name }: { name?: string }) {
  const c = name ? data.components.find((x) => x.name === name) : undefined

  return (
    <div className="flex min-h-screen flex-col">
      <Chrome trail={c ? ['components', c.name] : ['components']} />
      {c ? <Detail c={c} /> : <Index />}
    </div>
  )
}
