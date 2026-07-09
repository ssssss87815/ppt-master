#!/usr/bin/env python3
import json
import shutil
import subprocess
from pathlib import Path

REPO_ROOT = Path('/home/ubuntu/projects/ppt-master-upstream')
SCAN_ROOTS = [Path('/tmp')]


def list_manifests():
    seen = []
    for root in SCAN_ROOTS:
        if not root.exists():
            continue
        for path in root.rglob('generation-manifest.json'):
            seen.append(path)
    return sorted(set(seen))


def classify_manifest(path: Path) -> str:
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except Exception as exc:
        return f'invalid-json:{exc}'
    pages = data.get('pages')
    if not isinstance(pages, list) or not pages:
        return 'no-pages'
    first = pages[0]
    if isinstance(first, dict) and {'filename', 'storageKey', 'sha256'} <= set(first.keys()):
        return 'dict-shaped-rich'
    return f'legacy-{type(first).__name__}'


def normalize_workspace(workspace: Path) -> dict:
    command = """
import { syncPreviewArtifacts, exportLocalPhase } from './productization/backend/orchestrator/phase-runner';
const workspacePath = process.argv[1];
const previewProject = {
  projectId: 'migration-preview-project',
  name: 'Migration Preview Project',
  status: 'generation_in_progress',
  workspace: { projectId: 'migration-preview-project', workspacePath },
  lastRunId: 'migration-preview-run-1',
  createdAt: '2026-07-08T12:00:00.000Z',
  updatedAt: '2026-07-08T12:00:00.000Z'
};
const previewResult = syncPreviewArtifacts(previewProject as any, '2026-07-08T12:01:00.000Z');
const exportProject = {
  ...previewResult.project,
  status: 'preview_available',
};
const exportResult = exportLocalPhase(exportProject as any, '2026-07-08T12:02:00.000Z');
console.log(JSON.stringify({ previewResult, exportResult }, null, 2));
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
    image_manifest_path = next((workspace / 'exports').glob('*_files/image_manifest.json'))
    image_manifest = json.loads(image_manifest_path.read_text(encoding='utf-8'))
    return {
        'workspace': str(workspace),
        'post_kind': classify_manifest(workspace / 'preview' / 'generation-manifest.json'),
        'preview_artifact_ids': [a.get('artifactId') for a in result['previewResult'].get('artifacts', [])],
        'export_artifact_ids': [a.get('artifactId') for a in result['exportResult'].get('artifacts', [])],
        'page_count': len(manifest.get('pages') or []),
        'export_page_count': image_manifest.get('generation_manifest', {}).get('page_count'),
        'export_first_page': (image_manifest.get('generation_manifest', {}).get('pages') or [None])[0],
    }


def main():
    manifests = list_manifests()
    report = []
    for manifest_path in manifests:
        kind = classify_manifest(manifest_path)
        entry = {'manifest': str(manifest_path), 'kind': kind}
        if kind.startswith('legacy-'):
            workspace = manifest_path.parent.parent
            backup = workspace.with_name(workspace.name + '-migration-backup')
            if backup.exists():
                shutil.rmtree(backup)
            shutil.copytree(workspace, backup)
            try:
                entry['normalized'] = normalize_workspace(workspace)
            except Exception as exc:
                entry['normalize_error'] = str(exc)
        report.append(entry)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
