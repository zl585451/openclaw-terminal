import { ipcMain } from 'electron';
import type { IpcDeps } from './types';

const TASKS_FILE_PATH = 'TASKS_FILE_PATH_PLACEHOLDER';

interface TaskItem {
  id: string;
  content: string;
  priority: 'p0' | 'p1' | 'p2';
  done: boolean;
  source: 'amy' | 'user';
  createdAt: string;
}

interface TasksData {
  tasks: TaskItem[];
  parking: TaskItem[];
  intention: string;
  updatedAt: string;
}

function normalizeTaskContent(content: string): string {
  return String(content || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function isLikelyDuplicateTaskContent(a: string, b: string): boolean {
  const left = normalizeTaskContent(a);
  const right = normalizeTaskContent(b);
  if (!left || !right) return false;
  if (left === right) return true;

  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  if (shorter.length < 4) return false;

  return longer.includes(shorter) && longer.length - shorter.length <= 16;
}

function dedupeTaskItems(tasks: TaskItem[]): TaskItem[] {
  const deduped: TaskItem[] = [];
  for (const task of tasks || []) {
    const duplicate = deduped.find(existing => {
      if (!!existing.done !== !!task.done) return false;
      return isLikelyDuplicateTaskContent(existing.content, task.content);
    });
    if (!duplicate) deduped.push(task);
  }
  return deduped;
}

export function registerTasksHandlers(_deps: IpcDeps) {
  const fs = require('fs');
  const path = require('path');
  const app = require('electron').app;

  const getTasksFilePath = () => path.join(app.getPath('userData'), 'tasks.json');

  function loadTasksData(): TasksData {
    const filePath = getTasksFilePath();
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);
        return {
          tasks: data.tasks || [],
          parking: data.parking || [],
          intention: data.intention || '',
          updatedAt: data.updatedAt || '',
        };
      }
    } catch (e) {
      console.error('[TasksLocal] 加载失败:', e);
    }
    return { tasks: [], parking: [], intention: '', updatedAt: '' };
  }

  function saveTasksData(data: TasksData): boolean {
    try {
      data.updatedAt = new Date().toISOString();
      const filePath = getTasksFilePath();
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.error('[TasksLocal] 保存失败:', e);
      return false;
    }
  }

  const notifyTaskBoardUpdate = () => {
    const mainWindow = (globalThis as any).mainWindow;
    mainWindow?.webContents.send('task-board-update');
    mainWindow?.webContents.executeJavaScript('window.dispatchEvent(new Event("tasks-updated"))').catch(() => {});
  };

  ipcMain.handle('tasks-read', async () => {
    const filePath = getTasksFilePath();
    try {
      console.log('[TasksLocal] tasks-read filePath:', filePath);
    } catch {}
    if (!fs.existsSync(filePath)) {
      return { tasks: [], parking: [], intention: '', updatedAt: '' };
    }
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const dedupedTasks = dedupeTaskItems(raw.tasks || []);
    try {
      console.log('[TasksLocal] tasks-read counts:', {
        tasks: Array.isArray(raw?.tasks) ? raw.tasks.length : 0,
        dedupedTasks: dedupedTasks.length,
        parking: Array.isArray(raw?.parking) ? raw.parking.length : 0,
        updatedAt: raw?.updatedAt || '',
      });
    } catch {}
    return {
      tasks: dedupedTasks,
      parking: raw.parking || [],
      intention: raw.intention || '',
      updatedAt: raw.updatedAt || '',
    };
  });

  ipcMain.handle('tasks-write', async (_: unknown, data: { tasks: TaskItem[]; parking: any[]; intention?: string }) => {
    const filePath = getTasksFilePath();
    const payload = {
      tasks: dedupeTaskItems(data.tasks || []),
      parking: data.parking || [],
      intention: data.intention || '',
      updatedAt: new Date().toISOString(),
    };
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
    notifyTaskBoardUpdate();
    return { ok: true };
  });

  ipcMain.handle('tasks-add', async (_: unknown, { content, priority, source }: {
    content: string;
    priority: 'p0' | 'p1' | 'p2';
    source: 'amy' | 'user';
  }) => {
    const data = loadTasksData();
    const duplicate = (data.tasks || []).find(t => !t.done && isLikelyDuplicateTaskContent(t.content, content));
    if (duplicate) {
      return { ok: true, taskId: duplicate.id, deduped: true };
    }
    const newTask: TaskItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      content: content.trim(),
      priority,
      done: false,
      source,
      createdAt: new Date().toISOString(),
    };
    data.tasks.push(newTask);
    if (saveTasksData(data)) {
      notifyTaskBoardUpdate();
      return { ok: true, taskId: newTask.id };
    }
    return { ok: false, error: '保存失败' };
  });

  ipcMain.handle('tasks-update', async (_: unknown, { taskId, updates }: {
    taskId: string;
    updates: Partial<Pick<TaskItem, 'done' | 'content' | 'priority'>>;
  }) => {
    const data = loadTasksData();
    const idx = data.tasks.findIndex(t => t.id === taskId);
    if (idx === -1) return { ok: false, error: '任务不存在' };

    data.tasks[idx] = { ...data.tasks[idx], ...updates };
    if (saveTasksData(data)) {
      notifyTaskBoardUpdate();
      return { ok: true };
    }
    return { ok: false, error: '保存失败' };
  });

  ipcMain.handle('tasks-delete', async (_: unknown, { taskId }: { taskId: string }) => {
    const data = loadTasksData();
    const originalLen = data.tasks.length;
    data.tasks = data.tasks.filter(t => t.id !== taskId);
    if (data.tasks.length === originalLen) {
      return { ok: false, error: '任务不存在' };
    }
    if (saveTasksData(data)) {
      notifyTaskBoardUpdate();
      return { ok: true };
    }
    return { ok: false, error: '保存失败' };
  });

  ipcMain.handle('tasks-clear-completed', async () => {
    const data = loadTasksData();
    const completedCount = data.tasks.filter(t => t.done).length;
    data.tasks = data.tasks.filter(t => !t.done);
    if (saveTasksData(data)) {
      notifyTaskBoardUpdate();
      return { ok: true, cleared: completedCount };
    }
    return { ok: false, error: '保存失败' };
  });

  ipcMain.handle('tasks-set-intention', async (_: unknown, { intention }: { intention: string }) => {
    const data = loadTasksData();
    data.intention = intention;
    if (saveTasksData(data)) {
      return { ok: true };
    }
    return { ok: false, error: '保存失败' };
  });

  ipcMain.handle('tasks-parking-add', async (_: unknown, { content }: { content: string }) => {
    const data = loadTasksData();
    const newItem: TaskItem = {
      id: `${Date.now()}`,
      content: content.trim(),
      priority: 'p2',
      done: false,
      source: 'amy',
      createdAt: new Date().toISOString(),
    };
    data.parking.push(newItem);
    if (saveTasksData(data)) {
      return { ok: true, itemId: newItem.id };
    }
    return { ok: false, error: '保存失败' };
  });

  ipcMain.handle('tasks-parking-remove', async (_: unknown, { itemId }: { itemId: string }) => {
    const data = loadTasksData();
    data.parking = data.parking.filter(p => p.id !== itemId);
    if (saveTasksData(data)) {
      return { ok: true };
    }
    return { ok: false, error: '保存失败' };
  });
}