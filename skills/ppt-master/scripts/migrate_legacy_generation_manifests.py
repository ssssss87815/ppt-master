#!/usr/bin/env python3
import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path('/home/ubuntu/projects/ppt-master-upstream')
DEFAULT_SCAN_ROOTS = [Path('/tmp')]


def list_manifests(scan_roots: list[Path]) -> list[Path]:
    seen: set[Path] = set()
    for root in scan_roots:
        if not root.exists():
            continue
        for path in root.rglob('generation-manifest.json'):
            seen.add(path)
    return sorted(seen)


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


def make_backup(workspace: Path) -> Path:
    backup = workspace.with_name(workspace.name + '-migration-backup')
    if backup.exists():
        shutil.rmtree(backup)
    shutil.copytree(workspace, backup)
    return backup


def build_report(scan_roots: list[Path], apply: bool) -> list[dict]:
    manifests = list_manifests(scan_roots)
    report: list[dict] = []
    for manifest_path in manifests:
        kind = classify_manifest(manifest_path)
        entry: dict = {'manifest': str(manifest_path), 'kind': kind}
        if kind.startswith('legacy-'):
            workspace = manifest_path.parent.parent
            if workspace.name.endswith('-migration-backup'):
                entry['skipped'] = 'backup-workspace'
                report.append(entry)
                continue
            entry['workspace'] = str(workspace)
            if apply:
                backup = make_backup(workspace)
                entry['backup'] = str(backup)
                try:
                    entry['normalized'] = normalize_workspace(workspace)
                except Exception as exc:
                    entry['normalize_error'] = str(exc)
            else:
                entry['would_normalize'] = True
        report.append(entry)
    return report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description='Detect and optionally normalize legacy preview/generation-manifest.json workspaces.',
    )
    parser.add_argument(
        '--scan-root',
        action='append',
        default=[],
        help='Root directory to scan for generation-manifest.json (repeatable). Default: /tmp',
    )
    parser.add_argument(
        '--apply',
        action='store_true',
        help='Actually normalize legacy workspaces and create sibling *-migration-backup copies.',
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    scan_roots = [Path(p) for p in (args.scan_root or [])] or DEFAULT_SCAN_ROOTS
    report = build_report(scan_roots, apply=args.apply)
    json.dump(report, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write('\n')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
