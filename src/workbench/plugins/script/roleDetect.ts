import type { ScriptLine } from '../../../utils/scriptParser';
import type {
  ScriptCharacterProfile,
  ScriptLineAttribution,
  ScriptStructuredLineMarker,
  ScriptVoiceFragmentMarker,
} from '../../types';

export interface RoleDetectCandidateLine {
  lineIndex: number;
  text: string;
}

export interface RoleDetectStructuredCandidate extends RoleDetectCandidateLine {
  label: string;
}

export interface RoleDetectAttributedLine extends RoleDetectCandidateLine {
  speaker: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface RoleDetectPanelResult {
  chapterTitle: string;
  recognizedRoles: ScriptCharacterProfile[];
  attributedLines: RoleDetectAttributedLine[];
  structuredLines: RoleDetectStructuredCandidate[];
  voiceFragmentLines: Array<RoleDetectCandidateLine & { speaker?: string; mentionedNames?: string[] }>;
  unresolvedLines: RoleDetectCandidateLine[];
}

export function extractQuoteCandidateLines(lines: ScriptLine[]): RoleDetectCandidateLine[] {
  return lines
    .map((line, lineIndex) => ({ line, lineIndex }))
    .filter(({ line }) => line.type === 'text' && /“[^”]+”/.test(String(line.raw || line.content || '')))
    .map(({ line, lineIndex }) => ({
      lineIndex,
      text: String(line.raw || line.content || '').trim(),
    }))
    .filter((entry) => entry.text);
}

export function extractStructuredRecordCandidates(lines: ScriptLine[]): RoleDetectStructuredCandidate[] {
  return lines
    .map((line, lineIndex) => ({ line, lineIndex }))
    .filter(({ line }) =>
      line.type === 'dialogue'
      && !!String(line.character || '').trim()
      && !!String(line.content || line.raw || '').trim())
    .map(({ line, lineIndex }) => ({
      lineIndex,
      label: String(line.character || '').trim(),
      text: String(line.raw || line.content || '').trim(),
    }))
    .filter((entry) => entry.label && entry.text)
    .slice(0, 80);
}

export function buildRoleDetectPanelResult(args: {
  chapterTitle: string;
  roleLibrary: ScriptCharacterProfile[];
  candidateLines: RoleDetectCandidateLine[];
  structuredCandidates: RoleDetectStructuredCandidate[];
  attributions: ScriptLineAttribution[];
  structuredLines: ScriptStructuredLineMarker[];
  voiceFragments: ScriptVoiceFragmentMarker[];
}): RoleDetectPanelResult {
  const attributionMap = new Map<number, ScriptLineAttribution>();
  args.attributions.forEach((entry) => {
    attributionMap.set(entry.lineIndex, entry);
  });
  const structuredLineMap = new Map<number, ScriptStructuredLineMarker>();
  args.structuredLines.forEach((entry) => {
    structuredLineMap.set(entry.lineIndex, entry);
  });
  const voiceFragmentMap = new Map<number, ScriptVoiceFragmentMarker>();
  args.voiceFragments.forEach((entry) => {
    voiceFragmentMap.set(entry.lineIndex, entry);
  });

  const recognizedRoleNames = new Set(args.attributions.map((entry) => entry.speaker));
  const recognizedRoles = args.roleLibrary.filter((role) => recognizedRoleNames.has(role.name));
  const structuredLines = args.structuredCandidates.filter((candidate) => structuredLineMap.has(candidate.lineIndex));
  const voiceFragmentLines = args.candidateLines
    .filter((candidate) => voiceFragmentMap.has(candidate.lineIndex))
    .map((candidate) => ({
      ...candidate,
      speaker: voiceFragmentMap.get(candidate.lineIndex)?.speaker,
      mentionedNames: voiceFragmentMap.get(candidate.lineIndex)?.mentionedNames,
    }));

  const attributedLines: RoleDetectAttributedLine[] = [];
  const unresolvedLines: RoleDetectCandidateLine[] = [];

  args.candidateLines.forEach((candidate) => {
    if (voiceFragmentMap.has(candidate.lineIndex)) return;
    const attribution = attributionMap.get(candidate.lineIndex);
    if (attribution) {
      attributedLines.push({
        ...candidate,
        speaker: attribution.speaker,
        confidence: attribution.confidence || 'medium',
      });
    } else {
      unresolvedLines.push(candidate);
    }
  });

  return {
    chapterTitle: args.chapterTitle,
    recognizedRoles,
    attributedLines,
    structuredLines,
    voiceFragmentLines,
    unresolvedLines,
  };
}
