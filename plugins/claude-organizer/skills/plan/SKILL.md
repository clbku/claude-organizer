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
2. **Understand & surface decisions.** Two kinds of unknowns block a well-formed card; resolve both _with the user_ before you create anything:
   - **Ambiguities** — what the user actually wants: goal, scope, constraints, edge cases, what "done" looks like. Ask to remove them.
   - **Decisions** — open choices where more than one reasonable path exists (runtime/language, which API or library, auth model, session strategy, storage…). Never pick one silently — surface each as **ready-made options** the user chooses from (see _Surfacing decisions, not assuming them_ below).

   **One topic per message**; prefer multiple-choice (open-ended is fine for ambiguities). Keep going until nothing remains that would materially change what gets built. It's far cheaper to ask now than to bake a wrong assumption into a card executed blindly later.
3. **Organize (propose).** Decide the shape of the work and present it with your reasoning (see _Where the work lives_ for the sprint-vs-standalone call):
   - **single task** — one coherent, testable deliverable. May live on the board with no sprint (a standalone task) or sit in the backlog for later.
   - **history (story) + tasks** — a cohesive feature split into a few testable deliverables.
   - **sprint + histories + tasks** — a large, cohesive effort worth isolating.
4. **Get approval.** Present the proposed structure (and, when useful, 2–3 approaches with a recommendation). Revise until the user approves. Only then create anything.
5. **Create in the MCP.** Materialize the approved structure: `create_sprint` (if needed) → histories (cards) → tasks (cards, with `parentId` for a history's children). Create cards in dependency order — a task before the ones that depend on it — so a card you need to reference already has its key. Wire dependencies with blockers when one task must precede another. **Tag every task you create** (see the tagging rule in the `claude-organizer` skill): attach the tags that fit; if none fit, suggest new tag(s) and ask the user before creating them.
   - **Tasks live only as cards — never as a list in prose.** A history's `descriptionMd` describes the _history_: its goal, scope and decisions. It does **not** enumerate its tasks. The tasks ARE the child cards (`parentId`), and the board already shows them nested under the history. Re-listing them in the body creates a second, drifting copy of the breakdown and invites positional references like `CO-46.1` ("task 1 of the history") instead of the card's real key.
   - **Cross-reference by the card's real key.** When one card points at another — a dependency, a follow-up, "the foundation task" — use the key the MCP assigned (e.g. `CO-51`), which auto-links. Never invent a positional alias (`CO-46.1`, "task 1"): it links to nothing and breaks the moment order or scope changes. Likewise, write each key in full — `CO-53, CO-54`, not a shorthand range like `CO-53/54` (only the first half links). This is exactly why you create in dependency order — so the real key exists when you write the reference.
6. **Review what you created.** Once the cards exist, do a verification pass before handing off — light for a single task, **mandatory and thorough when the scope is large** (multiple sprints, dozens of cards), because breadth is exactly where a card comes out thin and where drift goes unnoticed. Read **card by card**:
   - **Pending decisions** — did any open choice slip through unsettled? Surface it (see _Surfacing decisions, not assuming them_), then fold the answer into the card.
   - **Completeness** — is each card self-sufficient (the memoryless-session test in _Writing a task_), or did something come out half-written under the volume?
   - **Coherence & objective** — step back to the whole: do the cards fit together (dependency order, no gap or contradiction), and does the set actually achieve the objective the user set for that sprint/story? Fix what doesn't — adjust, split, merge or drop cards as needed, and tell the user what you changed.
7. **Hand off.** Tell the user the plan is on the board; execution proceeds via the `claude-organizer` skill (in_progress → implement → review → done).

## Surfacing decisions, not assuming them

A demand almost always hides choices with more than one defensible answer. The wrong move — and the easy one — is to silently pick one and bake it into a card; that's a decision made _for_ the user instead of _by_ them. Surface it. This holds even for demands that look trivial: "too simple to have decisions" is exactly where a silent assumption slips in.

For each open decision, present **ready-made options** — concrete and already worked out, not "what do you think?". Each option carries its **trade-offs (pros and cons)**, and you mark the one you **recommend**, with the reason. This serves both the user who just takes the recommendation and the one who knows enough to choose differently. When you can't offer good options from knowledge alone — _which_ weather API exists, its free tier, accuracy, rate limits — **research first**, then present what you found. A multiple-choice fits: each option's description holds its trade-offs, the recommended one marked.

Decisions often **chain** — settle the earlier one first, because it narrows the next. "Get the current temperature" hides at least two, in order:
1. **How to access it** — Node, Python, a shell one-liner… each with trade-offs (what's already installed, dependencies, how it'll run). Recommend one.
2. **Where the data comes from** — _which_ weather API (open vs. key-gated, free tier, accuracy, rate limits) or scraping. Recommend one.

Only once both are settled do you create the card — now aligned with what the user wants, not a guess. "Build an auth system" hides more: OAuth or not, third-party identity providers, session as token or cookie, hashing algorithm, and so on.

**These are the decisions that shape the _card_ — the _what_, not the _how_.** Stop at the choices needed to write a well-formed card. The implementation may surface further decisions later; those belong to execution (the `claude-organizer` skill), not here. Don't drift into designing the code.

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
- _(as needed)_ constraints, out-of-scope, references, links.

Describe **behavior and intent, not code**. Do **not** write the implementation or hard-prescribe _how_ to build it — the executor decides that — **unless** it's a real constraint or an already-diagnosed bug (then being specific is correct). Naming a real endpoint/table/file is fine; writing function bodies is not.

The test: _could a fresh session execute this task using only its contents?_ If not, it's underspecified — keep refining (go back to the user if needed).

## Where the work lives — sprint, story, or a standalone task

A card doesn't need a sprint to be worked. A sprint-less card in a board status (`todo`…`done`) lives on the **board** on its own; a sprint-less card in the `backlog` status sits in the **backlog**. So choosing the shape is three independent questions:

- **Open a sprint, or not?** A large, cohesive effort worth isolating → its own **sprint**. A small, one-off demand (a handful of quick tasks, like a few fixes) → **standalone task(s)** on the board, no sprint. Something that fits what's already underway → the **active sprint**.
- **Group under a story, or not?** A cohesive feature that splits into several testable deliverables → a **story (history) + tasks**. A single coherent deliverable → **one task**.
- **Now, or later?** Worked now → the board (active sprint or standalone). Parked for later → the **backlog** (status `backlog`) or a **future sprint**.

Judge by size and cohesion, not habit. **When in doubt, suggest** a placement — and say why — then confirm with the user; don't silently pick one.

## Key principles

- **One question at a time** — don't overwhelm.
- **Surface decisions, don't assume them** — every meaningful choice goes to the user as ready-made options with trade-offs and a recommendation, before the card exists.
- **Remove ambiguity before creating** — a decision that lives only in chat is lost; bake it into the card.
- **Approve before executing** — the hard gate above.
- **Review what you created** — for large scopes especially, sweep card by card for pending decisions, gaps and whether the whole still achieves the goal; fix before handing off.
- **YAGNI** — cut features that don't serve the goal.
- **Self-sufficient cards** — each must survive a memoryless future session.
