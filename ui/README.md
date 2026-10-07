# Neon UI — design exploration

Static, no backend. Three candidate visual directions rendering the same
screen from the same fixture data, so they can be judged against realistic
content rather than lorem.

```bash
npm install
npm run dev
```

Then `#filament` (the live direction), or `#instrument` / `#foundry` / `#halo`
for the earlier three. The switcher is top-right; add `?bare=1` to hide it.

Screenshots without a visible browser:

```bash
node scripts/shot.mjs filament 1440 900 evidence
```

## Layout

```
src/
  fixtures/     the fictional Meridian dataset — the only source of data
    types.ts    domain types, mirroring the core schema
    core.ts     users, repos, components, contracts, checks, open questions
    work.ts     18 work orders, 30 changes
    evidence.ts 6 environments, 91 runs (hand-authored + deterministic history)
    decisions.ts 15 decisions
    index.ts    assembled Dataset + selectors (doneWhenStatus, blockers, …)
  design/
    tokens.css  one token contract, three direction themes
  screens/
    boardModel.ts  everything the board derives, computed once
  directions/
    filament/    D — the live one
      primitives.tsx  the design system: Aurora, Plate, CheckFilaments, …
      Wire.tsx        the board-as-a-filament
      Board.tsx       screen 1 — work board
      WorkOrderScreen screen 2 — work order detail
      RunScreen       screen 3 — run / evidence
      DecisionLog     screen 4 — decision log and detail
      LabScreen       screen 5 — environments, as fuses burning down
      ComponentScreen screen 6 — a component as a junction of contracts
      SetupScreen     screen 7 — four-step onboarding
    instrument/  A — hairlines, monospace, one signal colour
    foundry/     B — warm charcoal, editorial serif, printed grain
    halo/        C — one light source, luminous state
```

## Routes

Filament's screens live in the hash after the direction, so each is shareable:

| route | screen |
| --- | --- |
| `#filament` | Work board |
| `#filament/wo/DSP-412` | Work order detail |
| `#filament/run/run_412_eval_3` | Run / evidence |
| `#filament/decisions` | Decision log |
| `#filament/decisions/DEC-047` | A decision (this one is contested) |
| `#filament/lab` | Environments |
| `#filament/components` | Components index |
| `#filament/components/dispatch-engine` | A component and what it is wired to |
| `#filament/setup` | Onboarding |

## Filament, specifically

The screen answers one question — *what should I work on* — and shows exactly
one work order legibly. The other seventeen are beads of light on a single
filament at the bottom of the room, ordered left to right by pipeline stage.
Blocked work hangs below the wire it fell off. Hover, click or arrow along the
wire to change what is lit; `e` opens the evidence behind a failure; the full
list is one click away and otherwise absent.

Six facts are on screen at rest. Everything else is disclosed on demand.

## Rules the code follows

- **Screens import from `src/fixtures` and nowhere else.** Swapping in a real
  API client is a change to `fixtures/index.ts` only.
- **Nothing reads the system clock.** `fixtures/time.ts` pins `NOW`, and the
  bulk run history is generated from a seeded PRNG, so every load is identical
  and screenshots are stable.
- **Directions share a token contract.** Every direction defines the same CSS
  variable names — colour, type, radius, texture — so a component written
  against the tokens renders in all three. Anything one direction needs
  (a grain, a glow, a rule weight) is a token, not a one-off class.
- **Thresholds come from the work order**, not the check. The same check has
  different bars for different work; the evidence panel reads
  `WorkOrder.done_when[].threshold`.
- **`Run.citable` is respected.** An unpinned run renders as not citable, and
  the fixture includes one deliberately (`run_415_eval`, working-copy fixture).
