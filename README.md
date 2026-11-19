# Takeover Triage

> Status: **in development** for Atlassian Codegeist 2026 (Specialized Industries). Not yet installable.

ADAS validation teams receive piles of driver-takeover tickets that all say roughly the same thing
("car drifted left, took over"). Takeover Triage is an Atlassian Forge app for Jira that groups those
tickets by **what the vehicle actually did** — telemetry signal signatures and dashcam image
conditions — instead of by the text, and then answers the questions that change what happens next:

- **Which cluster does this ticket belong to, and why?** Explainable similarity with per-feature contributions.
- **Did this start on a specific build?** An exact conditional Poisson test of event rate per km driven, per build.
- **Is any scenario test covering these conditions?** A deterministic coverage-gap check, with a one-click test stub.
- **Who should own it?** Routing to the owning team via the Teamwork Graph, with a Jira fallback.

The same actions are available to a Rovo agent and to external AI clients through a Forge `rovo:mcp` server.
Every recommendation links back to the evidence. A human accepts every link; this is a triage assistant,
not a safety-certified tool. All demo data is procedurally generated and labelled synthetic.

## Repository layout

| Path | What |
|---|---|
| `packages/engine` | Pure, deterministic TypeScript core (stats, signal features, clustering, coverage). No Forge, DOM, clock or RNG. |
| `apps/forge` | The Forge app (coming next). |
| `docs/` | [PRD](docs/PRD.md), [architecture](docs/ARCHITECTURE.md), [demo script](docs/DEMO_SCRIPT.md), [seed data](docs/SEED_DATA.md), [milestones](docs/MILESTONES.md), [risks](docs/RISKS.md), research. |

## Development

Requires Node 22.12+ (or 24) and pnpm 10.

```bash
pnpm install
pnpm check   # typecheck + lint + tests (Vitest + fast-check)
```

## License

MIT
