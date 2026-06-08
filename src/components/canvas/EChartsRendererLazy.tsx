import { Suspense } from 'react';
import EChartsRenderer from './EChartsRenderer';

export default function EChartsRendererLazy(props: { content: string }) {
  return (
    <Suspense fallback={<div className="oct-ec-loading">Loading chart...</div>}>
      <EChartsRenderer {...props} />
    </Suspense>
  );
}
