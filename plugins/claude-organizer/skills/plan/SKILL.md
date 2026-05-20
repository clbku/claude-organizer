---
name: plan
description: Use to turn a NEW fuzzy demand — a feature, a change, a fix — into structured work in claude-organizer (sprints, histories/stories, tasks). Trigger whenever the user describes something new to build (a feature, a change, a fix) before it's broken down, or asks to plan/organize the work. Understands the demand, organizes it, gets the design approved, then creates the cards. This is PLANNING, not execution — do NOT write code here.
---

# Planning a demand into sprints, histories and tasks

Turn an idea into well-formed work through collaborative dialogue, then materialize it as **cards in claude-organizer**. The artifact here is the **cards in the MCP** — not a spec file. Execution happens afterwards via the `claude-organizer` skill, card by card, with the user validating.

<HARD-GATE>
Do NOT write code, scaffold, edit files, or take any implementation action until you have presented the organization (the plan) and the user has approved it. This applies to EVERY demand regardless of perceived simplicity — "too simple to plan" is exactly where wrong assumptions get baked in. The plan can be short, but you MUST present it and get approval.
</HARD-GATE>

## Flow

1. **Orient.** Read the current state first: `list_projects` → `get_active_sprint` → `list_unread_comments` → `list_cards`. Then scan the **docs tree** (Modules / Decisions / Notes) and read what's relevant to the demand's area — a past decision or a note can change the design, and modules tell you how the area already works. Don't read everything; glance and decide. Know what exists before proposing anything.
2. **Understand.** Ask clarifying questions to remove ambiguity about the goal, constraints, edge cases, and what "done" looks like. **One topic per message**; prefer multiple-choice when possible (open-ended is fine). Keep asking until nothing remains that would materially change what gets built. It's far cheaper to ask now than to bake a wrong assumption into a card executed blindly later.
3. **Organize (propose).** Decide the shape of the work and present it with your reasoning:
   - **single task** — one coherent, testable deliverable.
   - **history (story) + tasks** — a cohesive feature split into a few testable deliverables.
   - **sprint + histories + tasks** — a large, cohesive effort worth isolating.
4. **Get approval.** Present the proposed structure (and, when useful, 2–3 approaches with a recommendation). Revise until the user approves. Only then create anything.
5. **Create in the MCP.** Materialize the approved structure: `create_sprint` (if needed) → histories (cards) → tasks (cards, with `parentId` for a history's children). Create cards in dependency order — a task before the ones that depend on it — so a card you need to reference already has its key. Wire dependencies with blockers when one task must precede another. **Tag every task you create** (see the tagging rule in the `claude-organizer` skill): attach the tags that fit; if none fit, suggest new tag(s) and ask the user before creating them.
   - **Tasks live only as cards — never as a list in prose.** A history's `descriptionMd` describes the *history*: its goal, scope and decisions. It does **not** enumerate its tasks. The tasks ARE the child cards (`parentId`), and the board already shows them nested under the history. Re-listing them in the body creates a second, drifting copy of the breakdown and invites positional references like `CO-46.1` ("task 1 of the history") instead of the card's real key.
   - **Cross-reference by the card's real key.** When one card points at another — a dependency, a follow-up, "the foundation task" — use the key the MCP assigned (e.g. `CO-51`), which auto-links. Never invent a positional alias (`CO-46.1`, "task 1"): it links to nothing and breaks the moment order or scope changes. This is exactly why you create in dependency order — so the real key exists when you write the reference.
6. **Hand off.** Tell the user the plan is on the board; execution proceeds via the `claude-organizer` skill (in_progress → implement → review → done).

## Granularity — Scrum, adapted for full-IA execution

This is executed **full-IA with the user's review and validation**. Think in real Scrum terms, adapted to "the AI defines and executes".

**A task is a deliverable the user can test** — not a micro-step.

Example — "CRUD for customers":
- a **history**: "Customer registration"
- **tasks**: list customers · create customer · edit customer · delete customer

Each task is independently buildable and testable. If the whole thing is trivial, make it **a single task**. Don't over-split into "write the failing test" micro-steps (that's execution detail, not planning), and don't under-split "the whole feature" into one opaque blob. Judge by what delivers something the user can actually exercise.

## Writing a task so it can be executed

Write each task so a developer — or a fresh agent with **zero chat context** — can read it, understand it, and execute it correctly. Use sections as needed (not all are always required, but it must be clear how to execute):

- **Objective** — what and why.
- **Expected behavior** — user-visible behavior and rules.
- **Acceptance criteria** — how to know it's done.
- **Decisions** — what was settled during clarification.
- *(as needed)* constraints, out-of-scope, references, links.

Describe **behavior and intent, not code**. Do **not** write the implementation or hard-prescribe *how* to build it — the executor decides that — **unless** it's a real constraint or an already-diagnosed bug (then being specific is correct). Naming a real endpoint/table/file is fine; writing function bodies is not.

The test: *could a fresh session execute this task using only its contents?* If not, it's underspecified — keep refining (go back to the user if needed).

## Where the work lives

- Fits what's being done now → the **active sprint**.
- Part of a larger effort, or not now → the **backlog** or a **future sprint**.
- Large, cohesive effort worth isolating → its **own sprint**.

Judge by size and cohesion, not habit. When unsure whether something deserves its own sprint, ask.

## Key principles

- **One question at a time** — don't overwhelm.
- **Remove ambiguity before creating** — a decision that lives only in chat is lost; bake it into the card.
- **Approve before executing** — the hard gate above.
- **YAGNI** — cut features that don't serve the goal.
- **Self-sufficient cards** — each must survive a memoryless future session.
