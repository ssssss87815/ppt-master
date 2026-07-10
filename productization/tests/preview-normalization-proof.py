import json
import shutil
import subprocess
import tempfile
from pathlib import Path

REPO_ROOT = Path('/home/ubuntu/projects/ppt-master-upstream')
PROJECT_SOURCE = Path('productization/test-fixtures/runtime-workspace')

with tempfile.TemporaryDirectory(prefix='ppt-preview-normalization-proof-') as temp_dir:
    workspace = Path(temp_dir) / 'workspace'
    shutil.copytree(PROJECT_SOURCE, workspace)
    legacy_manifest_path = workspace / 'preview' / 'generation-manifest.json'
    legacy_manifest = json.loads(legacy_manifest_path.read_text(encoding='utf-8'))
    legacy_manifest['pages'] = [str(page) for page in legacy_manifest.get('pages', [])]
    legacy_manifest_path.write_text(json.dumps(legacy_manifest, ensure_ascii=False, indent=2), encoding='utf-8')

    command = """
import { syncPreviewArtifacts } from './productization/backend/orchestrator/phase-runner';
const project = {
  projectId: 'preview-normalization-proof-project',
  name: 'Preview Normalization Proof Project',
  status: 'generation_in_progress',
  workspace: { projectId: 'preview-normalization-proof-project', workspacePath: process.argv[1] },
  lastRunId: 'preview-normalization-proof-run-1',
  createdAt: '2026-07-08T11:00:00.000Z',
  updatedAt: '2026-07-08T11:00:00.000Z'
};
const result = syncPreviewArtifacts(project as any, '2026-07-08T11:07:00.000Z');
console.log(JSON.stringify(result, null, 2));
""".strip()

    completed = subprocess.run(
        ['npx', 'tsx', '-e', command, str(workspace)],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    result = json.loads(completed.stdout)
    manifest = json.loads((workspace / 'preview' / 'generation-manifest.json').read_text(encoding='utf-8'))
    preview_index = json.loads((workspace / 'preview' / 'index.json').read_text(encoding='utf-8'))
    print(json.dumps({
        'normalized_artifact_ids': [artifact.get('artifactId') for artifact in result.get('artifacts', [])],
        'normalized_generation_pages_type': type((manifest.get('pages') or [None])[0]).__name__ if manifest.get('pages') else None,
        'preview_generation_manifest_page_count': preview_index.get('generationManifestPageCount'),
        'preview_first_page_generation_provenance': (preview_index.get('pages') or [{}])[0].get('generationProvenance'),
    }, ensure_ascii=False, indent=2))
