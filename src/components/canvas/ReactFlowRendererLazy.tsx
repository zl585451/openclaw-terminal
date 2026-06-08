import { Suspense } from 'react';
import ReactFlowRenderer from './ReactFlowRenderer';

export default function ReactFlowRendererLazy(props: { content: string }) {
  return (
    <Suspense fallback={<div className="oct-rf-loading">Loading graph...</div>}>
      <ReactFlowRenderer {...props} />
    </Suspense>
  );
}
