import type { ProductAction } from '../models/actions';
import type { PptmasterRuntimeAdapter } from '../adapter/interface';

export async function dispatchProductAction(
  adapter: PptmasterRuntimeAdapter,
  action: ProductAction,
) {
  switch (action.type) {
    case 'create_project':
      return adapter.createProject(action);
    case 'import_sources':
      return adapter.importSources(action);
    case 'prepare_confirmations':
      return adapter.prepareConfirmations(action);
    case 'submit_confirmations':
      return adapter.submitConfirmations(action);
    case 'start_generation':
      return adapter.startGeneration(action);
    case 'resume_generation':
      return adapter.resumeGeneration(action);
    case 'request_revision':
      return adapter.requestRevision(action);
    case 'export_pptx':
      return adapter.exportPptx(action);
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
