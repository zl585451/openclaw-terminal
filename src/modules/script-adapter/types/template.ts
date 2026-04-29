import type { ArtifactType } from './artifact';
import type { ContentTemplateType } from './project';

export interface TeamTemplate {
  id: string;
  version: string;
  name: string;
  type: ContentTemplateType;
  description: string;
  stageIds: string[];
  requiredArtifactTypes: ArtifactType[];
  optionalArtifactTypes?: ArtifactType[];
}
