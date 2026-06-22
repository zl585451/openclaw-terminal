import React, { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { getCachedPreprocessedMarkdown, stabilizeStreamingMarkdown } from '../../utils/markdownPreprocess';
import { limitChatMermaidBlocks } from './messageListHelpers';

const MARKDOWN_REMARK_PLUGINS = [remarkGfm, remarkMath];
const MARKDOWN_REHYPE_PLUGINS = [rehypeKatex];

/** 流式结束后的正文：预处理 + ReactMarkdown，结果按 messageId+段键缓存 */
const FinalizedMarkdownContent = memo(
  function FinalizedMarkdownContent({
    messageId,
    segmentKey,
    content,
    markdownComponents,
    streaming = false,
  }: {
    messageId: number;
    segmentKey?: string;
    content: string;
    markdownComponents: React.ComponentProps<typeof ReactMarkdown>['components'];
    /** 与 segmentKey 解耦：流式时 segmentKey 需与结束后一致，用此标志跳过预处理 */
    streaming?: boolean;
  }) {
    const processedText = useMemo(
      () => {
        // 流式阶段跳过 preprocessMarkdown：
        // 1. 流式内容每帧都变，无法命中缓存，每帧都重算开销高
        // 2. 表格从 |---| 文本变成 <table> DOM 时结构突变，造成跳动
        // 流式阶段 remark-gfm 已能渲染大部分 markdown，不需要预处理
        // 但仍需转换 [echart]/[canvas] 标签，并临时闭合未完成代码围栏，避免半截 fence
        // 在 token 到达过程中反复改变 ReactMarkdown 的块级结构。
        if (streaming || segmentKey?.includes('stream')) {
          return stabilizeStreamingMarkdown(content || '');
        }
        return limitChatMermaidBlocks(
          getCachedPreprocessedMarkdown(messageId, segmentKey, content || '')
        );
      },
      [messageId, segmentKey, content, streaming]
    );
    return (
      <div className="msg-content markdown-body">
        <ReactMarkdown
          remarkPlugins={MARKDOWN_REMARK_PLUGINS}
          rehypePlugins={MARKDOWN_REHYPE_PLUGINS}
          components={markdownComponents}
        >
          {processedText}
        </ReactMarkdown>
      </div>
    );
  },
  (prev, next) =>
    prev.messageId === next.messageId &&
    prev.segmentKey === next.segmentKey &&
    prev.content === next.content &&
    prev.streaming === next.streaming &&
    prev.markdownComponents === next.markdownComponents
);

export default FinalizedMarkdownContent;
