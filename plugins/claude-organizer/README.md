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

## Dependency

The plugin ships **only the skills**. They operate on the `claude-organizer` MCP, which must be configured separately (Postgres + this monorepo). See the root `CLAUDE.md`.
