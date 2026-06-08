import { Suspense } from 'react';
import type { WorkbenchDocument } from '../../types';
import ScriptViewer from './ScriptViewer';

export default function ScriptViewerLazy({ document }: { document: WorkbenchDocument }) {
  return (
    <Suspense fallback={<div className="oct-script-loading">Loading script...</div>}>
      <ScriptViewer document={document} />
    </Suspense>
  );
}
