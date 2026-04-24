export type ArtifactType =
  | 'chapter_index'
  | 'character_profile'
  | 'artifact_tracker'
  | 'timeline'
  | 'style_profile'
  | 'scene_breakdown'
  | 'distilled_content'
  | 'scene_script'
  | 'consistency_report'
  | 'final_package';

export type ArtifactScope = 'project' | 'chapter' | 'scene';
export type ArtifactStatus = 'draft' | 'reviewing' | 'approved' | 'rejected' | 'superseded';

export interface Artifact {
  id: string;
  projectId: string;
  type: ArtifactType;
  scope: ArtifactScope;
  scopeId: string;
  version: number;
  producerTaskId?: string;
  parentArtifactId?: string;
  content: unknown;
  contentPreview: string;
  status: ArtifactStatus;
  isFrozen: boolean;
  createdAt: string;
}
