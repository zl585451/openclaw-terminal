import { Suspense } from 'react';
import MermaidRenderer from './MermaidRenderer';

export default function MermaidRendererLazy(props: { content: string; compact?: boolean }) {
  return (
    <Suspense fallback={<div className="oct-mm-loading">Loading diagram...</div>}>
      <MermaidRenderer {...props} />
    </Suspense>
  );
}
