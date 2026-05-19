# claude-organizer

A "Jira" for Claude Code. Lets Claude Code track its own work via an MCP server
that exposes cards, sprints, roadmaps, comments and project docs. A Nuxt 4 UI
mirrors everything so the human can review what Claude sees and intervene.

## Architecture

```
Claude Code  ──stdio──▶  MCP server (Node + TS SDK)
                              │
                              ▼   shared use-cases (Drizzle)
Nuxt 4 UI   ──HTTP──▶   Fastify API   ──▶  Postgres 16 (Docker)
```

Monorepo (pnpm workspaces):

```
packages/
  db/    Drizzle schema, migrations, ID helpers
  core/  use cases shared by api and mcp (Zod-validated)
  mcp/   MCP server (stdio)
  api/   Fastify REST consumed by the UI
  web/   Nuxt 4 + Nuxt UI
```

## Prerequisites

- Node 20.10+
- pnpm 9+
- Docker + Docker Compose

## First-time setup

```bash
cp .env.example .env
pnpm install
pnpm db:up                # starts Postgres on port 5544
pnpm db:generate          # generates first migration from schema
pnpm db:migrate           # applies migrations
```

## Dev workflow

In separate terminals:

```bash
pnpm dev:api      # http://127.0.0.1:4400
pnpm dev:web      # http://127.0.0.1:4401
pnpm dev:mcp      # stdio - mostly invoked by Claude Code, not directly
```

## Wiring the MCP into Claude Code

Add an entry to your Claude Code MCP config (usually `~/.claude.json` or via
`claude mcp add`):

```json
{
  "mcpServers": {
    "claude-organizer": {
      "command": "node",
      "args": ["/absolute/path/to/claude-organizer/packages/mcp/dist/server.js"],
      "env": {
        "DATABASE_URL": "postgres://organizer:organizer@localhost:5544/organizer"
      }
    }
  }
}
```

Build first:

```bash
pnpm --filter @claude-organizer/mcp build
```

Or for dev, point at the tsx entry:

```json
{
  "command": "pnpm",
  "args": ["--silent", "-C", "/abs/path/claude-organizer", "dev:mcp"]
}
```

## Phase 1 scope

What this skeleton currently exposes:

- Projects: list, get, create
- Sprints: list, get active, create, start, complete
- Cards: list (filters), get, create, update, set status, move
- Comments: list (auto-mark-as-read), unread list, add (AI), mark as read

What's still pending:

- Tags, roadmaps, docs (schema is in place, tools not wired)
- Kanban drag-and-drop UI
- TipTap editor for descriptions and comments
- Skill `claude-organizer:planning-workflow`

## Roadmap

- **Phase 1** (current) - skeleton + CRUD MVP
- **Phase 2** - sprints/comments UI, TipTap editor, tags
- **Phase 3** - roadmaps + project docs (modules, ADRs)
- **Phase 4** - skill + optional LSP MCP

## Notes on IDs

Every entity uses prefixed nanoids (`prj_xxx`, `crd_xxx`, `spr_xxx`...). The
prefix tells the AI what kind of entity it's looking at without an extra
lookup.
