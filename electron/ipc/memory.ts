import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { IpcDeps } from './types';

const GATEWAY_PORT = 18789;
const CONFIG_FILE = path.join(os.homedir(), '.openclaw', 'config.json');

function ensureConfigFile(): void {
  if (fs.existsSync(CONFIG_FILE)) return;
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({}, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[Config] Failed to create config.json:', e);
  }
}

function readAppConfig(): Record<string, any> {
  ensureConfigFile();
  if (!fs.existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

export function registerMemoryHandlers(_deps: IpcDeps) {
  ipcMain.handle('get-memory-summarizer-config', async () => {
    try {
      const { buildMemorySummarizerConfigData } = await import('../config/memorySummarizer');
      const cfg = readAppConfig();
      return {
        success: true,
        data: buildMemorySummarizerConfigData(cfg),
      };
    } catch (e: any) {
      return { success: false, error: e?.message || String(e) };
    }
  });

  ipcMain.handle('save-memory-summarizer-config', async (_: unknown, payload: {
    enabled?: boolean;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
  }) => {
    try {
      const { applyMemorySummarizerConfig } = await import('../config/memorySummarizer');

      ensureConfigFile();
      const cfg = applyMemorySummarizerConfig(readAppConfig(), payload);
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');

      const mainWindow = (globalThis as any).mainWindow;
      const loadOpenClawConfig = (globalThis as any).loadOpenClawConfig;
      const octGatewayProcess = (globalThis as any).octGatewayProcess;
      const expectOctGatewayProcessExit = (v: boolean) => { (globalThis as any).expectOctGatewayProcessExit = v; };
      const waitForPortRelease = (globalThis as any).waitForPortRelease;
      const startOctGateway = (globalThis as any).startOctGateway;
      const connectOpenClaw = (globalThis as any).connectOpenClaw;
      const reconnectRetryCount = (v: number) => { (globalThis as any).reconnectRetryCount = v; };

      loadOpenClawConfig?.();

      const hadGateway = !!(octGatewayProcess && !octGatewayProcess.killed);
      if (hadGateway && octGatewayProcess) {
        expectOctGatewayProcessExit(true);
        try {
          octGatewayProcess.kill('SIGTERM');
        } catch {
          /* ignore */
        }
        (globalThis as any).octGatewayProcess = null;
        mainWindow?.webContents.send('openclaw-log-lines', ['[记忆系统] 摘要模型配置已保存，正在重启 Gateway...']);
        await waitForPortRelease?.(GATEWAY_PORT, 5000);
        await new Promise((r) => setTimeout(r, 500));
        const octResult = await startOctGateway?.();
        if (octResult?.success) {
          reconnectRetryCount?.(0);
          await new Promise((r) => setTimeout(r, 500));
          connectOpenClaw?.();
        }
      }

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || String(e) };
    }
  });

  ipcMain.handle('get-memory-vector-recall-config', async () => {
    try {
      const { buildMemoryVectorRecallConfigData } = await import('../config/vectorRecall');
      const cfg = readAppConfig();
      return {
        success: true,
        data: buildMemoryVectorRecallConfigData(cfg),
      };
    } catch (e: any) {
      return { success: false, error: e?.message || String(e) };
    }
  });

  ipcMain.handle('save-memory-vector-recall-config', async (_: unknown, payload: {
    enabled?: boolean;
    provider?: 'bailian' | 'volcengine' | 'custom';
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    dimensions?: number;
    threshold?: number;
    topK?: number;
  }) => {
    try {
      const { applyMemoryVectorRecallConfig } = await import('../config/vectorRecall');

      ensureConfigFile();
      const cfg = applyMemoryVectorRecallConfig(readAppConfig(), payload);
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');

      const mainWindow = (globalThis as any).mainWindow;
      const loadOpenClawConfig = (globalThis as any).loadOpenClawConfig;
      const octGatewayProcess = (globalThis as any).octGatewayProcess;
      const expectOctGatewayProcessExit = (v: boolean) => { (globalThis as any).expectOctGatewayProcessExit = v; };
      const waitForPortRelease = (globalThis as any).waitForPortRelease;
      const startOctGateway = (globalThis as any).startOctGateway;
      const connectOpenClaw = (globalThis as any).connectOpenClaw;
      const reconnectRetryCount = (v: number) => { (globalThis as any).reconnectRetryCount = v; };

      loadOpenClawConfig?.();

      const hadGateway = !!(octGatewayProcess && !octGatewayProcess.killed);
      if (hadGateway && octGatewayProcess) {
        expectOctGatewayProcessExit(true);
        try {
          octGatewayProcess.kill('SIGTERM');
        } catch {
          /* ignore */
        }
        (globalThis as any).octGatewayProcess = null;
        mainWindow?.webContents.send('openclaw-log-lines', ['[记忆系统] 向量召回配置已保存，正在重启 Gateway...']);
        await waitForPortRelease?.(GATEWAY_PORT, 5000);
        await new Promise((r) => setTimeout(r, 500));
        const octResult = await startOctGateway?.();
        if (octResult?.success) {
          reconnectRetryCount?.(0);
          await new Promise((r) => setTimeout(r, 500));
          connectOpenClaw?.();
        }
      }

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || String(e) };
    }
  });
}
