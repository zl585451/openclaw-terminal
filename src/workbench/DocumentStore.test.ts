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

describe('Streaming draft documents (canvas 实时预览)', () => {
  it('合并同一个 streamId 的连续 create 分片到同一份草稿，不新建条目', () => {
    let state = workbenchDocumentReducer(
      { documents: [], activeDocumentId: null },
      {
        type: 'create',
        payload: { document: { content: '<html><div clas', mode: 'html', title: '正在生成…', streamId: 'call_1', isStreaming: true } },
      },
    );
    expect(state.documents).toHaveLength(1);
    const draftId = state.documents[0].id;
    expect(state.documents[0].isStreaming).toBe(true);

    state = workbenchDocumentReducer(state, {
      type: 'create',
      payload: { document: { content: '<html><div class="a">更多内容', mode: 'html', title: '深夜方案', streamId: 'call_1', isStreaming: true } },
    });

    expect(state.documents).toHaveLength(1); // 没有新增条目
    expect(state.documents[0].id).toBe(draftId); // 同一个 id
    expect(state.documents[0].content).toBe('<html><div class="a">更多内容');
    expect(state.documents[0].title).toBe('深夜方案');
  });

  it('最终事件（isStreaming:false）原地把草稿转正，不产生重复文档', () => {
    let state = workbenchDocumentReducer(
      { documents: [], activeDocumentId: null },
      {
        type: 'create',
        payload: { document: { content: '<html>草稿', mode: 'html', title: '草稿标题', streamId: 'call_1', isStreaming: true } },
      },
    );
    const draftId = state.documents[0].id;

    state = workbenchDocumentReducer(state, {
      type: 'create',
      payload: { document: { content: '<html>完整内容</html>', mode: 'html', title: '最终标题', streamId: 'call_1', isStreaming: false } },
    });

    expect(state.documents).toHaveLength(1);
    expect(state.documents[0].id).toBe(draftId);
    expect(state.documents[0].content).toBe('<html>完整内容</html>');
    expect(state.documents[0].title).toBe('最终标题');
    expect(state.documents[0].isStreaming).toBe(false);
    expect(state.documents[0].streamId).toBeUndefined();
  });

  it('没有 streamId 的普通 create 仍然各自新建文档', () => {
    let state = workbenchDocumentReducer(
      { documents: [], activeDocumentId: null },
      { type: 'create', payload: { document: { content: 'A', mode: 'markdown' } } },
    );
    state = workbenchDocumentReducer(state, {
      type: 'create',
      payload: { document: { content: 'B', mode: 'markdown' } },
    });
    expect(state.documents).toHaveLength(2);
  });

  it('update 流式分片(isStreaming:true)不增加版本号，最终分片才增加', () => {
    let state: ReturnType<typeof workbenchDocumentReducer> = {
      activeDocumentId: 'doc-1',
      documents: [createWorkbenchDocument('原文', 'markdown', '标题', 'text', { id: 'doc-1' })],
    };
    expect(state.documents[0].version).toBe(1);

    state = workbenchDocumentReducer(state, {
      type: 'update',
      payload: { documentId: 'doc-1', patch: { content: '原文 更多', isStreaming: true } },
    });
    expect(state.documents[0].version).toBe(1); // 流式分片不涨版本号
    expect(state.documents[0].isStreaming).toBe(true);

    state = workbenchDocumentReducer(state, {
      type: 'update',
      payload: { documentId: 'doc-1', patch: { content: '原文 更多 完整版', isStreaming: false } },
    });
    expect(state.documents[0].version).toBe(2); // 收尾的真正修订涨版本号
    expect(state.documents[0].isStreaming).toBe(false);
  });
});
