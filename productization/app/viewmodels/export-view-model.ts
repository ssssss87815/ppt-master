export type ExportViewModel = {
  latestExportUrl?: string;
  format?: 'pptx';
  filename?: string;
  manifestStorageKey?: string;
  companionArtifactIds?: string[];
  companionStorageKeys?: string[];
  assetDirectoryStorageKey?: string;
  runId?: string;
};
