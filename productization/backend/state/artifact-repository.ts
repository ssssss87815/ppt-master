import type { ProductArtifactRef } from '../models/artifacts';

export interface ArtifactRepository {
  create(artifact: ProductArtifactRef): Promise<ProductArtifactRef>;
  createMany(artifacts: ProductArtifactRef[]): Promise<ProductArtifactRef[]>;
  listByProjectId(projectId: string): Promise<ProductArtifactRef[]>;
  listByKind(projectId: string, kind: ProductArtifactRef['kind']): Promise<ProductArtifactRef[]>;
}
