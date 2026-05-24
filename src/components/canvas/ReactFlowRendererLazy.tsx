import { Suspense, lazy } from 'react';

const ReactFlowRenderer = lazy(() => import('./ReactFlowRenderer'));

export default function ReactFlowRendererLazy(props: { content: string }) {
  return (
    <Suspense fallback={<div className="oct-rf-loading">Loading graph...</div>}>
      <ReactFlowRenderer {...props} />
    </Suspense>
  );
}
