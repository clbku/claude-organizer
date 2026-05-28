---
name: claude-organizer
description: Use whenever the mcp__claude-organizer__* tools are available and you're about to start or continue work on a project tracked here. This is the entry point and panorama for using the board — consult it at the START of every coding session (before exploring code) to orient, and for how the board, comments and docs work. Trigger even when the user just says "let's continue" or "what's next". It does NOT hold the workflow rules: to turn a NEW fuzzy demand into structured work use the `plan` skill, and to execute a specific card through its lifecycle use the `implement` skill. Do NOT rely on memory; read state from here.
---

# Using claude-organizer

claude-organizer is a "Jira for Claude Code" exposed over MCP. It holds a project's **cards** (tasks), **sprints**, **backlog**, **comments**, and **docs**. It is the **source of truth for what to work on and why** — not your memory, not assumptions. Whenever its tools are available, use them to orient yourself and to record what you do, so work survives across sessions.

A fresh session starts with no memory of past work. This system is how continuity is preserved: the active sprint says what matters now, cards carry the detail, comments carry the back-and-forth with the user, and docs carry the architecture and decisions. Read it first; keep it honest.

> **Four skills, one board.** This skill covers **operating** the board — orienting, reading state, keeping it honest, comments and docs. The other three own distinct phases:
>
> - **`plan`** — when the user brings a **new demand** (a feature, a change, a fix) to turn into work: it understands the demand and organizes it into sprints/histories/tasks. Planning, not code.
> - **`implement`** — when you **execute** a card that already exists (a task, a story, a sprint's cards): it owns the **mandatory execution lifecycle** (`in_progress` → read comments → implement → commit → done). The moment you start building a specific card, that skill drives — every step is mandatory.
> - **`review`** — the **mandatory review gate** the `implement` skill fires before work closes: a per-task review and a story-level review, run by a **fresh subagent** that checks acceptance criteria and hunts for reuse/dead-code/comment improvements.
>
> Use this skill to orient and to keep the board honest throughout.

## Start of every session — orient before touching code

Do this sequence _before_ exploring the codebase or making changes:

1. **`list_projects`** — find the project whose `slug` matches the repo you're working in, and grab its `projectId`. Every other tool takes an explicit `projectId`.
2. **`get_active_sprint(projectId)`** — what's being worked on right now.
3. **`list_unread_comments(projectId)`** — feedback the user left that you haven't seen yet. Read it and address it first; it's often a correction or a new priority.
4. **`list_cards`** — the cards in flight. Read **what's on the board now**, not just the active sprint:
   - `list_cards(projectId, sprintId=<active sprint>)` — the active sprint's cards.
   - `list_cards(projectId, backlogOnly=true)` — sprint-less cards. Those in a board status (`todo`…`done`) are **standalone cards on the board**; those in the `backlog` status are the **backlog**.

   The board = the active sprint's cards **plus** every sprint-less card in a board status, so a card you must work may belong to no sprint at all. Returns short summaries, so you can scan many quickly.

5. For one card's full detail: **`get_card(id)`** or **`get_card_by_key(key)`** (e.g. `ABC-12`).
6. For architecture, decisions, or how-tos: **`list_docs(projectId)`** + **`read_doc(id)`**, or **`search_docs`**. Projects document themselves here — read before reinventing or re-deciding something.

If no project matches the current repo, ask the user before creating one.

**Wire the repo link once.** After step 1, if the project has no `repoWebUrl`, detect the current repo's remote so commit hashes link to the provider: read `git remote get-url origin` (fallback: the first of `git remote -v`), convert it to a web URL (`git@github.com:owner/repo.git` or `https://github.com/owner/repo.git` → `https://github.com/owner/repo`; GitLab the same, subgroups included), pick the `provider` by host (`github`/`gitlab`; skip a self-hosted host you can't classify), and save it with `set_project_repo(projectId, provider, repoWebUrl)`. Skip when it's already set or there's no git remote.

## Before you analyze or act — read the tasks first, code second

Whether you're **starting a single card** or **analyzing a group of them** (the backlog, a sprint, a set of tech-debt cards, "what's left to do?"), read what the board already knows _before_ you open the codebase: each card's full **description** (`get_card` / `get_card_by_key`) **and its comments** (`list_comments`), plus which **sprint** it sits in. `list_cards` returns only short summaries — never base an analysis on summaries alone.

Comments routinely carry the decisive context: a card may be flagged _"consolidated into CO-31 — don't execute in isolation"_, already resolved, deferred, or superseded by another card. Skipping the comments and jumping to the code produces redundant or wrong conclusions (e.g. recommending work that's already planned elsewhere). **Order: tasks first (description + comments + sprint), then code only if still needed.**

## The work phases live in their own skills — not here

This skill is the **panorama of how to use the board**. The actual workflow rules live elsewhere, and you should switch to them instead of working from memory:

- **New demand → `plan`.** Turning a fuzzy feature/change/fix into sprints/histories/tasks (clarifying, surfacing decisions, writing the cards) is the **`plan`** skill's job. Don't plan ad-hoc here.
- **Executing a card → `implement`.** The moment you start building a specific card, the **`implement`** skill drives — it owns the mandatory execution lifecycle so no step gets skipped. Don't reconstruct that flow from memory here.
- **Closing a task/story → `review`.** Before work closes, the `implement` skill fires the **`review`** skill's mandatory gate (per-task and story-level), run by a fresh subagent. Don't review your own work inline here.

Everything below is about **operating** the board itself — comments, card/sprint structure, docs — and applies across all phases.

## Comments — write signal, not noise

A comment exists to change what the **next reader** (a memoryless future session, or the user) knows. The criterion: **record what is NOT deducible from the card's state; omit what is.**

**Worth a comment (signal):**

- Decisions made and **why**.
- Scope changes — what entered/left and why.
- What was deferred or became another task, with the reference (e.g. `→ CO-2`); card keys auto-link. Write each key **in full** — `CO-53, CO-54`, never a shorthand range like `CO-53/54` (only the `CO-53` half becomes a link).
- What **differed** from what the card asked, or from the plan.
- Domain insights, edge cases, relevant fixes.

**Noise — don't write it:**

- The plan, before/while doing the work.
- Facts deducible from the card's state: "typecheck passed", "lint ok", "tests green", "moved to review". If a card reached review/done, the basics are assumed.
- Step-by-step narration or exhaustive lists of touched lines that don't change understanding.

Learn the _criterion_ (signal vs. noise; deducible vs. new) — don't follow a fixed blacklist. "typecheck passed" is just one example of the concept.

This signal-vs-noise criterion applies to **every** comment you write — including the **test plan** the `implement` skill makes you post when a card goes to `review`.

User comments arrive flagged unread. `list_unread_comments` lists them _without_ marking them read; `list_comments(cardId)` marks that card's user comments as read. Check unread comments at session start. **When you pick a card up to develop, `list_comments(cardId)` is mandatory before implementing** — the `implement` skill enforces this (every card, every time, even if read before, because new context may have landed). Reading the history's comments does **not** cover its children.

## Cards — field reference

To organize a new demand into the right structure, use the **`plan`** skill. This is just the reference for the card fields:

- **`summary`** — one line (~100 chars) describing _what_ the card is about. It's what shows on the board and in `list_cards`.
- **`descriptionMd`** — the spec: _behavior and intent_, acceptance criteria, decisions — **not** implementation code.
- **Sprint and status together decide where a card shows.** A card with **no `sprintId`** is sprint-less: in the **`backlog`** status it sits in the backlog; in a board status (`todo`…`done`) it's a **standalone card on the board**. A card in a sprint shows on the board while that sprint is active. New cards default to `backlog` when created with no sprint, `todo` when created in a sprint.
- **`parentId`** makes a card a sub-task of a **history** (one level). A card can be **blocked by** others (add/remove blockers) — the board flags it while a blocker isn't `done`.

**Always tag a task after creating it.** Attach the tag(s) that fit — area/layer (e.g. `web`, `api`, `mcp`) or type (e.g. `bug`). If no existing tag fits, **suggest new tag(s) and ask the user before creating them** — never invent tags silently. Tagged cards keep the board filterable and scannable.

## Docs — read before building, record after deciding

Docs are organized into **four top-level groups**; put each new doc under the right one:

- **Modules** (`module`) — one doc per code area/feature: what it does, how it's used, what it depends on.
- **Decisions / ADRs** (`adr`) — **one decision per doc** (_Context · Decision · Consequences_, terse). Don't pile decisions into a single doc.
- **Guides** (`guide`) — how-tos and references.
- **Notes** (`note`) — loose context, pending items, observations.

**Consult the docs before creating or executing a task.** Scan the docs tree first and read what's relevant to the task's area — the `module` for the code you'll touch, an `adr` for a decision that affects it, a `note` that might carry a constraint. You don't need to read _everything_ (no need to read a back-end note for a front-end task), but you DO need to glance at the tree and decide what's worth opening. Important context often lives only in a doc.

Use **`write_doc`** (no `id` creates, `id` updates; pass `parentId` to nest under a group), **`search_docs`** to find, **`read_doc`** for full content. When you make a notable decision, write an `adr` (under the Decisions group) — terse is fine; the _why_ is what matters.

## Conventions

- The board only reflects reality if you keep statuses honest as you go.
- New demand → **`plan`** skill (understand & organize) before executing.
- Executing a card → **`implement`** skill (mandatory lifecycle: `in_progress` → read comments → implement → review status → commit → done). Every step is obligatory — don't skip.
- Closing a task/story → **`review`** skill (mandatory gate, fresh subagent: per-task + story-level — acceptance criteria + reuse/dead-code/comment improvements).
- **Durable knowledge lives in docs, not in `CLAUDE.md`.** Architecture, data model, decisions (ADRs) and patterns belong in the docs — consult them, don't copy them into `CLAUDE.md`. Keep `CLAUDE.md` lean: it points at the project and its skills and holds only project-specific rules and overrides.
- Respect the repo's `CLAUDE.md`. When `CLAUDE.md` conflicts with a doc or this skill, `CLAUDE.md` wins — it's the project-specific override.
