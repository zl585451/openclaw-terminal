import { describe, expect, it } from 'vitest';
import {
  createWorkbenchDocument,
  inferArtifactType,
  restoreWorkbenchDocumentState,
  workbenchDocumentReducer,
} from './DocumentStore';
import {
  isEditableWorkbenchArtifact,
  isReadingWorkbenchArtifact,
  normalizeWorkbenchArtifactType,
} from './types';

describe('Workbench artifact migration', () => {
  it('normalizes legacy document artifacts to reading when restoring persisted state', () => {
    const restored = restoreWorkbenchDocumentState({
      activeDocumentId: 'legacy-doc',
      documents: [
        {
          id: 'legacy-doc',
          title: 'Legacy document',
          artifactType: 'document',
          mode: 'markdown',
          content: 'old prose',
          language: 'text',
          origin: 'ai',
          status: 'draft',
          version: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    expect(restored.activeDocumentId).toBe('legacy-doc');
    expect(restored.documents[0].artifactType).toBe('reading');
    expect(isReadingWorkbenchArtifact(restored.documents[0])).toBe(true);
    expect(isEditableWorkbenchArtifact(restored.documents[0])).toBe(false);
  });

  it('creates markdown output as reading by default', () => {
    expect(inferArtifactType('markdown')).toBe('reading');

    const document = createWorkbenchDocument('new prose', 'markdown', 'New prose');

    expect(document.artifactType).toBe('reading');
    expect(isReadingWorkbenchArtifact(document)).toBe(true);
  });

  it('keeps explicit artifact documents editable', () => {
    const document = createWorkbenchDocument('draft', 'markdown', 'Draft', 'markdown', {
      artifactType: 'artifact',
    });

    expect(document.artifactType).toBe('artifact');
    expect(isEditableWorkbenchArtifact(document)).toBe(true);
  });

  it('normalizes document patches to reading', () => {
    const initial = {
      activeDocumentId: 'doc-1',
      documents: [
        createWorkbenchDocument('content', 'markdown', 'Title', 'text', {
          id: 'doc-1',
          artifactType: 'artifact',
        }),
      ],
    };

    const next = workbenchDocumentReducer(initial, {
      type: 'update',
      payload: {
        documentId: 'doc-1',
        patch: { artifactType: 'document' },
      },
    });

    expect(next.documents[0].artifactType).toBe('reading');
  });

  it('normalizes raw artifact type values at the boundary', () => {
    expect(normalizeWorkbenchArtifactType('document')).toBe('reading');
    expect(normalizeWorkbenchArtifactType('artifact')).toBe('artifact');
    expect(normalizeWorkbenchArtifactType(undefined, 'markdown')).toBe('reading');
    expect(normalizeWorkbenchArtifactType(undefined, 'code')).toBe('code');
    expect(normalizeWorkbenchArtifactType(undefined, 'html')).toBe('ui-draft');
  });
});
