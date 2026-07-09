export type PreviewViewModel = {
  latestPreviewUrl?: string;
  pageCount?: number;
  pageKeys?: string[];
  manifestStorageKey?: string;
  entryStorageKey?: string;
  pageArtifactIds?: string[];
  runId?: string;
  items?: Array<{
    artifactId: string;
    kind: 'preview_bundle' | 'preview_page_svg';
    label?: string;
    title?: string;
    storageKey: string;
    filename?: string;
    mimeType?: string;
    role: 'bundle' | 'page';
    pageKey?: string;
  }>;
};
