import { useEffect, useRef, useState } from 'react'
import type { BoardRow } from '../../screens/boardModel'

/*
  The wire.

  Every work order on the board is a bead of light on one continuous filament
  running left to right through the pipeline. Blocked work hangs below the
  line. Nothing here is a list, a column or a row — the whole board is one
  glance, and detail is somebody's deliberate next action.
*/

const PATH = 'M 30 84 C 280 84 320 38 600 38 S 920 44 1170 62'
const VIEW_W = 1200
const VIEW_H = 132
/** Headroom above the wire so the lit bead's beam has somewhere to go. */
const HEADROOM = 104

export interface Bead {
  row: BoardRow
  x: number
  y: number
  r: number
  color: string
  dim: boolean
  hollow: boolean
  hanging: boolean
}

/** Left to right is the pipeline. Blocked sits under the line it fell off. */
const SEQUENCE = ['draft', 'ready', 'blocked', 'in_progress', 'review', 'done', 'abandoned'] as const

const STAGE_LABEL: Partial<Record<(typeof SEQUENCE)[number], string>> = {
  draft: 'draft',
  ready: 'ready',
  in_progress: 'in flight',
  review: 'review',
  done: 'done',
}

function beadStyle(row: BoardRow): Pick<Bead, 'color' | 'dim' | 'hollow' | 'hanging'> {
  const s = row.wo.state
  // Blocked work hangs off the wire whether or not its checks are also failing.
  const hanging = s === 'blocked'
  if (row.failingCount > 0) return { color: 'var(--color-fail)', dim: false, hollow: false, hanging }
  if (s === 'blocked') return { color: 'var(--color-warn)', dim: false, hollow: false, hanging }
  if (s === 'ready') return { color: 'var(--color-accent-2)', dim: false, hollow: false, hanging: false }
  if (s === 'in_progress' || s === 'review')
    return { color: 'var(--color-accent)', dim: false, hollow: false, hanging: false }
  if (s === 'abandoned') return { color: 'var(--color-idle)', dim: true, hollow: true, hanging: false }
  return { color: 'var(--color-idle)', dim: true, hollow: false, hanging: false }
}

/** Pipeline order, left to right. Shared with the board so arrow keys and the
    wire agree about what "next" means. */
export function orderRows(rows: BoardRow[]): BoardRow[] {
  return SEQUENCE.flatMap((state) =>
    rows
      .filter((r) => r.wo.state === state)
      .sort((a, b) => Date.parse(b.wo.updatedAt) - Date.parse(a.wo.updatedAt)),
  )
}

export default function Wire({
  rows,
  activeId,
  onHover,
  onSelect,
}: {
  rows: BoardRow[]
  activeId: string
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
}) {
  const pathRef = useRef<SVGPathElement>(null)
  const [beads, setBeads] = useState<Bead[]>([])

  const ordered = orderRows(rows)

  useEffect(() => {
    const p = pathRef.current
    if (!p) return
    const len = p.getTotalLength()
    setBeads(
      ordered.map((row, i) => {
        const t = (i + 0.6) / (ordered.length + 0.2)
        const pt = p.getPointAtLength(t * len)
        const style = beadStyle(row)
        return {
          row,
          x: pt.x,
          y: pt.y + (style.hanging ? 30 : 0),
          r: 3 + Math.min(row.progress.total, 5) * 0.6,
          ...style,
        }
      }),
    )
    // Bead count is the only thing that moves them.
  }, [ordered.length])

  const active = beads.find((b) => b.row.wo.id === activeId)

  // Stage captions sit under the average position of their group.
  const captions = SEQUENCE.map((state) => {
    const label = STAGE_LABEL[state]
    if (!label) return null
    const group = beads.filter((b) => b.row.wo.state === state)
    if (!group.length) return null
    return { label, x: group.reduce((s, b) => s + b.x, 0) / group.length, count: group.length }
  }).filter(Boolean) as { label: string; x: number; count: number }[]

  return (
    <svg
      viewBox={`0 ${-HEADROOM} ${VIEW_W} ${VIEW_H + HEADROOM}`}
      className="w-full select-none"
      onMouseLeave={() => onHover(null)}
      role="group"
      aria-label="Work orders, arranged along the delivery pipeline"
    >
      <defs>
        <linearGradient id="wire-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--color-line-strong)" stopOpacity="0.25" />
          <stop offset="42%" stopColor="var(--color-accent)" stopOpacity="0.55" />
          <stop offset="78%" stopColor="var(--color-accent-2)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="var(--color-line-strong)" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id="shaft-grad" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="var(--color-ink)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="var(--color-ink)" stopOpacity="0" />
        </linearGradient>
        <filter id="bloom" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="bloom-lg" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>

      {/* the filament itself, twice: a soft bleed and a hairline core */}
      <path ref={pathRef} d={PATH} fill="none" stroke="url(#wire-grad)" strokeWidth="7" opacity="0.18" filter="url(#bloom-lg)" />
      <path d={PATH} fill="none" stroke="url(#wire-grad)" strokeWidth="1" />

      {captions.map((c) => (
        <text
          key={c.label}
          x={c.x}
          y={VIEW_H - 12}
          textAnchor="middle"
          className="font-mono"
          fontSize="8.5"
          letterSpacing="2.4"
          fill="var(--color-ink-3)"
          opacity="0.65"
        >
          {c.label.toUpperCase()} {c.count}
        </text>
      ))}

      {/* a short shaft of light off the lit bead — bloom, not a connector */}
      {active && (
        <>
          <line
            x1={active.x}
            y1={active.y - 8}
            x2={active.x}
            y2={active.y - 74}
            stroke="url(#shaft-grad)"
            strokeWidth="1"
          />
          <line
            x1={active.x}
            y1={active.y - 8}
            x2={active.x}
            y2={active.y - 60}
            stroke="url(#shaft-grad)"
            strokeWidth="10"
            opacity="0.22"
            filter="url(#bloom-lg)"
          />
        </>
      )}

      {beads.map((b) => {
        const isActive = b.row.wo.id === activeId
        return (
          <g
            key={b.row.wo.id}
            onMouseEnter={() => onHover(b.row.wo.id)}
            onFocus={() => onHover(b.row.wo.id)}
            onBlur={() => onHover(null)}
            onClick={() => onSelect(b.row.wo.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect(b.row.wo.id)
              }
            }}
            tabIndex={0}
            role="button"
            aria-label={`${b.row.wo.key}: ${b.row.wo.title}. ${b.row.wo.state.replace('_', ' ')}${
              b.row.failingCount ? `, ${b.row.failingCount} checks failing` : ''
            }`}
            className="cursor-pointer focus:outline-none"
          >
            {/* a generous invisible target — the beads are small on purpose */}
            <circle cx={b.x} cy={b.y} r="15" fill="transparent" />

            {b.hanging && (
              <line
                x1={b.x}
                y1={b.y - 30}
                x2={b.x}
                y2={b.y - 5}
                stroke="var(--color-warn)"
                strokeWidth="0.75"
                strokeDasharray="2 3"
                opacity="0.4"
              />
            )}

            <circle
              cx={b.x}
              cy={b.y}
              r={b.r * (isActive ? 3.6 : 2.6)}
              fill={b.color}
              opacity={b.dim ? 0.05 : isActive ? 0.22 : 0.1}
              filter="url(#bloom-lg)"
            />

            {b.hollow ? (
              <circle
                cx={b.x}
                cy={b.y}
                r={b.r}
                fill="none"
                stroke={b.color}
                strokeWidth="1"
                opacity="0.5"
              />
            ) : (
              <circle
                cx={b.x}
                cy={b.y}
                r={b.r}
                fill={b.color}
                opacity={b.dim ? 0.45 : 1}
                filter={b.dim ? undefined : 'url(#bloom)'}
                className={b.row.failingCount > 0 ? 'breathe' : undefined}
              />
            )}

            {isActive && (
              <circle
                cx={b.x}
                cy={b.y}
                r={b.r + 7}
                fill="none"
                stroke="var(--color-ink)"
                strokeWidth="0.75"
                opacity="0.55"
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}
