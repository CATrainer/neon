import type { ReactNode } from 'react'
import { currentUser } from '../../fixtures'
import type { DecisionState, RunResult, WorkOrderState } from '../../fixtures'
import { initials } from '../../lib/format'
import type { DoneWhenStatus } from '../../fixtures'
import { useNav } from './nav'

/*
  Filament's design system.

  The rules the primitives enforce, so no screen has to remember them:

  1. One lit object per screen. Everything else is dark glass or plain text on
     the aurora.
  2. Light means state. Nothing is coloured decoratively, and nothing that is
     not a state gets a glow.
  3. Prose is a first-class element, not a subtitle. Intent and rationale are
     set at reading size with real measure.
  4. Metadata is dim, small, and never above the thing it describes.
*/

// ── Ambient ──────────────────────────────────────────────────────────────

export function Aurora() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-bg" />
      <div className="aurora-a absolute top-[-20%] left-[-10%] h-[70vh] w-[70vw] rounded-full bg-[#5b3cff] opacity-[0.22] blur-[140px]" />
      <div className="aurora-b absolute top-[10%] right-[-15%] h-[60vh] w-[55vw] rounded-full bg-[#00b3ff] opacity-[0.13] blur-[150px]" />
      <div className="aurora-c absolute bottom-[-25%] left-[20%] h-[55vh] w-[60vw] rounded-full bg-[#c342ff] opacity-[0.11] blur-[160px]" />
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_35%,transparent_20%,#04050b_78%)]" />
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  )
}

const PLACES: [string, string[]][] = [
  ['lab', ['lab']],
  ['decisions', ['decisions']],
  ['components', ['components']],
]

/** The only chrome in the product. Left-aligned so nothing competes with it. */
export function Chrome({ trail, right }: { trail?: ReactNode[]; right?: ReactNode }) {
  const { go, path } = useNav()
  return (
    <header className="flex items-center gap-3 px-8 pt-7">
      <button onClick={() => go([])} className="flex items-center gap-3">
        <span className="h-[7px] w-[7px] rounded-full bg-accent shadow-[0_0_14px_2px_var(--color-accent)]" />
        <span className="text-[13px] font-medium tracking-[0.06em] text-ink">Neon</span>
      </button>
      <span className="text-[12px] text-ink-3">meridian</span>
      {trail?.map((t, i) => (
        <span key={i} className="flex items-center gap-3">
          <span className="text-ink-3/40">/</span>
          <span className="text-[12px] text-ink-3">{t}</span>
        </span>
      ))}
      <div className="ml-auto flex items-center gap-5">
        <nav className="hidden items-center gap-4 md:flex">
          {PLACES.map(([name, to]) => (
            <button
              key={name}
              onClick={() => go(to)}
              className={`text-[12px] transition-colors ${
                path[0] === to[0] ? 'text-ink-2' : 'text-ink-3 hover:text-ink-2'
              }`}
            >
              {name}
            </button>
          ))}
        </nav>
        {right}
        <span
          className="grid h-[24px] w-[24px] place-items-center rounded-full text-[10px] font-medium"
          style={{ background: `${currentUser.accent}26`, color: currentUser.accent }}
          title={currentUser.name}
        >
          {initials(currentUser.name)}
        </span>
      </div>
    </header>
  )
}

// ── Surfaces ─────────────────────────────────────────────────────────────

/** Dark glass with a single rim light along its top edge. */
export function Plate({
  children,
  lit,
  tone,
  className = '',
}: {
  children: ReactNode
  lit?: boolean
  tone?: 'fail' | 'pass' | 'accent'
  className?: string
}) {
  const glow =
    tone === 'fail'
      ? 'shadow-[0_0_120px_-30px_var(--color-fail),inset_0_1px_0_rgba(255,255,255,0.08)]'
      : tone === 'pass'
        ? 'shadow-[0_0_120px_-30px_var(--color-pass),inset_0_1px_0_rgba(255,255,255,0.08)]'
        : 'shadow-[0_0_120px_-40px_var(--color-accent),inset_0_1px_0_rgba(255,255,255,0.08)]'
  return (
    <div
      className={`relative overflow-hidden rounded-card border bg-surface/80 backdrop-blur-xl ${
        lit ? `border-line-strong/70 ${glow}` : 'border-line'
      } ${className}`}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent"
      />
      {children}
    </div>
  )
}

// ── Type ─────────────────────────────────────────────────────────────────

export function Label({ children }: { children: ReactNode }) {
  return (
    <span className="text-[10px] tracking-[0.22em] text-ink-3 uppercase">{children}</span>
  )
}

/** A dim section rule with its name. The only structural device on a screen. */
export function Divide({ children }: { children: ReactNode }) {
  return (
    <div className="mt-16 mb-6 flex items-center gap-4">
      <Label>{children}</Label>
      <span className="h-px flex-1 bg-line" />
    </div>
  )
}

export function Key({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[11px] tracking-[0.2em] text-accent-2">{children}</span>
}

export function StateWord({ state }: { state: WorkOrderState | DecisionState }) {
  return (
    <span className="text-[11px] tracking-[0.18em] text-ink-3 uppercase">
      {state.replace('_', ' ')}
    </span>
  )
}

export function Meta({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 text-[12px] text-ink-3">{children}</div>
  )
}

export function Sep() {
  return <span className="text-ink-3/45">·</span>
}

/** Prose at reading size. Used for intent and rationale — never for metadata. */
export function Prose({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`max-w-[62ch] text-[15px] leading-[1.68] text-ink-2 ${className}`}>{children}</p>
  )
}

// ── State as light ───────────────────────────────────────────────────────

export const TONE: Record<RunResult | 'pending' | 'stale', string> = {
  pass: 'var(--color-pass)',
  fail: 'var(--color-fail)',
  error: 'var(--color-error)',
  pending: 'var(--color-idle)',
  stale: 'var(--color-idle)',
}

export function Dot({ color, lit = true, size = 6 }: { color: string; lit?: boolean; size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: color,
        boxShadow: lit ? `0 0 8px ${color}` : undefined,
        opacity: lit ? 1 : 0.5,
      }}
    />
  )
}

/**
 * A completion definition rendered as a fuse: lit segments have passed, dim
 * ones have not run, a burning one has failed.
 */
export function CheckFilaments({
  rows,
  width = 36,
  onSelect,
}: {
  rows: DoneWhenStatus[]
  width?: number
  onSelect?: (r: DoneWhenStatus) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      {rows.map((r, i) => {
        const bad = r.status === 'fail' || r.status === 'error'
        const good = r.status === 'pass' && r.meetsThreshold
        const short = r.status === 'pass' && !r.meetsThreshold
        return (
          <span
            key={i}
            onClick={onSelect ? () => onSelect(r) : undefined}
            title={`${r.check.name} — ${r.status}${r.thresholdNote ? ` · ${r.thresholdNote}` : ''}`}
            style={{ width }}
            className={`h-[3px] rounded-full transition-all ${onSelect ? 'cursor-pointer' : ''} ${
              bad
                ? 'breathe bg-fail shadow-[0_0_10px_var(--color-fail)]'
                : good
                  ? 'bg-pass shadow-[0_0_10px_var(--color-pass)]'
                  : short
                    ? 'bg-warn shadow-[0_0_8px_var(--color-warn)]'
                    : 'bg-ink-3/25'
            }`}
          />
        )
      })}
    </div>
  )
}

/** The score ring. The threshold is a tick on the track, not a second number. */
export function ScoreRing({
  score,
  threshold,
  tone,
  size = 124,
}: {
  score: number
  threshold?: number
  tone: 'pass' | 'fail'
  size?: number
}) {
  const r = 52
  const C = 2 * Math.PI * r
  const stroke = tone === 'fail' ? 'var(--color-fail)' : 'var(--color-pass)'
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" className="-rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-surface-3)" strokeWidth="4" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${score * C} ${C}`}
          style={{ filter: `drop-shadow(0 0 8px ${stroke})` }}
        />
        {threshold !== undefined && (
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke="var(--color-accent-2)"
            strokeWidth="12"
            strokeDasharray={`1.5 ${C}`}
            strokeDashoffset={-threshold * C}
          />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span
          className="tnum leading-none font-medium text-ink"
          style={{ fontSize: size * 0.22 }}
        >
          {score.toFixed(3)}
        </span>
      </div>
    </div>
  )
}

// ── Controls ─────────────────────────────────────────────────────────────

export function Action({
  children,
  onClick,
  primary,
}: {
  children: ReactNode
  onClick?: () => void
  primary?: boolean
}) {
  if (!primary) {
    return (
      <button
        onClick={onClick}
        className="rounded-chip px-4 py-2.5 text-[13px] text-ink-2 transition-colors hover:text-ink"
      >
        {children}
      </button>
    )
  }
  return (
    <button
      onClick={onClick}
      className="rounded-chip border border-accent/45 bg-accent/12 px-5 py-2.5 text-[13px] font-medium text-ink shadow-[0_0_28px_-6px_var(--color-accent),inset_0_1px_0_rgba(255,255,255,0.14)] transition-all hover:border-accent/80 hover:bg-accent/20 hover:shadow-[0_0_40px_-6px_var(--color-accent),inset_0_1px_0_rgba(255,255,255,0.2)]"
    >
      {children}
    </button>
  )
}

export function Chip({ children, tone }: { children: ReactNode; tone?: 'accent' | 'dim' }) {
  return (
    <span
      className={`rounded-chip border px-2.5 py-1 font-mono text-[10px] ${
        tone === 'accent' ? 'border-accent-2/35 text-accent-2' : 'border-line text-ink-3'
      }`}
    >
      {children}
    </span>
  )
}

/** A quiet row that behaves like a link. Used for every list in the product. */
export function Row({
  onClick,
  children,
  lit,
}: {
  onClick?: () => void
  children: ReactNode
  lit?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-4 rounded-card px-4 py-3 text-left transition-colors ${
        lit ? 'bg-surface-2/70' : 'hover:bg-surface-2/50'
      }`}
    >
      {children}
    </button>
  )
}
