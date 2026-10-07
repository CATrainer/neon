# Neon

An engineering platform for teams where most code is written by AI agents.

When an agent writes the code, the reasoning doesn't survive. The repo records
what the system does; the constraint that made this shape necessary, the
approach that was rejected, the invariant that must hold — none of that is in
the code, and in an AI-native team it isn't in anyone's head either. Neon
serves bounded context to coding agents over MCP, makes "done" machine-checkable,
records decisions with the evidence behind them, and captures ideas at low
enough friction that people actually do it.

Knowledge lives in git as markdown. Neon stores state, evidence and links —
never the only copy of anything.

## Getting started

```bash
cp .env.example .env      # then set NEON_SECRET_KEY
npm install
npm run db:up
npm run db:migrate
npm run seed
npm run dev
```

See [AGENTS.md](AGENTS.md) for how the repo is laid out and how to work in it,
and [knowledge/decisions](knowledge/decisions) for why it is shaped this way.

## Status

Phase 1, building to the bootstrap point: enough of Neon to build Neon with.
The lab, the evaluation harness and the UI are later phases. `ui/` holds the
approved design direction as a prototype and is not wired to the service yet.
