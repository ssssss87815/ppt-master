import { strict as assert } from 'node:assert';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { exportLocalPhase, requestRevision, runResumeGeneration, runStartGeneration, syncPreviewArtifacts } from '../backend/orchestrator/phase-runner';
import type { ProjectRecord } from '../backend/models/projects';

function createProjectFixture(): ProjectRecord {
  return {
    projectId: 'probe-project',
    name: 'Probe project',
    status: 'spec_ready',
    workspace: {
      projectId: 'probe-project',
      workspacePath: '',
    },
    lastRunId: 'probe-project-run-1',
    createdAt: '2026-07-07T10:00:00.000Z',
    updatedAt: '2026-07-07T10:00:00.000Z',
  };
}

test('slice-2 generation/export flow keeps preview and export downstream surfaces aligned with refreshed post-authoring evidence', () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'ppt-generation-flow-'));
  const workspace = path.join(tempRoot, 'project');
  cpSync('/tmp/ppt-downstream-svg-probe', workspace, { recursive: true });

  const project = createProjectFixture();
  project.workspace.workspacePath = workspace;

  try {
    mkdirSync(path.join(workspace, 'confirmations'), { recursive: true });
    writeFileSync(path.join(workspace, 'confirmations', 'result.json'), JSON.stringify({ approved: true }, null, 2), 'utf8');
    writeFileSync(path.join(workspace, 'design_spec.md'), '# design spec\n', 'utf8');
    writeFileSync(path.join(workspace, 'spec_lock.md'), '## colors\n- primary: #2F7D4A\n', 'utf8');

    const started = runStartGeneration(project, [], '2026-07-07T10:05:00.000Z');
    assert.equal(started.project.status, 'generation_in_progress');
    assert.equal(started.nextStatus, 'generation_in_progress');
    assert.equal(started.checkpoints[0]?.stage, 'generation_started');

    const generationManifestArtifact = started.artifacts.find(
      (item) => item.storageKey.endsWith('/preview/generation-manifest.json') && item.artifactId.endsWith('-generation-manifest'),
    );
    assert(generationManifestArtifact);
    const refreshedGenerationManifestArtifact = started.artifacts.find(
      (item) => item.artifactId.endsWith('-generation-manifest-refreshed'),
    );
    assert(refreshedGenerationManifestArtifact);
    assert.equal(
      refreshedGenerationManifestArtifact?.metadata?.verification,
      'runtime_workspace_generation_bridge_refreshed_after_authoring',
    );
    assert.equal(refreshedGenerationManifestArtifact?.metadata?.refreshedAfterAuthoringProbe, true);

    const authoringProbe = started.artifacts.find((item) => item.artifactId.endsWith('-svg-authoring-probe'));
    assert(authoringProbe);
    assert.equal(authoringProbe?.metadata?.verification, 'runtime_svg_authoring_probe');

    const startGenerationManifest = JSON.parse(readFileSync(path.resolve(String(generationManifestArtifact?.storageKey)), 'utf8')) as {
      pages: Array<{ filename: string; storageKey: string; sha256: string }>;
    };
    const refreshedStartGenerationManifest = JSON.parse(
      readFileSync(path.resolve(String(refreshedGenerationManifestArtifact?.storageKey)), 'utf8'),
      'utf8',
    ) as {
      pages: Array<{ filename: string; storageKey: string; sha256: string }>;
    };
    const startProbeStorageKey = String(authoringProbe?.metadata?.storageKey ?? '');
    const startProbeTargetFile = String(authoringProbe?.metadata?.targetFile ?? '');
    const startProbeAfterHash = String(authoringProbe?.metadata?.afterHash ?? '');
    const refreshedStartTargetPage = refreshedStartGenerationManifest.pages.find(
      (page) => startProbeTargetFile.endsWith(page.filename) || startProbeStorageKey.endsWith(String(page.storageKey ?? '')),
    );
    assert(refreshedStartTargetPage, 'refreshed generation manifest after start should include probed page');
    assert.equal(refreshedStartTargetPage?.sha256, startProbeAfterHash);
    assert(Array.isArray(startGenerationManifest.pages));
    assert((startGenerationManifest.pages.length ?? 0) > 0);

    const previewed = syncPreviewArtifacts(started.project, '2026-07-07T10:05:30.000Z');
    assert.equal(previewed.project.status, 'preview_available');
    assert.equal(previewed.checkpoints[0]?.stage, 'preview_synced');
    const previewBundle = previewed.artifacts.find((item) => item.kind === 'preview_bundle');
    assert(previewBundle);
    const previewManifestPath = path.resolve(String(previewBundle?.storageKey));
    const previewManifest = JSON.parse(readFileSync(previewManifestPath, 'utf8')) as {
      generationManifestGeneratedAt?: string;
      generationManifestPageCount?: number;
      pages: Array<{
        sourceSvg: string;
        label: string;
        generationProvenance?: { filename?: string; storageKey?: string; sha256?: string } | null;
      }>;
    };
    assert((previewManifest.generationManifestPageCount ?? 0) > 0);
    assert.match(String(previewManifest.generationManifestGeneratedAt ?? ''), /^\d{4}-\d{2}-\d{2}T/);
    const previewTargetPage = previewManifest.pages.find(
      (page) => startProbeTargetFile.endsWith(path.basename(page.sourceSvg)) || page.sourceSvg.endsWith(path.basename(startProbeStorageKey)),
    );
    assert(previewTargetPage, 'preview manifest should include the same probed page');
    assert.match(String(previewTargetPage?.generationProvenance?.sha256 ?? ''), /^[a-f0-9]{64}$/);

    const revisioned = requestRevision(previewed.project, 'Tighten the title hierarchy.', '2026-07-07T10:06:00.000Z');
    assert.equal(revisioned.project.status, 'revision_requested');
    assert.equal(revisioned.checkpoints[0]?.stage, 'revision_requested');
    assert.equal(revisioned.revisions[0]?.note, 'Tighten the title hierarchy.');

    const resumed = runResumeGeneration(revisioned.project, '2026-07-07T10:07:00.000Z');
    assert.equal(resumed.project.status, 'generation_in_progress');
    assert.equal(resumed.nextStatus, 'generation_in_progress');
    assert.equal(resumed.checkpoints[0]?.stage, 'generation_resumed');
    const resumeGenerationManifestArtifact = resumed.artifacts.find(
      (item) => item.artifactId.endsWith('-generation-manifest') && item.storageKey.endsWith('/preview/generation-manifest.json'),
    );
    const refreshedResumeGenerationManifestArtifact = resumed.artifacts.find(
      (item) => item.artifactId.endsWith('-generation-manifest-refreshed'),
    );
    assert(resumeGenerationManifestArtifact, 'resume generation should still emit the base manifest artifact');
    assert(refreshedResumeGenerationManifestArtifact, 'resume generation should emit a refreshed generation manifest after authoring mutation');
    assert.equal(
      refreshedResumeGenerationManifestArtifact?.metadata?.verification,
      'runtime_workspace_generation_bridge_refreshed_after_authoring',
    );
    assert.equal(refreshedResumeGenerationManifestArtifact?.metadata?.refreshedAfterAuthoringProbe, true);

    const resumedProbe = resumed.artifacts.find((item) => item.artifactId.endsWith('-svg-authoring-probe'));
    assert(resumedProbe, 'resume generation should still emit a svg authoring probe artifact');
    assert.equal(resumedProbe?.metadata?.verification, 'runtime_svg_authoring_probe');

    const resumeGenerationManifest = JSON.parse(readFileSync(path.resolve(String(resumeGenerationManifestArtifact?.storageKey)), 'utf8')) as {
      pages: Array<{ filename: string; storageKey: string; sha256: string }>;
    };
    const refreshedResumeGenerationManifest = JSON.parse(
      readFileSync(path.resolve(String(refreshedResumeGenerationManifestArtifact?.storageKey)), 'utf8'),
      'utf8',
    ) as {
      pages: Array<{ filename: string; storageKey: string; sha256: string }>;
    };
    const probeStorageKey = String(resumedProbe?.metadata?.storageKey ?? '');
    const probeTargetFile = String(resumedProbe?.metadata?.targetFile ?? '');
    const mutatedHash = String(resumedProbe?.metadata?.afterHash ?? '');
    const refreshedResumeTargetPage = refreshedResumeGenerationManifest.pages.find(
      (page) => probeTargetFile.endsWith(page.filename) || probeStorageKey.endsWith(String(page.storageKey ?? '')),
    );
    assert(refreshedResumeTargetPage, 'refreshed generation manifest after resume should include the probed page');
    assert.equal(refreshedResumeTargetPage?.sha256, mutatedHash);
    assert(Array.isArray(resumeGenerationManifest.pages));
    assert((resumeGenerationManifest.pages.length ?? 0) > 0);

    const persistedGenerationManifestPath = path.join(workspace, 'preview', 'generation-manifest.json');
    const persistedGenerationManifest = JSON.parse(readFileSync(persistedGenerationManifestPath, 'utf8')) as {
      pages: Array<{ filename: string; storageKey: string; sha256: string }>;
    };
    const manifestTargetPage = persistedGenerationManifest.pages.find(
      (page) => probeTargetFile.endsWith(page.filename) || probeStorageKey.endsWith(String(page.storageKey ?? '')),
    );
    assert(manifestTargetPage, 'persisted generation manifest should include probed page');
    assert.equal(manifestTargetPage?.sha256, mutatedHash);

    const previewedAgain = syncPreviewArtifacts(resumed.project, '2026-07-07T10:07:30.000Z');
    assert.equal(previewedAgain.project.status, 'preview_available');
    assert.equal(previewedAgain.checkpoints[0]?.stage, 'preview_synced');
    const normalizationArtifact = previewedAgain.artifacts.find(
      (item) => item.metadata?.verification === 'runtime_workspace_generation_bridge' && item.metadata?.role === 'generation_evidence',
    );
    assert(normalizationArtifact, 'preview sync should normalize generation manifest before building preview artifacts');
    const previewBundleAgain = previewedAgain.artifacts.find((item) => item.kind === 'preview_bundle');
    assert(previewBundleAgain);
    const previewManifestAgainPath = path.resolve(String(previewBundleAgain?.storageKey));
    const previewManifestAgain = JSON.parse(readFileSync(previewManifestAgainPath, 'utf8')) as {
      generationManifestGeneratedAt?: string;
      generationManifestPageCount?: number;
      pages: Array<{
        sourceSvg: string;
        label: string;
        generationProvenance?: { filename?: string; storageKey?: string; sha256?: string } | null;
      }>;
    };
    assert((previewManifestAgain.generationManifestPageCount ?? 0) > 0);
    assert.match(String(previewManifestAgain.generationManifestGeneratedAt ?? ''), /^\d{4}-\d{2}-\d{2}T/);
    const previewTargetPageAgain = previewManifestAgain.pages.find(
      (page) => probeTargetFile.endsWith(path.basename(page.sourceSvg)) || page.sourceSvg.endsWith(path.basename(probeStorageKey)),
    );
    assert(previewTargetPageAgain, 'preview-after-resume manifest should include the probed page from refreshed generation evidence');
    assert.equal(previewTargetPageAgain?.generationProvenance?.sha256, mutatedHash);

    const exported = exportLocalPhase(previewedAgain.project, '2026-07-07T10:08:00.000Z');
    assert.equal(exported.project.status, 'export_ready');
    assert.equal(exported.nextStatus, 'export_ready');
    assert.equal(exported.checkpoints[0]?.stage, 'export_ready');
    const exportNormalizationArtifact = exported.artifacts.find(
      (artifact) => artifact.metadata?.verification === 'runtime_workspace_generation_bridge' && artifact.metadata?.role === 'generation_evidence',
    );
    assert(exportNormalizationArtifact, 'export phase should return a normalization generation manifest before exporting');

    const artifactIds = exported.artifacts.map((artifact) => artifact.artifactId);
    assert(artifactIds.includes('probe-project-export-pptx'));
    const pptxArtifact = exported.artifacts.find((artifact) => artifact.kind === 'export_pptx');
    assert(pptxArtifact);
    assert(exported.artifacts.some((artifact) => artifact.storageKey.endsWith('.pptx')));
    assert(exported.artifacts.some((artifact) => artifact.storageKey.endsWith('.md')));
    assert(exported.artifacts.some((artifact) => artifact.storageKey.endsWith('image_manifest.json')));

    const exportMarkdownArtifact = exported.artifacts.find((artifact) => artifact.label?.includes('markdown companion'));
    assert(exportMarkdownArtifact);
    const exportMarkdown = readFileSync(path.resolve(String(exportMarkdownArtifact?.storageKey)), 'utf8');
    assert.match(exportMarkdown, /productization_export_shim/);
    assert.match(exportMarkdown, /generation_manifest_present: True/);
    assert.match(exportMarkdown, /generation_manifest_page_count: \d+/);

    const exportImageManifestArtifact = exported.artifacts.find((artifact) => artifact.kind === 'image_manifest');
    assert(exportImageManifestArtifact);
    const exportImageManifest = JSON.parse(readFileSync(path.resolve(String(exportImageManifestArtifact?.storageKey)), 'utf8')) as {
      generation_manifest?: {
        present: boolean;
        page_count: number;
        pages: Array<{ filename: string; storageKey: string; sha256: string }>;
      };
    };
    assert.equal(exportImageManifest.generation_manifest?.present, true);
    assert((exportImageManifest.generation_manifest?.page_count ?? 0) > 0);
    const exportedTargetPage = exportImageManifest.generation_manifest?.pages?.find(
      (page) => probeTargetFile.endsWith(page.filename) || probeStorageKey.endsWith(String(page.storageKey ?? '')),
    );
    assert(exportedTargetPage, 'export image manifest should carry the probed page provenance');
    assert.equal(exportedTargetPage?.sha256, mutatedHash);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
