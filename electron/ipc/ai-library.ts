import { ipcMain } from 'electron';
import type { AiLibraryPluginPayload, IpcDeps } from './types';

export function registerAiLibraryHandlers(deps: IpcDeps) {
  ipcMain.handle('get-ai-library-plugin', async () => deps.getAiLibraryPlugin());

  ipcMain.handle('save-ai-library-plugin', async (_event: unknown, payload: AiLibraryPluginPayload) => {
    return deps.saveAiLibraryPlugin(payload || {});
  });
}
