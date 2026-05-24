import { Suspense, lazy } from 'react';

const EChartsRenderer = lazy(() => import('./EChartsRenderer'));

export default function EChartsRendererLazy(props: { content: string }) {
  return (
    <Suspense fallback={<div className="oct-ec-loading">Loading chart...</div>}>
      <EChartsRenderer {...props} />
    </Suspense>
  );
}
