import { useState } from 'react'
import type { RepoKind } from '../../fixtures'
import { currentUser } from '../../fixtures'
import { initials } from '../../lib/format'
import { useNav } from './nav'
import { Action, Chrome, Label, Plate, Prose } from './primitives'

/*
  Screen 7 — setup.

  The brief for this one is a feeling: five minutes of work, not an afternoon.
  So it is four steps, one on screen at a time, each with its own minute
  estimate and an honest note about what happens if you stop early. The wire
  runs across the top and lights up behind you.
*/

const STEPS = [
  { key: 'signin', label: 'sign in', minutes: '30 seconds' },
  { key: 'app', label: 'github app', minutes: '1 minute' },
  { key: 'repos', label: 'repositories', minutes: '1 minute' },
  { key: 'plugin', label: 'local plugin', minutes: '2 minutes' },
] as const

/** What GitHub would hand back. Not fixture data — Neon does not own this. */
const ACCESSIBLE = [
  { name: 'meridianops/dispatch-api', suggested: 'code' as RepoKind },
  { name: 'meridianops/dispatch-web', suggested: 'code' as RepoKind },
  { name: 'meridianops/platform-infra', suggested: 'config' as RepoKind },
  { name: 'meridianops/meridian-handbook', suggested: 'knowledge' as RepoKind },
  { name: 'meridianops/legacy-scheduler', suggested: 'code' as RepoKind },
]

const KINDS: RepoKind[] = ['code', 'knowledge', 'config']

function Progress({ at }: { at: number }) {
  return (
    <div className="flex items-center">
      {STEPS.map((s, i) => {
        const done = i < at
        const here = i === at
        const color = done || here ? 'var(--color-accent-2)' : 'var(--color-idle)'
        return (
          <div key={s.key} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-2.5">
              <span
                className="rounded-full transition-all"
                style={{
                  width: here ? 9 : 6,
                  height: here ? 9 : 6,
                  background: color,
                  boxShadow: done || here ? `0 0 10px ${color}` : undefined,
                  opacity: done || here ? 1 : 0.45,
                }}
              />
              <span
                className={`text-[10px] tracking-[0.16em] whitespace-nowrap uppercase ${
                  here ? 'text-ink-2' : 'text-ink-3/70'
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span
                className="mb-6 h-px flex-1"
                style={{
                  background: done
                    ? 'linear-gradient(to right, var(--color-accent-2), var(--color-accent-2))'
                    : 'var(--color-line)',
                  opacity: done ? 0.6 : 1,
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function SetupScreen() {
  const { go } = useNav()
  const [at, setAt] = useState(0)
  const [picked, setPicked] = useState<Record<string, RepoKind>>({
    'meridianops/dispatch-api': 'code',
    'meridianops/dispatch-web': 'code',
    'meridianops/platform-infra': 'config',
  })
  const [copied, setCopied] = useState(false)

  const next = () => setAt((v) => Math.min(v + 1, STEPS.length))
  const command = 'claude plugin install neon@meridianops --scope user'

  return (
    <div className="flex min-h-screen flex-col">
      <Chrome trail={['setup']} />

      <main className="mx-auto w-full max-w-[620px] px-8 pt-20 pb-32">
        {at < STEPS.length ? (
          <>
            <div className="ignite">
              <h1 className="text-[30px] leading-tight font-medium tracking-[-0.02em] text-ink">
                Set up Neon
              </h1>
              <p className="mt-3 text-[14px] text-ink-2">
                Four steps, about five minutes. You can stop after the third and still get context
                packs — the plugin is what makes checks run without you asking.
              </p>
            </div>

            <div className="mt-12">
              <Progress at={at} />
            </div>

            <div className="mt-12">
              <Plate lit className="p-8">
                <div className="flex items-baseline justify-between">
                  <Label>
                    step {at + 1} of {STEPS.length}
                  </Label>
                  <span className="text-[11px] text-ink-3">{STEPS[at]!.minutes}</span>
                </div>

                {at === 0 && (
                  <div key="signin" className="ignite">
                    <h2 className="mt-5 text-[21px] leading-snug font-medium text-ink">
                      Sign in with GitHub
                    </h2>
                    <Prose className="mt-3.5">
                      Neon uses your GitHub identity and nothing else. There are no Neon passwords
                      to forget and no separate user list to keep in sync.
                    </Prose>
                    <div className="mt-7 flex flex-wrap items-center gap-4">
                      <Action primary onClick={next}>
                        Continue with GitHub
                      </Action>
                      <span className="flex items-center gap-2 text-[12px] text-ink-3">
                        <span
                          className="grid h-[20px] w-[20px] place-items-center rounded-full text-[9px] font-medium"
                          style={{
                            background: `${currentUser.accent}26`,
                            color: currentUser.accent,
                          }}
                        >
                          {initials(currentUser.name)}
                        </span>
                        {currentUser.githubLogin}
                      </span>
                    </div>
                  </div>
                )}

                {at === 1 && (
                  <div key="app" className="ignite">
                    <h2 className="mt-5 text-[21px] leading-snug font-medium text-ink">
                      Install the Neon GitHub App
                    </h2>
                    <Prose className="mt-3.5">
                      The app reads repository metadata and pull requests, receives webhooks, and
                      posts commit statuses. That last one is what branch protection keys off — it
                      is how a failing check stops a merge.
                    </Prose>
                    <ul className="mt-6 space-y-2.5">
                      {[
                        'Read repository metadata and pull requests',
                        'Receive push and pull request webhooks',
                        'Post commit statuses',
                      ].map((p) => (
                        <li key={p} className="flex items-center gap-3">
                          <span className="h-1 w-1 shrink-0 rounded-full bg-accent-2 shadow-[0_0_6px_var(--color-accent-2)]" />
                          <span className="text-[13px] text-ink-2">{p}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-5 text-[12px] text-ink-3">
                      No write access to code. Tokens are encrypted at rest, and a local instance
                      runs without this step at all.
                    </p>
                    <div className="mt-7">
                      <Action primary onClick={next}>
                        Install on meridianops
                      </Action>
                    </div>
                  </div>
                )}

                {at === 2 && (
                  <div key="repos" className="ignite">
                    <h2 className="mt-5 text-[21px] leading-snug font-medium text-ink">
                      Register repositories
                    </h2>
                    <Prose className="mt-3.5">
                      Pick the repos Neon should know about and say what kind each one is. You can
                      add more later; nothing breaks if you start with one.
                    </Prose>

                    <div className="mt-6 space-y-1">
                      {ACCESSIBLE.map((r) => {
                        const on = r.name in picked
                        return (
                          <div
                            key={r.name}
                            className={`flex flex-wrap items-center gap-3 rounded-card px-3 py-2.5 transition-colors ${
                              on ? 'bg-surface-2/60' : ''
                            }`}
                          >
                            <button
                              onClick={() =>
                                setPicked((p) => {
                                  const n = { ...p }
                                  if (on) delete n[r.name]
                                  else n[r.name] = r.suggested
                                  return n
                                })
                              }
                              className="flex min-w-0 flex-1 items-center gap-3 text-left"
                            >
                              <span
                                className="h-[7px] w-[7px] shrink-0 rounded-full"
                                style={{
                                  background: on ? 'var(--color-accent-2)' : 'var(--color-idle)',
                                  boxShadow: on ? '0 0 8px var(--color-accent-2)' : undefined,
                                  opacity: on ? 1 : 0.5,
                                }}
                              />
                              <span
                                className={`truncate font-mono text-[12px] ${
                                  on ? 'text-ink' : 'text-ink-3'
                                }`}
                              >
                                {r.name}
                              </span>
                            </button>
                            {on && (
                              <span className="flex gap-1">
                                {KINDS.map((k) => (
                                  <button
                                    key={k}
                                    onClick={() => setPicked((p) => ({ ...p, [r.name]: k }))}
                                    className={`rounded-chip border px-2 py-0.5 font-mono text-[10px] transition-colors ${
                                      picked[r.name] === k
                                        ? 'border-accent-2/45 text-accent-2'
                                        : 'border-line text-ink-3 hover:text-ink-2'
                                    }`}
                                  >
                                    {k}
                                  </button>
                                ))}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    <div className="mt-7 flex items-center gap-4">
                      <Action primary onClick={next}>
                        Register {Object.keys(picked).length}
                      </Action>
                      <span className="text-[12px] text-ink-3">
                        {Object.keys(picked).length === 0 && 'pick at least one'}
                      </span>
                    </div>
                  </div>
                )}

                {at === 3 && (
                  <div key="plugin" className="ignite">
                    <h2 className="mt-5 text-[21px] leading-snug font-medium text-ink">
                      Install the local plugin
                    </h2>
                    <Prose className="mt-3.5">
                      This is the part that does the work: it registers Neon's MCP tools with your
                      coding agent, adds the <span className="font-mono text-[14px]">/neon</span>{' '}
                      skills, and installs the Stop hook that keeps an agent from declaring success
                      before the checks pass.
                    </Prose>

                    <button
                      onClick={() => {
                        void navigator.clipboard?.writeText(command)
                        setCopied(true)
                      }}
                      className="mt-6 flex w-full items-center gap-4 rounded-card border border-line bg-bg-deep/70 px-4 py-3.5 text-left transition-colors hover:border-line-strong"
                    >
                      <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-2">
                        {command}
                      </span>
                      <span className="shrink-0 text-[11px] text-accent-2">
                        {copied ? 'copied' : 'copy'}
                      </span>
                    </button>

                    <p className="mt-4 text-[12px] text-ink-3">
                      Installed at user scope, so it works in every repo. Inside this repo a
                      project-scoped registration points at localhost instead.
                    </p>

                    <div className="mt-7">
                      <Action primary onClick={next}>
                        I have run it
                      </Action>
                    </div>
                  </div>
                )}
              </Plate>
            </div>

            {at > 0 && (
              <button
                onClick={() => setAt((v) => v - 1)}
                className="mt-6 text-[12px] text-ink-3 transition-colors hover:text-ink-2"
              >
                ← back
              </button>
            )}
          </>
        ) : (
          <div className="ignite">
            <Progress at={STEPS.length} />

            <h1 className="mt-14 text-[30px] leading-tight font-medium tracking-[-0.02em] text-ink">
              You're set.
            </h1>
            <Prose className="mt-4 text-[16px]">
              {Object.keys(picked).length} repositories registered and the plugin installed. From
              here you claim a work order, and the context pack arrives in your agent — you should
              not need to come back to this screen.
            </Prose>

            <div className="mt-9 flex flex-wrap gap-3">
              <Action primary onClick={() => go([])}>
                Go to the board
              </Action>
              <Action onClick={() => setAt(0)}>Run through it again</Action>
            </div>

            <div className="mt-14">
              <Label>next, in your terminal</Label>
              <div className="mt-3 rounded-card border border-line bg-bg-deep/70 px-4 py-3.5 font-mono text-[12px] text-ink-2">
                /neon:start DSP-424
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
