import React, { useState, useCallback } from 'react';
import './ActivationWindow.css';

interface ActivationWindowProps {
  onActivated: () => void;
}

const ActivationWindow: React.FC<ActivationWindowProps> = ({ onActivated }) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleActivate = useCallback(async () => {
    setError('');
    const trimmed = code.trim();
    if (!trimmed) {
      setError('请输入授权码');
      return;
    }
    setLoading(true);
    try {
      const result = await window.electronAPI?.licenseVerify?.(trimmed);
      if (result?.valid) {
        onActivated();
        return;
      }
      setError(result?.error || '激活失败');
    } catch (e) {
      setError('验证出错，请重试');
    } finally {
      setLoading(false);
    }
  }, [code, onActivated]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleActivate();
  };

  return (
    <div className="activation-overlay">
      <div className="activation-scanlines" aria-hidden />
      <div className="activation-content">
        <div className="activation-title">OCT v0.1.0 内测版</div>
        <div className="activation-subtitle">请输入授权码激活</div>
        <input
          type="text"
          className="activation-input"
          placeholder="OCT-XXXX-XXXX-XXXX"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={handleKeyDown}
          maxLength={19}
          disabled={loading}
          autoFocus
        />
        {error && <div className="activation-error">{error}</div>}
        <button
          className="activation-btn"
          onClick={handleActivate}
          disabled={loading}
        >
          {loading ? '验证中...' : '激 活'}
        </button>
      </div>
      <div className="activation-corner activation-corner-tl" />
      <div className="activation-corner activation-corner-tr" />
      <div className="activation-corner activation-corner-bl" />
      <div className="activation-corner activation-corner-br" />
    </div>
  );
};

export default ActivationWindow;
