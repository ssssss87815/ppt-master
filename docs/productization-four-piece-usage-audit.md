# Productization four-piece usage audit

Date: 2026-07-08

## Scope

Audit the repo-declared default four-piece stack for PPT productization work:

- RTK
- codebase
- agent-skills
- ponytail

Question:

> Which parts were actually used in the current productization mainline, and which parts are only policy/expectation so far?

## Repo-level declaration

`AGENTS.md` declares the PPT productization default as:

- RTK
- codebase
- agent-skills
- ponytail

This is a workflow expectation, not automatic proof of runtime usage.

## Verified current usage

### 1. agent-skills — used

Direct evidence:

- `AGENTS.md` requires reading `skills/ppt-master/SKILL.md` before PPT generation or repo modification.
- The current run explicitly loaded `using-agent-skills` and `ponytail`.
- The work repeatedly referenced repo-local PPT skills and workflow documents as the authoritative contract.

Conclusion:

- `agent-skills` is genuinely in use on this mainline.

### 2. ponytail — used

Direct evidence:

- `ponytail` was explicitly loaded.
- The implemented path followed the ponytail pattern: smallest honest bridge first, no premature full legacy reimplementation, verify each slice with real commands/tests/artifacts before widening scope.

Conclusion:

- `ponytail` is genuinely in use on this mainline.

## Not yet verified as used

### 3. RTK — not proven used

Observed reality:

- There was earlier evidence that some shell behavior may be wrapped by RTK (`find` wrapper limitation was encountered historically).
- But for the productization slices completed so far, there is no clean, attributable proof that RTK-specific capability materially powered the implementation.

Conclusion:

- RTK may be present in the environment, but current mainline evidence does **not** justify claiming RTK was used as a substantive tool in these slices.

### 4. codebase — not proven used

Observed reality:

- The work relied on ordinary file reads, source search, targeted edits, and test execution.
- No distinct codebase tool invocation or output was captured as evidence for these slices.

Conclusion:

- Current mainline evidence does **not** justify claiming codebase was used as a substantive tool in these slices.

## Usage status summary

| Piece | Repo-required | Evidence of actual use in this mainline | Honest status |
|---|---|---:|---|
| RTK | yes | no clear direct evidence | policy only so far |
| codebase | yes | no clear direct evidence | policy only so far |
| agent-skills | yes | yes | used |
| ponytail | yes | yes | used |

## Current wording rule

Until stronger evidence exists, the correct wording is:

> The PPT productization mainline is operating under the repo's four-piece policy, but only `agent-skills` and `ponytail` are currently proven in use. `RTK` and `codebase` should not be claimed as actually used without direct evidence.

## Mainline implication

This audit does not block the productization chain itself.

It only tightens terminology so future progress reports distinguish:

- workflow policy / repo expectation
- vs.
- actually evidenced tool usage
