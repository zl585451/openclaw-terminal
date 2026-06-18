import { registerWindowHandlers } from './window';
import { registerCodeWindowHandlers } from './code-window';
import { registerTerminalHandlers } from './terminal';
import { registerFileDialogHandlers } from './file-dialog';
import { registerGatewayHandlers } from './gateway';
import { registerChatHandlers } from './chat';
import { registerAiLibraryHandlers } from './ai-library';
import { registerAiConfigHandlers } from './ai-config';
import { registerMemoryHandlers } from './memory';
import { registerMcpHandlers } from './mcp';
import { registerMediaHandlers } from './media';
import { registerLogsHandlers } from './logs';
import { registerLibraryHandlers } from './library';
import { registerDeliveryHandlers } from './delivery';
import { registerImageHandlers, type ImageDeps } from './image';
import { registerScriptAdapterHandlers } from './script-adapter';
import type { IpcDeps } from './types';

export type { IpcDeps } from './types';

export function registerAllIpcHandlers(deps: IpcDeps) {
  registerWindowHandlers(deps);
  registerCodeWindowHandlers(deps);
  registerTerminalHandlers(deps);
  registerFileDialogHandlers(deps);
  registerGatewayHandlers(deps);
  registerChatHandlers(deps);
  registerAiLibraryHandlers(deps);
  registerAiConfigHandlers(deps);
  registerMemoryHandlers(deps);
  registerMcpHandlers(deps);
  registerMediaHandlers(deps);
  registerLogsHandlers(deps);
  registerLibraryHandlers(deps);
  registerDeliveryHandlers(deps);
  registerImageHandlers(deps as ImageDeps);
  registerScriptAdapterHandlers(deps);
}

export { registerWindowHandlers } from './window';
export { registerCodeWindowHandlers } from './code-window';
export { registerTerminalHandlers } from './terminal';
export { registerFileDialogHandlers } from './file-dialog';
export { registerGatewayHandlers } from './gateway';
export { registerChatHandlers } from './chat';
export { registerAiLibraryHandlers } from './ai-library';
export { registerAiConfigHandlers } from './ai-config';
export { registerMemoryHandlers } from './memory';
export { registerMcpHandlers } from './mcp';
export { registerMediaHandlers } from './media';
export { registerLogsHandlers } from './logs';
export { registerLibraryHandlers } from './library';
export { registerDeliveryHandlers } from './delivery';
export { registerImageHandlers } from './image';
export { registerScriptAdapterHandlers } from './script-adapter';
