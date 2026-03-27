import { blockRouter } from './blockRouter';
import { blocksToSegments } from './blockAdapter';

/**
 * Incremental bridge: model batches → accumulated raw → block pipeline → bridged text for parseOptionBox.
 */
export class BlockIngest {
  private acc = '';

  ingest(batch: string): void {
    if (batch) this.acc += batch;
  }

  getAccumulatedRaw(): string {
    return this.acc;
  }

  getBridgedText(): string {
    if (!this.acc) return '';
    const blocks = blockRouter(this.acc);
    return blocksToSegments(blocks).map((s) => s.content).join('');
  }

  reset(): void {
    this.acc = '';
  }
}
