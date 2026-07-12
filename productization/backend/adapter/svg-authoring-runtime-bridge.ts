import { createHash, randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import type { ProductArtifactRef } from '../models/artifacts';
import type { ProjectRecord } from '../models/projects';

export type SvgAuthoringRuntimeResult = {
  artifacts: ProductArtifactRef[];
  runtimeStatus: 'mutated' | 'failed';
  note: string;
};

function sha256Of(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function resolveFirstSvg(workspacePath: string): string {
  const preferred = path.join(workspacePath, 'svg_output', '01_封面｜低碳生活.svg');
  if (existsSync(preferred)) {
    return preferred;
  }

  const fallback = execFileSync(
    'python3',
    [
      '-c',
      "from pathlib import Path; import sys; files=sorted(Path(sys.argv[1]).glob('svg_output/*.svg')); print(files[0] if files else '')",
      workspacePath,
    ],
    { encoding: 'utf8' },
  ).trim();

  if (!fallback) {
    throw new Error(`no svg files found under ${workspacePath}/svg_output`);
  }

  return path.resolve(fallback);
}

export function runSvgAuthoringProbe(
  project: ProjectRecord,
  now = new Date().toISOString(),
): SvgAuthoringRuntimeResult {
  const repoRoot = path.resolve('.');
  const workspacePath = path.resolve(project.workspace.workspacePath);
  const targetFile = resolveFirstSvg(workspacePath);
  const targetBasename = path.basename(targetFile);
  const encodedTargetBasename = encodeURIComponent(targetBasename);
  const runId = project.lastRunId ?? `${project.projectId}-authoring-probe`;
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'ppt-svg-authoring-probe-'));
  const probeWorkspace = path.join(tempRoot, path.basename(workspacePath));

  try {
    cpSync(workspacePath, probeWorkspace, { recursive: true });

    const probeTarget = path.join(probeWorkspace, 'svg_output', targetBasename);
    const beforeContent = readFileSync(probeTarget, 'utf8');
    const beforeHash = sha256Of(probeTarget);
    const annotationText = `productization runtime authoring probe ${now} ${randomUUID()}`;

    const script = `
import json, re, subprocess, time, urllib.request
from pathlib import Path
proj = Path(${JSON.stringify(probeWorkspace)})
slide_name = ${JSON.stringify(targetBasename)}
slide_url = ${JSON.stringify(encodedTargetBasename)}
annotation_text = ${JSON.stringify(annotationText)}
server = subprocess.Popen([
  'python3', 'skills/ppt-master/scripts/svg_editor/server.py', str(proj), '--live', '--port', '5071'
], cwd=${JSON.stringify(repoRoot)}, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
try:
  for _ in range(40):
    try:
      with urllib.request.urlopen('http://127.0.0.1:5071/api/slides', timeout=2):
        break
    except Exception:
      time.sleep(0.5)
  with urllib.request.urlopen(f'http://127.0.0.1:5071/api/slide/{slide_url}', timeout=5) as resp:
    slide = json.load(resp)
  ids = re.findall(r'id=\"([^\"]+)\"', slide['content'])
  if not ids:
    raise RuntimeError(f'no editable element ids found in {slide_name}')
  target_id = ids[0]
  payload = json.dumps({'element_id': target_id, 'annotation': annotation_text}).encode()
  req = urllib.request.Request(f'http://127.0.0.1:5071/api/slide/{slide_url}/annotate', data=payload, headers={'Content-Type': 'application/json'}, method='POST')
  with urllib.request.urlopen(req, timeout=5):
    pass
  save_req = urllib.request.Request('http://127.0.0.1:5071/api/save-all', data=b'{}', headers={'Content-Type': 'application/json'}, method='POST')
  with urllib.request.urlopen(save_req, timeout=10) as resp:
    print(resp.read().decode())
finally:
  try:
    req = urllib.request.Request('http://127.0.0.1:5071/api/shutdown', data=b'', method='POST')
    urllib.request.urlopen(req, timeout=2)
  except Exception:
    pass
  try:
    server.communicate(timeout=5)
  except Exception:
    server.kill()
`;
    execFileSync('python3', ['-c', script], { cwd: repoRoot, stdio: 'pipe' });

    const afterContent = readFileSync(probeTarget, 'utf8');
    const afterHash = sha256Of(probeTarget);
    if (beforeHash === afterHash && beforeContent === afterContent) {
      throw new Error('svg authoring probe did not mutate the SVG file');
    }

    writeFileSync(targetFile, afterContent, 'utf8');
    const workspaceAfterHash = sha256Of(targetFile);
    const storageKey = path.relative(repoRoot, targetFile);
    return {
      runtimeStatus: 'mutated',
      note: 'SVG authoring runtime probe mutated the workspace SVG through the live preview save-all path and synced the mutation back to the active workspace.',
      artifacts: [
        {
          artifactId: `${project.projectId}-svg-authoring-probe`,
          projectId: project.projectId,
          kind: 'runtime_log',
          scope: 'run',
          status: 'ready',
          label: 'SVG authoring runtime probe',
          runId,
          storageKey,
          mimeType: 'image/svg+xml',
          metadata: {
            verification: 'runtime_svg_authoring_probe',
            probeWorkspace,
            targetFile,
            beforeHash,
            afterHash: workspaceAfterHash,
            beforeBytes: beforeContent.length,
            afterBytes: afterContent.length,
            mutation: 'annotation_via_live_preview_save_all',
            annotationText,
            syncedBackToWorkspace: true,
          },
          createdAt: now,
          updatedAt: now,
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      runtimeStatus: 'failed',
      note: `SVG authoring runtime probe failed: ${message}`,
      artifacts: [],
    };
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
