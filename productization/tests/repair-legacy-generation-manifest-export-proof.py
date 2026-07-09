import json
import shutil
import subprocess
import tempfile
from pathlib import Path

REPO_ROOT = Path('/home/ubuntu/projects/ppt-master-upstream')
PROJECT_SOURCE = Path('/tmp/ppt-downstream-svg-probe')

with tempfile.TemporaryDirectory(prefix='ppt-legacy-manifest-repair-') as temp_dir:
    workspace = Path(temp_dir) / 'workspace'
    shutil.copytree(PROJECT_SOURCE, workspace)
    subprocess.run(
        ['npx', 'tsx', '-e', (
            "import { runGenerationFromWorkspace } from './productization/backend/adapter/generation-runtime-bridge';"
            "const project = {"
            " projectId: 'legacy-manifest-repair-project',"
            " name: 'Legacy Manifest Repair Project',"
            " status: 'generation_in_progress',"
            " workspace: { projectId: 'legacy-manifest-repair-project', workspacePath: process.argv[1] },"
            " lastRunId: 'legacy-manifest-repair-project-run-1',"
            " createdAt: '2026-07-08T11:00:00.000Z',"
            " updatedAt: '2026-07-08T11:00:00.000Z'"
            "};"
            "const result = runGenerationFromWorkspace(project as any, '2026-07-08T11:06:00.000Z');"
            "if (result.runtimeStatus !== 'generation_synced') { throw new Error(result.note); }"
        ), str(workspace)],
        cwd=REPO_ROOT,
        check=True,
    )
    subprocess.run(
        ['python3', 'skills/ppt-master/scripts/productization_export_shim.py', str(workspace)],
        cwd=REPO_ROOT,
        check=True,
    )
    manifest = json.loads((workspace / 'preview' / 'generation-manifest.json').read_text(encoding='utf-8'))
    image_manifest = json.loads((workspace / 'exports' / f'{workspace.name}_files' / 'image_manifest.json').read_text(encoding='utf-8'))
    print(json.dumps({
        'generation_manifest_page_count': len(manifest.get('pages', [])),
        'first_generation_page': (manifest.get('pages') or [None])[0],
        'export_generation_manifest': image_manifest.get('generation_manifest'),
    }, ensure_ascii=False, indent=2))
