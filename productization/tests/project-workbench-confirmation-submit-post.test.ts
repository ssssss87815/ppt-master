import assert from 'node:assert/strict';

import type { ProductArtifactRef } from '../backend/models/artifacts.ts';
import type { ProjectRecord, WorkflowCheckpoint } from '../backend/models/projects.ts';
import { handleProjectWorkbenchHttpRequest } from '../app/project-workbench-http-route.ts';
import { applyImportSources } from '../backend/actions/import-sources.ts';
import { applyPrepareConfirmations } from '../backend/actions/prepare-confirmations.ts';
import type { ImportSourcesAction, PrepareConfirmationsAction } from '../backend/models/actions.ts';

function makeProject(status: ProjectRecord['status']): ProjectRecord {
  return {
    projectId: 'confirm-submit-test-project',
    name: 'Confirm Submit Test Project',
    status,
    workspace: {
      projectId: 'confirm-submit-test-project',
      workspacePath: 'projects/confirm-submit-test-project',
    },
    createdAt: '2026-07-10T10:00:00.000Z',
    updatedAt: '2026-07-10T10:00:00.000Z',
  };
}

function makeDependencies(project: ProjectRecord, artifacts: ProductArtifactRef[] = []) {
  let storedProject = project;
  let storedArtifacts = [...artifacts];
  const storedCheckpoints: WorkflowCheckpoint[] = [];
  const recommendations = [
    { key: 'audience', title: 'Audience', recommendation: 'Clarify the target audience.' },
    { key: 'goal', title: 'Goal', recommendation: 'Define the primary outcome.' },
    { key: 'tone', title: 'Tone', recommendation: 'Choose the tone.' },
    { key: 'language', title: 'Language', recommendation: 'Confirm the language.' },
    { key: 'brand', title: 'Brand', recommendation: 'Specify brand constraints.' },
    { key: 'outline', title: 'Outline', recommendation: 'Lock the narrative arc.' },
    { key: 'visual_style', title: 'Visual Style', recommendation: 'Choose the visual style.' },
    { key: 'delivery', title: 'Delivery', recommendation: 'State the delivery mode.' },
  ];

  return {
    projects: {
      async getById(projectId: string): Promise<ProjectRecord | null> {
        return projectId === storedProject.projectId ? storedProject : null;
      },
      async update(nextProject: ProjectRecord): Promise<ProjectRecord> {
        storedProject = nextProject;
        return storedProject;
      },
    },
    artifacts: {
      async listByProjectId(projectId: string): Promise<ProductArtifactRef[]> {
        return storedArtifacts.filter((a) => a.projectId === projectId);
      },
      async createMany(nextArtifacts: ProductArtifactRef[]): Promise<ProductArtifactRef[]> {
        storedArtifacts = [...storedArtifacts, ...nextArtifacts];
        return nextArtifacts;
      },
    },
    checkpoints: {
      async getLatestByProjectId(projectId: string): Promise<WorkflowCheckpoint | null> {
        return storedCheckpoints.filter((checkpoint) => checkpoint.projectId === projectId).at(-1) ?? null;
      },
      async listByProjectId(projectId: string): Promise<WorkflowCheckpoint[]> {
        return storedCheckpoints.filter((checkpoint) => checkpoint.projectId === projectId);
      },
      async create(checkpoint: WorkflowCheckpoint): Promise<WorkflowCheckpoint> {
        storedCheckpoints.push(checkpoint);
        return checkpoint;
      },
    },
    loadRecommendations: async (_projectId: string) => recommendations,
  };
}

async function main() {
  // --- Setup: create a project and flow it to confirmation_pending ---
  const draftProject = makeProject('draft');
  const importAction: ImportSourcesAction = {
    type: 'import_sources',
    payload: {
      projectId: draftProject.projectId,
      sources: [{ kind: 'text', value: 'test content', label: 'Test memo' }],
    },
  };
  const imported = applyImportSources(draftProject, importAction, '2026-07-10T10:05:00.000Z');

  const prepareAction: PrepareConfirmationsAction = {
    type: 'prepare_confirmations',
    payload: { projectId: imported.project.projectId },
  };
  const prepared = applyPrepareConfirmations(imported.project, imported.artifacts, prepareAction, '2026-07-10T10:10:00.000Z');

  const confirmationPendingProject = prepared.project;
  const deps = makeDependencies(confirmationPendingProject, [...imported.artifacts, prepared.artifact]);

  // --- Test 1: valid eight-answer submit succeeds and re-renders the page ---
  const validSubmit = await handleProjectWorkbenchHttpRequest(deps, {
    method: 'POST',
    url: '/projects/confirm-submit-test-project',
    body: JSON.stringify({
      answers: {
        audience: 'Founders',
        goal: 'Raise seed round',
        tone: 'Confident',
        language: 'zh-CN',
        brand: 'PPTMASTER',
        outline: 'problem-solution-traction',
        visual_style: 'minimal dark',
        delivery: 'live pitch',
      },
    }),
  });

  assert.equal(validSubmit.status, 200, 'valid submit should return 200');
  assert.match(validSubmit.body, /<!doctype html>/i, 'response should render a full HTML document');
  assert.match(validSubmit.body, /Confirmation submission/i, 'response should show the confirmation submission panel');
  assert.match(validSubmit.body, /submitted/i, 'response should reflect submitted status after lock');
  assert.match(validSubmit.body, /locked and ready/i, 'response should show locked confirmation banner text');
  assert.match(validSubmit.body, /8\/8 answered/i, 'response should show all eight answers completed');

  // The same repositories must now return the locked state on a fresh GET, not only in the POST response.
  const freshGet = await handleProjectWorkbenchHttpRequest(deps, {
    method: 'GET',
    url: '/projects/confirm-submit-test-project',
  });
  assert.equal(freshGet.status, 200, 'fresh GET should succeed after confirmation persistence');
  assert.match(freshGet.body, /locked and ready/i, 'fresh GET should retain the persisted locked confirmation state');
  assert.match(freshGet.body, /8\/8 answered/i, 'fresh GET should retain all persisted answers');

  // --- Test 2: malformed JSON body returns 400 ---
  const malformedJson = await handleProjectWorkbenchHttpRequest(deps, {
    method: 'POST',
    url: '/projects/confirm-submit-test-project',
    body: 'not-json',
  });

  assert.equal(malformedJson.status, 400, 'malformed JSON should return 400');
  assert.match(malformedJson.body, /Malformed request body/i, 'malformed JSON should report body error');

  // --- Test 3: missing answers field returns 400 ---
  const missingAnswers = await handleProjectWorkbenchHttpRequest(deps, {
    method: 'POST',
    url: '/projects/confirm-submit-test-project',
    body: JSON.stringify({ foo: 'bar' }),
  });

  assert.equal(missingAnswers.status, 400, 'missing answers should return 400');
  assert.match(missingAnswers.body, /Missing answers/i, 'missing answers should report field error');

  // --- Test 4: empty answers returns 400 ---
  const emptyAnswers = await handleProjectWorkbenchHttpRequest(deps, {
    method: 'POST',
    url: '/projects/confirm-submit-test-project',
    body: JSON.stringify({ answers: {} }),
  });

  assert.equal(emptyAnswers.status, 400, 'empty answers should return 400');
  assert.match(emptyAnswers.body, /Invalid answers/i, 'empty answers should report validation error');

  // --- Test 5: missing one key returns 400 ---
  const partialAnswers = await handleProjectWorkbenchHttpRequest(deps, {
    method: 'POST',
    url: '/projects/confirm-submit-test-project',
    body: JSON.stringify({
      answers: {
        audience: 'Founders',
        goal: 'Raise seed round',
        // missing the other 6 keys
        tone: 'Confident',
        language: 'zh-CN',
        brand: 'PPTMASTER',
        outline: 'problem-solution-traction',
        visual_style: 'minimal dark',
        delivery: 'live pitch',
      },
    }),
  });

  // Actually that has all 8 — let me make it truly partial
  const trulyPartialAnswers = await handleProjectWorkbenchHttpRequest(deps, {
    method: 'POST',
    url: '/projects/confirm-submit-test-project',
    body: JSON.stringify({
      answers: {
        audience: 'Founders',
        goal: '', // empty string should fail
        tone: 'Confident',
        language: 'zh-CN',
        brand: 'PPTMASTER',
        outline: 'problem-solution-traction',
        visual_style: 'minimal dark',
        delivery: 'live pitch',
      },
    }),
  });

  assert.equal(trulyPartialAnswers.status, 400, 'empty answer value should return 400');
  assert.match(trulyPartialAnswers.body, /Invalid answers/i, 'empty answer should report validation error');

  // --- Test 6: unknown project returns 404 ---
  const unknownProject = await handleProjectWorkbenchHttpRequest(
    makeDependencies(makeProject('confirmation_pending')),
    {
      method: 'POST',
      url: '/projects/nonexistent-project',
      body: JSON.stringify({
        answers: {
          audience: 'Founders',
          goal: 'Raise seed round',
          tone: 'Confident',
          language: 'zh-CN',
          brand: 'PPTMASTER',
          outline: 'problem-solution-traction',
          visual_style: 'minimal dark',
          delivery: 'live pitch',
        },
      }),
    },
  );

  assert.equal(unknownProject.status, 404, 'unknown project should return 404');
  assert.match(unknownProject.body, /not found/i, 'unknown project should report not found');

  // --- Test 7: wrong project status (already locked) returns 400 ---
  const lockedProject = makeProject('confirmation_locked');
  const lockedDeps = makeDependencies(lockedProject);
  const alreadyLocked = await handleProjectWorkbenchHttpRequest(lockedDeps, {
    method: 'POST',
    url: '/projects/confirm-submit-test-project',
    body: JSON.stringify({
      answers: {
        audience: 'Founders',
        goal: 'Raise seed round',
        tone: 'Confident',
        language: 'zh-CN',
        brand: 'PPTMASTER',
        outline: 'problem-solution-traction',
        visual_style: 'minimal dark',
        delivery: 'live pitch',
      },
    }),
  });

  assert.equal(alreadyLocked.status, 400, 'already-locked project should return 400');
  assert.match(alreadyLocked.body, /Invalid transition/i, 'locked project should report transition error');

  // --- Test 8: no body at all returns 400 ---
  const noBody = await handleProjectWorkbenchHttpRequest(deps, {
    method: 'POST',
    url: '/projects/confirm-submit-test-project',
  });

  assert.equal(noBody.status, 400, 'missing body should return 400');
  assert.match(noBody.body, /Malformed request body/i, 'missing body should report body error');

  // --- Test 9: PUT/DELETE still returns 405 (not GET or POST) ---
  const putMethod = await handleProjectWorkbenchHttpRequest(deps, {
    method: 'PUT',
    url: '/projects/confirm-submit-test-project',
  });

  assert.equal(putMethod.status, 405, 'PUT should return 405');
  assert.match(putMethod.body, /Method not allowed/i, 'PUT should report method not allowed');
  assert.match(putMethod.headers.allow ?? '', /POST/i, '405 response should advertise POST as allowed');

  console.log('project workbench confirmation submission POST test: ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
