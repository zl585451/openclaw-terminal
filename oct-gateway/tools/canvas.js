const { normalizeDiagramContent } = require('../diagram_schema');

function normalizeMode(mode, artifactType) {
  if (mode === 'markdown' || mode === 'code' || mode === 'html') return mode;
  if (artifactType === 'code') return 'code';
  if (artifactType === 'ui-draft') return 'html';
  return 'markdown';
}

function normalizeArtifactType(artifactType, mode) {
  if (artifactType === 'document' || artifactType === 'diagram' ||
      artifactType === 'ui-draft' || artifactType === 'code' ||
      artifactType === 'react-flow' || artifactType === 'echart') {
    return artifactType;
  }
  if (mode === 'code') return 'code';
  if (mode === 'html') return 'ui-draft';
  return 'document';
}

function extractMermaidContent(content) {
  const raw = String(content || '').trim();
  if (!raw) return raw;

  const fencedMatch = raw.match(/```mermaid\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }

  const lines = raw.split(/\r?\n/);
  const startIndex = lines.findIndex((line) =>
    /^(flowchart|graph|sequencediagram|classdiagram|erdiagram|statediagram|gantt|pie|mindmap|journey|timeline|quadrantchart|requirementdiagram|gitgraph)\b/i
      .test(line.trim())
  );

  if (startIndex >= 0) {
    return lines.slice(startIndex).join('\n').trim();
  }

  return raw;
}

function normalizeDiagramPayload(content) {
  return extractMermaidContent(normalizeDiagramContent(content));
}

module.exports = {
  name: 'canvas',
  definition: {
    type: 'function',
    function: {
      name: 'canvas',
      description: 'Create, update, focus, explain, or delete a canvas artifact when visual or structured output is better than plain chat.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['create', 'update', 'focus', 'delete', 'explain'],
            description: 'Canvas action to perform',
          },
          documentId: {
            type: 'string',
            description: 'Existing document id for update, focus, delete, or explain',
          },
          title: {
            type: 'string',
            description: 'Human-readable artifact title',
          },
          artifactType: {
            type: 'string',
            enum: ['document', 'diagram', 'ui-draft', 'code', 'react-flow', 'echart'],
            description: 'Artifact category: document=markdown文档, diagram=Mermaid图, react-flow=交互式节点图(JSON格式), echart=ECharts数据图表(bar/line/pie/scatter等), ui-draft=HTML, code=代码',
          },
          mode: {
            type: 'string',
            enum: ['markdown', 'code', 'html'],
            description: 'Renderer mode for the artifact content',
          },
          content: {
            type: 'string',
            description: 'Artifact content. markdown for documents; pure Mermaid DSL for diagram; {"nodes":[...],"edges":[...],"direction":"LR","title":"..."} JSON for react-flow; {"title":"...","option":{...ECharts option...}} JSON for echart; HTML for ui-draft; raw code for code.',
          },
          language: {
            type: 'string',
            description: 'Code language when mode is code',
          },
          explanation: {
            type: 'string',
            description: 'Short explanation describing the artifact or the update you made',
          },
        },
        required: ['action'],
      },
    },
  },
  execute: async (args) => {
    const action = args?.action;

    if (!action) {
      return { success: false, error: 'Missing required field: action' };
    }

    if (action === 'create') {
      if (!args?.content) {
        return { success: false, error: 'create requires content' };
      }

      const mode = normalizeMode(args.mode, args.artifactType);
      const artifactType = normalizeArtifactType(args.artifactType, mode);
      // Normalize content to string — some models (MiniMax) pass `content` as a
      // parsed JS object rather than a JSON string when the value is structured JSON.
      const rawContent = (args.content !== null && args.content !== undefined && typeof args.content === 'object')
        ? JSON.stringify(args.content)
        : String(args.content || '');
      // react-flow content is JSON — never run it through the Mermaid extractor
      const normalizedContent = artifactType === 'diagram'
        ? normalizeDiagramPayload(rawContent)
        : rawContent;
      const payload = {
        document: {
          id: args.documentId,
          title: args.title || 'Canvas Artifact',
          artifactType,
          mode,
          content: normalizedContent,
          language: args.language || (mode === 'code' ? 'text' : 'text'),
          origin: 'ai',
          explanation: args.explanation || '',
          status: 'draft',
        },
      };

      return {
        success: true,
        message: `Canvas artifact created: ${payload.document.title}`,
        canvasEvent: {
          action: 'create',
          payload,
        },
        workbenchEvent: {
          action: 'create',
          payload,
        },
        document: payload.document,
      };
    }

    if (action === 'update') {
      if (!args?.documentId) {
        return { success: false, error: 'update requires documentId' };
      }

      const patch = {};
      if (typeof args.title === 'string') patch.title = args.title;
      if (args.content !== undefined && args.content !== null) {
        const rawUpdateContent = typeof args.content === 'object'
          ? JSON.stringify(args.content)
          : String(args.content);
        const artifactType = typeof args.artifactType === 'string' ? args.artifactType : undefined;
        patch.content = artifactType === 'diagram' ? normalizeDiagramPayload(rawUpdateContent) : rawUpdateContent;
      }
      if (typeof args.language === 'string') patch.language = args.language;
      if (typeof args.explanation === 'string') patch.explanation = args.explanation;
      if (typeof args.mode === 'string') patch.mode = normalizeMode(args.mode, args.artifactType);
      if (typeof args.artifactType === 'string') {
        patch.artifactType = normalizeArtifactType(args.artifactType, patch.mode || args.mode);
      }

      return {
        success: true,
        message: `Canvas artifact updated: ${args.documentId}`,
        canvasEvent: {
          action: 'update',
          payload: {
            documentId: args.documentId,
            patch,
          },
        },
        workbenchEvent: {
          action: 'update',
          payload: {
            documentId: args.documentId,
            patch,
          },
        },
        documentId: args.documentId,
        patch,
      };
    }

    if (action === 'focus') {
      if (!args?.documentId) {
        return { success: false, error: 'focus requires documentId' };
      }

      return {
        success: true,
        message: `Canvas artifact focused: ${args.documentId}`,
        canvasEvent: {
          action: 'focus',
          payload: {
            documentId: args.documentId,
          },
        },
        workbenchEvent: {
          action: 'focus',
          payload: {
            documentId: args.documentId,
          },
        },
      };
    }

    if (action === 'delete') {
      if (!args?.documentId) {
        return { success: false, error: 'delete requires documentId' };
      }

      return {
        success: true,
        message: `Canvas artifact deleted: ${args.documentId}`,
        canvasEvent: {
          action: 'delete',
          payload: {
            documentId: args.documentId,
          },
        },
        workbenchEvent: {
          action: 'delete',
          payload: {
            documentId: args.documentId,
          },
        },
      };
    }

    if (action === 'explain') {
      if (!args?.documentId || !args?.explanation) {
        return { success: false, error: 'explain requires documentId and explanation' };
      }

      return {
        success: true,
        message: `Canvas explanation updated: ${args.documentId}`,
        canvasEvent: {
          action: 'explain',
          payload: {
            documentId: args.documentId,
            explanation: args.explanation,
          },
        },
        workbenchEvent: {
          action: 'explain',
          payload: {
            documentId: args.documentId,
            explanation: args.explanation,
          },
        },
      };
    }

    return { success: false, error: `Unsupported canvas action: ${action}` };
  },
};
