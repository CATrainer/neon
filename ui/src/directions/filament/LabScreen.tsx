import { useState } from 'react'
import { data, getUser, msUntilExpiry } from '../../fixtures'
import type { Environment } from '../../fixtures'
import { duration, initials, rel } from '../../lib/format'
import { useNav } from './nav'
import { Action, Chip, Chrome, Divide, Dot, Label, Meta, Plate, Prose, Sep } from './primitives'

/*
  Screen 5 — the lab.

  An environment is a thing that is burning down. TTL is the only number that
  matters at a glance, so it is the only thing rendered as light: each
  environment is a fuse, lit for the time it has left. When a fuse gets short
  it turns amber and breathes. Nothing else on this screen glows.
*/

const HOUR = 3_600_000

interface Fuse {
  /** 0–1 of the TTL still to burn. */
  left: number
  color: string
  label: string
  urgent: boolean
  indeterminate: boolean
}

function fuseOf(env: Environment): Fuse {
  const ms = msUntilExpiry(env)
  switch (env.state) {
    case 'provisioning':
      return {
        left: 0.35,
        color: 'var(--color-info)',
        label: 'coming up',
        urgent: false,
        indeterminate: true,
      }
    case 'ready':
      return {
        left: 1,
        color: 'var(--color-accent-2)',
        label: 'free to claim',
        urgent: false,
        indeterminate: false,
      }
    case 'reaping':
      // Burnt through and being torn down — the whole fuse is alight.
      return {
        left: 1,
        color: 'var(--color-error)',
        label: `overdue by ${duration(Math.abs(ms ?? 0))}`,
        urgent: true,
        indeterminate: false,
      }
    case 'destroyed':
      return {
        left: 0,
        color: 'var(--color-idle)',
        label: `destroyed ${rel(env.expiresAt ?? env.claimedAt ?? '')} ago`,
        urgent: false,
        indeterminate: false,
      }
    default: {
      const remaining = Math.max(0, ms ?? 0)
      const urgent = remaining < HOUR
      return {
        left: Math.min(1, remaining / (env.ttlSeconds * 1000)),
        color: urgent ? 'var(--color-warn)' : 'var(--color-accent)',
        label: `${duration(remaining)} left`,
        urgent,
        indeterminate: false,
      }
    }
  }
}

function FuseRow({
  env,
  open,
  onToggle,
}: {
  env: Environment
  open: boolean
  onToggle: () => void
}) {
  const { go } = useNav()
  const f = fuseOf(env)
  const claimant = getUser(env.claimedBy)
  const wo = data.workOrders.find((w) => w.id === env.workOrderId)

  return (
    <div className={`rounded-card px-4 py-4 transition-colors ${open ? 'bg-surface-2/50' : ''}`}>
      <button onClick={onToggle} className="w-full text-left">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="font-mono text-[12.5px] text-ink">{env.name}</span>
          <span className="text-[11px] tracking-[0.16em] text-ink-3 uppercase">
            {env.state.replace('_', ' ')}
          </span>
          <span className="ml-auto flex items-center gap-3">
            {claimant ? (
              <>
                <span
                  className="grid h-[20px] w-[20px] place-items-center rounded-full text-[9px] font-medium"
                  style={{ background: `${claimant.accent}26`, color: claimant.accent }}
                  title={claimant.name}
                >
                  {initials(claimant.name)}
                </span>
                <span className="text-[11px] text-ink-3">{claimant.short}</span>
              </>
            ) : (
              <span className="text-[11px] text-accent-2">unclaimed</span>
            )}
            <span
              className={`w-[104px] text-right text-[11px] ${f.urgent ? 'text-warn' : 'text-ink-3'}`}
            >
              {f.label}
            </span>
          </span>
        </div>

        {/* the fuse */}
        <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-ink-3/15">
          <div
            className={`h-full rounded-full ${f.urgent ? 'breathe' : ''} ${
              f.indeterminate ? 'breathe' : ''
            }`}
            style={{
              width: `${Math.max(f.left * 100, f.left > 0 ? 2 : 0)}%`,
              background: f.color,
              boxShadow: f.left > 0 ? `0 0 10px ${f.color}` : undefined,
            }}
          />
        </div>

        <div className="mt-2.5 truncate text-[11.5px] text-ink-3">{env.topology}</div>
      </button>

      {open && (
        <div className="ignite mt-5 border-t border-line pt-5">
          <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            <div>
              <Label>artifact</Label>
              <div className="mt-1 font-mono text-[11.5px] text-ink-2">
                {env.artifactVersion ?? 'none deployed'}
              </div>
            </div>
            <div>
              <Label>config commit</Label>
              <div className="mt-1 font-mono text-[11.5px] text-ink-2">
                {env.configCommit ?? '—'}
              </div>
            </div>
            <div>
              <Label>target</Label>
              <div className="mt-1 font-mono text-[11.5px] text-ink-2">
                {data.targets.find((t) => t.id === env.targetId)?.name}
              </div>
            </div>
            <div>
              <Label>ttl</Label>
              <div className="mt-1 font-mono text-[11.5px] text-ink-2">
                {duration(env.ttlSeconds * 1000)}
                {env.claimedAt ? ` from ${rel(env.claimedAt)} ago` : ''}
              </div>
            </div>
          </div>

          {wo && (
            <button
              onClick={() => go(['wo', wo.key])}
              className="mt-5 block text-left text-[12.5px] text-ink-3 transition-colors hover:text-ink-2"
            >
              claimed for {wo.key} — {wo.title}
            </button>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            {env.state === 'ready' && <Action primary>Claim for 8 hours</Action>}
            {(env.state === 'in_use' || env.state === 'reaping') && (
              <>
                <Action primary>Extend by 4 hours</Action>
                <Action>Destroy now</Action>
              </>
            )}
            {env.state === 'provisioning' && <Action>Cancel</Action>}
            {env.state === 'destroyed' && <Action primary>Provision one like this</Action>}
          </div>
        </div>
      )}
    </div>
  )
}

export default function LabScreen() {
  const [openId, setOpenId] = useState<string | null>(null)
  const [showGone, setShowGone] = useState(false)

  const live = data.environments.filter((e) => e.state !== 'destroyed')
  const gone = data.environments.filter((e) => e.state === 'destroyed')

  // The one that needs a human: soonest to expire, or already overdue.
  const urgent = [...live]
    .filter((e) => e.expiresAt)
    .sort((a, b) => (msUntilExpiry(a) ?? 0) - (msUntilExpiry(b) ?? 0))[0]
  const urgentMs = urgent ? (msUntilExpiry(urgent) ?? 0) : 0
  const claimant = getUser(urgent?.claimedBy)

  return (
    <div className="flex min-h-screen flex-col">
      <Chrome trail={['lab']} />

      <main className="mx-auto w-full max-w-[820px] px-8 pt-16 pb-32">
        <div className="ignite">
          <h1 className="text-[32px] leading-tight font-medium tracking-[-0.02em] text-ink">Lab</h1>
          <p className="mt-3 text-[14px] text-ink-2">
            {live.filter((e) => e.state === 'in_use').length} in use,{' '}
            {live.filter((e) => e.state === 'ready').length} free,{' '}
            {live.filter((e) => e.state === 'provisioning').length} coming up,{' '}
            {live.filter((e) => e.state === 'reaping').length} being torn down. Everything here is
            burning down.
          </p>
        </div>

        {/* The one that needs a human */}
        {urgent && (
          <div className="mt-10">
            <Plate lit tone={urgentMs < HOUR ? 'fail' : 'accent'} className="p-7">
              <Label>{urgentMs < 0 ? 'overdue' : 'expiring first'}</Label>
              <div className="mt-3.5 flex flex-wrap items-baseline gap-3">
                <span className="font-mono text-[15px] text-ink">{urgent.name}</span>
                <span className={`text-[15px] ${urgentMs < HOUR ? 'text-warn' : 'text-ink-2'}`}>
                  {urgentMs < 0
                    ? `should have been reaped ${duration(Math.abs(urgentMs))} ago`
                    : `expires in ${duration(urgentMs)}`}
                </span>
              </div>
              <Prose className="mt-3">
                {claimant ? `${claimant.name} has it` : 'Nobody has claimed it'}
                {urgent.artifactVersion ? `, running ${urgent.artifactVersion}` : ''}.{' '}
                {urgentMs < HOUR
                  ? 'Anything still running against it will lose its environment mid-suite.'
                  : 'It will be reaped automatically unless someone extends it.'}
              </Prose>
              <div className="mt-6 flex flex-wrap gap-3">
                <Action primary>Extend by 4 hours</Action>
                <Action>Destroy now</Action>
              </div>
            </Plate>
          </div>
        )}

        <Divide>claimed and free</Divide>

        <div className="space-y-1">
          {live.map((e) => (
            <FuseRow
              key={e.id}
              env={e}
              open={openId === e.id}
              onToggle={() => setOpenId(openId === e.id ? null : e.id)}
            />
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Action primary>Provision an environment</Action>
          <Meta>
            <span>topologies come from the repo, not from here</span>
            <Sep />
            <span>local uses the docker provider</span>
          </Meta>
        </div>

        {gone.length > 0 && (
          <>
            <Divide>gone</Divide>
            <button
              onClick={() => setShowGone((v) => !v)}
              className="text-[13px] text-ink-3 transition-colors hover:text-ink-2"
            >
              {gone.length} destroyed in the last week {showGone ? '− hide' : '+ show'}
            </button>
            {showGone && (
              <div className="ignite mt-5 space-y-1">
                {gone.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                    <Dot color="var(--color-idle)" lit={false} />
                    <span className="font-mono text-[11.5px] text-ink-3">{e.name}</span>
                    <span className="truncate text-[11.5px] text-ink-3/70">{e.topology}</span>
                    <span className="ml-auto shrink-0 text-[11px] text-ink-3">
                      {getUser(e.claimedBy)?.short ?? '—'}
                    </span>
                    <Chip>{e.artifactVersion ?? 'no artifact'}</Chip>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
