---
name: review
description: Use to REVIEW work in claude-organizer with fresh, objective eyes before it's closed — like a senior engineer reviewing a real PR. Two levels, both MANDATORY gates the `implement` skill fires — a per-task review when a task is done (its own diff), and a story-level review when a story's last child is done (the whole PR's cross-cutting concerns: duplication across tasks, coherence, story acceptance criteria). It verifies acceptance criteria are met the right way and hunts for real problems — bugs, security, DB/query and performance issues, outdated/deprecated/vulnerable dependencies, high complexity, missed reuse, unnecessary code and comments. It spawns a FRESH subagent for each pass, reports the findings, then asks what to do next (fix now / follow-up card / other). Trigger whenever a task just finished, a story's last task just finished, or the user asks to review a card/story/PR. Don't review in this context yourself, and don't auto-create cards. A trivial task (one-liner, rename, config) may skip its per-task review by quick judgment.
---

# Reviewing with fresh eyes

This skill is the **review phase** — what a careful **senior engineer reviewing a PR** does. The session that just wrote the code is the worst judge of it — it's anchored to the choices it made. So every review runs in a **separate subagent with a clean context**, which checks that the **acceptance criteria were actually met, the right way**, and goes looking for the **real problems a human reviewer would catch**: bugs and missed edge cases, security holes, slow or wasteful data access, risky dependencies, needless complexity, missed reuse, and code or comments that shouldn't be there.

There are **two levels**, with **different scopes so they don't redo each other's work**.

## The two levels

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

A task with **no parent** is its own unit (≈ its own PR). It gets a **single review at completion** — the per-task review *is* the whole review here, since there's no story layer above it. (Trivial-skip still applies.)

<HARD-GATE>
Both gates are **mandatory** and the `implement` skill fires them automatically — they are **not** optional and **not** skippable because the work "looks fine" (trivial tasks are the only exception, and only at the per-task level). The point is exactly that the implementing session's confidence is unreliable; an independent pass catches what it's blind to. Run the gate **before** the unit closes (`done`). Skipping it is a defect.
</HARD-GATE>

## How — spawn a fresh subagent

Do **not** review in this context. Spawn a **subagent** (`Agent` tool) per pass, starting from a clean slate, and give it what it needs to work alone:

- **The card** — pass the **card id or key** (e.g. `CO-42`). For a per-task review, that task; for a story review, the **story** (the subagent reads the parent **and all children** via `get_card` / `get_card_by_key` + `list_comments`, so it has the acceptance criteria and any constraints from comments straight from the source). You may also paste the criteria inline, but the id lets it pull the full current context itself.
- **The changeset, from git** (not the attached-commit blobs):
  - **per-task** → that task's change: the task's commit (`git show <sha>`) or the working-tree diff of just that task's files.
  - **story** → the whole unit: the branch/PR diff against the base (`git diff <base>...HEAD`), or the commits whose messages reference the story's key **and its children's keys**.
  It reads the **actual changed files**, and for reuse checks **searches the surrounding codebase** for existing helpers/components — reuse can't be judged from the diff alone.
- **The mandate** — the scope for this level (above), the checks (below), and the **output format** (below).

The subagent **finds and reports** — it does not fix and does not touch the board. It returns its findings to you as data.

### What the subagent checks

**Acceptance criteria come first** — that's what the review is *for*:

1. **Acceptance criteria — met, and met well.** For each criterion in scope, decide **met / partial / not-met** with concrete evidence (the file/function that satisfies it, or what's missing). "Met well" counts: a criterion satisfied by convoluted or fragile code is **partial**.

Then review the change the way a **senior engineer reviewing a real PR** would. The lenses below are the **usual suspects, not an exhaustive checklist** — apply the ones that fit *this* change (a CSS tweak has no DB concern; a query change does), and follow your nose to whatever else looks wrong:

- **Correctness & edge cases** — bugs, off-by-one, unhandled `null`/empty/error paths, race conditions, broken assumptions, wrong status codes, missing `await`.
- **Security** — injection (SQL/command/XSS), missing authz/authn or tenant checks, secrets or tokens committed, unsafe handling of user input, overly broad permissions, sensitive data in logs.
- **Performance & data access** — DB query problems (N+1, missing index, over-fetching columns/rows, query in a loop, missing pagination), expensive work in hot paths, needless re-renders/recomputation, unbounded memory.
- **Dependencies** — newly added or bumped packages that are **outdated, deprecated, unmaintained, or carry known vulnerabilities**; a heavyweight dep for something trivial the codebase or stdlib already does; and the project's supply-chain rule (don't adopt a version published <7 days ago).
- **Complexity** — functions/components doing too much, deep nesting, tangled control flow, premature abstraction. Flag what should be simplified or split, with the simpler shape.
- **Reuse over reinvention** — re-implementing a util/helper/hook/component/type/constant the codebase already provides. Point at the existing thing. (Story level: focus on duplication **between tasks**.)
- **No more code than needed** — dead code, unused exports, speculative options nobody asked for, copy-paste, over-engineering for a case the card doesn't require.
- **Comments that earn their place** — comments that restate the code or narrate the obvious, per the project's comment rules (capture a non-obvious *why*, not the *what*). Don't flag comments that carry real signal.
- **Consistency with the codebase** — deviations from the project's established patterns/conventions where there's no reason to deviate.

Match the depth to the change: don't manufacture findings to look thorough, and don't wave through a risky one because the diff is small. Frame each finding as an **improvement with a rationale**, not a nitpick — what, where (`file:line`), why it matters, the concrete fix, and how sure you are.

### Output format the subagent returns

```
## Acceptance criteria
- [met | partial | not-met] <criterion> — <evidence / what's missing>
  …one line per criterion in scope…

## Findings
- [bug | security | performance | dependency | complexity | reuse | dead-code | comment | consistency | other] <file:line> — <what & why> → <suggested fix> (severity: high|med|low)
  …one per finding, ordered by severity; empty if none…

## Verdict
<one line: are the in-scope acceptance criteria met the right way? biggest thing to address, if any>
```

## After the subagent returns — report, then ask

1. **Report** to the user — acceptance-criteria verdict first (this is what the review is *for*), then the improvement findings, concise and grouped. Don't bury the lede: a not-met criterion or a high-severity finding goes up front.
2. **Ask what to do next — don't act on your own.** Present the options; **do not** auto-create cards and **do not** start fixing unprompted:
   - **fix now** — apply the changes before the unit closes (they fold into the same PR);
   - **follow-up card(s)** — capture findings as new cards (via the `plan`/board flow) for later;
   - **other** — defer, dismiss as won't-fix, accept as partial, etc.
3. **Act on the choice.** Fixes go back through the `implement` lifecycle; cards get created; then the unit can close.

Record the outcome on the board: a short comment on the card with the criteria verdict and anything deferred, following the signal-vs-noise rule in the `claude-organizer` skill. The full finding list is ephemeral working material — never paste the whole diff or a wall of nitpicks into a comment.

## Where this sits

Planning (`plan`) → execution (`implement`) → **review (this skill)** → close. The `implement` skill fires the per-task gate as each task wraps up and the story gate when the last child finishes; this skill hands back once findings are reported and the user has chosen what to do, so the task/story can move to `done` and the PR can be merged.
