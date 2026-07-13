---
title: PPT Productization Session Retrospective — 2026-07-12 to 2026-07-13
status: archived-session-summary
effective_date: 2026-07-13
scope: PPT Master productization, Hermes Kanban governance, delivery verification
source_kind: session-retrospective
---

# Session retrospective: 2026-07-12 to 2026-07-13

> **Purpose.** This is a factual archive of the work and operating lessons from the sessions spanning 2026-07-12 through the current 2026-07-13 checkpoint. It distinguishes verified repository state from task-worker claims. Secrets, credentials and remote endpoints are omitted.

## Executive summary

The work moved the productization path forward through two adjacent PPT Master gates:

```text
verified preview availability
→ Quality Check
→ post-processing / svg_final
→ remote canonical landing (still blocked)
→ future export gate (not opened)
```

The Quality Check work was genuinely landed to `origin/main` at `25b5dd0`. The post-processing / `svg_final` implementation was built, independently verified and reviewed; a verified local integration commit exists at `1244751`, but it has **not** reached `origin/main` because the executing environment lacks authenticated GitHub write capability. The next stage, PPTX export, remains deliberately unopened.

During the session, governance was materially improved: external Cron-based control planes were paused; Kanban lifecycle writes were constrained to Hermes CLI/Gateway; a prelinked implementation → verification → review → landing chain was adopted; and notification subscriptions were added before terminal task events. The session also surfaced important process failures: stale/obsolete task chains, all roles initially assigned to `default`, a worker blocking for review despite prebuilt review children, and false-positive "canonical landing" claims from task-local worktrees.

## Authoritative operating model after this session

The following hierarchy is now the intended control model:

```text
PPT project documentation
+ PPT Master production gates
+ Hermes Gateway dispatcher and dependency graph
+ task-scoped workers/worktrees
```

Engineering governance tools are evidence requirements, not workflow substitutes:

```text
ponytail    = smallest adjacent engineering slice
codebase    = definitions/callers/impact/tests investigation
agent-skills = phase-appropriate specification, implementation, verification, review and shipping method
```

Hard constraints retained:

- Canonical write access is serialized; implementation, verification/review and landing are separated.
- Root tracker `t_a4281740` stays `blocked` / tracker-only; it is not executable.
- Kanban lifecycle changes use Hermes CLI/Gateway, not direct SQLite writes.
- `kanban.auto_decompose: false` remains unchanged; no worker/script dynamically creates unknown successors.
- External PPT Cron controllers remain paused. They cannot approve review, mutate lifecycle, invent successors or impersonate worker context.
- A `done` task alone is insufficient evidence of delivery. The actual canonical branch and `origin/main` SHA must be inspected.

## What was accomplished

### 1. Reconciled project governance with the PPT Master workflow

The sessions clarified a prior terminology error: the project-level engineering toolset is `ponytail`, `codebase`, and `agent-skills`; it is not the PPT Master role sequence or the PPT helper scripts. The product documentation governs scope, acceptance, stopping rules and evidence. `skills/ppt-master/SKILL.md` remains authoritative for presentation-production ordering and artifacts:

```text
Source / project
→ confirmations / strategist specification
→ generation and live preview
→ Quality Check
→ post-processing / svg_final
→ PPTX export
```

The implementation chain was therefore kept adjacent: no export work was allowed before post-processing proof.

### 2. Retired the shadow automation control plane

The existing PPT-related Cron jobs that attempted dispatch, continuity handling or review handling were paused. This included the guarded auto-continue dispatcher and continuity controller. The reason was architectural, not merely operational: Gateway dispatch plus explicit parent dependencies is the Hermes control plane; external scripts must not form a second lifecycle state machine.

The Gateway configuration verified in this session includes:

```yaml
kanban.dispatch_in_gateway: true
kanban.dispatch_interval_seconds: 60
kanban.orchestrator_profile: default
kanban.default_assignee: default
kanban.auto_decompose: false
```

The first two fields let the Gateway claim and spawn ready cards. The latter two are configuration defaults, not a mandate that every stage use the same role.

### 3. Landed the Quality Check runtime gate to the real remote main branch

The Quality Check slice enforced the key production ordering:

```text
preview availability does not authorize export
Quality Check must be executable via the runtime/HTTP path
Quality Check must persist its report/checkpoint
failed Quality Check must prevent export
```

The verified remote result was:

```text
origin/main = 25b5dd0aa5d298fde7acca127d560f759b42550f
```

with this reviewed lineage:

```text
e2f48fe  fail-closed Quality Check gate
b299cc3  enforce Quality Check before workbench export
25b5dd0  execute Workbench Quality Check
```

Focused, TypeScript, mainline runtime, diff-hygiene and repository-integrity checks were recorded as passing at landing time.

### 4. Built and independently checked the post-processing / svg_final gate

A prebuilt dependency chain was created for the next stage:

```text
t_83798fa0  scope
→ t_69c77469  implementation
→ t_cb0ce85f  independent verification
→ t_b0002e05  independent review
→ t_e542955c  landing attempt
→ t_a8f3430d  post-landing verification attempt
```

The implementation commit was:

```text
a8115f73  feat: gate svg final post-processing
```

Its verified contract:

- exactly one passed, current-run Quality Check is required;
- preview roster evidence must be unambiguous and hash-valid;
- post-processing produces an exact hash-verified `svg_final` roster and report/checkpoint evidence;
- stale, missing, cross-run, ambiguous or duplicate evidence fails closed;
- no `export_pptx` artifact/action becomes available after post-processing.

Independent verification and review reproduced focused tests, TypeScript, `productization:mainline`, and `git diff --check` successfully.

### 5. Preserved unrelated stage-materializer work separately

Three unrelated in-progress files were moved without reset or loss into a dedicated worktree branch:

```text
worktree: .worktrees/stage-materializer-preserved
branch:    wt/pptmaster-stage-materializer-preserved
```

This preserved patch remains intentionally uncommitted pending a separate, governed decision. It is not runtime-wired and does not authorize any external scheduler, Cron controller or automatic successor materialization.

## Current factual state at archive time

### Remote delivery state

```text
origin/main: 25b5dd0
```

The post-processing change is **not on `origin/main`**.

A corrected local integration branch exists:

```text
canonical-main: 1244751
```

It was created from `origin/main@25b5dd0` and contains only the reviewed post-processing change. Local validation passed, but the worker could not push to remote because this environment has no usable authenticated GitHub HTTPS write path:

```text
fatal: could not read Username for https://github.com
```

The corrective Kanban card is intentionally blocked:

```text
t_448f3b0a — Correct false-positive canonical svg_final landing
```

This is a genuine external capability blocker. It must remain blocked until an authorized push path exists; retrying without credentials would only repeat failure.

### Important false-positive correction

Two earlier cards reported success:

```text
t_e542955c  landing
`t_a8f3430d` post-landing verification
```

Their work validated task-scoped worktree branches, not `origin/main`. They do **not** prove remote canonical delivery and do not authorize opening PPTX export work. This correction is the central integrity lesson of the session.

### Current stage state

The functional state machine currently stops safely after post-processing:

```text
preview_synced → quality_checked → post_processed
```

The post-processing state has no productive transition to `export_ready`; only failure transitions are available. That is fail-closed and correct while remote landing is unresolved. It also means the future export gate requires explicit scope, implementation, verification, review, actual remote landing and post-land verification.

### Repository checkout caveat

The local default checkout is on:

```text
chore/productization-worktree-cleanup @ 25b5dd0
```

and shows `.worktrees/` as an untracked container. That directory is Git worktree management state, not an uncommitted production-source change. Branch names alone must not be treated as canonical authority; remote SHA verification is required.

## Problems encountered and how they were handled

### Stale / obsolete Quality Check chain

A prior verifier was blocked before an executable HTTP Quality Check route existed. Once the remediation changed that factual baseline, simply unblocking the old verifier would have produced an invalid audit path. The obsolete chain was stopped/archived and a replacement landing path was used instead.

**Lesson:** when a remediation changes the basis of a blocked verification task, create a replacement verification/landing path rather than reopening the stale card as though its old evidence still applied.

### Roles were initially collapsed into `default`

To compensate for historical lane instability, scope, implementation, verification, review and landing were initially assigned to `default`. This weakened independent review and made it easier for one context to assert its own success.

The intended separation was corrected to:

```text
implementation              coder
independent verification    researcher
independent review          default
canonical landing           ops
post-landing verification   researcher
```

**Lesson:** profile reliability is a real operational concern, but it is not a reason to erase role separation. Use isolated smoke tests and scope-specific fallback planning instead.

### Review-required was used as a blocked terminal state despite a prebuilt review chain

The implementation worker placed its task in `review-required` / blocked even though independent verification and review children had already been created.

**Lesson:** when a dependency chain already exists, workers should complete with structured handoff evidence. Parent completion makes the verifier ready; review is performed by the child card. `blocked` is reserved for a genuine missing input, failure or capability constraint.

### Notification subscription was added after the blocked event

The first post-processing blocked event occurred before its Feishu task subscription existed. Gateway notifications do not backfill historical terminal events.

**Improvement:** subscribe the user’s active chat to every task in a governed chain at creation time, before the task is promoted/dispatchable. Confirm the subscription using `notify-list`.

### Landing worker confused local worktree success with canonical/remote success

The initial landing worker created `db11df9` on its task branch and reported canonical delivery; its post-verifier checked that same local worktree. Neither actual canonical checkout nor `origin/main` moved.

**Improvement:** a landing task’s completion contract must require all of:

```text
1. actual canonical integration branch identified;
2. local canonical branch SHA recorded;
3. origin/main fetched after push;
4. origin/main SHA equals the expected landed SHA;
5. post-land verifier runs against actual canonical/origin-main checkout;
6. failure to push is terminal/blocking, not a completed landing.
```

### Main branch topology was ambiguous

The local `main` branch was stale/unrelated to the tracked remote integration path, while the default working checkout used a separate cleanup branch. This made branch-name-based assumptions unsafe.

**Improvement:** before any landing card is dispatched, record a canonical-reference tuple in its task body/handoff:

```text
remote = origin
remote branch = main
base SHA = <fetched origin/main SHA>
local integration branch = <explicit branch>
expected landed SHA = <commit or resolved SHA>
```

## Improvements to adopt immediately

1. **Landing evidence gate.** A landing cannot become `done` unless the handoff records and independently verifies remote SHA equality. Local worktree branch evidence is explicitly insufficient.
2. **Pre-dispatch notification gate.** Add Feishu subscriptions for every task in a prebuilt chain before `specify` / `ready` / dispatch.
3. **Role-map template.** Build governed chains with implementation=`coder`, verification=`researcher`, review=`default`, canonical landing=`ops`, post-land verification=`researcher`; deviations need an explicit reliability reason in the card.
4. **No self-review blocks.** If verifier/reviewer children exist, the implementation worker uses `kanban_complete`; it may block only on genuine capability, dependency, artifact, or human product-risk needs.
5. **Obsolescence rule.** When a blocker’s fact base is remediated, archive/stop the obsolete review path and create a replacement path with a fresh baseline.
6. **Remote-auth preflight.** Before starting canonical landing, test a non-mutating authenticated remote capability or explicitly label remote authentication as a prerequisite. Do not allow expensive landing/review loops to reach final push before discovering credentials are absent.
7. **Canonical branch registry.** Document and maintain the actual remote integration branch separately from local historical branches and task worktrees.
8. **Daily audit checkpoint.** At the end of a session, record: live task states, remote SHA, canonical SHA, worktree branches, active/paused automation, notification subscriptions, and the next legal PPT Master gate.

## Recommended next actions

### Required before any additional product stage

1. Obtain or provide an authorized push path for the repository’s `origin/main`.
2. Resume only `t_448f3b0a`; push the already reviewed local integration commit `1244751` to `origin/main`.
3. Fetch and compare remote SHA to `1244751`.
4. Run a new post-landing verification against the real canonical/remote-main lineage; do not reuse the prior task-worktree verification as delivery evidence.
5. Update this archive and the Kanban handoff with the remote SHA.

### Only after the preceding steps pass

Create a new, explicit export-gate scope. It should cover the adjacent transition:

```text
post_processed / svg_final
→ export-ready eligibility
→ staged PPTX generation
→ durable verified export
→ delivery
```

It must preserve current fail-closed requirements: current-run provenance, exact artifact roster, uniqueness, hashes, staged-output cleanup, durable commit, and no UI action that overstates delivery state.

## Evidence index

### Repository commits

```text
e2f48fe   Quality Check fail-closed gate
b299cc3   enforce Quality Check before workbench export
25b5dd0   executable Workbench Quality Check

a8115f73  post-processing/svg_final implementation (task worktree)
1244751   local integration of reviewed svg_final work onto origin/main base
```

### Kanban tasks

```text
t_f79acf48  stage-materializer preservation handoff
t_fa16bdd1  Quality Check canonical landing (remote verified)

t_83798fa0  post-processing/svg_final scope
t_69c77469  implementation
t_cb0ce85f  independent verification
t_b0002e05  independent review
t_e542955c  initial local-worktree landing false positive
t_a8f3430d  initial local-worktree post-land verification false positive
t_448f3b0a  corrective actual canonical/remote landing — blocked on remote auth
```

### Primary documentation and skills

```text
AGENTS.md
skills/ppt-master/SKILL.md
docs/productization-current-status.md
docs/productization-architecture.md
docs/productization-autopilot-contract.md
~/.hermes/skills/project-management/pptmaster-governed-kanban/SKILL.md
Hermes Kanban official documentation
```
