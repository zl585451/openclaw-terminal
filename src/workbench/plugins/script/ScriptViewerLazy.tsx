import { Suspense, lazy } from 'react';
import type { WorkbenchDocument } from '../../types';

const ScriptViewer = lazy(() => import('./ScriptViewer'));

export default function ScriptViewerLazy({ document }: { document: WorkbenchDocument }) {
  return (
    <Suspense fallback={<div className="oct-script-loading">Loading script...</div>}>
      <ScriptViewer document={document} />
    </Suspense>
  );
}
