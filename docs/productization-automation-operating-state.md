# PPT Master Productization — Automation Operating State

> **Status:** controlled automation enabled; legacy autonomous workers paused; one stale reviewer job paused pending repair.
>
> **Updated:** 2026-07-12
>
> **Scope:** the Hermes Kanban board `ppt-master-productization-mainline` and its related scheduled jobs. This is an operations document, not evidence that `productization/` is a production-deployed application.

## Decision

The board is the control plane. The canonical repository is the only delivery workspace:

```text
/home/ubuntu/projects/ppt-master-upstream
```

A Kanban run, a worker comment, a scratch-worktree commit, or a green-looking UI is **not** completion. A task may be closed only after its change is present in the canonical repository and the task's required validation has passed there.

The root task `t_a4281740` is an umbrella tracker only. It must remain blocked/comment-only. Do not claim, promote, reclaim, dispatch, decompose, or attach child-to-root links to it.

## Current board checkpoint

The verified-export composition repair and its independent review are closed:

| Task | State | Meaning |
| --- | --- | --- |
| `t_dbcb654c` | done | Production-style Workbench verified-export HTTP composition was added and independently verified on canonical commit `217451b808b645f7c2323b1a57c55e1a0f1a1a65`. |
| `t_1cd93ecd` | done | Independent export review closed after the original P1 composition gap was rechecked and found resolved. |
| `t_051691a7` | done | Verified-export productization status documentation was reconciled. |
| `t_a4281740` | blocked / needs_input | Umbrella tracker; not an executable card. |

At the last checkpoint, the following commands passed on the clean canonical tree:

```bash
npx tsc -p tsconfig.json --noEmit
npm run productization:mainline
npx tsx productization/tests/project-workbench-verified-export-http.test.ts
npx tsx productization/tests/project-workbench-verified-export-node-server.test.ts
git diff --check
```

These checks establish the repository slice, not deployment, authentication, tenant isolation, CSRF/origin protection, abuse controls, or production operations.

## Automation classification

### 1. Trusted and enabled — safety guard only

| Job | State | Role | Permitted behavior |
| --- | --- | --- | --- |
| `pptmaster-productization-guarded-autocontinue-dispatch` (`77cd12289560`) | enabled | Guard + bounded dispatch | Runs the repository guard first, then invokes `hermes kanban dispatch --max 1`. The repository guard itself does not select/claim/promote/reclaim/decompose tasks or modify root. Dispatch may only start a board-ready card after the guard returns. |

The repository guard's policy contract is deliberately narrow. The scheduled wrapper is not a delivery worker: it is a bounded one-at-a-time dispatch trigger, and it must stay silent when no qualifying handoff or ready card exists.

### 2. Paused — legacy execution lanes

| Job | State | Why it stays paused | Do not resume until |
| --- | --- | --- | --- |
| `pptmaster-productization-kanban-autocontinue` (`cfb3f20414d8`) | paused | Parallel implementation lane could select/act without canonical acceptance and contributed to unsafe board behavior. | It is replaced by a reviewed, canonical-only dispatcher with dependency gating and acceptance evidence. |
| `pptmaster-productization-verify-parallel-lane` (`facaad7b5842`) | paused | Parallel verification lane could race implementation and report unverified state. | Verification is serialized after canonical delivery and required commands are machine-recorded. |
| `pptmaster-preview-export-proof-worker` (`b9d7ac1c0ad1`) | paused | Narrow worker was tied to an older export-proof phase and is no longer the source of truth. | A successor card explicitly requires its scope and uses canonical workspace plus current runtime evidence. |
| `pptmaster-next-runtime-action-worker` (`652f87610ad4`) | paused | It guessed or advanced the next action outside dependency-controlled successor cards. | The next adjacent PPT Master gate is represented by a pre-created dependent task. |
| `pptmaster-export-foundation-canonical-autopilot` (`67593d1e3e2f`) | paused | It belongs to the completed export-foundation phase. Re-running it risks duplicate work. | A new explicitly-scoped successor requires it; otherwise leave it retired. |

### 3. Paused — broken/stale scheduler configuration

| Job | State | Finding | Required repair before any resume |
| --- | --- | --- | --- |
| `pptmaster-productization-kanban-reviewer-and-idle-continuation` (`645ed70cfad6`) | paused on 2026-07-12 | Its scheduler configuration refers to `pptmaster_auto_review.py`, but that script is absent from `~/.hermes/scripts/`. A scheduled reviewer without its executable is not trustworthy automation. | Rebuild the script from a reviewed specification; run it in dry-run mode; prove it cannot mutate root, fabricate a successor, or mark a task complete without canonical acceptance. |

## Canonical successor protocol

Use this protocol for any future automated PPT productization increment.

### Preconditions

- The task is a non-root child task with an explicit scope.
- The task uses the canonical workspace:

  ```text
  dir:/home/ubuntu/projects/ppt-master-upstream
  ```

- The predecessor is actually `done`, with canonical commit and required checks recorded.
- The successor is pre-created with a dependency link. Workers must not invent a follow-up task during completion.
- The root has zero incoming links, no claim lock, no worker PID, and is not selected by any scheduler.
- There is at most one mutating canonical-worktree worker at a time.

### Execution

1. Promote only the eligible dependent successor.
2. Claim only a `ready` non-root task.
3. Make the smallest adjacent change permitted by `skills/ppt-master/SKILL.md`.
4. Run the task's focused negative/positive proof, then TypeScript, `productization:mainline`, and `git diff --check` as applicable.
5. Confirm the canonical working tree is clean and the claimed commit exists on canonical HEAD.
6. Record the exact commit and commands in the task result.
7. Complete the task only after the above acceptance. If there is a real P0/P1 finding, block with file/line evidence and create one minimal, dependency-gated remediation task.

### Prohibited behavior

- No scratch-only completion.
- No root manipulation except comment/guard observation.
- No `todo -> claim`; use `todo -> ready -> claim`.
- No worker-created “next card” as a substitute for dependency links.
- No generic `review-required` / `needs_input` blocker when a canonical acceptance check can decide the result.
- No claim/promote/reclaim/decompose operations by parallel cron jobs.
- No completion based only on a worker-reported SHA; independently verify it exists in the canonical repository.

## Re-enable checklist

Do **not** resume a paused execution job merely because another task finished. A job may be replaced or re-enabled only when all applicable items below are true.

- [ ] Its script exists at the scheduler-resolved path and is executable.
- [ ] The script has a dry-run mode and a test fixture/board fixture for its decision rules.
- [ ] Its task selection excludes `t_a4281740` by ID, not only by title or status.
- [ ] It uses only `dir:/home/ubuntu/projects/ppt-master-upstream` for mutating work.
- [ ] It honors dependency links and never selects a task whose parent is not done.
- [ ] It serializes canonical mutations; the scheduled wrapper dispatches at most one ready task per tick and no second mutating worker can run concurrently.
- [ ] It validates canonical commit existence, clean worktree, focused proof, TypeScript, mainline, and diff check before closing.
- [ ] It records exact commands and results in the Kanban task.
- [ ] Its failure path blocks only on a concrete, reproducible P0/P1 issue; it does not convert ordinary review into `needs_input`.
- [ ] A manual dry-run and one controlled live run demonstrate no root link/lock contamination.
- [ ] The legacy job remains paused until the replacement has satisfied every item above.

## Operator quick checks

```bash
# Canonical repository acceptance state
cd /home/ubuntu/projects/ppt-master-upstream
git status --short
npx tsc -p tsconfig.json --noEmit
npm run productization:mainline
git diff --check

# Board status
export HERMES_KANBAN_BOARD=ppt-master-productization-mainline
/home/ubuntu/.local/bin/hermes kanban status
/home/ubuntu/.local/bin/hermes kanban diagnostics

# Scheduled-job state
/home/ubuntu/.local/bin/hermes cron list
```

## What this does not authorize

This operating state does not authorize declaring the Workbench a production service or re-enabling arbitrary cron workers. Production deployment work still requires separate proof for host lifecycle, production persistence, authentication/authorization, tenant isolation, CSRF/origin controls, rate limiting/abuse handling, logging, backup/recovery, and operational ownership.
