#!/usr/bin/env python3
"""Minimal productization export shim for PPT Master projects.

Builds a PPTX from an existing project workspace whose svg_output/ and notes/ are
already present. Also writes the minimal companion artifacts that current
productization slices expect: an export markdown note and an image manifest.
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


def fail(message: str) -> int:
    print(f"error: {message}", file=sys.stderr)
    return 1


def read_generation_manifest(project_path: Path) -> dict:
    manifest_path = project_path / 'preview' / 'generation-manifest.json'
    if not manifest_path.exists():
        return {}
    try:
        return json.loads(manifest_path.read_text(encoding='utf-8'))
    except Exception:
        return {}


def write_markdown_companion(project_path: Path, exports_dir: Path, project_name: str, generation_manifest: dict) -> Path:
    md_path = exports_dir / f"{project_name}.md"
    pages = generation_manifest.get('pages') if isinstance(generation_manifest, dict) else None
    refreshed = generation_manifest.get('generatedAt') if isinstance(generation_manifest, dict) else None
    content = "\n".join(
        [
            f"# Export companion — {project_name}",
            "",
            f"project_path: {project_path}",
            f"exported_at: {datetime.now(timezone.utc).isoformat()}",
            "source: productization_export_shim",
            f"generation_manifest_present: {bool(generation_manifest)}",
            f"generation_manifest_generated_at: {refreshed or ''}",
            f"generation_manifest_page_count: {len(pages) if isinstance(pages, list) else 0}",
        ]
    )
    md_path.write_text(content, encoding='utf-8')
    return md_path


def write_image_manifest(project_path: Path, exports_dir: Path, generation_manifest: dict) -> Path:
    assets_dir = exports_dir / f"{project_path.name}_files"
    assets_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = assets_dir / 'image_manifest.json'
    images = []
    images_dir = project_path / 'images'
    if images_dir.exists():
        for image in sorted(images_dir.rglob('*')):
            if image.is_file():
                images.append({'path': str(image.relative_to(project_path)), 'bytes': image.stat().st_size})
    manifest_path.write_text(
        json.dumps(
            {
                'project': project_path.name,
                'images': images,
                'generation_manifest': {
                    'present': bool(generation_manifest),
                    'generated_at': generation_manifest.get('generatedAt') if isinstance(generation_manifest, dict) else None,
                    'page_count': len(generation_manifest.get('pages', [])) if isinstance(generation_manifest, dict) else 0,
                    'pages': [
                        {
                            'filename': page.get('filename'),
                            'storageKey': page.get('storageKey'),
                            'sha256': page.get('sha256'),
                        }
                        for page in generation_manifest.get('pages', [])
                        if isinstance(page, dict)
                    ] if isinstance(generation_manifest, dict) else [],
                },
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding='utf-8',
    )
    return manifest_path


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    if len(argv) != 1:
        return fail('usage: productization_export_shim.py <project_path>')

    project_path = Path(argv[0]).resolve()
    if not project_path.exists():
        return fail(f'project path does not exist: {project_path}')

    svg_dir = project_path / 'svg_output'
    if not svg_dir.exists() or not any(svg_dir.glob('*.svg')):
        return fail(f'svg_output missing or empty: {svg_dir}')

    notes_dir = project_path / 'notes'
    if not notes_dir.exists():
        return fail(f'notes directory missing: {notes_dir}')

    exports_dir = project_path / 'exports'
    exports_dir.mkdir(parents=True, exist_ok=True)
    generation_manifest = read_generation_manifest(project_path)

    subprocess.run(
        ['python3', 'skills/ppt-master/scripts/svg_to_pptx.py', str(project_path), '-s', 'output', '-q'],
        check=True,
    )

    pptx_files = sorted(exports_dir.glob('*.pptx'), key=lambda item: item.stat().st_mtime, reverse=True)
    if not pptx_files:
        return fail(f'no pptx produced under: {exports_dir}')

    latest_pptx = pptx_files[0]
    project_name = latest_pptx.stem
    write_markdown_companion(project_path, exports_dir, project_name, generation_manifest)
    write_image_manifest(project_path, exports_dir, generation_manifest)

    print(
        json.dumps(
            {
                'project_path': str(project_path),
                'pptx_path': str(latest_pptx),
                'markdown_companion': str(exports_dir / f'{project_name}.md'),
                'image_manifest': str(exports_dir / f'{project_path.name}_files' / 'image_manifest.json'),
                'status': 'exported',
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
