import { highlightCode } from '../../../utils/codeHighlight';
import type { CanvasRendererPlugin } from './types';

const EXT_MAP: Record<string, string> = {
  javascript: '.js',
  typescript: '.ts',
  python: '.py',
  java: '.java',
  cpp: '.cpp',
  c: '.c',
  rust: '.rs',
  go: '.go',
  php: '.php',
  ruby: '.rb',
  swift: '.swift',
  kotlin: '.kt',
  scala: '.scala',
  css: '.css',
  scss: '.scss',
  less: '.less',
  json: '.json',
  xml: '.xml',
  yaml: '.yaml',
  yml: '.yml',
  sql: '.sql',
  shell: '.sh',
  bash: '.sh',
  powershell: '.ps1',
};

export const codePlugin: CanvasRendererPlugin = {
  id: 'code',
  canRender: (document) => document.mode === 'code',
  render: (document) => (
    <div className="canvas-preview">
      <pre className="canvas-code-preview">
        <code
          className="oct-prism-code"
          dangerouslySetInnerHTML={{
            __html: highlightCode(document.content, document.language || 'text'),
          }}
        />
      </pre>
    </div>
  ),
  getExportFilename: (document) => {
    const ext = document.language ? EXT_MAP[document.language] : '';
    return `canvas${ext || '.txt'}`;
  },
};
