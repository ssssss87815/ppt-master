import type { ProjectViewModel } from './viewmodels/project-view-model.js';

type ConfirmationSubmissionQuestion = NonNullable<
  ProjectViewModel['workbench']['confirmationSubmission']
>['questions'][number];
type PreviewItem = NonNullable<NonNullable<ProjectViewModel['preview']>['items']>[number];

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;')
    .split("'").join('&#39;');
}

function renderBadge(tone: string, text: string): string {
  return `<span class="badge badge-${escapeHtml(tone)}">${escapeHtml(text)}</span>`;
}

function previewPageLabel(item: PreviewItem): string {
  return item.title ?? item.label ?? item.pageKey ?? item.filename ?? item.storageKey;
}

function renderPreviewPageFocus(previewUrl: string | undefined, pageItems: PreviewItem[]): string {
  if (!pageItems.length) {
    return '';
  }

  const initialItem = pageItems[0]!;
  const controls = pageItems
    .map((item, index) => {
      const isSelected = index === 0;
      return `<li>
        <button
          type="button"
          class="preview-page-button${isSelected ? ' is-selected' : ''}"
          data-preview-page-button="true"
          data-preview-page-title="${escapeHtml(previewPageLabel(item))}"
          data-preview-page-key="${escapeHtml(item.pageKey ?? '')}"
          data-preview-page-filename="${escapeHtml(item.filename ?? '')}"
          data-preview-page-storage-key="${escapeHtml(item.storageKey ?? '')}"
          aria-pressed="${isSelected ? 'true' : 'false'}"
          data-selected="${isSelected ? 'true' : 'false'}"
        >
          <span class="preview-page-button-title">${escapeHtml(previewPageLabel(item))}</span>
          ${item.pageKey ? `<span class="preview-page-button-key">${escapeHtml(item.pageKey)}</span>` : ''}
        </button>
      </li>`;
    })
    .join('');

  const helperCopy = previewUrl
    ? 'Selection identifies the projected page artifact. Use the live preview link to open the current rendered view.'
    : 'Selection identifies the projected page artifact. No per-page URL is projected in this workbench yet.';

  return `
    <section class="preview-page-focus" data-preview-page-focus="true" aria-labelledby="preview-page-focus-title">
      <div class="preview-page-focus-header">
        <h3 id="preview-page-focus-title">Focused preview page</h3>
        <p class="section-summary">Select a projected page artifact to inspect its current identifiers.</p>
      </div>
      <div class="preview-page-focus-grid">
        <ol class="preview-page-list">${controls}</ol>
        <div class="preview-page-summary" data-preview-page-summary="true" aria-live="polite">
          <p class="preview-page-summary-label">Focused artifact</p>
          <h4 data-preview-page-field="title">${escapeHtml(previewPageLabel(initialItem))}</h4>
          <dl class="artifact-metadata preview-page-summary-metadata">
            ${renderMetadataRow('Page key', initialItem.pageKey)}
            ${renderMetadataRow('Filename', initialItem.filename)}
            ${renderMetadataRow('Storage key', initialItem.storageKey)}
          </dl>
          <p class="preview-page-summary-note" data-preview-page-note="true">${escapeHtml(helperCopy)}</p>
        </div>
      </div>
    </section>`;
}

function panelHeadingId(panelKey: string): string {
  return `panel-${panelKey}-title`;
}

function formatActionLabel(action: string): string {
  if (action.indexOf('_') === -1) {
    return action;
  }

  const label = action
    .split('_')
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');

  return label || action;
}

function formatActionDetail(action: string): string {
  switch (action) {
    case 'run_quality_check':
      return 'Run the required Quality Check against the verified current preview before PPTX export can begin.';
    case 'submit_confirmations':
      return 'Capture and lock the eight confirmations so the strategist handoff can proceed.';
    case 'start_generation':
      return 'Start page generation from the locked strategist handoff and begin producing preview pages.';
    case 'resume_generation':
      return 'Resume the generation pass from the latest revision checkpoint after the blocking note is addressed.';
    case 'export_pptx':
      return 'Package the current preview output into the PPTX delivery bundle and companion artifacts.';
    default:
      return 'Advance the productized workflow using the projected runtime action.';
  }
}

function formatActionOwner(action: string): string {
  switch (action) {
    case 'run_quality_check':
      return 'Quality Check bridge';
    case 'submit_confirmations':
      return 'Operator input';
    case 'start_generation':
    case 'resume_generation':
      return 'Runtime bridge';
    case 'export_pptx':
      return 'Export bridge';
    default:
      return 'Product workflow';
  }
}

function isActionableAction(project: ProjectViewModel, action: string): boolean {
  return action === 'submit_confirmations'
    || action === 'start_generation'
    || (action === 'export_pptx' && project.workbench.exportAvailable === true);
}

function actionAvailabilityMessage(project: ProjectViewModel, action: string): string {
  if (action === 'export_pptx' || action === 'run_quality_check') {
    return 'Runtime action unavailable in this read-only workbench.';
  }

  if (action !== 'start_generation') {
    return 'This action runs through the verified server-side runtime bridge.';
  }

  const strategistHandoff = project.workbench.strategistHandoff;
  if (strategistHandoff?.gateStatus === 'verified') {
    return 'Generation handoff is runtime-verified, but this workbench does not execute generation directly.';
  }

  return strategistHandoff?.generationGateCopy
    ?? 'Generation handoff locked: wait for runtime bridge verification before starting page generation.';
}

function projectedNextActions(project: ProjectViewModel): string[] {
  if (project.nextActions.length) {
    return project.nextActions;
  }

  const submitAction = project.workbench.confirmationSubmission?.submitAction;
  if (submitAction?.type) {
    return [submitAction.type];
  }

  return [];
}

function actionStatusLabel(project: ProjectViewModel): string {
  if (project.status === 'revision_requested') {
    return 'resume required';
  }

  if (project.status === 'failed_recoverable' || project.status === 'failed_terminal') {
    return 'blocked';
  }

  return `${projectedNextActions(project).length} pending`;
}

function blockedActionRows(project: ProjectViewModel): string {
  const blockingDetail = project.status === 'revision_requested'
    ? project.latestRevisionRequest?.note ?? project.latestCheckpoint?.note ?? 'Awaiting revised generation pass.'
    : project.lastError ?? (project.status === 'failed_terminal'
        ? 'Terminal failure details unavailable.'
        : 'Recoverable failure details unavailable.');
  const primaryAction = project.status === 'revision_requested'
    ? 'resume_generation'
    : project.status === 'failed_terminal'
      ? 'manual_investigation'
      : 'recovery_bridge_required';
  const primaryLabel = project.status === 'revision_requested'
    ? 'Resume generation'
    : project.status === 'failed_terminal'
      ? 'Manual investigation'
      : 'Recovery bridge required';
  const primaryDetail = project.status === 'revision_requested'
    ? 'Apply the revision note, then resume the generation pass from the latest checkpoint.'
    : project.status === 'failed_terminal'
      ? 'The product shell cannot continue automatically after a terminal failure. An operator must inspect the failing runtime first.'
      : 'The product shell has no recovery bridge yet, so the workflow cannot continue until that bridge exists.';

  return `
    <article class="next-action-card blocked-card" data-primary-action="true" data-action-code="${escapeHtml(primaryAction)}">
      <header>
        <p class="action-kicker">Primary recovery path</p>
        <h3>${escapeHtml(primaryLabel)}</h3>
        <span class="action-owner">${escapeHtml(project.status === 'revision_requested' ? 'Runtime bridge' : 'Operator escalation')}</span>
      </header>
      <p class="action-detail">${escapeHtml(primaryDetail)}</p>
      <dl class="artifact-metadata">
        ${renderMetadataRow('Workflow state', project.status)}
        ${renderMetadataRow('Blocking detail', blockingDetail)}
        ${renderMetadataRow('Latest checkpoint', project.latestCheckpoint?.checkpointId ?? project.lastStartedCheckpoint?.checkpointId)}
      </dl>
    </article>`;
}

function actionableRows(project: ProjectViewModel): string {
  return projectedNextActions(project)
    .map((action, index) => {
      const isPrimary = index === 0;
      return `
        <article class="next-action-card${isPrimary ? ' is-primary' : ''}" data-action-index="${escapeHtml(index + 1)}" data-primary-action="${escapeHtml(isPrimary ? 'true' : 'false')}" data-action-code="${escapeHtml(action)}">
          <header>
            <p class="action-kicker">${escapeHtml(isPrimary ? 'Primary action' : `Action ${index + 1}`)}</p>
            <h3>${escapeHtml(formatActionLabel(action))}</h3>
            <span class="action-owner">${escapeHtml(formatActionOwner(action))}</span>
          </header>
          <p class="action-detail">${escapeHtml(formatActionDetail(action))}</p>
          <dl class="artifact-metadata">
            ${renderMetadataRow('Action code', action)}
            ${renderMetadataRow('Current phase', project.currentPhase.title)}
            ${renderMetadataRow('Primary', isPrimary ? 'yes' : 'no')}
          </dl>
          ${isActionableAction(project, action)
            ? `<button type="button" class="next-action-button" data-action-code="${escapeHtml(action)}" data-project-id="${escapeHtml(project.projectId)}">${escapeHtml(formatActionLabel(action))}</button>`
            : `<p class="action-availability">${escapeHtml(actionAvailabilityMessage(project, action))}</p>`}
        </article>`;
    })
    .join('');
}

function renderHeaderMetadata(project: ProjectViewModel): string {
  const rows = [
    ['Current phase status', project.currentPhase.status],
    ['Workspace', project.workspacePath],
    ['Last run ID', project.lastRunId],
    ['Last updated', project.lastUpdatedAt],
  ]
    .filter(([, value]) => value !== undefined && value !== '')
    .map(
      ([label, value]) => `
        <div class="meta-row">
          <dt>${escapeHtml(label)}</dt>
          <dd>${escapeHtml(value)}</dd>
        </div>`,
    )
    .join('');

  if (!rows) {
    return '';
  }

  return `<dl class="project-header-metadata">${rows}</dl>`;
}

function renderSummaryCards(project: ProjectViewModel): string {
  return project.workbench.summaryCards
    .map(
      (card) => `
        <article class="summary-card tone-${escapeHtml(card.tone)}" data-key="${escapeHtml(card.key)}">
          <h3>${escapeHtml(card.title)}</h3>
          <p class="summary-value">${escapeHtml(card.value)}</p>
        </article>`,
    )
    .join('');
}

function renderSections(project: ProjectViewModel): string {
  return project.workbench.sections
    .map((section) => {
      const badges = section.badges?.map((badge) => renderBadge(badge.tone, badge.text)).join('') ?? '';
      return `
        <section class="workbench-section status-${escapeHtml(section.status)}" data-key="${escapeHtml(section.key)}">
          <header>
            <h3>${escapeHtml(section.title)}</h3>
            <span class="section-status">${escapeHtml(section.status)}</span>
          </header>
          <p class="section-summary">${escapeHtml(section.summary)}</p>
          ${section.description ? `<p class="section-description">${escapeHtml(section.description)}</p>` : ''}
          ${badges ? `<div class="section-badges">${badges}</div>` : ''}
          ${section.action ? `<div class="section-action">Next action: <code>${escapeHtml(section.action)}</code></div>` : ''}
        </section>`;
    })
    .join('');
}

function renderWorkflowStatusPanel(project: ProjectViewModel): string {
  if (!project.workbench.sections.length) {
    return '';
  }

  const statusCounts = project.workbench.sections.reduce<Record<string, number>>((acc, section) => {
    acc[section.status] = (acc[section.status] ?? 0) + 1;
    return acc;
  }, {});
  const nextUpcomingCount = project.workbench.sections.some((section) => section.status === 'upcoming') ? 1 : 0;

  const statusSummary = [
    statusCounts.current ? `${statusCounts.current} current` : undefined,
    statusCounts.complete ? `${statusCounts.complete} complete` : undefined,
    statusCounts.warning ? `${statusCounts.warning} warning` : undefined,
    statusCounts.ready ? `${statusCounts.ready} ready` : undefined,
    nextUpcomingCount ? `${nextUpcomingCount} upcoming` : undefined,
  ]
    .filter((status): status is string => Boolean(status))
    .join(' · ');

  return `
    <section id="panel-workbench-sections" class="workbench-sections-panel" data-panel="workbench-sections" tabindex="-1" aria-labelledby="${panelHeadingId('workbench-sections')}">
      <header>
        <h2 id="${panelHeadingId('workbench-sections')}">Workflow status</h2>
        <span class="panel-status">${escapeHtml(statusSummary || `${project.workbench.sections.length} section(s)`)}</span>
      </header>
      ${project.workbench.currentTimelineItem?.description
        ? `<p class="section-summary">${escapeHtml(project.workbench.currentTimelineItem.description)}</p>`
        : ''}
      <div class="workbench-sections">${renderSections(project)}</div>
    </section>`;
}

function renderTimeline(project: ProjectViewModel): string {
  const items = project.workbench.timeline ?? project.timeline;
  if (!items?.length) {
    return '';
  }

  const rows = items
    .map((item) => {
      const phaseState = item.isCurrent ? 'current' : item.isNext ? 'upcoming' : item.reached ? 'complete' : 'upcoming';
      const markers = [
        item.isCurrent ? renderBadge('active', 'Current') : '',
        item.isNext ? renderBadge('warning', 'Next') : '',
        item.reached && !item.isCurrent ? renderBadge('success', 'Reached') : '',
      ]
        .filter(Boolean)
        .join('');

      return `
        <li class="timeline-item status-${escapeHtml(phaseState)}" data-status="${escapeHtml(item.status)}">
          <header>
            <h3>${escapeHtml(item.title)}</h3>
            <span class="timeline-status">${escapeHtml(phaseState)}</span>
          </header>
          ${item.description ? `<p class="timeline-description">${escapeHtml(item.description)}</p>` : ''}
          ${markers ? `<div class="timeline-badges">${markers}</div>` : ''}
        </li>`;
    })
    .join('');

  return `
    <section id="panel-timeline" class="timeline-panel" data-panel="timeline" tabindex="-1" aria-labelledby="${panelHeadingId('timeline')}">
      <header>
        <h2 id="${panelHeadingId('timeline')}">Project timeline</h2>
        <span class="panel-status">${escapeHtml(project.currentPhase.title)}</span>
      </header>
      <ol class="timeline-list">${rows}</ol>
    </section>`;
}

function renderSourcesPanel(project: ProjectViewModel): string {
  if (!project.sources.length) {
    return '';
  }

  const normalizedCount = project.sources.filter((source) => source.status === 'normalized').length;
  const uploadedCount = project.sources.filter((source) => source.status === 'uploaded').length;
  const failedCount = project.sources.filter((source) => source.status === 'failed').length;
  const summaryParts = [
    normalizedCount ? `${normalizedCount} normalized` : '',
    uploadedCount ? `${uploadedCount} uploaded` : '',
    failedCount ? `${failedCount} failed` : '',
  ].filter(Boolean);

  const rows = project.sources
    .map(
      (source) => `
        <li class="source-item status-${escapeHtml(source.status)}" data-source-id="${escapeHtml(source.sourceId)}">
          <strong>${escapeHtml(source.label)}</strong>
          <span class="source-kind">${escapeHtml(source.kind)}</span>
          <span class="source-status">${escapeHtml(source.status)}</span>
        </li>`,
    )
    .join('');

  return `
    <section id="panel-sources" class="sources-panel" data-panel="sources" tabindex="-1" aria-labelledby="${panelHeadingId('sources')}">
      <header>
        <h2 id="${panelHeadingId('sources')}">Source intake</h2>
        <span class="panel-status">${escapeHtml(`${project.sources.length} source(s)`)}</span>
      </header>
      ${summaryParts.length ? `<p class="section-summary">${escapeHtml(summaryParts.join(' · '))}</p>` : ''}
      <ul class="source-list">${rows}</ul>
    </section>`;
}

function renderActionList(project: ProjectViewModel): string {
  const nextActions = projectedNextActions(project);

  if (!nextActions.length) {
    const blockedSummary = project.status === 'revision_requested'
      ? 'Resume remains blocked until the pending revision note is addressed and generation can continue.'
      : project.status === 'failed_recoverable'
        ? 'No automatic next action is available in the product shell yet; recovery stays blocked until the recovery bridge exists.'
        : project.status === 'failed_terminal'
          ? 'No automatic next action is available after a terminal failure; manual investigation is required before the workflow can continue.'
        : '';

    if (!blockedSummary) {
      return '';
    }

    const blockedLabel = project.status === 'revision_requested' ? 'resume required' : 'blocked';
    const blockedReason = project.status === 'revision_requested'
      ? project.latestRevisionRequest?.note ?? project.latestCheckpoint?.note ?? 'Awaiting revised generation pass.'
      : project.lastError ?? (project.status === 'failed_terminal'
          ? 'Terminal failure details unavailable.'
          : 'Recoverable failure details unavailable.');

    return `
      <section id="panel-next-actions" class="next-actions-panel is-blocked" data-panel="next-actions" data-status="${escapeHtml(project.status)}" tabindex="-1" aria-labelledby="${panelHeadingId('next-actions')}">
        <header>
          <h2 id="${panelHeadingId('next-actions')}">Next actions</h2>
          <span class="panel-status">${escapeHtml(blockedLabel)}</span>
        </header>
        <p class="section-summary">${escapeHtml(blockedSummary)}</p>
        <div class="section-badges">
          ${renderBadge(project.status === 'revision_requested' ? 'warning' : 'neutral', project.status === 'revision_requested' ? 'Resume blocked' : 'No auto-recovery')}
          ${renderBadge(project.status === 'failed_terminal' ? 'warning' : 'neutral', project.status === 'failed_terminal' ? 'Manual investigation' : 'Bridge gap')}
        </div>
        <div class="next-action-grid">${blockedActionRows(project)}</div>
        <dl class="artifact-metadata">
          ${renderMetadataRow('Workflow state', project.status)}
          ${renderMetadataRow('Blocking detail', blockedReason)}
        </dl>
      </section>`;
  }

  return `
    <section id="panel-next-actions" class="next-actions-panel" data-panel="next-actions" tabindex="-1" aria-labelledby="${panelHeadingId('next-actions')}">
      <header>
        <h2 id="${panelHeadingId('next-actions')}">Next actions</h2>
        <span class="panel-status">${escapeHtml(actionStatusLabel(project))}</span>
      </header>
      <p class="section-summary">${escapeHtml(`Continue from ${project.currentPhase.title} with the next productized workflow action(s).`)}</p>
      <div class="section-badges">
        ${renderBadge('active', `${nextActions.length} workflow action${nextActions.length === 1 ? '' : 's'}`)}
        ${renderBadge('neutral', `Primary: ${formatActionLabel(nextActions[0])}`)}
      </div>
      <div class="next-action-grid">${actionableRows(project)}</div>
    </section>`;
}

function primaryPanelKey(project: ProjectViewModel): string | undefined {
  const status = String(project.status ?? '');
  if (status === 'revision_requested' || status === 'failed_recoverable' || status === 'failed_terminal') {
    return 'recovery';
  }

  let currentSectionKey: string | undefined;
  for (const section of project.workbench.sections) {
    if (section.status === 'current') {
      currentSectionKey = section.key;
      break;
    }
  }

  if (currentSectionKey === 'confirmations' && project.workbench.confirmationSubmission) {
    return 'confirmations';
  }

  if (currentSectionKey === 'strategist') {
    let hasStrategistPanel = false;
    for (const section of project.workbench.sections) {
      if (section.key === 'strategist') {
        hasStrategistPanel = true;
        break;
      }
    }

    if (!hasStrategistPanel) {
      for (const artifact of project.artifacts) {
        if (artifact.kind === 'design_spec' || artifact.kind === 'spec_lock') {
          hasStrategistPanel = true;
          break;
        }
      }
    }

    if (hasStrategistPanel) {
      return 'strategist';
    }
  }

  if (currentSectionKey === 'preview' && project.preview) {
    return 'preview';
  }

  if (currentSectionKey === 'export' && project.export) {
    return 'export';
  }

  if (currentSectionKey === 'sources' && project.sources.length) {
    return 'sources';
  }

  // Some projections only mark the current timeline item; honor it before
  // falling back to the available panels so directory focus tracks workflow
  // progress even when sections are summary-only.
  const currentTimelineItem = project.workbench.currentTimelineItem;
  if (
    currentTimelineItem?.key === 'strategist'
    && (project.workbench.sections.some((section) => section.key === 'strategist')
      || project.artifacts.some((artifact) => artifact.kind === 'design_spec' || artifact.kind === 'spec_lock'))
  ) {
    return 'strategist';
  }

  if (currentTimelineItem?.key === 'preview' && project.preview) {
    return 'preview';
  }

  if (currentTimelineItem?.key === 'export' && project.export) {
    return 'export';
  }

  if (currentTimelineItem?.key === 'sources' && project.sources.length) {
    return 'sources';
  }

  if (project.export) {
    return 'export';
  }

  if (project.preview) {
    return 'preview';
  }

  if (project.workbench.confirmationSubmission) {
    return 'confirmations';
  }

  if (project.sources.length) {
    return 'sources';
  }

  if (project.workbench.timeline?.length || project.timeline.length) {
    return 'timeline';
  }

  return undefined;
}

function latestVisibleCheckpoint(project: ProjectViewModel): ProjectViewModel['latestCheckpoint'] | ProjectViewModel['lastStartedCheckpoint'] {
  return project.latestCheckpoint ?? project.lastStartedCheckpoint;
}

function renderPanelDirectory(project: ProjectViewModel): string {
  const checkpoint = latestVisibleCheckpoint(project);
  const strategistSection = project.workbench.sections.find((section) => section.key === 'strategist');
  const strategistArtifacts = project.artifacts.filter(
    (artifact) => artifact.kind === 'design_spec' || artifact.kind === 'spec_lock',
  );
  const artifactSummary = project.artifactSummary;
  const totalArtifacts = artifactSummary?.planned ?? project.artifacts.length;
  const readyArtifacts = artifactSummary?.ready ?? project.artifacts.filter((artifact) => artifact.status === 'ready').length;
  const previewPageItems = project.preview?.items?.filter((item: PreviewItem) => item.role === 'page') ?? [];
  const confirmationSubmission = project.workbench.confirmationSubmission;
  const nextActions = projectedNextActions(project);
  const nextActionDirectoryStatus = nextActions.length
    ? `${nextActions.length} pending`
    : project.status === 'revision_requested'
      ? 'resume required'
      : project.status === 'failed_recoverable' || project.status === 'failed_terminal'
        ? 'blocked'
        : undefined;

  const visiblePanels = [
    project.workbench.timeline?.length || project.timeline.length
      ? { key: 'timeline', title: 'Project timeline', status: project.currentPhase.title }
      : undefined,
    project.sources.length ? { key: 'sources', title: 'Source intake', status: `${project.sources.length} source(s)` } : undefined,
    nextActionDirectoryStatus
      ? { key: 'next-actions', title: 'Next actions', status: nextActionDirectoryStatus }
      : undefined,
    strategistSection || strategistArtifacts.length
      ? {
          key: 'strategist',
          title: strategistSection?.title ?? 'Strategist handoff',
          status: project.workbench.strategistHandoff?.gateLabel ?? strategistSection?.summary ?? 'Awaiting strategist artifacts',
        }
      : undefined,
    checkpoint
      ? {
          key: 'checkpoint',
          title: 'Workflow checkpoint',
          status: checkpoint.statusTitle ?? checkpoint.status ?? 'unknown',
        }
      : undefined,
    project.status === 'revision_requested' || project.status === 'failed_recoverable' || project.status === 'failed_terminal'
      ? {
          key: 'recovery',
          title: project.status === 'revision_requested'
            ? 'Revision requested'
            : project.status === 'failed_terminal'
              ? 'Terminal failure'
              : 'Recoverable failure',
          status: project.status === 'revision_requested'
            ? 'Resume required'
            : project.status === 'failed_terminal'
              ? 'Manual intervention required'
              : 'Recovery bridge required',
        }
      : undefined,
    totalArtifacts ? { key: 'artifact-summary', title: 'Artifact inventory', status: `${readyArtifacts}/${totalArtifacts} ready` } : undefined,
    project.workbench.sections.length
      ? { key: 'workbench-sections', title: 'Workflow status', status: `${project.workbench.sections.length} section(s)` }
      : undefined,
    confirmationSubmission
      ? {
          key: 'confirmations', title: 'Confirmation submission', status: `${confirmationSubmission.completion.completedCount}/${confirmationSubmission.completion.totalCount} answered`,
        }
      : undefined,
    project.artifacts.length ? { key: 'artifacts', title: 'Artifacts', status: `${project.artifacts.length} tracked` } : undefined,
    project.preview ? { key: 'preview', title: 'Preview assets', status: `${previewPageItems.length} page asset(s)` } : undefined,
    project.export
      ? { key: 'export', title: 'Export assets', status: project.export.latestExportUrl ? 'ready' : 'pending' }
      : undefined,
    project.delivery
      ? { key: 'delivery', title: 'Delivery package', status: `${project.delivery.items?.length ?? 0} artifact(s)` }
      : undefined,
  ].filter((panel): panel is { key: string; title: string; status: string } => Boolean(panel));

  if (!visiblePanels.length) {
    return '';
  }

  const primaryPanel = primaryPanelKey(project);

  return `
    <section id="panel-directory" class="panel-directory" data-panel="directory" aria-labelledby="${panelHeadingId('directory')}">
      <header>
        <h2 id="${panelHeadingId('directory')}">Workbench directory</h2>
        <span class="panel-status">${escapeHtml(`${visiblePanels.length} visible`)}</span>
      </header>
      <nav aria-label="Workbench panels">
        <ol class="panel-directory-list">${visiblePanels
          .map(
            (panel) => `
              <li data-target="${escapeHtml(panel.key)}" data-primary-panel="${escapeHtml(primaryPanel === panel.key ? 'true' : 'false')}">
                <a href="#panel-${escapeHtml(panel.key)}"${primaryPanel === panel.key ? ' aria-current="page"' : ''}>${escapeHtml(panel.title)}</a>
                <span class="directory-status">${escapeHtml(panel.status)}</span>
              </li>`,
          )
          .join('')}</ol>
      </nav>
    </section>`;
}

function renderStrategistPanel(project: ProjectViewModel): string {
  const strategistSection = project.workbench.sections.find((section) => section.key === 'strategist');
  const strategistHandoff = project.workbench.strategistHandoff;
  const strategistArtifacts = strategistHandoff?.artifacts ?? project.artifacts.filter(
    (artifact) => artifact.kind === 'design_spec' || artifact.kind === 'spec_lock',
  );

  if (!strategistSection && !strategistArtifacts.length) {
    return '';
  }

  const badges = strategistSection?.badges?.map((badge) => renderBadge(badge.tone, badge.text)).join('') ?? '';
  const rows = [
    renderMetadataRow('Section status', strategistSection?.status),
    renderMetadataRow('Gate label', strategistHandoff?.gateLabel),
    renderMetadataRow('Summary', strategistSection?.summary),
    renderMetadataRow('Next action', strategistSection?.action),
    renderMetadataRow('Projected artifacts', strategistArtifacts.length),
    renderMetadataRow('Verified artifacts', strategistHandoff?.verifiedArtifactCount),
    renderMetadataRow('Pending verification', strategistHandoff?.pendingArtifactCount),
  ].join('');
  const gateSummary = strategistHandoff
    ? `
      <section class="strategist-gate" data-gate-status="${escapeHtml(strategistHandoff.gateStatus)}">
        <p class="section-summary">${escapeHtml(strategistHandoff.summary)}</p>
        <p class="section-description">${escapeHtml(strategistHandoff.detail)}</p>
        <div class="section-badges">
          ${renderBadge(strategistHandoff.verificationBadgeTone, strategistHandoff.verificationBadgeText)}
          ${renderBadge(strategistHandoff.gateStatus === 'verified' ? 'success' : 'warning', strategistHandoff.generationGateCopy)}
        </div>
      </section>`
    : '';
  const artifactList = strategistArtifacts.length
    ? `<ul class="artifact-list strategist-artifact-list">${strategistArtifacts
        .map(
          (artifact) => `
            <li data-artifact-id="${escapeHtml(artifact.artifactId)}" data-kind="${escapeHtml(artifact.kind)}" data-status="${escapeHtml(artifact.status)}"${'verificationState' in artifact ? ` data-verification-state="${escapeHtml(artifact.verificationState)}"` : ''}>
              <strong>${escapeHtml(artifact.label ?? artifact.artifactId)}</strong>
              <span class="artifact-kind">${escapeHtml(artifact.kind)}</span>
              <span class="artifact-status">${escapeHtml(artifact.status)}</span>
              ${'verificationState' in artifact ? `<span class="artifact-status">${escapeHtml(artifact.verificationState === 'verified' ? 'verified' : 'pending runtime verification')}</span>` : ''}
            </li>`,
        )
        .join('')}</ul>`
    : '<p class="section-summary">Strategist artifacts have not been projected into the workbench yet.</p>';

  return `
    <section id="panel-strategist" class="strategist-panel" data-panel="strategist" data-status="${escapeHtml(strategistHandoff?.panelStatus ?? strategistSection?.status ?? 'upcoming')}" tabindex="-1" aria-labelledby="${panelHeadingId('strategist')}">
      <header>
        <h2 id="${panelHeadingId('strategist')}">${escapeHtml(strategistSection?.title ?? 'Strategist handoff')}</h2>
        <span class="panel-status">${escapeHtml(strategistHandoff?.gateLabel ?? strategistSection?.summary ?? 'Awaiting strategist artifacts')}</span>
      </header>
      ${strategistSection?.description ? `<p class="section-description">${escapeHtml(strategistSection.description)}</p>` : ''}
      ${gateSummary}
      ${badges ? `<div class="section-badges">${badges}</div>` : ''}
      <dl class="artifact-metadata">${rows}</dl>
      ${artifactList}
    </section>`;
}

function renderCheckpointPanel(project: ProjectViewModel): string {
  const checkpoint = latestVisibleCheckpoint(project);
  if (!checkpoint) {
    return '';
  }

  const rows = [
    renderMetadataRow('Checkpoint ID', checkpoint.checkpointId),
    renderMetadataRow('Storage key', checkpoint.storageKey),
    renderMetadataRow('Stage', checkpoint.stageTitle ?? checkpoint.stage),
    renderMetadataRow('Status', checkpoint.statusTitle ?? checkpoint.status),
    renderMetadataRow('Created at', checkpoint.createdAt),
    renderMetadataRow('Note', checkpoint.note),
  ].join('');

  const artifacts = checkpoint.artifactIds?.length
    ? `<ul class="checkpoint-artifacts">${checkpoint.artifactIds
        .map((artifactId) => `<li>${escapeHtml(artifactId)}</li>`)
        .join('')}</ul>`
    : '';

  return `
    <section id="panel-checkpoint" class="checkpoint-panel" data-panel="checkpoint" tabindex="-1" aria-labelledby="${panelHeadingId('checkpoint')}">
      <header>
        <h2 id="${panelHeadingId('checkpoint')}">Workflow checkpoint</h2>
        <span class="panel-status">${escapeHtml(checkpoint.statusTitle ?? checkpoint.status ?? 'unknown')}</span>
      </header>
      <dl class="artifact-metadata">${rows}</dl>
      ${artifacts}
    </section>`;
}

function renderRecoveryPanel(project: ProjectViewModel): string {
  if (project.status !== 'revision_requested' && project.status !== 'failed_recoverable' && project.status !== 'failed_terminal') {
    return '';
  }

  const statusLabel = project.status === 'revision_requested'
    ? 'Revision requested'
    : project.status === 'failed_terminal'
      ? 'Terminal failure'
      : 'Recoverable failure';
  const recoveryNote = project.status === 'revision_requested'
    ? project.latestRevisionRequest?.note ?? project.latestCheckpoint?.note ?? 'Awaiting revised generation pass.'
    : project.lastError ?? (project.status === 'failed_terminal'
        ? 'Terminal failure details unavailable.'
        : 'Recoverable failure details unavailable.');
  const rows = [
    renderMetadataRow('Status', statusLabel),
    renderMetadataRow('Latest checkpoint', project.latestCheckpoint?.checkpointId ?? project.lastStartedCheckpoint?.checkpointId),
    renderMetadataRow(project.status === 'revision_requested' ? 'Revision note' : 'Last error', recoveryNote),
    renderMetadataRow(
      'Next action',
      project.status === 'revision_requested'
        ? 'resume_generation'
        : project.status === 'failed_terminal'
          ? 'manual investigation required'
          : 'recovery bridge required',
    ),
  ].join('');

  return `
    <section id="panel-recovery" class="recovery-panel" data-panel="recovery" data-status="${escapeHtml(project.status)}" tabindex="-1" aria-labelledby="${panelHeadingId('recovery')}">
      <header>
        <h2 id="${panelHeadingId('recovery')}">${escapeHtml(statusLabel)}</h2>
        <span class="panel-status">${escapeHtml(statusLabel)}</span>
      </header>
      <p class="section-summary">${escapeHtml(recoveryNote)}</p>
      <dl class="artifact-metadata">${rows}</dl>
    </section>`;
}

function renderConfirmationSubmission(project: ProjectViewModel): string {
  const submission = project.workbench.confirmationSubmission;
  if (!submission) {
    return '';
  }

  const submitAction = submission.submitAction;

  const normalizedQuestionStates = submission.questions.map((question: ConfirmationSubmissionQuestion) => {
    const normalizedAnswer = typeof question.answer === 'string' ? question.answer.trim() : '';
    return {
      ...question,
      answer: normalizedAnswer,
      isAnswered: normalizedAnswer.length > 0,
    };
  });
  const answeredQuestions = normalizedQuestionStates.filter((question: ConfirmationSubmissionQuestion & { isAnswered: boolean }) => question.isAnswered).length;
  const pendingQuestions = Math.max(normalizedQuestionStates.length - answeredQuestions, 0);
  const isComplete = pendingQuestions === 0 && normalizedQuestionStates.length > 0;
  const completionLabel = `${answeredQuestions}/${normalizedQuestionStates.length} answered`;
  const readinessMessage = isComplete
    ? 'All confirmation answers are complete. Submission is ready.'
    : pendingQuestions === 1
      ? '1 confirmation answer is still required before submission.'
      : `${pendingQuestions} confirmation answers are still required before submission.`;
  const answeredList = submission.questions
    .filter((question: ConfirmationSubmissionQuestion) => question.answer)
    .map(
      (question: ConfirmationSubmissionQuestion) => `
        <li data-key="${escapeHtml(question.key)}">
          <strong>${escapeHtml(question.title)}</strong>
          <span class="question-state">answered</span>
          <p class="answer">${escapeHtml(question.answer)}</p>
        </li>`,
    )
    .join('');

  const rows = normalizedQuestionStates
    .map(
      (question: ConfirmationSubmissionQuestion & { isAnswered: boolean }, index: number) => `
        <li data-key="${escapeHtml(question.key)}" data-state="${escapeHtml(question.isAnswered ? 'answered' : 'pending')}">
          <label for="confirmation-input-${escapeHtml(question.key)}"><strong>${escapeHtml(question.title)}</strong></label>
          <span class="question-state" data-question-state>${question.isAnswered ? 'answered' : 'pending'}</span>
          ${question.recommendation ? `<p class="recommendation">${escapeHtml(question.recommendation)}</p>` : ''}
          ${question.answer ? `<p class="answer">Answer: ${escapeHtml(question.answer)}</p>` : ''}
          ${question.input?.placeholder
            ? `<div class="question-input-shell" data-input-kind="${escapeHtml(question.input.kind)}"><textarea id="confirmation-input-${escapeHtml(question.key)}" name="answers.${escapeHtml(question.key)}" rows="3" placeholder="${escapeHtml(question.input.placeholder)}" data-confirmation-key="${escapeHtml(question.key)}" data-question-index="${escapeHtml(index + 1)}" aria-label="${escapeHtml(question.title)}">${escapeHtml(question.answer)}</textarea><p class="question-placeholder">Placeholder: ${escapeHtml(question.input.placeholder)}</p></div>`
            : ''}
        </li>`,
    )
    .join('');

  return `
    <section id="panel-confirmations" class="confirmation-submission tone-${escapeHtml(submission.bannerTone)}" data-panel="confirmations" data-status="${escapeHtml(submission.status)}" tabindex="-1" aria-labelledby="${panelHeadingId('confirmations')}">
      <header>
        <h2 id="${panelHeadingId('confirmations')}">Confirmation submission</h2>
        <span class="panel-status completion-label" data-completion-label>${escapeHtml(completionLabel)}</span>
      </header>
      <p class="banner-text">${escapeHtml(submission.bannerText)}</p>
      <div class="confirmation-progress" data-answered-count="${escapeHtml(answeredQuestions)}" data-pending-count="${escapeHtml(pendingQuestions)}">
        <p class="section-summary" data-confirmation-summary>${escapeHtml(answeredQuestions ? `${answeredQuestions} answers captured; ${pendingQuestions} still need review.` : 'No answers captured yet. Fill the confirmation prompts below to lock the deck brief.')}</p>
        <div class="section-badges">
          <span class="badge ${answeredQuestions ? 'badge-success' : 'badge-neutral'}" data-answered-badge>${escapeHtml(`${answeredQuestions} answered`)}</span>
          <span class="badge ${pendingQuestions ? 'badge-warning' : 'badge-success'}" data-pending-badge>${escapeHtml(`${pendingQuestions} pending`)}</span>
        </div>
        <p class="confirmation-readiness" data-readiness-state="${escapeHtml(isComplete ? 'ready' : 'pending')}" aria-live="polite">${escapeHtml(readinessMessage)}</p>
      </div>
      <dl class="artifact-metadata">
        ${renderMetadataRow('Completion status', isComplete ? 'complete' : 'pending')}
        ${renderMetadataRow('Question count', submission.questions.length)}
      </dl>
      ${submitAction
        ? `<p class="submit-action">Submit action: <code>${escapeHtml(submitAction.type)}</code> for <code>${escapeHtml(submitAction.projectId)}</code></p>`
        : ''}
      ${answeredList
        ? `<section class="confirmation-answers" aria-label="Captured answers">
            <h3>Captured answers</h3>
            <ul class="confirmation-answer-list">${answeredList}</ul>
          </section>`
        : ''}
      <form class="confirmation-form" method="post" action="/projects/${encodeURIComponent(submitAction?.projectId ?? submission.projectId)}" data-submit-action="${escapeHtml(submitAction?.type ?? '')}" data-project-id="${escapeHtml(submitAction?.projectId ?? submission.projectId)}">
        <input type="hidden" name="payload-format" value="confirmation-answers-json">
        <ol class="confirmation-questions">${rows}</ol>
        <div class="confirmation-form-footer">
          <button type="submit" class="confirmation-submit-button" data-submit-action="${escapeHtml(submitAction?.type ?? '')}" data-project-id="${escapeHtml(submitAction?.projectId ?? submission.projectId)}"${submitAction && isComplete ? '' : ' disabled'}>${escapeHtml(isComplete ? 'Update locked confirmations' : 'Submit confirmation answers')}</button>
        </div>
        <p class="confirmation-submit-error" role="alert" hidden></p>
      </form>
      <script>(function(){const form=document.querySelector('#panel-confirmations .confirmation-form');if(!form)return;const button=form.querySelector('.confirmation-submit-button');const error=form.querySelector('.confirmation-submit-error');const completionLabel=form.closest('#panel-confirmations')?.querySelector('[data-completion-label]');const progress=form.closest('#panel-confirmations')?.querySelector('.confirmation-progress');const summary=form.closest('#panel-confirmations')?.querySelector('[data-confirmation-summary]');const answeredBadge=form.closest('#panel-confirmations')?.querySelector('[data-answered-badge]');const pendingBadge=form.closest('#panel-confirmations')?.querySelector('[data-pending-badge]');const readiness=form.closest('#panel-confirmations')?.querySelector('.confirmation-readiness');const inputs=Array.from(form.querySelectorAll('textarea[data-confirmation-key]'));function updateQuestionState(input){const item=input.closest('li[data-key]');if(!item)return;const stateLabel=item.querySelector('[data-question-state]');const value=input.value.trim();const answered=value.length>0;item.dataset.state=answered?'answered':'pending';if(stateLabel){stateLabel.textContent=answered?'answered':'pending';}}function syncCompletion(){let answeredCount=0;inputs.forEach(function(input){updateQuestionState(input);if(input.value.trim().length>0){answeredCount+=1;}});const totalCount=inputs.length;const pendingCount=Math.max(totalCount-answeredCount,0);const isComplete=totalCount>0&&pendingCount===0;if(progress){progress.dataset.answeredCount=String(answeredCount);progress.dataset.pendingCount=String(pendingCount);}if(completionLabel){completionLabel.textContent=answeredCount+'/'+totalCount+' answered';}if(summary){summary.textContent=answeredCount?answeredCount+' answers captured; '+pendingCount+' still need review.':'No answers captured yet. Fill the confirmation prompts below to lock the deck brief.';}if(answeredBadge){answeredBadge.textContent=answeredCount+' answered';answeredBadge.className='badge '+(answeredCount?'badge-success':'badge-neutral');}if(pendingBadge){pendingBadge.textContent=pendingCount+' pending';pendingBadge.className='badge '+(pendingCount?'badge-warning':'badge-success');}if(readiness){readiness.dataset.readinessState=isComplete?'ready':'pending';readiness.textContent=isComplete?'All confirmation answers are complete. Submission is ready.':pendingCount===1?'1 confirmation answer is still required before submission.':pendingCount+' confirmation answers are still required before submission.';}if(button){button.disabled=!isComplete;}}inputs.forEach(function(input){input.value=input.value.trim();input.addEventListener('input',syncCompletion);});syncCompletion();form.addEventListener('submit',async function(event){event.preventDefault();if(!button||button.disabled)return;const answers={};form.querySelectorAll('textarea[data-confirmation-key]').forEach(function(input){answers[input.dataset.confirmationKey]=input.value.trim();});button.disabled=true;if(error){error.hidden=true;error.textContent='';}try{const response=await fetch(form.action,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({answers:answers})});const body=await response.text();if(!response.ok){throw new Error(body||response.statusText||'The confirmation submission was not accepted.');}document.open();document.write(body);document.close();}catch(submitError){if(error){error.textContent='Could not submit confirmation answers: '+(submitError instanceof Error?submitError.message:String(submitError));error.hidden=false;}syncCompletion();}});})();</script>
    </section>`;
}

function renderMetadataRow(label: string, value: string | number | undefined): string {
  if (value === undefined || value === '') {
    return '';
  }

  return `<div class="meta-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function renderArtifactSummaryPanel(project: ProjectViewModel): string {
  const artifactSummary = project.artifactSummary;
  const totalArtifacts = artifactSummary?.planned ?? project.artifacts.length;
  const readyArtifacts = artifactSummary?.ready ?? project.artifacts.filter((artifact) => artifact.status === 'ready').length;
  const failedArtifacts = artifactSummary?.failed ?? project.artifacts.filter((artifact) => artifact.status === 'failed').length;
  if (!totalArtifacts) {
    return '';
  }

  const byKind: Record<string, number> = artifactSummary?.byKind ?? project.artifacts.reduce<Record<string, number>>((acc, artifact) => {
    acc[artifact.kind] = (acc[artifact.kind] ?? 0) + 1;
    return acc;
  }, {});

  const kindRows = Object.keys(byKind)
    .map((kind) => [kind, byKind[kind]] as const)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([kind, count]) =>
        `<li data-kind="${escapeHtml(kind)}"><code>${escapeHtml(kind)}</code><span class="artifact-kind-count">${escapeHtml(count)}</span></li>`,
    )
    .join('');

  return `
    <section id="panel-artifact-summary" class="artifact-summary-panel" data-panel="artifact-summary" tabindex="-1" aria-labelledby="${panelHeadingId('artifact-summary')}">
      <header>
        <h2 id="${panelHeadingId('artifact-summary')}">Artifact inventory</h2>
        <span class="panel-status">${escapeHtml(`${readyArtifacts}/${totalArtifacts} ready`)}</span>
      </header>
      <dl class="artifact-metadata">
        ${renderMetadataRow('Total artifacts', totalArtifacts)}
        ${renderMetadataRow('Ready artifacts', readyArtifacts)}
        ${renderMetadataRow('Failed artifacts', failedArtifacts)}
      </dl>
      ${kindRows ? `<ul class="artifact-kind-list">${kindRows}</ul>` : ''}
    </section>`;
}

function renderArtifactList(project: ProjectViewModel): string {
  if (!project.artifacts.length) {
    return '';
  }

  const rows = project.artifacts
    .map(
      (artifact) => `
        <li data-artifact-id="${escapeHtml(artifact.artifactId)}" data-kind="${escapeHtml(artifact.kind)}" data-status="${escapeHtml(artifact.status)}">
          <strong>${escapeHtml(artifact.label ?? artifact.artifactId)}</strong>
          <span class="artifact-kind">${escapeHtml(artifact.kind)}</span>
          <span class="artifact-status">${escapeHtml(artifact.status)}</span>
        </li>`,
    )
    .join('');

  return `
    <section id="panel-artifacts" class="artifact-list-panel" data-panel="artifacts" tabindex="-1" aria-labelledby="${panelHeadingId('artifacts')}">
      <header>
        <h2 id="${panelHeadingId('artifacts')}">Artifacts</h2>
        <span class="panel-status">${escapeHtml(`${project.artifacts.length} tracked`)}</span>
      </header>
      <ul class="artifact-list">${rows}</ul>
    </section>`;
}

function renderPreviewPanel(project: ProjectViewModel): string {
  const preview = project.preview;
  const previewItems = preview?.items ?? [];
  const hasPreviewProjection = Boolean(
    preview
    || project.latestPreviewUrl
    || project.status === 'export_ready'
    || project.artifacts.some((artifact) => artifact.kind === 'preview_bundle' || artifact.kind === 'preview_page_svg'),
  );
  if (!hasPreviewProjection) {
    return '';
  }

  const pageItems = previewItems.filter((item: PreviewItem) => item.role === 'page');
  const rows = [
    renderMetadataRow('Manifest', preview?.manifestStorageKey),
    renderMetadataRow('Latest preview URL', preview?.latestPreviewUrl ?? project.latestPreviewUrl),
    renderMetadataRow('Page count', preview?.pageCount ?? pageItems.length),
  ].join('');

  const itemList = previewItems.length
    ? `<ul class="artifact-list preview-items">${previewItems
        .map(
          (item: PreviewItem) => `<li data-kind="${escapeHtml(item.kind)}" data-role="${escapeHtml(item.role)}">${escapeHtml(item.title ?? item.label ?? item.storageKey)}${item.pageKey ? ` <span class="artifact-page-key">(${escapeHtml(item.pageKey)})</span>` : ''}${item.filename ? ` <span class="artifact-filename">${escapeHtml(item.filename)}</span>` : ''}${item.mimeType ? ` <span class="artifact-mime">${escapeHtml(item.mimeType)}</span>` : ''}</li>`,
        )
        .join('')}</ul>`
    : '';
  const previewUrl = preview?.latestPreviewUrl ?? project.latestPreviewUrl;
  const previewAction = previewUrl
    ? `<p class="panel-action"><a class="artifact-link" href="${escapeHtml(previewUrl)}" data-preview-action="open">Open live preview</a></p>`
    : '';
  const pageFocus = renderPreviewPageFocus(previewUrl, pageItems);

  return `
    <section id="panel-preview" class="artifact-panel preview-panel" data-panel="preview" tabindex="-1" aria-labelledby="${panelHeadingId('preview')}">
      <header>
        <h2 id="${panelHeadingId('preview')}">Preview assets</h2>
        <span class="panel-status">${escapeHtml(`${pageItems.length} page asset(s)`)}</span>
      </header>
      <dl class="artifact-metadata">${rows}</dl>
      ${previewAction}
      ${pageFocus}
      ${itemList}
    </section>`;
}

function renderExportPanel(project: ProjectViewModel): string {
  const exportView = project.export;
  if (!exportView) {
    return '';
  }

  const rows = [
    renderMetadataRow('Export URL', exportView.latestExportUrl),
    renderMetadataRow('Export label', exportView.latestExportLabel),
    renderMetadataRow('Filename', exportView.filename),
    renderMetadataRow('Format', exportView.format),
    renderMetadataRow('Run ID', exportView.runId),
    renderMetadataRow('Artifact count', exportView.artifactCount),
    renderMetadataRow('Companion count', exportView.companionCount),
    renderMetadataRow('Asset directory', exportView.assetDirectoryStorageKey),
  ].join('');

  const companionList = exportView.companionStorageKeys?.length
    ? `<ul class="artifact-list export-companions">${exportView.companionStorageKeys
        .map((storageKey: string) => `<li data-storage-key="${escapeHtml(storageKey)}">${escapeHtml(storageKey)}</li>`)
        .join('')}</ul>`
    : '';
  const exportAction = exportView.latestExportUrl
    ? `<p class="panel-action"><a class="artifact-link" href="${escapeHtml(exportView.latestExportUrl)}" data-export-action="download">Download PPTX</a></p>`
    : '';

  return `
    <section id="panel-export" class="artifact-panel export-panel" data-panel="export" tabindex="-1" aria-labelledby="${panelHeadingId('export')}">
      <header>
        <h2 id="${panelHeadingId('export')}">Export assets</h2>
        <span class="panel-status">${escapeHtml(exportView.latestExportUrl ? 'ready' : 'pending')}</span>
      </header>
      <dl class="artifact-metadata">${rows}</dl>
      ${exportAction}
      ${companionList}
    </section>`;
}

function renderDeliveryPanel(project: ProjectViewModel): string {
  const delivery = project.delivery;
  if (!delivery) {
    return '';
  }

  const companionCount = delivery.items?.filter((item) => item.role === 'companion').length
    ?? delivery.companionArtifactIds?.length
    ?? 0;

  const rows = [
    renderMetadataRow('Primary artifact', delivery.primaryArtifactId),
    renderMetadataRow('Primary label', delivery.primaryLabel),
    renderMetadataRow('Primary storage key', delivery.primaryStorageKey),
    renderMetadataRow('Run ID', delivery.runId),
    renderMetadataRow('Asset directory', delivery.assetDirectoryStorageKey),
    renderMetadataRow('Companion artifact count', companionCount),
  ].join('');

  const items = delivery.items?.length
    ? `<ul class="artifact-list delivery-items">${delivery.items
        .map(
          (item) => `<li data-role="${escapeHtml(item.role)}" data-kind="${escapeHtml(item.kind)}">${escapeHtml(item.title ?? item.label ?? item.storageKey)}${item.filename ? ` <span class="artifact-filename">${escapeHtml(item.filename)}</span>` : ''}${item.mimeType ? ` <span class="artifact-mime">${escapeHtml(item.mimeType)}</span>` : ''}</li>`,
        )
        .join('')}</ul>`
    : '';

  return `
    <section id="panel-delivery" class="artifact-panel delivery-panel" data-panel="delivery" tabindex="-1" aria-labelledby="${panelHeadingId('delivery')}">
      <header>
        <h2 id="${panelHeadingId('delivery')}">Delivery package</h2>
        <span class="panel-status">${escapeHtml(`${delivery.items?.length ?? 0} artifact(s)`)}</span>
      </header>
      <dl class="artifact-metadata">${rows}</dl>
      ${items}
    </section>`;
}

export function renderProjectWorkbenchShell(project: ProjectViewModel): string {
  const primaryPanel = primaryPanelKey(project);
  const skipTarget = primaryPanel ? `panel-${primaryPanel}` : 'project-header';

  const body = [
    renderPanelDirectory(project),
    renderTimeline(project),
    renderSourcesPanel(project),
    renderActionList(project),
    renderStrategistPanel(project),
    renderCheckpointPanel(project),
    renderRecoveryPanel(project),
    renderArtifactSummaryPanel(project),
    renderWorkflowStatusPanel(project),
    renderConfirmationSubmission(project),
    renderArtifactList(project),
    renderPreviewPanel(project),
    renderExportPanel(project),
    renderDeliveryPanel(project),
  ]
    .filter(Boolean)
    .join('');
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(project.name)} — workbench</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        --bg: #0f172a;
        --panel: #111827;
        --panel-strong: #1f2937;
        --border: #334155;
        --text: #e5e7eb;
        --muted: #94a3b8;
        --accent: #38bdf8;
        --success: #22c55e;
        --warning: #f59e0b;
        --danger: #ef4444;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: linear-gradient(180deg, #020617 0%, #111827 100%);
        color: var(--text);
        min-height: 100vh;
      }
      a { color: var(--accent); }
      code {
        background: rgba(148, 163, 184, 0.18);
        padding: 0.1rem 0.3rem;
        border-radius: 0.35rem;
        font-family: 'SFMono-Regular', ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      .skip-link {
        position: absolute;
        left: -9999px;
        top: auto;
        width: 1px;
        height: 1px;
        overflow: hidden;
      }
      .skip-link:focus {
        left: 1rem;
        top: 1rem;
        width: auto;
        height: auto;
        padding: 0.75rem 1rem;
        background: #ffffff;
        color: #0f172a;
        border-radius: 0.5rem;
        z-index: 1000;
      }
      main {
        max-width: 1180px;
        margin: 0 auto;
        padding: 2rem 1.5rem 3rem;
      }
      .project-header {
        display: grid;
        gap: 1rem;
        padding: 1.5rem;
        border: 1px solid var(--border);
        background: rgba(15, 23, 42, 0.78);
        border-radius: 1rem;
        backdrop-filter: blur(14px);
      }
      .project-header h1 {
        margin: 0;
        font-size: clamp(2rem, 4vw, 2.8rem);
      }
      .project-header .current-phase {
        color: var(--accent);
        font-weight: 700;
      }
      .current-phase-description,
      .section-summary,
      .section-description,
      .timeline-description,
      .banner-text,
      .question-placeholder,
      .action-detail {
        color: var(--muted);
      }
      .project-header-metadata,
      .artifact-metadata {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 0.75rem;
        margin: 0;
      }
      .meta-row {
        margin: 0;
        padding: 0.85rem 1rem;
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 0.75rem;
        background: rgba(15, 23, 42, 0.55);
      }
      .meta-row dt {
        margin: 0 0 0.35rem;
        color: var(--muted);
        font-size: 0.85rem;
      }
      .meta-row dd {
        margin: 0;
        font-weight: 600;
      }
      .summary-card-grid,
      .content-grid {
        display: grid;
        gap: 1rem;
        margin-top: 1.5rem;
      }
      .summary-card-grid {
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      }
      .content-grid {
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        align-items: start;
      }
      .summary-card,
      .panel-directory,
      .timeline-panel,
      .sources-panel,
      .next-actions-panel,
      .strategist-panel,
      .checkpoint-panel,
      .recovery-panel,
      .workbench-sections-panel,
      .confirmation-submission,
      .artifact-summary-panel,
      .artifact-list-panel,
      .artifact-panel {
        border: 1px solid var(--border);
        background: rgba(17, 24, 39, 0.82);
        border-radius: 1rem;
        padding: 1rem 1.1rem;
        box-shadow: 0 20px 45px rgba(15, 23, 42, 0.22);
      }
      .summary-card h3,
      .timeline-panel h2,
      .sources-panel h2,
      .next-actions-panel h2,
      .strategist-panel h2,
      .checkpoint-panel h2,
      .recovery-panel h2,
      .workbench-sections-panel h2,
      .confirmation-submission h2,
      .artifact-summary-panel h2,
      .artifact-list-panel h2,
      .artifact-panel h2,
      .panel-directory h2 {
        margin: 0;
      }
      .summary-card .summary-value {
        font-size: 1.1rem;
        font-weight: 700;
        margin-bottom: 0;
      }
      .tone-success { border-color: rgba(34, 197, 94, 0.38); }
      .tone-warning { border-color: rgba(245, 158, 11, 0.38); }
      .tone-active { border-color: rgba(56, 189, 248, 0.38); }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.25rem 0.6rem;
        border-radius: 999px;
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.02em;
      }
      .badge-neutral { background: rgba(148, 163, 184, 0.18); color: #e2e8f0; }
      .badge-active { background: rgba(56, 189, 248, 0.18); color: #bae6fd; }
      .badge-success { background: rgba(34, 197, 94, 0.18); color: #bbf7d0; }
      .badge-warning { background: rgba(245, 158, 11, 0.18); color: #fde68a; }
      .panel-directory-list,
      .timeline-list,
      .source-list,
      .artifact-list,
      .artifact-kind-list,
      .checkpoint-artifacts,
      .confirmation-questions,
      .confirmation-answer-list {
        display: grid;
        gap: 0.75rem;
        list-style: none;
        margin: 1rem 0 0;
        padding: 0;
      }
      .panel-directory-list li,
      .timeline-item,
      .source-item,
      .artifact-list li,
      .artifact-kind-list li,
      .checkpoint-artifacts li,
      .confirmation-questions li {
        border: 1px solid rgba(148, 163, 184, 0.18);
        border-radius: 0.85rem;
        padding: 0.85rem 1rem;
        background: rgba(15, 23, 42, 0.42);
      }
      .panel-directory-list li {
        display: flex;
        justify-content: space-between;
        gap: 0.75rem;
        align-items: baseline;
      }
      .directory-status,
      .panel-status,
      .timeline-status,
      .section-status,
      .source-kind,
      .source-status,
      .artifact-kind,
      .artifact-status,
      .artifact-kind-count,
      .question-state,
      .action-owner {
        color: var(--muted);
        font-size: 0.86rem;
      }
      .timeline-item header,
      .workbench-section header,
      .source-item,
      .artifact-list li,
      .next-action-card header {
        display: flex;
        justify-content: space-between;
        gap: 0.75rem;
        align-items: baseline;
        flex-wrap: wrap;
      }
      .section-badges,
      .timeline-badges {
        display: flex;
        gap: 0.45rem;
        flex-wrap: wrap;
        margin-top: 0.75rem;
      }
      .workbench-sections,
      .next-action-grid {
        display: grid;
        gap: 0.9rem;
        margin-top: 1rem;
      }
      .next-action-grid {
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      }
      .next-action-card {
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 0.9rem;
        padding: 1rem;
        background: rgba(15, 23, 42, 0.45);
      }
      .next-action-card.is-primary,
      .next-action-card.blocked-card {
        border-color: rgba(56, 189, 248, 0.4);
        background: rgba(14, 116, 144, 0.18);
      }
      .action-kicker {
        margin: 0;
        color: var(--accent);
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .next-action-card h3 {
        margin: 0.2rem 0 0;
      }
      .next-action-button {
        margin-top: 1rem;
        border: 0;
        border-radius: 999px;
        background: linear-gradient(135deg, #0ea5e9, #2563eb);
        color: #eff6ff;
        font: inherit;
        font-weight: 700;
        padding: 0.7rem 1rem;
        cursor: pointer;
      }
      .action-availability {
        color: var(--muted);
        font-size: 0.86rem;
        margin: 1rem 0 0;
      }
      .preview-page-focus {
        margin-top: 1rem;
        padding: 1rem;
        border: 1px solid rgba(56, 189, 248, 0.18);
        border-radius: 0.9rem;
        background: rgba(15, 23, 42, 0.45);
      }
      .preview-page-focus-header {
        display: grid;
        gap: 0.45rem;
      }
      .preview-page-focus-header h3,
      .preview-page-summary h4 {
        margin: 0;
      }
      .preview-page-focus-grid {
        display: grid;
        gap: 1rem;
        margin-top: 1rem;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
      }
      .preview-page-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 0.75rem;
      }
      .preview-page-button {
        width: 100%;
        border: 1px solid rgba(148, 163, 184, 0.24);
        border-radius: 0.85rem;
        background: rgba(15, 23, 42, 0.62);
        color: var(--text);
        padding: 0.85rem 1rem;
        text-align: left;
        font: inherit;
        display: grid;
        gap: 0.25rem;
        cursor: pointer;
      }
      .preview-page-button.is-selected,
      .preview-page-button[data-selected="true"] {
        border-color: rgba(56, 189, 248, 0.55);
        background: rgba(14, 116, 144, 0.22);
        box-shadow: inset 0 0 0 1px rgba(56, 189, 248, 0.18);
      }
      .preview-page-button-title {
        font-weight: 700;
      }
      .preview-page-button-key,
      .preview-page-summary-label,
      .preview-page-summary-note {
        color: var(--muted);
        font-size: 0.86rem;
      }
      .preview-page-summary {
        border: 1px solid rgba(148, 163, 184, 0.18);
        border-radius: 0.85rem;
        padding: 1rem;
        background: rgba(15, 23, 42, 0.62);
      }
      .preview-page-summary-label {
        margin: 0 0 0.35rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .preview-page-summary-metadata {
        margin-top: 0.75rem;
      }
      .preview-page-summary-note {
        margin: 0.85rem 0 0;
      }
      .confirmation-form textarea {
        width: 100%;
        min-height: 7rem;
        border-radius: 0.85rem;
        border: 1px solid rgba(148, 163, 184, 0.3);
        background: rgba(15, 23, 42, 0.68);
        color: var(--text);
        padding: 0.85rem 0.95rem;
        font: inherit;
      }
      .confirmation-form-footer {
        margin-top: 1rem;
        display: flex;
        justify-content: flex-end;
      }
      .confirmation-submit-button {
        border: 0;
        border-radius: 999px;
        background: linear-gradient(135deg, #0ea5e9, #2563eb);
        color: #eff6ff;
        font-weight: 700;
        padding: 0.8rem 1.2rem;
        cursor: pointer;
      }
      .confirmation-submit-button[disabled] {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .confirmation-submit-error {
        margin: 0.75rem 0 0;
        color: #fecaca;
      }
      @media (max-width: 820px) {
        main { padding: 1rem 0.9rem 2rem; }
        .project-header { padding: 1.2rem; }
        .preview-page-focus-grid { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <a class="skip-link" href="#${escapeHtml(skipTarget)}">Skip to primary workbench panel</a>
    <main aria-labelledby="project-title">
      <header id="project-header" class="project-header">
        <div>
          <p class="current-phase">Current phase: ${escapeHtml(project.currentPhase.title)}</p>
          <h1 id="project-title">${escapeHtml(project.name)}</h1>
          ${project.currentPhase.description
            ? `<p class="current-phase-description">${escapeHtml(project.currentPhase.description)}</p>`
            : project.description
              ? `<p class="current-phase-description">${escapeHtml(project.description)}</p>`
              : ''}
        </div>
        ${renderHeaderMetadata(project)}
      </header>
      <section class="summary-card-grid" aria-label="Workbench summary cards">
        ${renderSummaryCards(project)}
      </section>
      <section class="content-grid" aria-label="Workbench detail panels">
        ${body}
      </section>
    </main>
    <script>
      document.addEventListener('click', function (event) {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }

        const button = target.closest('[data-preview-page-button="true"]');
        if (!(button instanceof HTMLButtonElement)) {
          return;
        }

        const panel = button.closest('#panel-preview');
        if (!(panel instanceof HTMLElement)) {
          return;
        }

        const buttons = panel.querySelectorAll('[data-preview-page-button="true"]');
        buttons.forEach((candidate) => {
          if (candidate instanceof HTMLElement) {
            const isSelected = candidate === button;
            candidate.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
            candidate.setAttribute('data-selected', isSelected ? 'true' : 'false');
            candidate.classList.toggle('is-selected', isSelected);
          }
        });

        const summary = panel.querySelector('[data-preview-page-summary="true"]');
        if (!(summary instanceof HTMLElement)) {
          return;
        }

        const titleField = summary.querySelector('[data-preview-page-field="title"]');
        if (titleField instanceof HTMLElement) {
          titleField.textContent = button.dataset.previewPageTitle ?? '';
        }

        const metadataValues = summary.querySelectorAll('.meta-row dd');
        if (metadataValues[0] instanceof HTMLElement) {
          metadataValues[0].textContent = button.dataset.previewPageKey ?? '';
        }
        if (metadataValues[1] instanceof HTMLElement) {
          metadataValues[1].textContent = button.dataset.previewPageFilename ?? '';
        }
        if (metadataValues[2] instanceof HTMLElement) {
          metadataValues[2].textContent = button.dataset.previewPageStorageKey ?? '';
        }
      });
    </script>
  </body>
</html>`;
}
