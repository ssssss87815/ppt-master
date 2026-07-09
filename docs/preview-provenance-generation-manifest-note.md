# Preview now carries generation-manifest provenance explicitly

Date: 2026-07-08

## What this slice proves

Preview is no longer justified only by "it reads the same workspace SVGs". The preview manifest now explicitly carries generation-manifest provenance fields forward, making downstream preview provenance structurally closer to what export now does.

## What changed

Updated:

- `productization/backend/adapter/preview-runtime-bridge.ts`
- `productization/tests/preview-runtime-bridge.test.ts`
- `productization/tests/slice2-generation-flow.test.ts`

### Preview bridge changes

The preview bridge now reads `preview/generation-manifest.json` when present and propagates provenance into `preview/index.json` and preview artifacts:

- bundle metadata now includes:
  - `generationManifestGeneratedAt`
  - `generationManifestPageCount`
- preview manifest top-level now includes:
  - `generationManifestGeneratedAt`
  - `generationManifestPageCount`
- each preview page now includes `generationProvenance` when a generation-manifest page can be matched

Matching logic was also hardened for real-world path drift:

- exact `filename`
- exact `storageKey`
- `/svg_output/<filename>` suffix
- Windows-style `\\svg_output\\<filename>` suffix
- basename match
- fallback to page index when older manifests do not preserve enough path fidelity

## Verification

Commands run:

```bash
npx tsx productization/tests/preview-runtime-bridge.test.ts
npx tsx productization/tests/slice2-generation-flow.test.ts
python3 skills/ppt-master/scripts/productization_export_shim.py /tmp/ppt-downstream-svg-probe
npx tsx productization/tests/export-runtime-bridge.test.ts
```

Observed results:

- preview runtime bridge test: passed
- slice-2 downstream alignment flow: passed
- export shim on `/tmp/ppt-downstream-svg-probe`: exported successfully
- export runtime bridge test: passed

Observed artifact evidence:

- `/tmp/ppt-downstream-svg-probe/preview/index.json`
  now contains `generationManifestGeneratedAt` and `generationManifestPageCount`
- `/tmp/ppt-downstream-svg-probe/exports/ppt-downstream-svg-probe_20260708_150716.md`
  contains generation-manifest provenance fields on the export side
- `/tmp/ppt-downstream-svg-probe/exports/ppt-downstream-svg-probe_files/image_manifest.json`
  contains a `generation_manifest` block with `present=true`, `generated_at`, and `page_count=10`

## Honest boundary

This still does not prove canonical fresh-page generation discovery.

What it now proves is a stronger continuous downstream provenance chain:

- generation records page-level evidence,
- authoring mutates the same runtime surface,
- refreshed generation evidence records post-mutation state,
- preview carries generation provenance forward explicitly,
- export carries generation provenance forward explicitly.
