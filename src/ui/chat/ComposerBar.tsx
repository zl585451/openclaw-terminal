import React, { useEffect, useRef, useState, useCallback } from 'react';

interface ProviderModel { id: string; label?: string; tools?: boolean; thinking?: boolean; }
interface Provider { id: string; name?: string; defaultModel?: string; models?: ProviderModel[]; }

const THINK_LEVELS = ['off', 'low', 'medium', 'high'] as const;
const THINK_LABEL: Record<string, string> = { off: '关', low: '低', medium: '中', high: '高' };

export interface ComposerBarProps {
  /** 当前运行时模型（来自 gateway 状态） */
  modelName: string;
  /** 当前思考强度 off/low/medium/high（初始值） */
  thinkMode: string;
  /** 流式进行中禁用切换 */
  disabled?: boolean;
  /** 发送 slash 命令（仅模型切换用 /model） */
  onCommand: (cmd: string) => void;
}

/**
 * 输入框下方控件条：当前供应商可切换模型 + 思考强度（弹出式拉条）。
 * - 模型：即时 /model 命令切换；下拉跟随当前运行模型所属供应商自动刷新。
 * - 思考强度：点按钮弹出拉条，静默设置（electronAPI.setThink），随后续消息以参数携带，
 *   不在对话框出现斜杠命令（对齐 Claude 的 effort 弹层）。
 */
const ComposerBar: React.FC<ComposerBarProps> = ({ modelName, thinkMode, disabled, onCommand }) => {
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [providerName, setProviderName] = useState<string>('');
  const [think, setThink] = useState<string>(() => {
    const v = (thinkMode || 'off').toLowerCase();
    return (THINK_LEVELS as readonly string[]).includes(v) ? v : 'off';
  });
  const [thinkOpen, setThinkOpen] = useState(false);
  const thinkWrapRef = useRef<HTMLDivElement | null>(null);

  // 加载当前供应商的模型列表：优先匹配"包含当前运行模型"的供应商，
  // 否则用配置里的 OCT_PROVIDER，再否则取第一个。
  const loadProvider = useCallback(async () => {
    try {
      const api = window.electronAPI;
      if (!api?.getProviderList) return;
      const [plRes, keysRes] = await Promise.all([
        api.getProviderList(),
        api.getApiKeys ? api.getApiKeys() : Promise.resolve(null),
      ]);
      const data = (plRes as any)?.data;
      const providers: Provider[] = Array.isArray(data) ? data : Object.values(data || {});
      const currentId = String((keysRes as any)?.data?.OCT_PROVIDER || '').trim();
      const byModel = modelName
        ? providers.find((p) => (p.models || []).some((m) => m.id === modelName))
        : undefined;
      const current = byModel || providers.find((p) => p.id === currentId) || providers[0];
      setModels(current?.models || []);
      setProviderName(current?.name || current?.id || '');
    } catch { /* ignore */ }
  }, [modelName]);

  // 挂载时加载；当运行模型变化且不在当前列表里（多半是切了供应商）时重新加载
  useEffect(() => {
    if (models.length === 0 || (modelName && !models.some((m) => m.id === modelName))) {
      void loadProvider();
    }
  }, [modelName, models, loadProvider]);

  // 点击弹层外部关闭
  useEffect(() => {
    if (!thinkOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (thinkWrapRef.current && !thinkWrapRef.current.contains(e.target as Node)) {
        setThinkOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [thinkOpen]);

  const currentInList = models.some((m) => m.id === modelName);
  const modelValue = modelName || models[0]?.id || '';

  const onModelChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    if (id && id !== modelName) onCommand(`/model ${id}`);
  }, [modelName, onCommand]);

  const onThinkSlide = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const level = THINK_LEVELS[Number(e.target.value) || 0] || 'off';
    setThink(level);
    try { window.electronAPI?.setThink?.(level); } catch { /* ignore */ }
  }, []);

  const thinkIndex = Math.max(0, THINK_LEVELS.indexOf(think as typeof THINK_LEVELS[number]));

  return (
    <div className="composer-bar">
      <select
        className="composer-select"
        value={modelValue}
        onChange={onModelChange}
        disabled={disabled}
        title={providerName ? `切换模型（${providerName}）` : '切换模型'}
      >
        {modelName && !currentInList && <option value={modelName}>{modelName}</option>}
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label || m.id}{m.tools ? ' 🔧' : ''}{m.thinking ? ' 🧠' : ''}
          </option>
        ))}
        {models.length === 0 && !modelName && <option value="">（无可用模型）</option>}
      </select>

      <div className="composer-think-wrap" ref={thinkWrapRef}>
        <button
          type="button"
          className={`composer-think-btn ${thinkOpen ? 'open' : ''}`}
          onClick={() => setThinkOpen((v) => !v)}
          disabled={disabled}
          title="思考强度"
        >
          思考·{THINK_LABEL[think] || '关'}
        </button>
        {thinkOpen && (
          <div className="composer-think-pop" role="dialog">
            <div className="composer-think-pop-head">思考强度 · {THINK_LABEL[think] || '关'}</div>
            <div className="composer-think-pop-row">
              <span className="composer-think-end">省</span>
              <input
                type="range"
                className="composer-think-slider"
                min={0}
                max={THINK_LEVELS.length - 1}
                step={1}
                value={thinkIndex}
                onChange={onThinkSlide}
                aria-label="思考强度"
              />
              <span className="composer-think-end">深</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(ComposerBar);
