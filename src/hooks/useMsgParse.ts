import type { ChatMessage } from '../ui/chat/chatTypes';
import { parseOptionBox, type OptionItem, type RenderSegment } from '../utils/optionBoxParser';
import { extractAssistantCotAndMain, hasAssistantCotMarkers, stripLeakedToolCallSections, stripTextToolAnnotations } from '../utils/cotExtract';
import { blockRouter } from '../core/blockRouter';
import { blocksToSegments } from '../core/blockAdapter';
import { renderBlocksCacheKey, renderBlocksToParsedContent } from '../ui/chat/renderBlocksAdapter';
import React from 'react';

const STABLE_EMPTY_OPTIONS: OptionItem[] = [];
const USER_ROW_PARSE_PLACEHOLDER = {
  text: '',
  options: STABLE_EMPTY_OPTIONS,
  totalPages: undefined as number | undefined,
  isTaskList: false,
  isReflectiveQuestions: false,
  forcePills: undefined as boolean | undefined,
  segments: undefined as RenderSegment[] | undefined,
};

export function useMsgParse(params: {
  msg: ChatMessage;
  isStreamingMsg: boolean;
  streamingContent: string;
  displayedText: string;
  allowCotDisplay: boolean;
  usePlainStreamingText: boolean;
  streamingParseCacheRef: React.MutableRefObject<{ input: string; output: ReturnType<typeof parseOptionBox> } | null>;
  finalizedParseCacheRef: React.MutableRefObject<Map<number, { input: string; output: ReturnType<typeof parseOptionBox> }>>;
}): {
  textToShow: string;
  cotContent: string | null;
  cotStarted: boolean;
  optionsToShow: OptionItem[];
  totalPages: number | undefined;
  isTaskList: boolean;
  isReflectiveQuestions: boolean;
  forcePills: boolean | undefined;
  segments: RenderSegment[] | undefined;
  raw: string;
} {
  const {
    msg,
    isStreamingMsg,
    streamingContent,
    displayedText,
    allowCotDisplay,
    usePlainStreamingText,
    streamingParseCacheRef,
    finalizedParseCacheRef,
  } = params;

  const raw = typeof msg.content === 'string'
    ? msg.content
    : String((msg.content as any)?.text ?? (msg.content as any)?.content ?? msg.content ?? '');

  const fullContent =
    isStreamingMsg
      ? (
          (msg.isStreamingRaw && raw.trim())
            ? raw
            : (streamingContent || raw)
        )
      : raw;

  const fullForCot =
    msg.role === 'assistant' && fullContent ? stripLeakedToolCallSections(fullContent) : fullContent;
  const displayedLength = displayedText.length;

  const { cotContent: streamingCotContent, cotStarted: streamingCotStarted, mainContent: mainTextFull } =
    allowCotDisplay && msg.role === 'assistant' && fullForCot
      ? !hasAssistantCotMarkers(fullForCot)
        ? { cotContent: null, cotStarted: false, mainContent: stripTextToolAnnotations(fullForCot) }
        : extractAssistantCotAndMain(fullForCot)
      : { cotContent: null, cotStarted: false, mainContent: fullContent };
  const display = isStreamingMsg ? mainTextFull.slice(0, displayedLength) : mainTextFull;
  const shouldBypassStreamingParse =
    usePlainStreamingText && msg.role === 'assistant' && isStreamingMsg;

  const parsed =
    msg.role === 'user'
      ? USER_ROW_PARSE_PLACEHOLDER
      : msg.role === 'assistant'
        ? (() => {
            if (shouldBypassStreamingParse) {
              return {
                text: display,
                options: STABLE_EMPTY_OPTIONS,
                totalPages: undefined,
                isTaskList: false,
                isReflectiveQuestions: false,
                forcePills: undefined,
                segments: undefined,
              };
            }
            const fc = typeof fullContent === 'string' ? fullContent : '';
            const cotStrippedContent = streamingCotContent !== null
              ? mainTextFull
              : fc;
            if (isStreamingMsg) {
              const cached = streamingParseCacheRef.current;
              if (cached && cached.input === cotStrippedContent) return cached.output;
              const blocks = blockRouter(cotStrippedContent);
              const bridgedText = blocksToSegments(blocks).map((s) => s.content).join('');
              const result = parseOptionBox(bridgedText);
              streamingParseCacheRef.current = { input: cotStrippedContent, output: result };
              return result;
            }
            const { mainContent: nonStreamingCotStripped } = extractAssistantCotAndMain(fc);
            const cachedFinal = finalizedParseCacheRef.current.get(msg.id);
            const cacheInput = renderBlocksCacheKey(nonStreamingCotStripped, msg.renderBlocks);
            if (cachedFinal && cachedFinal.input === cacheInput) {
              return cachedFinal.output;
            }
            let finalParsed;
            if (msg.renderBlocks && msg.renderBlocks.length > 0) {
              finalParsed = renderBlocksToParsedContent(msg.renderBlocks);
            } else {
              const blocks = blockRouter(nonStreamingCotStripped);
              const bridgedText = blocksToSegments(blocks).map((s) => s.content).join('');
              finalParsed = parseOptionBox(bridgedText);
            }
            finalizedParseCacheRef.current.set(msg.id, {
              input: cacheInput,
              output: finalParsed,
            });
            return finalParsed;
          })()
        : {
            text: display,
            options: STABLE_EMPTY_OPTIONS,
            totalPages: undefined,
            isTaskList: false,
            isReflectiveQuestions: false,
            forcePills: undefined,
            segments: undefined,
          };

  const textToShow = msg.role === 'assistant'
    ? isStreamingMsg
      ? (display as string)
      : parsed.text?.trim()
        ? parsed.text
        : mainTextFull
    : (display as string);

  return {
    textToShow,
    cotContent: streamingCotContent,
    cotStarted: streamingCotStarted,
    optionsToShow: parsed.options,
    totalPages: parsed.totalPages,
    isTaskList: !!parsed.isTaskList,
    isReflectiveQuestions: !!parsed.isReflectiveQuestions,
    forcePills: parsed.forcePills,
    segments: parsed.segments,
    raw,
  };
}
