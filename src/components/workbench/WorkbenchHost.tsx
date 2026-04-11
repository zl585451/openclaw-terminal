import WorkbenchPanel from './WorkbenchPanel';
import { useWorkbench } from '../../workbench/WorkbenchContext';
import '../canvas/CanvasHost.css';

interface WorkbenchHostProps {
  enabled?: boolean;
}

export default function WorkbenchHost({ enabled = true }: WorkbenchHostProps) {
  const workbench = useWorkbench();
  if (!enabled) return null;

  return (
    <div className={`canvas-host-drawer${workbench.isOpen ? ' canvas-host-drawer--open' : ''}`}>
      <div className="canvas-host-drawer-shadow" aria-hidden />
      <WorkbenchPanel />
    </div>
  );
}
