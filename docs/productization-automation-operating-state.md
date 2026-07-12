# PPT Productization Automation: Operating State

**Updated:** 2026-07-12

## Scope

This is an operating-state record for PPT Master productization automation in `/home/ubuntu/projects/ppt-master-upstream`. It distinguishes the verified scheduler/board facts from a claim that the product is production-complete.

The governing execution contract is now `docs/productization-autopilot-contract.md`, which binds both:

- the repository’s project documents and four-piece engineering policy; and
- the real PPT Master production stages, artifacts, and quality gates.

## Board truth

- Board: `ppt-master-productization-mainline`
- Canonical workspace: `dir:/home/ubuntu/projects/ppt-master-upstream`
- Root tracker: `t_a4281740`
- Root policy: tracker-only, `blocked / needs_input`, no worker lock/PID/current run, and no inbound child links.

The root task is never an execution target. Workers must run only on pre-created, dependency-linked child cards in the canonical workspace, with at most one canonical writer at a time.

## Scheduler inventory

### Paused legacy jobs

The following PPT jobs remain paused. They must not be resumed because they can create competing writers, use obsolete task semantics, or bypass the current dependency contract:

- `cfb3f20414d8` — `pptmaster-productization-kanban-autocontinue`
- `facaad7b5842` — `pptmaster-productization-verify-parallel-lane`
- `b9d7ac1c0ad1` — `pptmaster-preview-export-proof-worker`
- `652f87610ad4` — `pptmaster-next-runtime-action-worker`
- `67593d1e3e2f` — `pptmaster-export-foundation-canonical-autopilot`
- `645ed70cfad6` — `pptmaster-productization-kanban-reviewer-and-idle-continuation`

### Guarded loop

`77cd12289560` — `pptmaster-productization-guarded-autocontinue-dispatch` is paused during migration to the controlled contract.

When restored, its only shell flow is:

```text
repository guard
→ hermes kanban --board ppt-master-productization-mainline dispatch --max 1
```

The guard is intentionally unable to select/claim/promote/reclaim/decompose a task or modify the root tracker. It validates a narrow review handoff only. It also must never dynamically create, infer, or link a successor; successors are pre-created and dependency-linked before predecessor execution.

Cron is a wake-up mechanism, not a lifecycle authority. It may dispatch only an existing dependency-eligible `ready` card and must be silent when none exists.

## Required recovery gates

Before re-enabling the guarded loop, verify all of the following:

1. The canonical repository has a clean baseline or exactly one deliberately scoped, reviewable card change; mixed historical work is not treated as a deliverable.
2. The next card is one adjacent PPT Master gate, not a generic UI/security/export task.
3. Its body contains both project-document acceptance/stop-rule information and PPT Master phase/checkpoint/artifact information.
4. Its successor is already created and linked before the card is dispatched.
5. Its handoff records real `changed_files`, `verification_commands`, stage artifacts, and four-piece evidence.
6. Negative evidence blocks action exposure: failed, pending, planned, stale, superseded, cross-run, or missing artifacts cannot unlock the next stage.
7. A real Cron cycle, board event, worker run, Git status, and relevant artifact checks are captured before stating autonomous progress.

## Current authoritative state

The canonical scheduler is **intentionally paused** until the contract’s first dependency-linked generation eligibility chain has been created and verified. This is a safety state, not a claim that no work remains.

The project document’s required next increment remains:

```text
locked confirmations
→ strategist runtime verification
→ explicit spec_ready gate
→ generation eligibility
→ workspace-derived preview/export availability
```

PPT Master’s later gates remain mandatory when reached:

```text
asset preparation
→ Executor SVG generation
→ live preview
→ Quality Check
→ post-processing
→ PPTX export
```

No automation may claim preview, quality approval, post-processing, or export merely from UI state, fixture data, or a partial test path.
