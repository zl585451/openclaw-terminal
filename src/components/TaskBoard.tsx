import React, { useState, useEffect, useCallback, useRef } from 'react';
import '../styles/TaskBoard.css';

const ipcRenderer =
  typeof window !== 'undefined' && typeof (window as any).require === 'function'
    ? (window as any).require('electron').ipcRenderer
    : {
        invoke: () => Promise.resolve(null),
        on: () => {},
        off: () => {},
        removeListener: () => {},
      };

export interface TaskItem {
  id: string;
  content: string;
  priority: 'p0' | 'p1' | 'p2' | 'none';
  done: boolean;
  archived?: boolean;
  source: 'amy' | 'user';
  createdAt: string;
}

interface ParkingItem {
  id: string;
  content: string;
  createdAt?: string;
}

interface TaskBoardProps {
  visible?: boolean;
  onClose?: () => void;
  compact?: boolean;
}

// OCT 主题色
const THEME = {
  primaryBg: '#0a0a0a',
  panelBg: '#1a1a1a',
  borderColor: '#2a2a2a',
  accentGreen: '#00ff88',
  textPrimary: '#e0e0e0',
  textSecondary: '#888888',
  redWarning: '#ff4444',
  p0Color: '#ff4444',
  p1Color: '#ffaa00',
  p2Color: '#00ff88',
};

// 优先级配置
const PRIORITY_CONFIG: Record<string, { color: string; label: string }> = {
  p0: { color: THEME.p0Color, label: 'P0' },
  p1: { color: THEME.p1Color, label: 'P1' },
  p2: { color: THEME.p2Color, label: 'P2' },
  none: { color: THEME.textSecondary, label: '无' },
};

const PRIORITY_ORDER = ['p0', 'p1', 'p2', 'none'] as const;

const TASKS_PER_PAGE = 5;

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr);
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const wd = weekdays[d.getDay()];
  return `${y}-${m}-${day} ${wd}`;
}

const TaskBoard: React.FC<TaskBoardProps> = ({ visible = true, onClose, compact = false }) => {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [parkingLot, setParkingLot] = useState<ParkingItem[]>([]);
  const [intention, setIntention] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [quickInput, setQuickInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 持久化当前状态到 userData/tasks.json
  const persistTasks = useCallback(async (nextTasks: TaskItem[], nextParking: ParkingItem[], nextIntention?: string) => {
    const payload = {
      tasks: nextTasks.map(t => ({
        id: t.id,
        content: t.content,
        priority: t.priority === 'none' ? 'p2' : t.priority,
        done: t.done,
        source: t.source,
        createdAt: t.createdAt,
      })),
      parking: nextParking.map(p => ({ id: p.id, content: p.content, createdAt: p.createdAt })),
      intention: nextIntention ?? intention,
    };
    await ipcRenderer.invoke('tasks-write', payload);
  }, [intention]);

  // 加载任务数据（tasks-read 直接返回 { tasks, parking, intention, updatedAt }）
  const loadTasks = useCallback(async () => {
    try {
      const data = await ipcRenderer.invoke('tasks-read');
      try {
        console.log('[TaskBoard] tasks-read result counts:', {
          tasks: Array.isArray(data?.tasks) ? data.tasks.length : 0,
          parking: Array.isArray(data?.parking) ? data.parking.length : 0,
          updatedAt: data?.updatedAt || '',
        });
      } catch {}
      const taskList = (data?.tasks || []).map((t: any) => ({
        id: t.id,
        content: t.content,
        priority: (t.priority || 'p2').toLowerCase() as 'p0' | 'p1' | 'p2' | 'none',
        done: t.done || false,
        archived: false,
        source: t.source || 'user',
        createdAt: t.createdAt || '',
      }));
      taskList.sort((a: TaskItem, b: TaskItem) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        const order = { p0: 0, p1: 1, p2: 2, none: 3 };
        return (order[a.priority] ?? 2) - (order[b.priority] ?? 2);
      });
      setTasks(taskList);
      setIntention(data?.intention || '');
      setParkingLot((data?.parking || []).map((p: any) => ({ id: p.id, content: p.content, createdAt: p.createdAt })));
    } catch (e) {
      console.error('[TaskBoard] 加载失败:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // 初始加载 + 定时刷新
  useEffect(() => {
    loadTasks();
    refreshTimerRef.current = setInterval(loadTasks, 60000);
    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [loadTasks]);

  // 监听任务更新事件
  useEffect(() => {
    const onTaskUpdate = () => loadTasks();
    ipcRenderer.on('task-board-update', onTaskUpdate);
    window.addEventListener('tasks-updated', onTaskUpdate);
    return () => {
      ipcRenderer.removeListener('task-board-update', onTaskUpdate);
      window.removeEventListener('tasks-updated', onTaskUpdate);
    };
  }, [loadTasks]);

  // 切换任务完成状态
  const toggleTask = useCallback(async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const newDone = !task.done;
    const nextTasks = tasks.map(t => t.id === taskId ? { ...t, done: newDone } : t);
    setTasks(nextTasks);
    try {
      await persistTasks(nextTasks, parkingLot);
    } catch (e) {
      console.error('[TaskBoard] 更新任务失败:', e);
      loadTasks();
    }
  }, [tasks, parkingLot, persistTasks, loadTasks]);

  // 切换优先级
  const cyclePriority = useCallback(async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const currentIdx = PRIORITY_ORDER.indexOf(task.priority as any);
    const nextPriority = PRIORITY_ORDER[(currentIdx + 1) % PRIORITY_ORDER.length];
    const nextTasks = tasks.map(t => t.id === taskId ? { ...t, priority: nextPriority } : t);
    setTasks(nextTasks);
    try {
      await persistTasks(nextTasks, parkingLot);
    } catch (e) {
      console.error('[TaskBoard] 更新优先级失败:', e);
      loadTasks();
    }
  }, [tasks, parkingLot, persistTasks, loadTasks]);

  // 删除任务（带确认：点击删除按钮展开确认条，需点「确认」才真正删除）
  const deleteTask = useCallback(async (taskId: string) => {
    const nextTasks = tasks.filter(t => t.id !== taskId);
    setTasks(nextTasks);
    setDeleteConfirmId(null);
    // 删除后重置页码，避免停留在不存在的页
    setCurrentPage(1);
    try {
      await persistTasks(nextTasks, parkingLot);
    } catch (e) {
      console.error('[TaskBoard] 删除任务失败:', e);
      loadTasks();
    }
  }, [tasks, parkingLot, persistTasks, loadTasks]);

  // 快速添加任务
  const handleQuickAdd = useCallback(async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const text = quickInput.trim();
    if (!text) return;
    const newTask: TaskItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      content: text,
      priority: 'p2',
      done: false,
      source: 'user',
      createdAt: new Date().toISOString(),
    };
    const nextTasks = [newTask, ...tasks];
    setTasks(nextTasks);
    setQuickInput('');
    try {
      await persistTasks(nextTasks, parkingLot);
    } catch (e) {
      console.error('[TaskBoard] 添加任务失败:', e);
    }
  }, [quickInput, tasks, parkingLot, persistTasks]);

  // 升级停车场项为任务（移入任务列表，从停车场移除）
  const promoteToTask = useCallback(async (item: ParkingItem) => {
    const newTask: TaskItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      content: item.content,
      priority: 'p2',
      done: false,
      source: 'user',
      createdAt: item.createdAt || new Date().toISOString(),
    };
    const nextTasks = [newTask, ...tasks];
    const nextParking = parkingLot.filter(p => p.id !== item.id);
    setTasks(nextTasks);
    setParkingLot(nextParking);
    try {
      await persistTasks(nextTasks, nextParking);
    } catch (e) {
      console.error('[TaskBoard] 升为任务失败:', e);
      loadTasks();
    }
  }, [tasks, parkingLot, persistTasks, loadTasks]);

  // 移除停车场项
  const removeParkingItem = useCallback(async (itemId: string) => {
    const nextParking = parkingLot.filter(p => p.id !== itemId);
    setParkingLot(nextParking);
    try {
      await persistTasks(tasks, nextParking);
    } catch (e) {
      console.error('[TaskBoard] 移除停车场项失败:', e);
      loadTasks();
    }
  }, [tasks, parkingLot, persistTasks, loadTasks]);

  // 当待办数量变化（完成/删除/加载）时，自动校正页码到合法范围
  useEffect(() => {
    const pendingCount = tasks.filter(t => !t.done).length;
    const nextTotalPages = Math.ceil(pendingCount / TASKS_PER_PAGE) || 1;
    setCurrentPage((p) => {
      if (p < 1) return 1;
      if (p > nextTotalPages) return 1;
      return p;
    });
  }, [tasks]);

  if (!visible) return null;

  // 分页计算
  const pendingTasks = tasks.filter(t => !t.done);
  const completedTasks = tasks.filter(t => t.done);
  const totalPages = Math.ceil(pendingTasks.length / TASKS_PER_PAGE) || 1;
  const startIndex = (currentPage - 1) * TASKS_PER_PAGE;
  const visibleTasks = pendingTasks.slice(startIndex, startIndex + TASKS_PER_PAGE);

  const doneCount = completedTasks.length;
  const totalCount = tasks.length;

  // 紧凑模式渲染
  if (compact) {
    return (
      <div className="task-board-compact-new">
        {/* 标题行 */}
        <div className="tb-header">
          <span className="tb-title">◈ 任务</span>
          <span className="tb-count">{doneCount}/{totalCount} 完成</span>
          <button
            type="button"
            onClick={loadTasks}
            title="刷新"
            className="tb-refresh-btn"
          >
            ↺
          </button>
        </div>
        
        {/* 今日意图 */}
        {intention && (
          <div className="tb-intention">
            今日：{intention}
          </div>
        )}
        
        {/* 任务列表 - 带翻页 */}
        <div className="tb-task-section">
          {loading ? (
            <div className="tb-loading">加载中...</div>
          ) : visibleTasks.length > 0 ? (
            <>
              {visibleTasks.map((task) => (
                <div key={task.id} className="tb-task-item">
                  {/* 优先级圆点 */}
                  <span
                    className="tb-priority-dot"
                    style={{ background: PRIORITY_CONFIG[task.priority]?.color || THEME.textSecondary }}
                    onClick={(e) => cyclePriority(task.id, e)}
                    title="点击切换优先级"
                  />
                  
                  {/* 任务内容 */}
                  <span className="tb-task-content">{task.content}</span>
                  
                  {/* 操作按钮 - hover显示 */}
                  <div className="tb-task-actions">
                    <button
                      type="button"
                      className="tb-action-btn tb-complete-btn"
                      onClick={() => toggleTask(task.id)}
                      title="完成"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      className="tb-action-btn tb-delete-btn"
                      onClick={() => setDeleteConfirmId(task.id)}
                      title="删除"
                    >
                      ✕
                    </button>
                  </div>
                  
                  {/* 删除确认条 */}
                  {deleteConfirmId === task.id && (
                    <div className="tb-delete-confirm">
                      <span>确认删除？</span>
                      <button type="button" onClick={() => deleteTask(task.id)}>确认</button>
                      <button type="button" onClick={() => setDeleteConfirmId(null)}>取消</button>
                    </div>
                  )}
                </div>
              ))}
              
              {/* 翻页控件 */}
              {pendingTasks.length > TASKS_PER_PAGE && (
                <div className="tb-pagination">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  >
                    上一页
                  </button>
                  <span>第{currentPage}页 共{totalPages}页</span>
                  <button
                    type="button"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  >
                    下一页
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="tb-empty">暂无待办任务</div>
          )}
        </div>
        
        {/* 分割线 */}
        <div className="tb-divider" />
        
        {/* 停车场 */}
        <div className="tb-parking-section">
          <div className="tb-parking-header">停车场 · 暂存</div>
          {parkingLot.length > 0 ? (
            parkingLot.slice(0, 3).map((item) => (
              <div key={item.id} className="tb-parking-item">
                <span className="tb-parking-tag">P</span>
                <span className="tb-parking-content">{item.content}</span>
                <div className="tb-parking-actions">
                  <button
                    type="button"
                    className="tb-promote-btn"
                    onClick={() => promoteToTask(item)}
                  >
                    升为任务
                  </button>
                  <button
                    type="button"
                    className="tb-remove-btn"
                    onClick={() => removeParkingItem(item.id)}
                  >
                    移除
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="tb-parking-empty">暂无暂存项</div>
          )}
        </div>
        
        {/* 快速输入框 */}
        <div className="tb-quick-input">
          <input
            ref={inputRef}
            type="text"
            placeholder="添加任务..."
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            onKeyDown={handleQuickAdd}
          />
          <button
            type="button"
            className="tb-add-btn"
            onClick={() => {
              if (quickInput.trim()) {
                handleQuickAdd({ key: 'Enter' } as any);
              }
            }}
          >
            添加
          </button>
        </div>
      </div>
    );
  }

  // 完整模式渲染
  return (
    <div className="task-board-full">
      {/* 顶部：日期 + 今日意图 */}
      <div className="tb-full-header">
        <div className="tb-full-date">{formatDateDisplay(getTodayStr())}</div>
        {intention && (
          <div className="tb-full-intention">
            <span className="tb-intention-label">今日意图</span>
            <span className="tb-intention-text">{intention}</span>
          </div>
        )}
        {onClose && (
          <button type="button" className="tb-close-btn" onClick={onClose}>×</button>
        )}
      </div>

      {/* 任务区域 */}
      <div className="tb-full-content">
        {/* 任务列表 */}
        <div className="tb-task-section">
          <div className="tb-section-header">
            <span>待办任务</span>
            <span>{doneCount}/{totalCount} 完成</span>
          </div>
          
          {loading ? (
            <div className="tb-loading">加载中...</div>
          ) : visibleTasks.length > 0 ? (
            <>
              {visibleTasks.map((task) => (
                <div key={task.id} className="tb-task-item">
                  <span
                    className="tb-priority-dot"
                    style={{ background: PRIORITY_CONFIG[task.priority]?.color || THEME.textSecondary }}
                    onClick={(e) => cyclePriority(task.id, e)}
                    title="点击切换优先级"
                  />
                  <span className="tb-task-content">{task.content}</span>
                  <div className="tb-task-actions">
                    <button
                      type="button"
                      className="tb-action-btn tb-complete-btn"
                      onClick={() => toggleTask(task.id)}
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      className="tb-action-btn tb-delete-btn"
                      onClick={() => setDeleteConfirmId(task.id)}
                    >
                      ✕
                    </button>
                  </div>
                  {deleteConfirmId === task.id && (
                    <div className="tb-delete-confirm">
                      <span>确认删除？</span>
                      <button type="button" onClick={() => deleteTask(task.id)}>确认</button>
                      <button type="button" onClick={() => setDeleteConfirmId(null)}>取消</button>
                    </div>
                  )}
                </div>
              ))}
              
              {pendingTasks.length > TASKS_PER_PAGE && (
                <div className="tb-pagination">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  >
                    上一页
                  </button>
                  <span>第{currentPage}页 共{totalPages}页</span>
                  <button
                    type="button"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  >
                    下一页
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="tb-empty">暂无待办任务</div>
          )}
        </div>

        {/* 分割线 */}
        <div className="tb-divider" />

        {/* 停车场 */}
        <div className="tb-parking-section">
          <div className="tb-parking-header">停车场 · 暂存</div>
          {parkingLot.length > 0 ? (
            parkingLot.map((item) => (
              <div key={item.id} className="tb-parking-item">
                <span className="tb-parking-tag">P</span>
                <span className="tb-parking-content">{item.content}</span>
                <div className="tb-parking-actions">
                  <button
                    type="button"
                    className="tb-promote-btn"
                    onClick={() => promoteToTask(item)}
                  >
                    升为任务
                  </button>
                  <button
                    type="button"
                    className="tb-remove-btn"
                    onClick={() => removeParkingItem(item.id)}
                  >
                    移除
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="tb-parking-empty">暂无暂存项</div>
          )}
        </div>

        {/* 快速输入框 */}
        <div className="tb-quick-input">
          <input
            ref={inputRef}
            type="text"
            placeholder="添加任务..."
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            onKeyDown={handleQuickAdd}
          />
          <button
            type="button"
            className="tb-add-btn"
            onClick={() => {
              if (quickInput.trim()) {
                handleQuickAdd({ key: 'Enter' } as any);
              }
            }}
          >
            添加
          </button>
        </div>
      </div>
    </div>
  );
};

export default TaskBoard;