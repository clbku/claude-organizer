---
name: review
description: Use to REVIEW work in claude-organizer with fresh, objective eyes before it closes — like a senior engineer on a real PR. Two MANDATORY gates the `implement` skill fires: a per-task review when a task finishes (its own diff), and a story-level review when a story's last child finishes (cross-cutting concerns a single task can't see). Each pass runs in a FRESH subagent that verifies the acceptance criteria were met the right way and hunts the real problems a reviewer catches — bugs, security, performance, risky deps, complexity, missed reuse, dead code — then disposes of EVERY finding, never dropping one on severity. Trigger when a task or a story's last task just finished, or the user asks to review a card/story/PR. Don't review in this context yourself, and don't auto-create cards. A trivial task may skip its per-task review.
---

# Reviewing with fresh eyes

This skill is the **review phase** — what a careful **senior engineer reviewing a PR** does. The session that just wrote the code is the worst judge of it: it's anchored to the choices it made. So every review runs in a **separate subagent with a clean context**, which checks that the **acceptance criteria were actually met, the right way**, and goes looking for the **real problems a human reviewer would catch**: bugs and missed edge cases, security holes, slow or wasteful data access, risky dependencies, needless complexity, missed reuse, and code or comments that shouldn't be there.

<SKILL-GATE>
**Load the `claude-organizer` panorama first.** This skill assumes you are oriented on the board. If you have **not** already loaded the **`claude-organizer`** skill in this conversation, invoke it now (Skill tool) and run its start-of-session orientation **before** anything below. If it is already loaded in this conversation, don't reload it — just continue. Don't enter this skill cold.
</SKILL-GATE>

## The two levels — different scopes, so they don't redo each other's work

### Per-task review — local scope

Fires when a **task** is done, **before it closes**. Reviews **just that task's diff**:

- the **task's own acceptance criteria** — met / partial / not-met, with evidence;
- **reuse, dead code, and comments** *within that task's change*.

**A trivial task may skip it.** A one-liner, a rename, a config tweak, a pure copy move — nothing with real logic — isn't worth a subagent. Use quick judgment; when you skip, say so briefly (a short note/comment on the card) so the skip is visible, not silent. When in doubt, review.

### Story-level review — cross-cutting scope

Fires **once**, when a **story's last child task is done**, **before the story closes**. The per-task reviews already covered each task's internals, so this pass looks **only at what a single task can't see**:

- **the story's acceptance criteria** — the sum of the tasks *plus* what emerges from them together;
- **duplication across tasks** — two tasks that each grew a near-identical helper/component/type; logic that should have been shared;
- **coherence of the whole PR** — does the changeset hang together, or are there seams, leftovers, contradictions between tasks?

It does **not** re-review each task line-by-line — that's already done. Reviewing the same code twice wastes the pass.

### Standalone task

A task with **no parent** is its own unit (≈ its own PR). It gets a **single review at completion** — the per-task review *is* the whole review, since there's no story layer above it. (Trivial-skip still applies.)

<HARD-GATE>
Both gates are **mandatory** and the `implement` skill fires them automatically — they are **not** optional and **not** skippable because the work "looks fine" (trivial tasks are the only exception, and only at the per-task level). The point is exactly that the implementing session's confidence is unreliable; an independent pass catches what it's blind to. Run the gate **before** the unit closes (`done`). Skipping it is a defect.
</HARD-GATE>

> **On comments:** the `implement` skill already requires code to be written without needless comments from the start, so the reviewer treats comment noise as a **safety net** — flagging what slipped through, not running a cleanup the implementer should never have left for it.

## How — dispatch the `reviewer` agent

Do **not** review in this context. Spawn a **fresh subagent** per pass, starting from a clean slate.

**Use the dedicated `claude-organizer:reviewer` agent** (`Agent` tool, `subagent_type: "claude-organizer:reviewer"`). It is **read-only by construction** — its tool roster has no `Edit`/`Write` and no board-write MCP tools, so it physically **cannot** fix code or touch the board, only read code + git + the board and report. The full review **mandate** (scope discipline, the checks, the output format) lives in the **agent definition** — this skill doesn't restate it; it just hands the agent the scope and the changeset:

- **The card** — the **card id or key** (e.g. `CO-42`) **and the scope** (per-task / story / standalone). The agent pulls the card itself (`get_card` / `get_card_by_key` + `list_comments`; for a story, the parent **and all children**), so it has the acceptance criteria and constraints straight from the source.
- **The changeset spec** — how to see exactly the code in scope (it runs the git itself; don't paste diffs):
  - **per-task / standalone** → that task's commit (`git show <sha>`) or the working-tree diff of just its files (`git diff`).
  - **story** → the whole unit: the branch/PR diff against the base (`git diff <base>...HEAD`), or the commits referencing the story's key **and its children's keys**.

The agent returns a structured report — **Acceptance criteria** (met/partial/not-met per criterion, with evidence), **Findings** (typed, ordered by severity, with `file:line` + fix + severity), and a one-line **Verdict** — as data, not prose. It **finds and reports**; it does not fix and does not touch the board.

> If `subagent_type: "claude-organizer:reviewer"` isn't resolvable in this environment (agent not loaded), fall back to `general-purpose` and paste the mandate from `agents/reviewer.md` into the prompt — but prefer the named agent, so the read-only roster is enforced.

## After the subagent returns — report, then dispose of every finding

<HARD-GATE>
The report is **input for a disposition that is the user's call, not yours.** You wrote this code, so you are the worst judge of whether a finding is "worth it" — that bias is the entire reason the review ran in a fresh subagent, and letting the writing session veto the findings reintroduces exactly what the gate exists to defeat. So **every finding is either fixed or surfaced — none is silently dropped, and severity never authorizes a drop.** `low` *ranks* a finding (do the high ones first); it does **not** delete it. "Not worth a fix cycle", "the reviewer only flagged low ones", "it's basically fine" — none of those is yours to decide unilaterally; deciding one and committing past it is a **defect**, the same class as skipping the gate.
</HARD-GATE>

1. **Report** to the user — acceptance-criteria verdict first (this is what the review is *for*), then the findings, concise and grouped. Don't bury the lede: a not-met criterion or a high-severity finding goes up front. Report the **low** ones too — they're in the list, not filtered out.
2. **Dispose of each finding — route it, never bin it.** Two paths, and **every** finding takes one of them:
   - **Cheap, in-scope, unambiguous improvement** (a leftover comment, a missed reuse, dead code, a small rename, a tidier shape) → **just fix it.** It folds into the working tree, and the user reviews it in the diff at the next lifecycle step anyway — so this **adds** oversight, it doesn't bypass it. This is the one disposition you may do without asking, precisely because it can only improve the change the user is about to see.
   - **Everything else** — a real **trade-off**, a finding the **reviewer itself recommends keeping**, a naming/contract call, or anything **too big for this card** (spans many files/systems or a module this card doesn't touch) → **surface it to the user with a recommendation** (options + a recommended marker, same bar as a decision) and let the user dispose: **fix now** / **follow-up card** (via the `plan`/board flow) / **inbox** for later / **dismiss with a stated reason**. Relay the reviewer's own rationale when it recommended keeping. **Don't auto-create cards** — propose, the user chooses.
3. **Act on the choice.** Fixes go back through the `implement` lifecycle; follow-up cards/inbox items get created once the user says so; then the unit can close.
4. **Re-review non-trivial fixes before closing.** A fix is itself a change, and a change can introduce new problems. If the fixes you applied were **substantial** — a new function, edits across several files, a reworked code path, anything with real logic — run **one more fresh review pass over the fix diff** before the unit closes. **Skip** the re-review for **obvious** fixes (deleting a comment, a lint/format tweak, a rename, a one-liner) — same trivial-skip judgment as a per-task review. The session that just applied the fix is the worst judge of it.

Record the outcome on the board: a short comment on the card with the criteria verdict and anything deferred, following the signal-vs-noise rule in the `claude-organizer` skill. The full finding list is ephemeral working material — never paste the whole diff or a wall of nitpicks into a comment.

## Where this sits

Planning (`plan`) → execution (`implement`) → **review (this skill)** → close. The `implement` skill fires the per-task gate as each task wraps up and the story gate when the last child finishes; this skill hands back once every finding is disposed — the cheap in-scope ones fixed, the rest decided by the user — so the task/story can move to `done` and the PR can be merged.
