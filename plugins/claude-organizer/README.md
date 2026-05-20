# claude-organizer (Claude Code plugin)

Two skills:

- **`claude-organizer`** — how to **use** the board: orient at the start of a session, work cards, comment with signal (not noise), docs.
- **`plan`** — turn a **new demand** into sprints/histories/tasks. Triggers automatically when you describe something to build.

## Installation

Development (current session):

```bash
claude --plugin-dir plugins/claude-organizer
```

Distribution (marketplace, from this repo):

```
/plugin marketplace add <owner>/<repo>
/plugin install claude-organizer@claude-organizer
```

> **There is no `--plugin` flag.** Use `--plugin-dir` (dev) or the marketplace (distribution).

Installing the plugin registers the `claude-organizer` MCP automatically (bundled `.mcp.json`, HTTP transport) — the `mcp__claude-organizer__*` tools appear with no `claude mcp add`. If you enable it mid-session, run `/reload-plugins`.

## The MCP server

The plugin ships the two skills **and** registers an MCP client pointing at an HTTP URL — but the MCP **server** must be running somewhere:

- **Local**: run the stack (Postgres + the MCP over HTTP) from this monorepo via Docker. Default URL `http://localhost:4402/mcp`, no auth.
- **Remote / VPS**: point the plugin at your host by exporting `CO_MCP_URL` (e.g. `https://mcp.example.com/mcp`); if the server requires a token, also export `CO_MCP_TOKEN`.

```bash
CO_MCP_URL=https://mcp.example.com/mcp CO_MCP_TOKEN=… claude
```

Both vars default safely: with neither set, the plugin talks to `http://localhost:4402/mcp` with an empty bearer header (ignored by an unauthenticated server). See the root `CLAUDE.md` for the full local setup.
