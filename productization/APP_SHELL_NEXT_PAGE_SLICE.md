# App-shell next page-level slice: preview-page focus

## Baseline reviewed

The current workbench shell is a complete server-rendered document. It projects the workflow directory, active timeline item, confirmations, strategist gate, checkpoints, artifacts, preview, export, and delivery from `ProjectViewModel`.

The preview panel already exposes the live-preview URL when supplied and lists every projected preview item. For page items it exposes title, page key, filename, and MIME type, but it does not provide a focused page-level reading surface. The renderer has sufficient existing data for a focus-only increment: `project.preview.items` identifies items with `role: 'page'` and supplies `pageKey`, `title`/`label`, `filename`, and `storageKey`. It does not guarantee a separately routable URL for each page; this slice must not invent one.

## Target behavior

When preview page artifacts are projected, the Preview assets panel gains an honest page navigator and a focused-page summary:

- The first projected page is the initial focused page.
- Each page is represented by a button using its title or label and its page key.
- Selecting a page updates the focused-page summary in place with its title, page key, filename when available, and storage key.
- The selected button has an explicit selected state (`aria-pressed="true"` and a data attribute); the summary is announced as a polite live region.
- The existing `Open live preview` action remains unchanged and appears only when a live-preview URL exists.
- If page artifacts exist but no per-page URL is available, the summary explains that selection identifies the artifact and that the live-preview link remains the view action when present. No fabricated page iframe, image source, or navigation URL is introduced.
- If there are no page artifacts, the preview panel behavior remains unchanged.

## Affected files

1. `productization/app/render-project-workbench-shell.ts`
   - Add a narrow preview-page focus renderer/helper using the existing `PreviewItem` type.
   - Render it from `renderPreviewPanel` only when `role === 'page'` items exist.
   - Add the minimal inline client-side event handling required to switch the focused summary and selected state; keep it scoped to `#panel-preview` and preserve the current live-preview link behavior.
   - Add minimal styling alongside the existing panel styles for the page navigator, selected control, and focused summary.

2. `productization/tests/project-workbench-app-shell-render.test.ts`
   - Extend the existing shell-render contract fixture with assertions for the initial focused page, page controls, honest artifact metadata, and selected-state accessibility semantics.
   - Add a no-page fixture/assertion proving that the new focus surface is absent when only a preview bundle is projected.

3. `productization/tests/project-workbench-page-slice.test.ts`
   - Assert the page-level route renders the same preview focus surface for the existing page-artifact fixture, so the endpoint is verified through the page renderer rather than only through the pure shell renderer.

## Why this is the smallest verifiable increment

This is constrained to the existing preview panel and existing `PreviewViewModel` fields. It adds a real, user-visible page-level interaction without changing routing, persistence, orchestration, artifact schemas, or runtime-bridge contracts. It deliberately stops short of displaying a page image because the current projection does not provide a per-page display URL; deriving such a URL would require a product/storage-routing decision outside this slice.

## Acceptance criteria

- A preview with one or more `role: 'page'` items renders a page navigator and focused-page summary.
- The first page is selected in the server-rendered HTML and exposes `aria-pressed="true"`.
- Each page control carries only existing projected identifiers/data, and selection updates the summary and selected state client-side.
- The focus summary exposes title, page key, storage key, and filename when available; it contains no invented page URL.
- `Open live preview` remains present only when `latestPreviewUrl` is present and retains its current `data-preview-action="open"` contract.
- A preview with no page items does not render the new navigator or focused-page summary.
- Focused tests pass:
  - `npm run runtime:app-shell-render`
  - `npm run runtime:workbench-page`
  - `npm run runtime:workbench-next-action-ui`
  - `npm run runtime:workbench-primary-timeline-focus`
- The relevant full productization mainline command remains green after the implementation and test tasks land.

## Handoff boundary

The implementation task should take this focused-preview-page slice. If it needs a real inline page image, per-page download/open URL, or a storage-key-to-URL mapping, it must stop and document that as a product/runtime routing decision rather than adding an inferred path.
