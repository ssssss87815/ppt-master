export type ExportViewModel = {
  latestExportUrl?: string;
  latestExportLabel?: string;
  format?: 'pptx';
  filename?: string;
  manifestStorageKey?: string;
  companionArtifactIds?: string[];
  companionStorageKeys?: string[];
  assetDirectoryStorageKey?: string;
  runId?: string;
  artifactCount?: number;
  companionCount?: number;
};
