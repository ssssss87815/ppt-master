import { strict as assert } from 'node:assert';

import type { ProjectViewModel } from '../app/viewmodels/project-view-model';
import { toProjectShellViewModel } from '../app/viewmodels/project-shell-view-model';

function makeProjectView(): ProjectViewModel {
  return {
    projectId: 'pptmaster-demo-project',
    name: 'PPTMASTER Demo Project',
    status: 'export_ready',
    currentPhase: {
      status: 'export_ready',
      title: 'Export ready',
      description: 'Preview and export are available.',
    },
    timeline: [],
    nextActions: ['export_pptx'],
    latestPreviewUrl: '/projects/pptmaster-demo-project/preview/index.json',
    latestExportUrl: '/projects/pptmaster-demo-project/exports/demo.pptx',
    preview: {
      latestPreviewUrl: '/projects/pptmaster-demo-project/preview/index.json',
      manifestStorageKey: 'projects/pptmaster-demo-project/preview/index.json',
      pageCount: 10,
      pageArtifactIds: ['pptmaster-demo-project-page-1'],
      items: [
        {
          artifactId: 'pptmaster-demo-project-preview-bundle',
          kind: 'preview_bundle',
          title: 'Preview bundle manifest',
          storageKey: 'projects/pptmaster-demo-project/preview/index.json',
          role: 'bundle',
        },
        {
          artifactId: 'pptmaster-demo-project-page-1',
          kind: 'preview_page_svg',
          title: 'Preview page page-1',
          storageKey: 'projects/pptmaster-demo-project/svg_output/01_封面｜低碳生活.svg',
          role: 'page',
          pageKey: 'page-1',
        },
      ],
    },
    export: {
      latestExportUrl: '/projects/pptmaster-demo-project/exports/demo.pptx',
      format: 'pptx',
      companionStorageKeys: [
        'projects/pptmaster-demo-project/exports/demo.md',
        'projects/pptmaster-demo-project/exports/demo_files/image_manifest.json',
      ],
    },
    delivery: {
      primaryArtifactId: 'pptmaster-demo-project-export-pptx',
      primaryStorageKey: 'projects/pptmaster-demo-project/exports/demo.pptx',
      companionArtifactIds: ['pptmaster-demo-project-export-md', 'pptmaster-demo-project-image-manifest'],
      companionStorageKeys: [
        'projects/pptmaster-demo-project/exports/demo.md',
        'projects/pptmaster-demo-project/exports/demo_files/image_manifest.json',
      ],
      items: [
        {
          artifactId: 'pptmaster-demo-project-export-pptx',
          kind: 'export_pptx',
          title: 'PPTX export',
          storageKey: 'projects/pptmaster-demo-project/exports/demo.pptx',
          role: 'primary',
        },
      ],
    },
    workbench: {
      sections: [
        {
          key: 'confirmations',
          title: 'Confirmations',
          status: 'complete',
          summary: 'All confirmations locked.',
        },
      ],
      confirmationState: {
        recommendationCount: 3,
        answeredCount: 3,
        locked: true,
        displayStatus: 'completed',
      },
      summaryCards: [],
    },
    sources: [],
    confirmations: [],
    artifacts: [],
    lastUpdatedAt: '2026-07-08T15:30:00.000Z',
  };
}

const shell = toProjectShellViewModel(makeProjectView());
assert.equal(shell.projectId, 'pptmaster-demo-project');
assert.equal(shell.status, 'export_ready');
assert.equal(shell.preview?.manifestStorageKey, 'projects/pptmaster-demo-project/preview/index.json');
assert.equal(shell.preview?.pageCount, 10);
assert.deepEqual(shell.preview?.pageArtifactIds, ['pptmaster-demo-project-page-1']);
assert.equal(shell.preview?.items?.[0]?.artifactId, 'pptmaster-demo-project-preview-bundle');
assert.equal(shell.preview?.items?.[1]?.pageKey, 'page-1');
assert.equal(shell.export?.latestExportUrl, '/projects/pptmaster-demo-project/exports/demo.pptx');
assert.equal(shell.export?.companionStorageKeys?.[0], 'projects/pptmaster-demo-project/exports/demo.md');
assert.equal(shell.delivery?.primaryArtifactId, 'pptmaster-demo-project-export-pptx');
assert.equal(shell.delivery?.companionArtifactIds?.length, 2);
console.log('project-shell projection gap test: ok');
