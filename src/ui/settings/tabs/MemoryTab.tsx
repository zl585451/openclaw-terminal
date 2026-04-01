import { useState } from 'react';
import { useNocturneMemory } from '../../../hooks/settings/useNocturneMemory';
import { useAiLibrary } from '../../../hooks/settings/useAiLibrary';

interface MemoryTabProps {
  // Props for parent communication if needed
}

export function MemoryTab({}: MemoryTabProps) {
  const nocturneHook = useNocturneMemory();
  const aiLibraryHook = useAiLibrary();
  const [amyWorkModeWriting, setAmyWorkModeWriting] = useState(false);

  const handleNocturneStart = async () => {
    const result = await nocturneHook.startNocturne();
    if (!result.success) {
      alert('启动失败：' + (result.error || '未知错误'));
    }
  };

  const handleMemoryRead = async () => {
    await nocturneHook.readMemoryContent();
  };

  const handleMemoryWrite = async () => {
    if (!nocturneHook.memoryReadContent) return;
    
    setAmyWorkModeWriting(true);
    try {
      const result = await nocturneHook.writeMemoryContent(nocturneHook.memoryReadContent);
      if (!result.success) {
        alert('写入失败：' + (result.error || '未知错误'));
      }
    } finally {
      setAmyWorkModeWriting(false);
    }
  };

  const handleAiLibrarySave = async () => {
    const result = await aiLibraryHook.saveAiLibraryConfig();
    if (!result.success) {
      alert('保存失败：' + (result.error || '未知错误'));
    }
  };

  return (
    <div className="settings-section">
      <h3>③ 记忆系统</h3>
      
      <div className="settings-group">
        <h4>Nocturne 记忆服务器</h4>
        {!nocturneHook.nocturneStatus ? (
          <div>检测中...</div>
        ) : (
          <div>
            <div className="status-info">
              <p>状态: {nocturneHook.nocturneStatus.available ? '可用' : '不可用'}</p>
              {nocturneHook.nocturneDetail && (
                <>
                  <p>路径: {nocturneHook.nocturneDetail.path}</p>
                  {nocturneHook.nocturneDetail.backendAlive !== undefined && (
                    <p>后端运行: {nocturneHook.nocturneDetail.backendAlive ? '是' : '否'}</p>
                  )}
                </>
              )}
            </div>

            {nocturneHook.nocturneDashboardStatus && (
              <div className="dashboard-status">
                <p>Dashboard 状态:</p>
                <ul>
                  <li>后端: {nocturneHook.nocturneDashboardStatus.backendRunning ? '运行中' : '已停止'}</li>
                  <li>前端: {nocturneHook.nocturneDashboardStatus.frontendRunning ? '运行中' : '已停止'}</li>
                </ul>
              </div>
            )}

            <div className="settings-group">
              <button
                onClick={handleNocturneStart}
                disabled={nocturneHook.nocturneStarting}
                className="settings-btn-primary"
              >
                {nocturneHook.nocturneStarting ? '启动中...' : 
                 (nocturneHook.nocturneDashboardStatus?.backendRunning ? '重启服务' : '启动服务')}
              </button>
              
              <button
                onClick={nocturneHook.restartBackend}
                disabled={nocturneHook.restartingBackend}
                className="settings-btn-secondary"
              >
                {nocturneHook.restartingBackend ? '重启中...' : '重启后端'}
              </button>
            </div>
          </div>
        )}
      </div>

      <hr />

      <div className="settings-group">
        <h4>核心记忆管理</h4>
        {nocturneHook.nocturneDetail?.coreMemoryUris && (
          <div className="memory-uris">
            <p>核心记忆URI:</p>
            <ul>
              {nocturneHook.nocturneDetail.coreMemoryUris.map((uri, index) => (
                <li key={index}>{uri}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="settings-group">
          <button
            onClick={handleMemoryRead}
            disabled={nocturneHook.memoryReadLoading}
            className="settings-btn-secondary"
          >
            {nocturneHook.memoryReadLoading ? '读取中...' : '读取记忆内容'}
          </button>
        </div>

        {nocturneHook.memoryReadContent !== null && (
          <div className="memory-content">
            <label>记忆内容:</label>
            <textarea
              value={nocturneHook.memoryReadContent}
              onChange={() => {
                // This would need to be handled by the hook
                // For now, we'll create a simple setter
              }}
              rows={10}
              cols={60}
              placeholder="记忆内容将显示在这里..."
            />
            <div className="settings-group">
              <button
                onClick={handleMemoryWrite}
                disabled={amyWorkModeWriting}
                className="settings-btn-primary"
              >
                {amyWorkModeWriting ? '写入中...' : '写入记忆'}
              </button>
            </div>
          </div>
        )}
      </div>

      <hr />

      <div className="settings-group">
        <h4>AI.library 插件</h4>
        {!aiLibraryHook.aiLibStatus ? (
          <div>加载中...</div>
        ) : (
          <div>
            <div className="status-info">
              <p>健康状态: {aiLibraryHook.aiLibStatus.healthy ? '健康' : '不健康'}</p>
              <p>托管模式: {aiLibraryHook.aiLibStatus.managed ? '是' : '否'}</p>
              <p>端口占用: {aiLibraryHook.aiLibStatus.portInUse ? '是' : '否'}</p>
              {aiLibraryHook.aiLibStatus.resolvedGatewayUrl && (
                <p>网关地址: {aiLibraryHook.aiLibStatus.resolvedGatewayUrl}</p>
              )}
            </div>

            <div className="settings-group">
              <label>
                <input
                  type="checkbox"
                  checked={aiLibraryHook.aiLibAutoStart}
                  onChange={(e) => aiLibraryHook.setAiLibAutoStart(e.target.checked)}
                />
                自动启动
              </label>
            </div>

            <div className="settings-group">
              <label>插件路径</label>
              <input
                type="text"
                value={aiLibraryHook.aiLibPath}
                onChange={(e) => aiLibraryHook.setAiLibPath(e.target.value)}
                placeholder="AI.library 插件路径"
              />
            </div>

            <div className="settings-group">
              <label>端口</label>
              <input
                type="number"
                value={aiLibraryHook.aiLibPort}
                onChange={(e) => aiLibraryHook.setAiLibPort(Number(e.target.value))}
                min="1000"
                max="65535"
              />
            </div>

            <div className="settings-group">
              <button
                onClick={handleAiLibrarySave}
                disabled={aiLibraryHook.aiLibSaving}
                className="settings-btn-primary"
              >
                {aiLibraryHook.aiLibSaving ? '保存中...' : '保存配置'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}