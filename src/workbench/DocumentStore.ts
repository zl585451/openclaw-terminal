import type {
  ScriptCharacterProfile,
  ScriptLineAttribution,
  ScriptStructuredLineMarker,
  ScriptVoiceFragmentMarker,
  WorkbenchArtifactType,
  WorkbenchCommand,
  WorkbenchDocument,
  WorkbenchMode,
} from './types';
import { normalizeWorkbenchArtifactType } from './types';
import { normalizeSpeakerCueName } from '../utils/speakerCueNormalizer';

export interface WorkbenchDocumentState {
  documents: WorkbenchDocument[];
  activeDocumentId: string | null;
}

function isWorkbenchMode(value: unknown): value is WorkbenchMode {
  return value === 'markdown' || value === 'code' || value === 'html';
}

function sanitizeWorkbenchDocument(value: unknown): WorkbenchDocument | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<WorkbenchDocument>;
  const content = typeof raw.content === 'string' ? raw.content : '';
  if (!content.trim()) return null;

  const mode = isWorkbenchMode(raw.mode) ? raw.mode : 'markdown';
  const title = typeof raw.title === 'string' ? raw.title : '';
  const language = typeof raw.language === 'string' ? raw.language : 'text';
  const scriptCharacterLibrary = Array.isArray(raw.scriptCharacterLibrary)
    ? dedupeScriptCharacterLibrary(
      raw.scriptCharacterLibrary
        .map((entry) => sanitizeScriptCharacterProfile(entry))
        .filter((entry): entry is ScriptCharacterProfile => !!entry),
    )
    : undefined;
  const scriptChapterAttributions = sanitizeScriptChapterAttributions(raw.scriptChapterAttributions);
  const scriptChapterStructuredLines = sanitizeScriptChapterStructuredLines(raw.scriptChapterStructuredLines);
  const scriptChapterVoiceFragments = sanitizeScriptChapterVoiceFragments(raw.scriptChapterVoiceFragments);

  return createWorkbenchDocument(content, mode, title, language, {
    ...raw,
    id: typeof raw.id === 'string' ? raw.id : undefined,
    title,
    mode,
    content,
    language,
    projectBookId: typeof raw.projectBookId === 'string' ? raw.projectBookId : undefined,
    projectChapterIndex: Number.isInteger(raw.projectChapterIndex) ? raw.projectChapterIndex : undefined,
    artifactType: normalizeWorkbenchArtifactType(raw.artifactType, mode),
    origin: raw.origin === 'ai' ? 'ai' : 'user',
    sourcePath: typeof raw.sourcePath === 'string' ? raw.sourcePath : undefined,
    draftCachePath: typeof raw.draftCachePath === 'string' ? raw.draftCachePath : undefined,
    sourceMessageId: typeof raw.sourceMessageId === 'string' ? raw.sourceMessageId : undefined,
    explanation: typeof raw.explanation === 'string' ? raw.explanation : undefined,
    scriptCharacterLibrary,
    scriptChapterAttributions,
    scriptChapterStructuredLines,
    scriptChapterVoiceFragments,
    status: raw.status === 'final' || raw.status === 'refining' ? raw.status : 'draft',
    version: typeof raw.version === 'number' && Number.isFinite(raw.version) && raw.version > 0
      ? Math.floor(raw.version)
      : 1,
    createdAt: typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt)
      ? raw.createdAt
      : undefined,
    updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt)
      ? raw.updatedAt
      : undefined,
  });
}

function sanitizeScriptCharacterProfile(value: unknown): ScriptCharacterProfile | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<ScriptCharacterProfile>;
  const name = normalizeSpeakerCueName(raw.name) || String(raw.name || '').trim();
  const color = String(raw.color || '').trim();
  if (!name || !color) return null;
  return { name, color };
}

function sanitizeScriptLineAttribution(value: unknown): ScriptLineAttribution | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<ScriptLineAttribution>;
  const lineIndex = Number(raw.lineIndex);
  const speaker = normalizeSpeakerCueName(raw.speaker) || String(raw.speaker || '').trim();
  if (!Number.isInteger(lineIndex) || lineIndex < 0 || !speaker) return null;
  const confidence = raw.confidence === 'high' || raw.confidence === 'low' ? raw.confidence : 'medium';
  return {
    lineIndex,
    speaker,
    confidence,
  };
}

function sanitizeScriptStructuredLineMarker(value: unknown): ScriptStructuredLineMarker | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<ScriptStructuredLineMarker>;
  const lineIndex = Number(raw.lineIndex);
  if (!Number.isInteger(lineIndex) || lineIndex < 0) return null;
  const label = normalizeSpeakerCueName(raw.label) || String(raw.label || '').trim();
  return label ? { lineIndex, label } : { lineIndex };
}

function sanitizeScriptVoiceFragmentMarker(value: unknown): ScriptVoiceFragmentMarker | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<ScriptVoiceFragmentMarker>;
  const lineIndex = Number(raw.lineIndex);
  if (!Number.isInteger(lineIndex) || lineIndex < 0) return null;
  const speaker = normalizeSpeakerCueName(raw.speaker) || String(raw.speaker || '').trim();
  const mentionedNames = Array.isArray(raw.mentionedNames)
    ? Array.from(
      new Set(
        raw.mentionedNames
          .map((name) => normalizeSpeakerCueName(name) || String(name || '').trim())
          .filter(Boolean),
      ),
    ).slice(0, 12)
    : undefined;
  if (!speaker && (!mentionedNames || mentionedNames.length === 0)) {
    return { lineIndex };
  }
  return {
    lineIndex,
    ...(speaker ? { speaker } : {}),
    ...(mentionedNames && mentionedNames.length > 0 ? { mentionedNames } : {}),
  };
}

function dedupeScriptCharacterLibrary(
  list: ScriptCharacterProfile[] | undefined,
): ScriptCharacterProfile[] | undefined {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  const seen = new Set<string>();
  const next: ScriptCharacterProfile[] = [];

  list.forEach((entry) => {
    if (!entry?.name || seen.has(entry.name)) return;
    seen.add(entry.name);
    next.push(entry);
  });

  return next.length > 0 ? next : undefined;
}

function sanitizeScriptChapterAttributions(
  value: unknown,
): Record<string, ScriptLineAttribution[]> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, list]) => {
      if (!Array.isArray(list)) return null;
      const cleanList = list
        .map((entry) => sanitizeScriptLineAttribution(entry))
        .filter((entry): entry is ScriptLineAttribution => !!entry);
      if (!key || cleanList.length === 0) return null;
      return [key, cleanList] as const;
    })
    .filter((entry): entry is readonly [string, ScriptLineAttribution[]] => !!entry);

  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
}

function sanitizeScriptChapterStructuredLines(
  value: unknown,
): Record<string, ScriptStructuredLineMarker[]> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, list]) => {
      if (!Array.isArray(list)) return null;
      const cleanList = list
        .map((entry) => sanitizeScriptStructuredLineMarker(entry))
        .filter((entry): entry is ScriptStructuredLineMarker => !!entry);
      if (!key || cleanList.length === 0) return null;
      return [key, cleanList] as const;
    })
    .filter((entry): entry is readonly [string, ScriptStructuredLineMarker[]] => !!entry);

  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
}

function sanitizeScriptChapterVoiceFragments(
  value: unknown,
): Record<string, ScriptVoiceFragmentMarker[]> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, list]) => {
      if (!Array.isArray(list)) return null;
      const cleanList = list
        .map((entry) => sanitizeScriptVoiceFragmentMarker(entry))
        .filter((entry): entry is ScriptVoiceFragmentMarker => !!entry);
      if (!key || cleanList.length === 0) return null;
      return [key, cleanList] as const;
    })
    .filter((entry): entry is readonly [string, ScriptVoiceFragmentMarker[]] => !!entry);

  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
}

export const initialWorkbenchDocumentState: WorkbenchDocumentState = {
  documents: [],
  activeDocumentId: null,
};

export function restoreWorkbenchDocumentState(value: unknown): WorkbenchDocumentState {
  if (!value || typeof value !== 'object') return initialWorkbenchDocumentState;
  const raw = value as Partial<WorkbenchDocumentState>;
  const documents = Array.isArray(raw.documents)
    ? raw.documents.map((document) => sanitizeWorkbenchDocument(document)).filter((document): document is WorkbenchDocument => !!document)
    : [];
  const activeDocumentId = typeof raw.activeDocumentId === 'string'
    && documents.some((document) => document.id === raw.activeDocumentId)
    ? raw.activeDocumentId
    : (documents[documents.length - 1]?.id ?? null);

  return {
    documents,
    activeDocumentId,
  };
}

export function createWorkbenchDocument(
  content: string,
  mode: WorkbenchMode,
  title = '',
  language = 'text',
  overrides: Partial<WorkbenchDocument> = {},
): WorkbenchDocument {
  const timestamp = Date.now();

  return {
    id: overrides.id || `canvas_${timestamp}_${Math.random().toString(36).slice(2, 8)}`,
    title: overrides.title || title || 'Untitled',
    artifactType: normalizeWorkbenchArtifactType(overrides.artifactType, mode),
    mode: overrides.mode || mode,
    content: overrides.content ?? content,
    language: overrides.language || language,
    origin: overrides.origin || 'user',
    projectBookId: overrides.projectBookId,
    projectChapterIndex: Number.isInteger(overrides.projectChapterIndex) ? overrides.projectChapterIndex : undefined,
    sourceMessageId: overrides.sourceMessageId,
    explanation: overrides.explanation,
    scriptCharacterLibrary: overrides.scriptCharacterLibrary,
    scriptChapterAttributions: overrides.scriptChapterAttributions,
    scriptChapterStructuredLines: overrides.scriptChapterStructuredLines,
    scriptChapterVoiceFragments: overrides.scriptChapterVoiceFragments,
    status: overrides.status || 'draft',
    version: overrides.version ?? 1,
    createdAt: overrides.createdAt ?? timestamp,
    updatedAt: overrides.updatedAt ?? timestamp,
  };
}

export function inferArtifactType(mode: WorkbenchMode): WorkbenchArtifactType {
  if (mode === 'code') return 'code';
  if (mode === 'html') return 'ui-draft';
  return 'reading';
}

export function workbenchDocumentReducer(
  state: WorkbenchDocumentState,
  command: WorkbenchCommand,
): WorkbenchDocumentState {
  switch (command.type) {
    case 'create': {
      const nextDocument = createWorkbenchDocument(
        command.payload.document.content,
        command.payload.document.mode || 'markdown',
        command.payload.document.title || '',
        command.payload.document.language || 'text',
        command.payload.document,
      );
      return {
        documents: [...state.documents, nextDocument],
        activeDocumentId: nextDocument.id,
      };
    }
    case 'update': {
      return {
        ...state,
        documents: state.documents.map((document) =>
          document.id === command.payload.documentId
            ? (() => {
              const patch = command.payload.patch;
              const nextArtifactType = patch.artifactType !== undefined
                ? normalizeWorkbenchArtifactType(patch.artifactType, patch.mode || document.mode)
                : document.artifactType;
              return {
                ...document,
                ...patch,
                artifactType: nextArtifactType,
                updatedAt: patch.updatedAt ?? Date.now(),
                version: patch.version
                  ?? (patch.content !== undefined ? document.version + 1 : document.version),
              };
            })()
            : document,
        ),
      };
    }
    case 'focus': {
      if (!state.documents.some((document) => document.id === command.payload.documentId)) {
        return state;
      }
      return {
        ...state,
        activeDocumentId: command.payload.documentId,
      };
    }
    case 'delete': {
      const nextDocuments = state.documents.filter((document) => document.id !== command.payload.documentId);
      const nextActiveId = state.activeDocumentId === command.payload.documentId
        ? nextDocuments[nextDocuments.length - 1]?.id ?? null
        : state.activeDocumentId;
      return {
        documents: nextDocuments,
        activeDocumentId: nextActiveId,
      };
    }
    case 'explain': {
      return {
        ...state,
        documents: state.documents.map((document) =>
          document.id === command.payload.documentId
            ? {
                ...document,
                explanation: command.payload.explanation,
                updatedAt: Date.now(),
              }
            : document,
        ),
      };
    }
    default:
      return state;
  }
}
