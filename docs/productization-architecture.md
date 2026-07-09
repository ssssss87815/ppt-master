# PPTMASTER Productization Architecture

[English](../productization-architecture.md) | [中文](./zh/productization-architecture.md)

---

## Scope

This document is not about how PPT Master generates presentations. It is about **how to productize PPT Master when its current execution model depends on an interactive, multi-turn agent workflow**.

The key constraint is already clear: **in its current form, PPT Master does not run reliably if the interactive, staged agent flow is removed**. So the question is no longer the abstract "should this be an agent product?" Instead, it becomes an engineering question:

> **How do we package PPT Master into a deliverable, commercializable, replaceable product system while preserving the runtime constraints that currently make it work?**

### First principle

PPTMASTER productization is **not** about building a prettier “Generate” button.

It is about turning **PPT Master’s full workflow protocol** into a **controllable, recoverable, visualized product shell** without sacrificing the generation quality that currently depends on its staged runtime discipline.

That means the productization target is not an abstract “PPT generation capability”, but the real protocol already embodied by the repository today:

- serial phase progression
- blocking confirmations
- design-state artifacts such as `design_spec.md` and `spec_lock.md`
- resumable / revisable midpoints such as `resume-execute`, `refine-spec`, and `live-preview`
- quality-preserving execution constraints owned by the current workflow

This document therefore assumes a **PPTMASTER-first** approach, not a generic-PPT-first approach:

- first preserve the protocol that makes PPTMASTER produce high-quality output
- then wrap it in a product shell that makes the protocol visible, controllable, and recoverable
- then modularize the boundaries so the system can eventually support engine replacement without flattening today’s workflow into a low-quality one-shot API

Modularity is part of the goal, but **modularity must be built around the existing protocol, not by erasing it**. In practice, that means introducing explicit product layers, contracts, adapters, and state boundaries around PPTMASTER, so the product becomes more replaceable over time without prematurely rewriting away the workflow constraints that currently protect output quality.

This document is for three audiences:

- engineering leads who want to integrate PPT Master into a SaaS or workbench product
- architects who want to turn today's multi-step collaboration flow into stable service boundaries
- product/platform owners who want optionality to swap PPT Master out for another engine later

---

## Default engineering operating convention for productization work

For software engineering, planning, code review, QA, and shipping work in PPTMASTER productization, the default operating convention is to preserve the current engine/runtime constraints **and** use the repo's default engineering toolchain unless the user explicitly asks for another path:

- **RTK** — default when the task needs structured runtime/state orchestration, especially workflow state, checkpoint transitions, action dispatch, and front-end state modeling.
- **codebase** — default when repo navigation, dependency tracing, symbol lookup, or impact analysis is large enough that ad-hoc file reading is not reliable.
- **ponytail** — default implementation posture for coding/refactor/cleanup/QA/review work: smallest working slice, direct execution, evidence-first verification.
- **agent-skills** — default governing workflow framework for multi-phase or risky work: load `using-agent-skills`, then follow the phase-appropriate path (`spec-driven-development`, `planning-and-task-breakdown`, implementation/verification/review skills as needed), with `.hermes/plans/` as the canonical plan location when plan mode is active.

This matters because PPTMASTER productization is not generic CRUD work: the system already embeds staged runtime discipline, so engineering defaults should bias toward preserving protocol boundaries, making state explicit, and verifying real execution rather than flattening the workflow into a one-shot abstraction too early.

## Reframing the problem

The real problem is not:

- Should the product look like a chatbot?
- Must the user directly talk to an agent?

The real problem is:

- **PPT Master currently depends on multi-turn context progression, staged confirmation, and serial gates**
- **If the agent runtime is removed, those constraints stop holding**

So the right reframing is:

> **PPT Master is an agent-native generation engine. The design question is where the agent belongs in the system, so the product remains runnable without forcing the final UX to look like a raw chat workflow.**

That is the core axis for the architecture.

---

## Why the current core cannot simply drop the agent runtime

This is not a taste preference. It follows directly from the current repository architecture.

### 1. The pipeline is serial, not stateless

The main pipeline is explicitly serial:

`Source → Project Init → [Template] → Strategist → [Image_Generator] → Executor → Quality Check → Post-processing → Export`

`skills/ppt-master/SKILL.md` makes the following constraints explicit:

- steps must execute in order
- blocking gates must stop and wait
- cross-phase bundling is forbidden
- Executor generates pages sequentially, not in parallel batches
- before each page, the runtime must re-read `spec_lock.md`

That is not a stateless `input -> pptx` function. It is a **session-shaped system with intermediate state and staged confirmation**.

### 2. The Eight Confirmations are a product-level blocking gate

The Strategist phase's Eight Confirmations are not a UI flourish. They are the single blocking decision point for the whole design system. They lock:

- canvas
- page count
- audience
- visual style
- color system
- icon system
- typography
- image strategy

These decisions are coupled. In theory they could be collected through forms, but in the current implementation they are still **recommended, explained, negotiated, and locked by an agentic orchestration step**, then written into `design_spec.md` and `spec_lock.md`.

### 3. `design_spec.md` and `spec_lock.md` are dual state artifacts

The current system uses two outputs for design state:

- `design_spec.md`: human-readable narrative design rationale
- `spec_lock.md`: machine-readable execution contract for the Executor

This is already a classic agent orchestration shape:

- the upstream role produces explanatory state
- the downstream role consumes locked state
- long-run consistency is enforced through explicit state reloads

The core dependency is therefore **state propagation across roles**, not a single API response.

### 4. The runtime already supports resumable, revisable midpoints

The repository already exposes:

- `resume-execute`: resume Phase B
- `refine-spec`: stop after spec generation so the user can revise it
- `live-preview`: re-enter during generation / preview / annotations
- `visual-review`: insert an optional review step on explicit request

This means the system is naturally a **long-running, re-enterable transaction**. Without an agent runtime or an equivalent orchestration layer, that shape is difficult to manage reliably.

---

## Conclusion: do not ask whether to use an agent; ask where the agent lives

So the architectural options should not be framed as:

- an agent product
- a non-agent product

The more accurate choices are:

| Option | User-facing layer | System core | Best fit |
|---|---|---|---|
| A. Direct agent product | chat / conversational | agent runtime | fastest validation, weakest product shell |
| B. Workbench product with internal agent orchestration | workbench / wizard / confirmation screens | agent runtime | **recommended now** |
| C. Fully refactored stateless service graph | structured product | non-agent / service graph | end-state, highest near-term cost |

The core conclusion is simple:

> **The front-end does not have to be agent-shaped, but the current back-end still needs an agent runtime.**

---

## Three viable architectures

### Option A: Agent as both runtime and front-end product surface

This is the closest to the repository's current workflow.

#### Shape

- the user submits requests through chat or chat-like UI
- the backend directly runs Strategist / Image_Generator / Executor
- confirmations are exposed directly as agent interaction
- the system returns previews, PPTX output, and revision turns

#### Advantages

- lowest adaptation cost
- fastest path to a working product
- aligns most closely with the current SKILL.md and workflows
- suitable for internal tools, concierge workflows, early validation

#### Disadvantages

- weak product controllability
- state presentation is under-structured
- raw agent interaction can hurt commercial UX
- permissions, billing, projects, and recovery all need extra wrapping

#### When to use it

- speed matters more than polish
- you are validating demand, not shipping a mature SaaS
- the team is comfortable exposing the raw agent flow

### Option B: Workbench product with internal agent orchestration (recommended)

This is the most realistic and balanced path for the current stage.

#### Shape

The user sees a structured product surface, not a raw chat transcript:

1. create project
2. upload material / input topic
3. confirm outline and design recommendations
4. confirm Eight Confirmations
5. generate / preview
6. regenerate or revise individual pages
7. export PPTX

Behind the scenes, these actions are still driven by an agent runtime.

#### Advantages

- preserves the current engine's operability
- lets the user experience feel like a product, not a tool transcript
- makes intermediate state easier to persist, inspect, and audit
- billing, quotas, login, and project management fit naturally
- creates a path to later abstract the engine

#### Disadvantages

- requires an explicit state mapping layer
- front-end and back-end must model steps, checkpoints, and artifacts
- more engineering work than Option A

#### Why this is the current best choice

Because it does two things at once:

1. **admits that PPT Master currently needs agent orchestration to run**
2. **avoids locking the product into a chatbot UX forever**

### Option C: Refactor PPT Master into a stateless service graph

This is the cleanest long-term architecture, but not the best first move.

#### Shape

Break the current workflow into clear services such as:

- outline service
- spec service
- asset planning service
- page generation service
- export service

Then drive them through structured inputs and outputs instead of an agent session.

#### Advantages

- most modular architecture
- best for platformization and multi-engine support
- cleanest testability and SLA model
- closest to a true plugin engine

#### Disadvantages

- highest rewrite cost
- highest risk of breaking what already works
- requires formalizing which state can be structural and which still depends on negotiated interaction

#### When to use it

- the product is already validated
- the demand shape is stable
- you need multiple engines or strong service guarantees

---

## Recommended architecture: a five-layer model

Given the repository as it exists today, the recommended structure is a five-layer system.

### Layer 1: Product Shell

This is the user-facing application layer. It owns:

- login, orgs, permissions
- project lists and project detail pages
- file upload / URL input / topic input
- outline confirmation
- Eight Confirmations screens
- generation progress
- page preview
- local revision / regeneration actions
- export and billing flows

This layer does not need to expose Strategist / Executor terminology, but it must surface their results.

### Layer 2: Workflow State / Session State

This is the critical productization layer.

It should persist:

- current project phase (`source`, `confirm`, `spec`, `generate`, `review`, `export`)
- imported source records
- current outline version
- current confirmation state
- current `design_spec.md` version
- current `spec_lock.md` version
- asset plans and acquisition state
- page-level generation progress
- export artifacts
- user feedback and revision history

Its job is to translate **continuous agent context** into **explicit product state**.

### Layer 3: Agent Orchestrator

This is the internal runtime core. It should:

- drive Strategist / Image_Generator / Executor by phase
- manage blocking gates
- invoke optional branches like `refine-spec`, `resume-execute`, and `live-preview`
- read and write repository artifacts
- sync recommendations, reasoning, and outputs into the state layer
- support recovery to the last valid checkpoint on failure

This layer does not need to look like chat. It needs to faithfully host the repository's agent-native workflow.

### Layer 4: PPT Master Adapter

This is the boundary between the product system and the repository workflow.

It should:

- turn product inputs into project directories and imported assets
- call `project_manager.py`, source conversion scripts, and workflow entrypoints
- map product confirmation state into `recommendations.json` / `result.json`
- map `design_spec.md`, `spec_lock.md`, `svg_output/`, and `exports/` into higher-level product objects
- expose stable domain actions such as:
  - `create_project`
  - `import_sources`
  - `prepare_confirmations`
  - `confirm_design`
  - `generate_deck`
  - `resume_generation`
  - `preview_slide`
  - `regenerate_slide`
  - `export_pptx`

This adapter layer is the main isolation boundary for future engine replacement.

### Layer 5: Commerce / Platform Layer

This holds the platform concerns required for a real product:

- accounts
- teams and workspaces
- quotas / credits / plans
- payments
- project archiving
- template or plugin marketplace
- usage analytics / audit / SLA

This layer should consume stable interfaces from the state and adapter layers, not leak into the PPT Master runtime.

---

## Recommended state machine

To productize the current workflow, the system state should be explicit instead of implicit in chat context.

Recommended top-level states:

| State | Meaning | Typical artifacts |
|---|---|---|
| `draft` | project exists but import is incomplete | project metadata |
| `sources_ready` | source material is ready | `sources/` |
| `confirmation_pending` | waiting for Eight Confirmations | `confirm_ui/recommendations.json` |
| `confirmation_locked` | user choices are locked | `confirm_ui/result.json` |
| `spec_ready` | design spec is generated | `design_spec.md`, `spec_lock.md` |
| `asset_preparing` | images / formulas / icons are being prepared | `images/`, manifests |
| `generation_in_progress` | Executor is generating pages | `svg_output/` |
| `preview_available` | preview / review entry is available | preview artifacts |
| `post_processing` | export pipeline is running | `svg_final/`, notes |
| `export_ready` | PPTX is downloadable | `exports/*.pptx` |
| `needs_revision` | user requested revision | annotations / issue state |
| `failed_recoverable` | a step failed but can resume from checkpoint | error metadata |

These states should be maintained by the product system and synchronized with project artifacts in both directions.

---

## Why the user-facing layer should not expose the raw agent flow

Even if the backend keeps an agent runtime, the front-end should still be productized. There are four reasons.

### 1. Users want outcomes and control, not prompt internals

Most users do not need to know how Strategist and Executor switch. They need to know:

- current progress
- what needs confirmation now
- where a failure happened
- what can be edited
- when export is available

### 2. Product state must be more stable than a chat transcript

Chat logs are useful for explanation, but poor as the authoritative product state. The product must be able to answer:

- what step the project is blocked on
- what the user has already locked
- what changed between versions
- whether Phase B can resume

without reconstructing it from message history.

### 3. Commercial features require structure

Quotas, payments, permissions, archiving, and collaboration all depend on structured state, not conversational memory.

### 4. Engine replacement should not force a front-end rewrite

If a future deck engine replaces PPT Master, the front-end should still reuse the same:

- project management
- confirmation flow
- preview UX
- export UX
- commercial infrastructure

So the front-end should bind to **state and actions**, not to a specific prompt transcript.

---

## Pluginization and future replacement: what to abstract, and what not to abstract

If the long-term goal is to swap PPT Master out for another plugin or engine, do **not** start by pretending the current core is a single-step `generate()` API.

The stable abstraction in this repository is not one-shot generation. It is **session-capable generation behavior**.

### Recommended abstraction: session-capable deck engine

A better domain interface looks like this:

| Capability | Meaning |
|---|---|
| `analyze_input()` | understand source material and extract structured facts |
| `build_outline()` | produce outline and page planning |
| `propose_confirmations()` | produce confirmation candidates and recommendations |
| `lock_confirmations()` | lock user decisions |
| `generate_spec()` | produce design and execution contracts |
| `prepare_assets()` | prepare images, icons, formulas, other assets |
| `generate_pages()` | generate pages progressively |
| `preview()` | provide review / preview surface |
| `revise()` | handle revision and rollback |
| `export()` | produce deliverables |

This matches the real boundaries of today's PPT Master and leaves room for other multi-turn engines later.

### Not recommended: fake one-shot abstraction

If the system is forced too early into:

- `generate_deck(input) -> pptx`

then the important intermediate state disappears from the architecture. The likely result is:

- poor recovery
- no stable partial confirmation
- awkward preview insertion
- ambiguous billing and stage control

That makes the product surface look cleaner while making the system itself more fragile.

---

## Direct mapping to the current repository

The productization model above is not hypothetical. It maps directly to the repository structure.

| Current repository artifact | Product meaning |
|---|---|
| `project_manager.py` | low-level project lifecycle initializer |
| `sources/` | user asset store |
| `confirm_ui/recommendations.json` | pending recommendation set |
| `confirm_ui/result.json` | locked confirmation result |
| `design_spec.md` | human-readable design state |
| `spec_lock.md` | machine-readable execution contract |
| `resume-execute` | long-task recovery entry |
| `refine-spec` | mid-pipeline review gate |
| `live-preview` | visual feedback entry |
| `svg_output/` | in-progress visual artifacts |
| `exports/*.pptx` | standard delivery artifacts |

This reveals an important fact: **the repository already contains the skeleton of a product system; it just exists today as workflows and artifacts instead of explicit product state and services.**

The goal is not to replace that skeleton. The goal is to:

1. add stable state modeling around it
2. give users a stronger product shell
3. give the platform a cleaner boundary to integrate against

---

## Suggested rollout phases

### Phase 1: wrap the current core in a workbench

Goal: package the existing repository workflow into a usable product shell quickly.

Suggested actions:

- build project list / detail / upload entrypoints
- embed the Eight Confirmations as product UI
- sync key artifacts into a database or durable state store
- keep using existing workflows and scripts behind the scenes
- support Phase B resume and basic retry paths

### Phase 2: explicit state machine and observability

Goal: make the system behave like a product rather than a script bundle.

Suggested actions:

- introduce a persistent state machine
- record inputs, outputs, errors, and timings structurally
- maintain an artifact index rather than inferring state from the filesystem each time
- unify preview, regeneration, and rollback through the same state layer

### Phase 3: introduce a domain adapter layer

Goal: decouple the product system from repository details.

Suggested actions:

- wrap scripts and workflows behind adapter actions
- let upper layers call domain actions instead of reading project directories directly
- preserve the same action surface for future engines

### Phase 4: gradual service extraction

Goal: extract stable services without breaking what already works.

Suggested actions:

- first extract lower-risk capabilities: source analysis, confirmation proposal, export management
- then evaluate which parts of spec generation and page generation can become services
- always preserve the ability to reconstruct product state from repository artifacts and vice versa, so the database view and project directory view do not drift apart

---

## Final recommendation

Given the current repository, the recommendation is very clear:

> **Do not try to remove the agent in phase one. Remove the requirement that end users must directly face the raw agent interaction flow.**

Concretely:

- **internally**: keep the agent runtime to preserve the serial, staged, re-enterable PPT Master workflow
- **externally**: build a structured workbench so upload, confirmation, preview, export, and revision are product actions
- **for the future**: define a session-capable deck engine interface in the adapter layer so the core can be swapped later

If there is one sentence to keep from this document, it is this:

> **PPT Master is not yet a clean stateless engine that can simply be wrapped by an API; it is better understood as an agent-native runtime that needs a strong product shell around it.**

---

## Project rules to anchor future discussion

To keep future design discussions grounded in the actual constraints, adopt these as default project rules:

1. **Until a verified refactor proves otherwise, do not assume PPT Master can run independently of an agent runtime.**
2. **The default product surface for productization work should be a workbench / wizard / confirmation flow, not a raw exposed agent transcript.**
3. **New productization integrations should model project state, artifact state, and adapter actions first, not assume a single one-shot `generate()` contract.**

These rules keep the team anchored to the real architecture instead of slipping back into the false question of whether the product should merely "be a chatbot."