import React, { useState, useEffect, useCallback, useRef, RefObject } from 'react';
import { createPortal } from 'react-dom';

interface VaultItem {
  refName: string;
  label: string;
  category: 'api_key' | 'email' | 'wallet' | 'password' | 'token' | 'general';
  riskLevel: 'normal' | 'high' | 'critical';
  lastUsedAt: number | null;
  createdAt: number;
}

interface VaultStatus {
  exists: boolean;
  unlocked: boolean;
  hint?: string;
}

interface VaultPanelProps {
  vaultOpen: boolean;
  setVaultOpen: (open: boolean) => void;
  onStatusChange?: (status: VaultStatus) => void;
  containerRef?: RefObject<HTMLDivElement | null>;
  dropPos?: { top: number; left: number };
}

const CATEGORY_LABELS: Record<string, string> = {
  api_key: 'API Key',
  email: '邮箱',
  wallet: '钱包',
  password: '密码',
  token: '令牌',
  general: '通用',
};

const inputStyle: React.CSSProperties = {
  background: 'var(--input-bg, var(--bg-input, var(--bg-base)))',
  border: '1px solid var(--border, var(--border-subtle))',
  borderRadius: '4px',
  padding: '6px 10px',
  color: 'var(--text-primary)',
  fontSize: 'var(--text-sm, 12px)',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const btnPrimaryStyle: React.CSSProperties = {
  flex: 1,
  background: 'var(--btn-bg, var(--bg-panel, var(--bg-hover)))',
  border: '1px solid var(--border, var(--border-subtle))',
  borderRadius: '4px',
  color: 'var(--color-accent, var(--accent-primary))',
  padding: '6px',
  cursor: 'pointer',
  fontSize: 'var(--text-sm, 12px)',
};

const btnSecondaryStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border, var(--border-subtle))',
  borderRadius: '4px',
  color: 'var(--text-secondary)',
  padding: '6px 10px',
  cursor: 'pointer',
  fontSize: 'var(--text-sm, 12px)',
};

export default function VaultPanel({ vaultOpen, setVaultOpen, onStatusChange, containerRef, dropPos = { top: 0, left: 0 } }: VaultPanelProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<VaultStatus>({ exists: false, unlocked: false });
  const [items, setItems] = useState<VaultItem[]>([]);
  const [masterPassword, setMasterPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState<VaultItem | null>(null);
  const [editValue, setEditValue] = useState('');
  const [newItem, setNewItem] = useState({
    refName: '', label: '', value: '', category: 'general', riskLevel: 'normal'
  });
  const [emailUser, setEmailUser] = useState('');
  const [emailPass, setEmailPass] = useState('');
  const [gatewayConnected, setGatewayConnected] = useState(false);

  const api = typeof window !== 'undefined' ? (window as any).electronAPI : null;

  const callVault = async (action: string, params: Record<string, any> = {}) => {
    if (!api?.invokeGatewayTool) {
      return { success: false, error: 'Gateway 未连接' };
    }
    try {
      const result = await api.invokeGatewayTool('vault_ops', {
        action,
        ...params
      });
      return { success: true, data: result };
    } catch (e: any) {
      return { success: false, error: e?.message || String(e) };
    }
  };

  const loadStatus = async () => {
    try {
      const health = await fetch('http://127.0.0.1:18790/health', {
        signal: AbortSignal.timeout(2000),
      });
      if (!health.ok) throw new Error('unreachable');
    } catch {
      setGatewayConnected(false);
      return;
    }
    setGatewayConnected(true);

    const res = await callVault('status');
    if (res.success) {
      try {
        const data = JSON.parse(res.data);
        setStatus(data);
        onStatusChange?.(data);
        if (data.unlocked) loadItems();
        else setItems([]);
      } catch {
        setStatus({ exists: false, unlocked: false });
        onStatusChange?.({ exists: false, unlocked: false });
      }
    }
  };

  const loadItems = async () => {
    const res = await callVault('list');
    if (!res.success) {
      setItems([]);
      return;
    }
    try {
      const parsed = JSON.parse(res.data);
      if (parsed?.items && Array.isArray(parsed.items)) {
        setItems(parsed.items);
      } else {
        setItems([]);
      }
    } catch {
      setItems([]);
    }
  };

  const handleUnlock = async () => {
    if (!masterPassword) return;
    setLoading(true);
    setError('');
    const action = status.exists ? 'unlock' : 'create';
    const res = await callVault(action, { masterPassword });
    setLoading(false);
    if (res.success) {
      setMasterPassword('');
      loadStatus();
    } else {
      setError(res.error || '操作失败');
    }
  };

  const handleLock = async () => {
    await callVault('lock');
    setItems([]);
    loadStatus();
  };

  const handleAddItem = async () => {
    if (!newItem.refName || !newItem.label) {
      setError('请填写引用名和说明标签');
      return;
    }
    let valueToSave = newItem.value;
    if (newItem.category === 'email') {
      if (!emailUser?.trim() || !emailPass?.trim()) {
        setError('请填写邮箱地址和 IMAP 授权码');
        return;
      }
      valueToSave = JSON.stringify({ user: emailUser.trim(), pass: emailPass.trim() });
    } else if (!newItem.value) {
      setError('请填写凭证值');
      return;
    }
    setLoading(true);
    setError('');
    const res = await callVault('set', {
      refName: newItem.refName,
      label: newItem.label,
      value: valueToSave,
      category: newItem.category,
      riskLevel: newItem.riskLevel
    });
    setLoading(false);
    if (res.success) {
      setShowAddForm(false);
      setNewItem({ refName: '', label: '', value: '', category: 'general', riskLevel: 'normal' });
      setEmailUser('');
      setEmailPass('');
      loadItems();
    } else {
      setError(res.error || '存入失败');
    }
  };

  const handleDelete = async (refName: string, label: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm(`确认删除「${label}」？此操作不可恢复`)) return;
    await callVault('delete', { refName });
    setEditingItem(null);
    loadItems();
  };

  const handleStartEdit = async (item: VaultItem) => {
    setShowAddForm(false);
    setEditingItem(item);
    const res = await callVault('get', { refName: item.refName });
    if (res.success) {
      const val = res.data;
      setEditValue(typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val ?? ''));
    } else {
      setEditValue('');
    }
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    setLoading(true);
    setError('');
    let value: any = editValue.trim();
    try {
      if (value.startsWith('{') || value.startsWith('[')) value = JSON.parse(value);
    } catch {}
    const res = await callVault('set', {
      refName: editingItem.refName,
      label: editingItem.label,
      value,
      category: editingItem.category,
      riskLevel: editingItem.riskLevel
    });
    setLoading(false);
    if (res.success) {
      setEditingItem(null);
      setEditValue('');
      loadItems();
    } else {
      setError(res.error || '保存失败');
    }
  };

  const closeDrawer = useCallback(() => setVaultOpen(false), [setVaultOpen]);

  useEffect(() => { loadStatus(); }, []);

  useEffect(() => {
    setEmailUser('');
    setEmailPass('');
    if (newItem.category !== 'email') setNewItem(prev => ({ ...prev, value: '' }));
  }, [newItem.category]);

  // 打开面板时刷新状态和列表（避免 stale）
  useEffect(() => {
    if (vaultOpen) loadStatus();
  }, [vaultOpen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && vaultOpen) closeDrawer();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [vaultOpen, closeDrawer]);

  useEffect(() => {
    if (!vaultOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const inContainer = containerRef?.current?.contains(target);
      const inDrawer = drawerRef.current?.contains(target);
      if (!inContainer && !inDrawer) setVaultOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [vaultOpen, setVaultOpen, containerRef]);

  const formatTime = (ts: number | null) => {
    if (!ts) return '从未使用';
    const d = new Date(ts);
    return d.toLocaleDateString('zh-CN') + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  const drawerContent = (
    <div
      ref={drawerRef}
      style={{
        position: 'fixed',
        top: dropPos.top,
        left: dropPos.left,
        width: 280,
        maxHeight: `calc(100vh - ${dropPos.top}px - 16px)`,
        overflowY: 'auto',
        zIndex: 99999,
        border: '1px solid var(--border, var(--border-subtle))',
        background: 'var(--bg-panel)',
        borderRadius: '0 6px 6px 6px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        padding: 16,
        fontFamily: 'var(--font-mono, monospace)',
        color: 'var(--text-primary)',
        transform: vaultOpen ? 'translateY(0)' : 'translateY(-8px)',
        opacity: vaultOpen ? 1 : 0,
        transition: 'transform 0.2s ease, opacity 0.2s ease',
        pointerEvents: vaultOpen ? 'auto' : 'none',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Gateway 未连接提示 */}
      {!gatewayConnected && (
        <div style={{
          marginBottom: 12,
          padding: '8px 10px',
          background: 'var(--color-danger, var(--status-error-bg))',
          color: 'var(--color-danger, var(--status-error))',
          fontSize: 'var(--text-xs)',
          borderRadius: 4,
        }}>
          Gateway 未连接
        </div>
      )}

      {/* 抽屉头部 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 'bold', fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>保险箱</span>
          <span style={{
            fontSize: 'var(--text-xs)',
            padding: '2px 8px',
            borderRadius: 12,
            background: status.unlocked
              ? 'var(--color-success, var(--status-success-bg, transparent))'
              : 'var(--color-danger, var(--status-error-bg, transparent))',
            color: status.unlocked
              ? 'var(--color-success, var(--status-success))'
              : 'var(--color-danger, var(--status-error))',
          }}>
            {status.unlocked ? '已解锁' : '已锁定'}
          </span>
        </div>
        <button
          type="button"
          onClick={closeDrawer}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: 18,
            padding: 4,
            lineHeight: 1,
            opacity: 0.8,
          }}
        >
          ✕
        </button>
      </div>

      {/* 未解锁时显示解锁表单 */}
      {!status.unlocked && (
        <div>
          {!status.exists && (
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 8 }}>
              首次使用，输入密码创建保险箱
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="主密码"
                value={masterPassword}
                onChange={e => setMasterPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleUnlock()}
                style={{ ...inputStyle, paddingRight: 28 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: 6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--text-secondary)',
                }}
              >
                {showPassword ? '隐藏' : '显示'}
              </button>
            </div>
            <button
              type="button"
              onClick={handleUnlock}
              disabled={loading}
              style={{ ...btnPrimaryStyle, whiteSpace: 'nowrap' }}
            >
              {loading ? '...' : status.exists ? '解锁' : '创建'}
            </button>
          </div>
          {error && (
            <div style={{ color: 'var(--color-danger, var(--status-error))', fontSize: 'var(--text-xs)', marginTop: 6 }}>
              {error}
            </div>
          )}
        </div>
      )}

      {/* 已解锁时显示内容 */}
      {status.unlocked && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => { setShowAddForm(!showAddForm); setEditingItem(null); setError(''); }}
              style={{ flex: 1, ...btnPrimaryStyle }}
            >
              + 添加凭证
            </button>
            <button type="button" onClick={handleLock} style={btnSecondaryStyle}>
              锁定
            </button>
          </div>

          {editingItem && (
            <div style={{
              background: 'var(--input-bg, var(--bg-base))',
              border: '1px solid var(--border, var(--border-subtle))',
              borderRadius: 6,
              padding: 12,
              marginBottom: 12,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                  编辑：{editingItem.label}
                </span>
                <button
                  type="button"
                  onClick={() => { setEditingItem(null); setEditValue(''); setError(''); }}
                  style={{ ...btnSecondaryStyle, padding: '4px 8px', fontSize: 'var(--text-xs)' }}
                >
                  取消
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  placeholder="凭证值"
                  rows={4}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace' }}
                />
                {error && (
                  <div style={{ color: 'var(--color-danger, var(--status-error))', fontSize: 'var(--text-xs)' }}>
                    {error}
                  </div>
                )}
                <button type="button" onClick={handleSaveEdit} disabled={loading} style={btnPrimaryStyle}>
                  {loading ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          )}

          {showAddForm && (
            <div style={{
              background: 'var(--input-bg, var(--bg-base))',
              border: '1px solid var(--border, var(--border-subtle))',
              borderRadius: 6,
              padding: 12,
              marginBottom: 12,
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  placeholder="引用名（如 github_token、163_邮箱）*"
                  value={newItem.refName}
                  onChange={e => setNewItem({ ...newItem, refName: e.target.value.replace(/\s/g, '_') })}
                  style={inputStyle}
                />
                <input
                  placeholder="说明标签（如 GitHub 个人令牌、163邮箱）*"
                  value={newItem.label}
                  onChange={e => setNewItem({ ...newItem, label: e.target.value })}
                  style={inputStyle}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <select
                    value={newItem.category}
                    onChange={e => setNewItem({ ...newItem, category: e.target.value })}
                    style={{ ...inputStyle, flex: 1 }}
                  >
                    {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                  <select
                    value={newItem.riskLevel}
                    onChange={e => setNewItem({ ...newItem, riskLevel: e.target.value })}
                    style={{ ...inputStyle, flex: 1 }}
                  >
                    <option value="normal">普通</option>
                    <option value="high">高危</option>
                    <option value="critical">极危</option>
                  </select>
                </div>
                {newItem.category === 'email' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <input
                      placeholder="邮箱地址 *"
                      value={emailUser}
                      onChange={e => {
                        setEmailUser(e.target.value);
                        setNewItem(prev => ({
                          ...prev,
                          value: JSON.stringify({ user: e.target.value, pass: emailPass })
                        }));
                      }}
                      style={inputStyle}
                    />
                    <input
                      type="password"
                      placeholder="IMAP 授权码（非登录密码）*"
                      value={emailPass}
                      onChange={e => {
                        setEmailPass(e.target.value);
                        setNewItem(prev => ({
                          ...prev,
                          value: JSON.stringify({ user: emailUser, pass: e.target.value })
                        }));
                      }}
                      style={inputStyle}
                    />
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', padding: '4px 0' }}>
                      💡 授权码在邮箱设置 → POP3/IMAP → 生成授权码
                    </div>
                  </div>
                ) : (
                  <input
                    type="password"
                    placeholder="凭证值（密码/Key/助记词）*"
                    value={newItem.value}
                    onChange={e => setNewItem({ ...newItem, value: e.target.value })}
                    style={inputStyle}
                  />
                )}
                {error && (
                  <div style={{ color: 'var(--color-danger, var(--status-error))', fontSize: 'var(--text-xs)' }}>
                    {error}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={handleAddItem} disabled={loading} style={btnPrimaryStyle}>
                    {loading ? '存入中...' : '安全存入'}
                  </button>
                  <button type="button" onClick={() => { setShowAddForm(false); setError(''); }} style={btnSecondaryStyle}>
                    取消
                  </button>
                </div>
              </div>
            </div>
          )}

          {items.length === 0 ? (
            <div style={{
              color: 'var(--text-secondary)',
              fontSize: 'var(--text-sm)',
              textAlign: 'center',
              padding: '20px 0',
              opacity: 0.7,
            }}>
              保险箱为空，点击「添加凭证」开始使用
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map(item => (
                <div
                  key={item.refName}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleStartEdit(item)}
                  onKeyDown={e => e.key === 'Enter' && handleStartEdit(item)}
                  style={{
                    background: editingItem?.refName === item.refName
                      ? 'var(--bg-hover, rgba(255,255,255,0.05))'
                      : 'var(--input-bg, var(--bg-base))',
                    border: `1px solid ${item.riskLevel === 'critical' ? 'var(--color-danger, var(--status-error))' : 'var(--border, var(--border-subtle))'}`,
                    borderRadius: 6,
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                  }}
                  title="点击编辑"
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                        {item.label}
                      </span>
                      {item.riskLevel === 'critical' && (
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger, var(--status-error))' }}>
                          极危
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 2, opacity: 0.7 }}>
                      {item.refName} · 最后使用：{formatTime(item.lastUsedAt)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleDelete(item.refName, item.label, e)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--color-danger, var(--status-error))',
                      cursor: 'pointer',
                      fontSize: 'var(--text-sm)',
                      padding: 4,
                      marginLeft: 4,
                    }}
                    title="删除"
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(drawerContent, document.body)
    : null;
}
