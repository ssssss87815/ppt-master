# PPT Productization Stage Closeout Plan (2026-07-09)

## Verified state

- Productization test lane currently passes end-to-end.
- Verified by direct execution of all `productization/tests/*.test.ts` files.
- Current count: **37 test files green**.
- Current worktree is **not** yet stage-closed: `git status --short` shows **89 changed/untracked paths**.

## Current worktree shape

Top-level changed-path counts from `git status --short`:

- `docs/`: 68
- `skills/`: 4
- `examples/`: 2
- one-off root files / directories: 15

Observed large buckets:

1. **Core productization implementation + tests**
   - `productization/`
   - `package.json`
   - `tsconfig.json`
   - `tailwind.theme.json`
   - `skills/ppt-master/scripts/materialize_from_confirmations.py`
   - `skills/ppt-master/scripts/migrate_legacy_generation_manifests.py`
   - `skills/ppt-master/scripts/productization_export_shim.py`
   - `skills/ppt-master/scripts/config.py`

2. **Supporting architecture / status / audit docs**
   - `docs/productization-*.md`
   - `docs/project-view-*.md`
   - `docs/preview-*.md`
   - `docs/export-*.md`
   - `docs/runtime-backed-*.md`
   - `docs/kanban-*.md`
   - `docs/zh/productization-*.md`

3. **Repo-global or ambiguous edits**
   - `.gitignore`
   - `AGENTS.md`
   - `CLAUDE.md`
   - `docs/technical-design.md`
   - `docs/zh/technical-design.md`
   - `DESIGN.md`

4. **Likely non-stage artifacts / temp outputs**
   - `.hermes/`
   - `confirmation_locked`
   - `design-md.sh`
   - `examples/ppt169_building_effective_agents/exports/building_effective_agents.md`
   - `examples/ppt169_building_effective_agents/exports/building_effective_agents_files/`
   - `tmp.checkpoint.stderr`
   - `tmp.checkpoint.stdout`
   - `tmp.slice1.stderr`
   - `tmp.slice1.stdout`

## Recommended closeout strategy

Do **not** submit the entire worktree as one blob.

### Commit group A — core productization runtime + tests

Scope:

- `productization/`
- `package.json`
- `tsconfig.json`
- `tailwind.theme.json`
- `skills/ppt-master/scripts/materialize_from_confirmations.py`
- `skills/ppt-master/scripts/migrate_legacy_generation_manifests.py`
- `skills/ppt-master/scripts/productization_export_shim.py`
- `skills/ppt-master/scripts/config.py`

Why:

- This is the actual runtime-backed implementation and verification surface.
- It contains the productization lane that is currently green.
- It should be reviewable without forcing reviewers through dozens of planning/audit notes.

Suggested commit message shape:

- `feat(productization): land runtime-backed PPT productization lane`

### Commit group B — productization status + audit documentation

Scope:

- `docs/productization-current-status.md`
- `docs/runtime-backed-test-surface-migration-note-2026-07-09.md`
- `docs/productization-architecture.md`
- `docs/zh/productization-architecture.md`
- other `docs/productization-*.md`, `docs/project-view-*.md`, `docs/preview-*.md`, `docs/export-*.md`, `docs/runtime-backed-*.md`, `docs/kanban-*.md` that are still useful as operator/reviewer context

Why:

- These files explain the why/how/evidence of the runtime-backed lane.
- They are valuable, but they are not the executable core.
- Keeping them separate makes review easier.

Suggested commit message shape:

- `docs(productization): add runtime-backed status and audit notes`

### Commit group C — optional repo-governance / global docs

Only include if they are truly part of this stage and not unrelated drift:

- `.gitignore`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/technical-design.md`
- `docs/zh/technical-design.md`
- `DESIGN.md`

Why separate:

- These touch repo-wide guidance and can easily muddy the stage boundary.
- If unrelated, defer them.

Suggested commit message shape:

- `docs(repo): refresh productization guidance references`

## Recommended exclusions from this stage

Unless there is a very specific reason to keep them, exclude or delete before stage closeout:

- `.hermes/`
- `confirmation_locked`
- `design-md.sh`
- `tmp.checkpoint.stderr`
- `tmp.checkpoint.stdout`
- `tmp.slice1.stderr`
- `tmp.slice1.stdout`
- generated example export payloads under `examples/ppt169_building_effective_agents/exports/`

Rationale:

- These look like local environment residue, probes, or generated artifacts.
- They raise review noise and make the stage boundary less honest.

## Minimal operator checklist before commit

1. Re-run productization suite:
   - `for f in productization/tests/*.test.ts; do npx tsx "$f" || exit 1; done`
2. Stage only commit group A.
3. Review staged diff with `git diff --cached --stat` and `git diff --cached`.
4. Commit group A.
5. Stage commit group B docs separately.
6. Review and commit group B.
7. Decide explicitly whether group C belongs to this stage.
8. Drop or ignore temp/generated artifacts.

## Best next move from here

The highest-value next action is:

> **separate the worktree into commit group A (runtime/tests) and group B (docs), while excluding temp/generated artifacts.**

That produces a truthful stage boundary without inventing new product scope.
