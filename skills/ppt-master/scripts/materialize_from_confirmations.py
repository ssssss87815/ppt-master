#!/usr/bin/env python3
"""Materialize design_spec.md/spec_lock.md from a locked confirmation result.

This is a minimal executor shim for productization: it does not pretend to be
full Strategist, but it does convert a confirmed result JSON into the canonical
markdown artifacts the downstream PPTMASTER workspace expects.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path


def _must_read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except FileNotFoundError as exc:
        raise SystemExit(f'error: locked confirmation result not found: {path}') from exc


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text.rstrip() + '\n', encoding='utf-8')


def build_design_spec(payload: dict) -> str:
    palette = payload.get('color', {}).get('palette', {})
    typography = payload.get('typography', {})
    image_strategy = payload.get('image_strategy', {})
    lines = [
        f"# Design Spec — {payload.get('audience', 'Unknown audience')}",
        '',
        '## Presentation Intent',
        f"- Audience: {payload.get('audience', '')}",
        f"- Goal mode: {payload.get('mode', '')}",
        f"- Visual style: {payload.get('visual_style', '')}",
        f"- Delivery: {payload.get('generation_mode', '')}",
        '',
        '## Narrative Constraints',
        f"- Page count: {payload.get('page_count', '')}",
        f"- Content divergence: {payload.get('content_divergence', '')}",
        f"- Formula policy: {payload.get('formula_policy', '')}",
        '',
        '## Visual System',
        f"- Palette background: {palette.get('background', '')}",
        f"- Palette primary: {palette.get('primary', '')}",
        f"- Palette accent: {palette.get('accent', '')}",
        f"- Palette body text: {palette.get('body_text', '')}",
        f"- Icon library: {payload.get('icons', '')}",
        '',
        '## Typography',
        f"- Heading CSS: {typography.get('heading', {}).get('css', '')}",
        f"- Body CSS: {typography.get('body', {}).get('css', '')}",
        f"- Body size: {typography.get('body_size', '')}",
        '',
        '## Image Strategy',
        f"- Image usage: {payload.get('image_usage', '')}",
        f"- Image acquisition: {payload.get('image_ai_path', '')}",
        f"- Rendering: {image_strategy.get('rendering', '')}",
        f"- Mood: {image_strategy.get('mood', '')}",
    ]
    return '\n'.join(lines)


def build_spec_lock(payload: dict) -> str:
    palette = payload.get('color', {}).get('palette', {})
    typography = payload.get('typography', {})
    heading = typography.get('heading', {})
    body = typography.get('body', {})
    lines = [
        f"# Spec Lock — Locked confirmations derived",
        '',
        f"canvas: {payload.get('canvas', '')}",
        f"mode: {payload.get('mode', '')}",
        f"visual_style: {payload.get('visual_style', '')}",
        f"audience: {payload.get('audience', '')}",
        f"page_count: {payload.get('page_count', '')}",
        '',
        '## typography',
        f"- heading_cjk: {heading.get('cjk', '')}",
        f"- heading_latin: {heading.get('latin', '')}",
        f"- heading_css: {heading.get('css', '')}",
        f"- body_cjk: {body.get('cjk', '')}",
        f"- body_latin: {body.get('latin', '')}",
        f"- body_css: {body.get('css', '')}",
        f"- body_size: {typography.get('body_size', '')}",
        '',
        '## colors',
        f"- background: {palette.get('background', '')}",
        f"- secondary_bg: {palette.get('secondary_bg', '')}",
        f"- primary: {palette.get('primary', '')}",
        f"- accent: {palette.get('accent', '')}",
        f"- secondary_accent: {palette.get('secondary_accent', '')}",
        f"- body_text: {palette.get('body_text', '')}",
        '',
        '## images',
        f"- usage: {payload.get('image_usage', '')}",
        f"- generation_mode: {payload.get('generation_mode', '')}",
    ]
    return '\n'.join(lines)


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print('usage: materialize_from_confirmations.py <project_path>', file=sys.stderr)
        return 2
    project = Path(argv[1]).resolve()
    result_path = project / 'confirmations' / 'result.json'
    payload = _must_read_json(result_path)
    design_spec_path = project / 'design_spec.md'
    spec_lock_path = project / 'spec_lock.md'
    _write(design_spec_path, build_design_spec(payload))
    _write(spec_lock_path, build_spec_lock(payload))
    print(json.dumps({
        'project_path': str(project),
        'confirmation_result': str(result_path),
        'design_spec_path': str(design_spec_path),
        'spec_lock_path': str(spec_lock_path),
        'status': 'materialized',
    }, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
