<h1 align="center">Claude Organizer</h1>

A "Jira" for Claude Code. Claude Organizer gives Claude Code tools (over MCP) to
manage a project's living state — tasks, sprints, roadmaps, docs — in a queryable
system instead of spec Markdown files that grow without bound and go stale. A
Nuxt UI mirrors it for humans. It ships as a Claude Code plugin (two skills + the
MCP server), backed by a pnpm monorepo you run with Docker.

## Quick start

Requires Node 20.10+, pnpm 9+, and Docker.

**1. Bring up the stack** (Postgres + migrations + API + UI + MCP):

```bash
cp .env.example .env
docker compose up
```

UI on http://localhost:4401 · API on `:4400` · MCP on `:4402/mcp`. Migrations run
automatically.

**2. Install the plugin** — it delivers the skills **and** the MCP, no
`claude mcp add`:

```bash
claude --plugin-dir plugins/claude-organizer    # from a clone
```

or via marketplace:

```
/plugin marketplace add fmilioni/claude-organizer
/plugin install claude-organizer@claude-organizer
```

The `claude-organizer` tools appear automatically, pointing at
`${CO_MCP_URL:-http://localhost:4402/mcp}`. Two skills come with it:
**`claude-organizer`** (work the board) and **`plan`** (break a new demand into
sprints/tasks).

## Using it

Just talk to Claude Code — the skills trigger themselves.

**Plan a new demand** (the `plan` skill):

> **You:** I want to add CSV export to the board — a button that downloads the
> active sprint's cards.
>
> **Claude:** *asks a couple of questions, proposes a breakdown into a
> sprint + tasks, and on your OK creates the cards in Claude Organizer.*

**Continue later** (the `claude-organizer` skill) — a fresh session has no
memory, so it reads the board before touching code:

> **You:** let's continue — what's next?
>
> **Claude:** *reads the active sprint, your unread comments and the in-flight
> cards, picks the top one, moves it to `in_progress`, implements it, records
> the decisions as comments, then moves it to `review` for you to check.*

## Remote (VPS)

Host the stack, then point Claude Code at it before launching:

```bash
CO_MCP_URL=https://your-host/mcp CO_MCP_TOKEN=your-token claude
```

`CO_MCP_TOKEN` is only needed if the server sets `MCP_AUTH_TOKEN`. Terminate TLS
with a reverse proxy (Caddy, Nginx, …).

## Architecture

```
Claude Code ──HTTP──▶ MCP (:4402/mcp) ─┐
                                       ├─▶ core ──▶ Postgres 16
Browser (SPA) ──HTTP──▶ API (:4400) ───┘   (+ WebSocket /ws for real-time)
```

pnpm monorepo: `shared` (types) · `db` (Drizzle schema/migrations) · `core`
(Zod-validated use-cases, the single source of truth) · `mcp` (stdio or HTTP) ·
`api` (Fastify) · `web` (Nuxt 4 SPA). The UI talks only to the API, never the
MCP. IDs are prefixed nanoids (`prj_`, `crd_`, `spr_`…) so the AI knows the
entity type at a glance.

## Dev (without Docker)

```bash
pnpm install
pnpm db:up                       # Postgres on :5544
pnpm db:migrate
pnpm dev:api                     # :4400
pnpm dev:web                     # :4401
MCP_HTTP_PORT=4402 pnpm dev:mcp  # :4402  (omit MCP_HTTP_PORT for stdio)
```

Also: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm db:generate` (after
schema changes).
