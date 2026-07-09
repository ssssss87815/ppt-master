import { strict as assert } from 'node:assert';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runExportFromWorkspace } from '../backend/adapter/export-runtime-bridge';
import type { ProjectRecord } from '../backend/models/projects';

function createProjectFixture(): ProjectRecord {
  return {
    projectId: 'pptmaster-export-bridge-project',
    name: 'PPTMASTER Export Bridge Project',
    status: 'preview_available',
    workspace: {
      projectId: 'pptmaster-export-bridge-project',
      workspacePath: '',
    },
    lastRunId: 'pptmaster-export-bridge-project-run-1',
    createdAt: '2026-07-08T10:00:00.000Z',
    updatedAt: '2026-07-08T10:00:00.000Z',
  };
}

test('export runtime bridge emits pptx and companion artifacts from an existing workspace', () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'ppt-export-bridge-'));
  const workspace = path.join(tempRoot, 'project');
  cpSync('/tmp/ppt-downstream-svg-probe', workspace, { recursive: true });

  const project = createProjectFixture();
  project.workspace.workspacePath = workspace;

  try {
    const generationManifestPath = path.join(workspace, 'preview', 'generation-manifest.json');
    mkdirSync(path.dirname(generationManifestPath), { recursive: true });
    writeFileSync(
      generationManifestPath,
      JSON.stringify(
        {
          generatedAt: '2026-07-08T10:09:00.000Z',
          pages: [
            {
              filename: '01_cover.svg',
              storageKey: path.join(workspace, 'svg_output', '01_cover.svg'),
              sha256: 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd',
            },
          ],
        },
        null,
        2,
      ),
      'utf8',
    );

    const result = runExportFromWorkspace(project, '2026-07-08T10:10:00.000Z');

    assert.equal(result.runtimeStatus, 'exported');
    assert.equal(result.artifacts.length, 3);

    const pptxArtifact = result.artifacts.find((item) => item.kind === 'export_pptx');
    assert.ok(pptxArtifact, 'pptx artifact should exist');
    assert.ok(pptxArtifact?.storageKey.endsWith('.pptx'));
    assert.ok(existsSync(path.resolve(pptxArtifact!.storageKey)));

    const manifestArtifact = result.artifacts.find((item) => item.kind === 'image_manifest');
    assert.ok(manifestArtifact, 'image manifest artifact should exist');
    const manifest = JSON.parse(readFileSync(path.resolve(manifestArtifact!.storageKey), 'utf8')) as {
      images: unknown[];
      generation_manifest?: {
        present: boolean;
        generated_at: string;
        page_count: number;
        pages: Array<{ filename: string; storageKey: string; sha256: string }>;
      };
    };
    assert.ok(Array.isArray(manifest.images), 'image manifest should include images array');
    assert.equal(manifest.generation_manifest?.present, true);
    assert.equal(manifest.generation_manifest?.generated_at, '2026-07-08T10:09:00.000Z');
    assert.equal(manifest.generation_manifest?.page_count, 1);
    assert.equal(manifest.generation_manifest?.pages?.[0]?.filename, '01_cover.svg');
    assert.equal(
      manifest.generation_manifest?.pages?.[0]?.sha256,
      'abc123def456abc123def456abc123def456abc123def456abc123def456abcd',
    );

    const companionArtifact = result.artifacts.find((item) => item.label?.includes('markdown companion'));
    assert.ok(companionArtifact, 'markdown companion artifact should exist');
    const companionContent = readFileSync(path.resolve(companionArtifact!.storageKey), 'utf8');
    assert.match(companionContent, /productization_export_shim/);
    assert.match(companionContent, /generation_manifest_present: True/);
    assert.match(companionContent, /generation_manifest_page_count: 1/);
    assert.match(companionContent, /generation_manifest_generated_at: 2026-07-08T10:09:00.000Z/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
