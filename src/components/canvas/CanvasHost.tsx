import CanvasPanel from '../CanvasPanel';
import { useCanvas } from '../../contexts/CanvasContext';
import './CanvasHost.css';

interface CanvasHostProps {
  enabled?: boolean;
}

export default function CanvasHost({ enabled = true }: CanvasHostProps) {
  const canvas = useCanvas();
  if (!enabled) return null;

  return (
    <div className={`canvas-host-drawer${canvas.isOpen ? ' canvas-host-drawer--open' : ''}`}>
      <div className="canvas-host-drawer-shadow" aria-hidden />
      <CanvasPanel />
    </div>
  );
}
