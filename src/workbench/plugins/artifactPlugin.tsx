import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import ReactMarkdown from 'react-markdown';
import type { WorkbenchDocument } from '../types';
import type { WorkbenchRendererPlugin } from './types';
import { markdownComponents } from '../../ui/chat/markdownComponents';
import { TextSelectionPolishLayer } from './TextSelectionPolishLayer';

function ArtifactEditor({ document }: { document: WorkbenchDocument }) {
  return (
    <div className="artifact-reader-shell">
      <TextSelectionPolishLayer
        document={document}
        className="artifact-reader markdown-body"
        discussLabel="artifact"
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={markdownComponents}
        >
          {document.content}
        </ReactMarkdown>
      </TextSelectionPolishLayer>
    </div>
  );
}

export const artifactPlugin: WorkbenchRendererPlugin = {
  id: 'artifact',
  canRender: (document) => document.artifactType === 'artifact',
  render: (document) => <ArtifactEditor document={document} />,
  getExportFilename: (document) =>
    `${document.title.replace(/\s+/g, '-').toLowerCase() || 'artifact'}.md`,
};
