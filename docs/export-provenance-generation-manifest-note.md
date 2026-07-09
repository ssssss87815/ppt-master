# Export provenance now carries generation-manifest metadata

Date: 2026-07-08

## What this slice proves

Export companions now carry explicit provenance from `preview/generation-manifest.json`, instead of proving downstream continuity only indirectly through workspace reuse.

This strengthens the export side of the productization chain: export artifacts now preserve structured evidence about the generation surface they were built from.

## What changed

Updated:

- `skills/ppt-master/scripts/productization_export_shim.py`
- `productization/tests/export-runtime-bridge.test.ts`
- `productization/tests/slice2-generation-flow.test.ts`

### Export shim changes

The shim now reads `preview/generation-manifest.json` when present and writes that provenance into both export companions:

1. markdown companion now records:
   - `generation_manifest_present`
   - `generation_manifest_generated_at`
   - `generation_manifest_page_count`
2. `image_manifest.json` now records:
   - `generation_manifest.present`
   - `generation_manifest.generated_at`
   - `generation_manifest.page_count`
   - page-level provenance entries when manifest pages are dict-shaped

A real-world edge case was also fixed during this slice:

- some existing `generation-manifest.json` files had `pages` in a non-dict shape
- the shim initially crashed with `AttributeError: 'str' object has no attribute 'get'`
- the shim was hardened to include only dict-shaped page entries in export provenance

## Verification

Commands run:

```bash
python3 skills/ppt-master/scripts/productization_export_shim.py /tmp/ppt-downstream-svg-probe
npx tsx productization/tests/export-runtime-bridge.test.ts
npx tsx productization/tests/slice2-generation-flow.test.ts
```

Observed results:

- export shim on `/tmp/ppt-downstream-svg-probe`: exported successfully
- export runtime bridge test: passed
- slice-2 downstream alignment flow: passed

Observed artifact evidence:

- `/tmp/ppt-downstream-svg-probe/exports/ppt-downstream-svg-probe_20260708_143620.md`
  contains generation-manifest provenance fields
- `/tmp/ppt-downstream-svg-probe/exports/ppt-downstream-svg-probe_files/image_manifest.json`
  contains a `generation_manifest` block with `present=true`, `generated_at`, and `page_count=10`

## Honest boundary

This still does not prove canonical fresh-page generation discovery.

What it now proves is stronger export-side provenance:

- downstream export is not only continuing from the mutated workspace state,
- it is now also carrying explicit generation-manifest metadata forward into export companions.
