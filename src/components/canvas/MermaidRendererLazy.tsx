import { Suspense, lazy } from 'react';

const MermaidRenderer = lazy(() => import('./MermaidRenderer'));

export default function MermaidRendererLazy(props: { content: string; compact?: boolean }) {
  return (
    <Suspense fallback={<div className="oct-mm-loading">Loading diagram...</div>}>
      <MermaidRenderer {...props} />
    </Suspense>
  );
}
