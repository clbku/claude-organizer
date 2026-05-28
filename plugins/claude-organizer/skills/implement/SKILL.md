---
name: implement
description: Use to EXECUTE a card that already exists on the board in claude-organizer — implement a sprint, a history/story, or a single task. Trigger the moment you start, resume, or carry out development on a specific card ("work CO-42", "let's implement this story", "continue the task", "build it now"). This skill owns the mandatory execution lifecycle: in_progress → read comments → implement → review → commit → done. It NEVER assumes — any ambiguity or open decision the card doesn't settle goes to the user first (options + recommendation, like `plan`), and answers live in comments. To turn a NEW fuzzy demand into cards, use `plan` instead; to orient/keep the board honest, see `claude-organizer`. Do NOT skip steps.
---

# Implementing a card

This skill governs the **execution of a card that already exists** on the board — a task, a history (story), or the cards of a sprint. Planning produced the card; here you build it and walk it through its lifecycle while keeping the board honest.

If you arrived here without orienting first, stop and orient via the **`claude-organizer`** skill (active sprint, unread comments, the board). To break a new demand into cards, use **`plan`** — not this skill.

<HARD-GATE>
Every step in **The lifecycle** below is **MANDATORY and ORDERED**, for **every** card — trivial or not. You do **not** skip a step, reorder it, or fold it away because:

- it "seems unnecessary" or "obvious",
- you "already did it earlier" (in this session, on the parent history, on a sibling task),
- the card is "too small",
- or you judged it faster to go straight to code.

The board is only honest if **every** card walks the **full** lifecycle in lockstep with the real work. Skipping a step — not flipping status, not re-reading this card's comments, committing before the user reviews, not attaching the commit, not moving to `done` after validation — is a **defect**, not an optimization. When in doubt, do the step.
</HARD-GATE>

## Never assume — ask the user

Execution constantly hits things the card didn't fully nail down. **Never assume your way past one — ask.** This covers **both** kinds of unknown, exactly as the `plan` skill separates them:

- **Ambiguities** — anything unclear about what the user wants: vague wording, an unstated expectation, an edge case the card doesn't mention, "did they mean X or Y?". Even a *small* ambiguity gets a question — don't resolve it by guessing the "probably intended" reading.
- **Decisions** — open choices where more than one reasonable path exists: which library or existing helper, how to shape data, where code lives, a naming/contract call, behavior on an edge case.

A wrong assumption baked into code is expensive to undo and is often not what the user wanted; asking now is far cheaper than rebuilding later. **Make it clear what you're about to do** — before building, state the approach in plain terms so the user can catch a wrong assumption *before* it's code. Don't disappear and come back with choices already made.

Apply the **same method as the `plan` skill**:

- **For an ambiguity**, a direct question is fine (open-ended where that fits). **For a decision**, present **ready-made options**, not "what do you think?" — each concrete and worked out, with its **trade-offs (pros/cons)**, and the one you **recommend** marked, with the reason.
- **One topic per message**; prefer multiple-choice. Use the `AskUserQuestion` tool.
- **Unknowns chain** — settle the earlier one first, because it narrows the next.
- **Research when you can't offer good options from knowledge alone** (e.g. which library, its trade-offs), then present what you found.

Keep asking until **nothing material is left to guess**. Assuming instead of asking is a **defect**, the same as skipping a lifecycle step.

**Check before you ask — the answer may already exist.** It may be settled in the card's **description** or, crucially, in its **comments** (this is exactly why reading comments at task start is mandatory, even if you read them before — see step 2). Only ask what isn't already answered; don't re-litigate a settled call.

**Record the answer once you have it.** Save each resolved decision/clarification as a **comment** on the card (it's signal — see step 5), so it survives for the next session and isn't re-asked.

**A story is decided up front, as a whole.** Before you start building a story with several cards, **read all of its cards** (description + comments) and gather **every** open decision and ambiguity across them, then clear them with the user **before writing code**. Don't start card 1, hit a fork mid-way, and guess — surface the doubts as a batch (still one decision per message, chained) so the whole story is unblocked before execution begins.

## The lifecycle — every card, every time, in order

### 1. Re-read the board, then move the card to `in_progress`

- **Re-read before you start.** Don't trust an earlier read or your memory: between cards the user may have re-prioritized, pulled in work, or left a comment. Re-query the active sprint and the sprint-less `todo`/`backlog` cards, and check `list_unread_comments`, so you act on the **current** state.
- **`set_card_status(id, "in_progress")` the moment you pick the card up** — before writing a line of code. Non-negotiable, even for a one-line change. A card being worked while it still reads `todo` is the board lying.
- If it's a sub-task, also move its **history** to `in_progress` now (see _History status_).

### 2. Read THIS card's comments — `list_comments(cardId)` — even if you read them before

This is the step most often skipped, and skipping it is where the work goes wrong.

- Call **`list_comments(cardId)` before implementing, every card, every time** — including each sub-task of a history.
- **Re-read even if you already read this card's comments earlier.** Re-read at the **start of the task** specifically, because something **new or different may have been added since** — a correction, a constraint, a scope change the user posted after the briefing or while you were on another card.
- Reading the **history's** comments does **not** cover its children, and a sibling task having nothing does **not** mean this one does. Comments are **per-card**.
- **Comments are where settled decisions and clarifications live** — the answer to a question you'd otherwise ask may already be here. Read them so you don't re-ask, and don't assume past what they say (see _Never assume_).
- Address whatever's there **before** writing code. Never skip because you "already read the comments around here".

### 3. Read the relevant docs

Scan the docs tree (`list_docs` / `search_docs`) and read what's pertinent to this card's area — the `module` for the code you'll touch, an `adr` that affects it, a `note` that may carry a constraint. Don't read unrelated docs; do decide what's worth opening. Important context often lives only there.

### 4. Implement

Build the card. Follow the repo's `CLAUDE.md` and the agreed git flow (see _Git flow_). Stay within the card's scope; if scope shifts, that's a comment (step 5) — and possibly a new card via `plan`. **The moment you hit an ambiguity or a decision the card doesn't settle, stop and ask** — don't assume your way forward (see _Never assume_); fold the answer back in and record it as a comment.

### 5. Record signal as comments

As you work, **`add_comment(cardId, …)`** for what carries **signal** — decisions and why, scope changes, deviations from what the card asked, domain insights, edge cases. Skip noise (the plan, narration, "typecheck passed"). The criterion (signal vs. noise) lives in the **`claude-organizer`** skill — follow it. This is the project's memory for the next session.

### 6. Move to `review` the moment you hand off — **even if you haven't committed**

- **`set_card_status(id, "review")` the instant you stop and the user takes over** to validate. Status reflects **who holds the ball**, not whether a commit exists. Do this **even though the commit hasn't landed yet** — the commit only lands after the user confirms it works (steps 7–8), but the card belongs in `review` from the moment _you're_ done and _they_ need to look.
- On the **same move**, post **one** comment with the **test plan**: what to open, what to do, what to expect, and briefly what you already checked. The console scrollback is ephemeral; this comment is where the user (and a future session) sees how to validate what's in review.
- Then **wait for the user to validate**. Do **not** self-approve and do **not** jump ahead to commit or `done`.

### 7. Per-task review gate — a fresh subagent, **before commit** (skip only if trivial)

Now that the behavior is validated, run the **per-task review** via the **`review`** skill **before** committing — over the **working-tree diff** (`git diff`), so any fixes fold into the change and the card keeps **one clean commit**. It spawns a **fresh subagent** (objective eyes — you just wrote this code, so you're the worst judge of it) that checks **this task's acceptance criteria** and hunts for **reuse / dead code / noise comments**, then reports and asks what to do (fix now / follow-up card / other). A **trivial** task (one-liner, rename, config — nothing with real logic) may **skip** this by quick judgment; note the skip briefly so it's visible, not silent. See _Review gate_.

### 8. Let the user review the diff — **before** committing

Once the behavior is validated and the per-task review is settled, **let the user review the diff first**. Don't commit on your own initiative. Wait for the user's go-ahead on the actual changes before creating the commit.

### 9. Commit, then attach the commit's diff to the card — **always**

- After the user confirms, create **one commit per card**, message in English referencing the key (e.g. `feat(tags): … (CO-4)`), per the repo's `CLAUDE.md` (commit + versioning rules).
- **Always attach the commit's diff to the card** — right after it lands. Run the project's `pnpm attach-commit <sha>`, or the bundled script in this skill's own `scripts/`: `node "<skill dir>/scripts/attach-commit.mjs" <sha>` (or the `.py` twin where Node isn't available). It runs `git show` and POSTs the diff straight to the API (`CO_API_URL`, default `http://127.0.0.1:4400`), so the card's **Changes** section shows what the commit produced.
- The diff is captured **outside your context on purpose** — **never read it or paste it into a comment** (it burns tokens and adds noise).

### 10. Move to `done` — **always**, only after the user confirms

**`set_card_status(id, "done")`** once the user has confirmed it works. Don't leave a validated card sitting in `review`, and never mark `done` before validation.

If this is the **last child of a story**, the **story-level review gate** fires **before** the story closes (see _Review gate_); only then move the history to `done` too (see _History status_).

## Review gate — mandatory, before a task or story closes

Work gets an independent review so acceptance criteria are actually met and the change carries no more code than it needs. Don't review it yourself — the **`review`** skill spawns a **fresh subagent** for objective eyes, reports the findings, and asks what to do (fix now / follow-up card / other). Fixes come back through this lifecycle. There are **two levels**, at **two moments**:

- **Per task — before commit (step 7).** Reviews **that task's working-tree diff** (`git diff`): its own acceptance criteria + reuse/dead-code/comments. Fixes fold into the single commit. A **trivial** task (one-liner, rename, config — nothing with real logic) may **skip** by quick judgment; note the skip so it's visible, not silent.
- **Per story — when the last child is done, before the story closes (step 10).** An additional pass over the **whole story** (≈ one PR), from the story's **commits / branch diff** (`git diff <base>...HEAD`), scoped to what a single task can't see: **the story's acceptance criteria**, **duplication across tasks**, **coherence of the PR**. It does **not** re-review each task line-by-line — the per-task gates already did. A **standalone task** (no parent) has no story layer: its per-task review *is* the whole review.

Skipping a gate (beyond the trivial-task exception) is a defect.

## Git flow — agree before you start

Before implementing a story (or the first card of a batch), get the git flow straight — **don't assume**:

- If the repo's `CLAUDE.md` already defines a flow, follow it.
- Otherwise, when you're on `main`/`master`, **ask the user how to proceed**: a branch + PR? a branch merged later? commit straight on the current branch? **Mirror what the user already does** — some want a branch + PR per story, others a branch per task, others everything left in review on one branch.

A batch of several cards may mean **several branches** — warn the user that you'll need to **switch branches** between cards, and don't pile unrelated work onto one branch. Watch for **conflicts**: don't run far ahead in parallel if the work will collide; sequence dependent cards with the **blockers** system (a card `blocked by` another) so the order is explicit.

## History status — keep it honest as children move

A **history** (a parent card with sub-tasks) is a container; its status tracks its children, not the other way around. The moment work starts on any child — you move the first sub-task to `in_progress`, or one is already `done` — move the history to `in_progress` too. Move it to `done` only when **every** child is `done`. The board shows each history's child counts, so an out-of-sync status is visible and confusing.

## The one-line checklist

For each card, in order — no step skipped. **Standing rule: never assume — any ambiguity or decision the card doesn't settle goes to the user before you build (see _Never assume_); for a story, clear all of them up front.**

1. Re-read the board → `in_progress` (history too, if a sub-task).
2. `list_comments(cardId)` — even if read before; new context may have landed (and is where settled decisions live).
3. Read the relevant docs.
4. Implement — hit a doubt? stop and ask, don't assume.
5. Comment the signal.
6. `review` status the moment you hand off (even uncommitted) + test-plan comment → wait for behavioral validation.
7. **Per-task review gate** (`review` skill, fresh subagent, working-tree diff; skip only if trivial) → report & ask → fixes fold in.
8. Let the user review the diff before committing.
9. Commit (one per card, key in message) → attach the diff to the card.
10. `done` after the user confirms — and if this is a story's last child, the **story-level review gate** first, then close the story.
