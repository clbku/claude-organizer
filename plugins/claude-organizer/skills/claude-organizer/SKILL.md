---
name: claude-organizer
description: Use whenever the mcp__claude-organizer__* tools are available and you're about to start, continue, or execute development on a project tracked here. This skill is the source of truth for what to work on and how to keep the board honest — consult it at the START of every coding session (before exploring code) and as you work cards, comments and docs. Trigger even when the user just says "let's continue" or "what's next". To turn a NEW fuzzy demand into structured work (sprints/histories/tasks), use the `plan` skill instead. Do NOT rely on memory; read state from here.
---

# Using claude-organizer

claude-organizer is a "Jira for Claude Code" exposed over MCP. It holds a project's **cards** (tasks), **sprints**, **backlog**, **comments**, and **docs**. It is the **source of truth for what to work on and why** — not your memory, not assumptions. Whenever its tools are available, use them to orient yourself and to record what you do, so work survives across sessions.

A fresh session starts with no memory of past work. This system is how continuity is preserved: the active sprint says what matters now, cards carry the detail, comments carry the back-and-forth with the user, and docs carry the architecture and decisions. Read it first; keep it honest.

> **Planning vs. using.** This skill covers *using* the board. When the user brings a **new demand** — a feature, a change, a fix — to turn into work, use the **`plan`** skill: it understands the demand and organizes it into sprints/histories/tasks. Then come back here to execute the cards.

## Start of every session — orient before touching code

Do this sequence *before* exploring the codebase or making changes:

1. **`list_projects`** — find the project whose `slug` matches the repo you're working in, and grab its `projectId`. Every other tool takes an explicit `projectId`.
2. **`get_active_sprint(projectId)`** — what's being worked on right now.
3. **`list_unread_comments(projectId)`** — feedback the user left that you haven't seen yet. Read it and address it first; it's often a correction or a new priority.
4. **`list_cards(projectId, sprintId=<active sprint>)`** — the cards in flight. Returns short summaries (not full descriptions), so you can scan many quickly.
5. For one card's full detail: **`get_card(id)`** or **`get_card_by_key(key)`** (e.g. `ABC-12`).
6. For architecture, decisions, or how-tos: **`list_docs(projectId)`** + **`read_doc(id)`**, or **`search_docs`**. Projects document themselves here — read before reinventing or re-deciding something.

If no project matches the current repo, ask the user before creating one.

## Working a card

1. **`set_card_status(id, "in_progress")`** before you start, so the board reflects reality.
2. **Read the card's comments first** — call **`list_comments(cardId)`** *before* implementing. The user often leaves a correction or constraint on the **card itself**, not just in the session: a comment added after the initial briefing, or one you only skimmed, can change the whole approach. Address it before writing a line of code.
3. **Glance at the docs, then implement.** Scan the docs tree and read what's pertinent to this card's area — the relevant `module`, an `adr` that affects it, a `note` that might carry a constraint. Don't read unrelated docs (a back-end note for a front-end card), but do decide what's worth opening — important context often lives only there.
4. **`add_comment(cardId, ...)`** to record what carries **signal** — decisions, scope changes, deviations (see *Comments*). This is the project's memory for the next session.
5. **`set_card_status(id, "review")`** when you believe it's done — and post a **test plan** comment (see below). Then **wait for the user to validate**. Don't self-approve.
6. **`set_card_status(id, "done")`** only after the user confirms.

## Keep a history's status honest

A **history** (a parent card with sub-tasks) is a container, and its status should track its children instead of lagging behind them. The moment work starts on any child — you move the first sub-task to `in_progress`, or one is already `done` — move the history to `in_progress` too: a history sitting in `todo` while its tasks are underway misreads the board. Move it to `done` only when **every** child is `done`. The board shows each history's child counts, so an out-of-sync status is visible and confusing.

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

Learn the *criterion* (signal vs. noise; deducible vs. new) — don't follow a fixed blacklist. "typecheck passed" is just one example of the concept.

**Test plan on review.** When you move a card to `review`, add **one comment** with how to validate it — what to open, what to do, what to expect (and what was already checked, briefly). The console scrollback is ephemeral; this comment is where the user (and you) sees exactly how to test what's in review.

User comments arrive flagged unread. `list_unread_comments` lists them *without* marking them read; `list_comments(cardId)` marks that card's user comments as read. Check unread comments at session start **and** when you open a card.

## Cards — field reference

To organize a new demand into the right structure, use the **`plan`** skill. This is just the reference for the card fields:

- **`summary`** — one line (~100 chars) describing *what* the card is about. It's what shows on the board and in `list_cards`.
- **`descriptionMd`** — the spec: *behavior and intent*, acceptance criteria, decisions — **not** implementation code.
- A card with **no `sprintId`** goes to the **backlog**.
- **`parentId`** makes a card a sub-task of a **history** (one level). A card can be **blocked by** others (add/remove blockers) — the board flags it while a blocker isn't `done`.

**Always tag a task after creating it.** Attach the tag(s) that fit — area/layer (e.g. `web`, `api`, `mcp`) or type (e.g. `bug`). If no existing tag fits, **suggest new tag(s) and ask the user before creating them** — never invent tags silently. Tagged cards keep the board filterable and scannable.

## Docs — read before building, record after deciding

Docs are organized into **four top-level groups**; put each new doc under the right one:
- **Modules** (`module`) — one doc per code area/feature: what it does, how it's used, what it depends on.
- **Decisions / ADRs** (`adr`) — **one decision per doc** (*Context · Decision · Consequences*, terse). Don't pile decisions into a single doc.
- **Guides** (`guide`) — how-tos and references.
- **Notes** (`note`) — loose context, pending items, observations.

**Consult the docs before creating or executing a task.** Scan the docs tree first and read what's relevant to the task's area — the `module` for the code you'll touch, an `adr` for a decision that affects it, a `note` that might carry a constraint. You don't need to read *everything* (no need to read a back-end note for a front-end task), but you DO need to glance at the tree and decide what's worth opening. Important context often lives only in a doc.

Use **`write_doc`** (no `id` creates, `id` updates; pass `parentId` to nest under a group), **`search_docs`** to find, **`read_doc`** for full content. When you make a notable decision, write an `adr` (under the Decisions group) — terse is fine; the *why* is what matters.

## Conventions

- The board only reflects reality if you keep statuses honest as you go.
- New demand → **`plan`** skill (understand & organize) before executing.
- **Durable knowledge lives in docs, not in `CLAUDE.md`.** Architecture, data model, decisions (ADRs) and patterns belong in the docs — consult them, don't copy them into `CLAUDE.md`. Keep `CLAUDE.md` lean: it points at the project and its skills and holds only project-specific rules and overrides.
- Respect the repo's `CLAUDE.md`. When `CLAUDE.md` conflicts with a doc or this skill, `CLAUDE.md` wins — it's the project-specific override.
