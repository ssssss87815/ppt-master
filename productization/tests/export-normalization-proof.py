import json
import shutil
import subprocess
import tempfile
from pathlib import Path

REPO_ROOT = Path('/home/ubuntu/projects/ppt-master-upstream')
PROJECT_SOURCE = Path('/tmp/ppt-downstream-svg-probe')

with tempfile.TemporaryDirectory(prefix='ppt-export-normalization-proof-') as temp_dir:
    workspace = Path(temp_dir) / 'workspace'
    shutil.copytree(PROJECT_SOURCE, workspace)
    legacy_manifest_path = workspace / 'preview' / 'generation-manifest.json'
    legacy_manifest = json.loads(legacy_manifest_path.read_text(encoding='utf-8'))
    legacy_manifest['pages'] = [str(page) for page in legacy_manifest.get('pages', [])]
    legacy_manifest_path.write_text(json.dumps(legacy_manifest, ensure_ascii=False, indent=2), encoding='utf-8')

    command = """
import { exportLocalPhase } from './productization/backend/orchestrator/phase-runner';
const project = {
  projectId: 'export-normalization-proof-project',
  name: 'Export Normalization Proof Project',
  status: 'preview_available',
  workspace: { projectId: 'export-normalization-proof-project', workspacePath: process.argv[1] },
  lastRunId: 'export-normalization-proof-run-1',
  createdAt: '2026-07-08T11:00:00.000Z',
  updatedAt: '2026-07-08T11:00:00.000Z'
};
const result = exportLocalPhase(project as any, '2026-07-08T11:08:00.000Z');
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
    image_manifest = json.loads((workspace / 'exports' / f'{workspace.name}_files' / 'image_manifest.json').read_text(encoding='utf-8'))
    print(json.dumps({
        'normalized_artifact_ids': [artifact.get('artifactId') for artifact in result.get('artifacts', [])],
        'normalized_generation_pages_type': type((manifest.get('pages') or [None])[0]).__name__ if manifest.get('pages') else None,
        'export_generation_manifest_page_count': image_manifest.get('generation_manifest', {}).get('page_count'),
        'export_first_page': (image_manifest.get('generation_manifest', {}).get('pages') or [None])[0],
    }, ensure_ascii=False, indent=2))
