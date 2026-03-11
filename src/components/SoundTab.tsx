import React, { useState, useRef, useCallback, useEffect } from 'react';
import '../styles/SoundTab.css';

interface SoundItem {
  id: string;
  name: string;
  ext: string;
  folders: string[];
}


const SoundTab: React.FC = () => {
  const [inputValue, setInputValue] = useState('');
  const [results, setResults] = useState<SoundItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [eagleConnected, setEagleConnected] = useState(false);
  const [dashscopeKey, setDashscopeKey] = useState('');
  
  const outputRef = useRef<HTMLDivElement>(null);

  // 获取环境变量
  useEffect(() => {
    window.electronAPI?.getEnv('DASHSCOPE_API_KEY').then(key => {
      setDashscopeKey(key);
    });
  }, []);

  // 添加日志
  const addLog = useCallback((message: string) => {
    setLogs(prev => [...prev, message]);
    setTimeout(() => {
      outputRef.current?.scrollTo(0, outputRef.current.scrollHeight);
    }, 10);
  }, []);

  // 检查 Eagle
  const checkEagle = async (): Promise<boolean> => {
    try {
      const res = await fetch('http://localhost:41595/api/application/info');
      if (res.ok) {
        setEagleConnected(true);
        addLog('[SYSTEM] Eagle API 连接成功');
        return true;
      }
    } catch {
      addLog('[ERROR] Eagle API 连接失败');
    }
    setEagleConnected(false);
    return false;
  };

  // AI 获取关键词（使用阿里百炼 API）
  const getKeywords = async (query: string): Promise<string[]> => {
    if (!dashscopeKey) {
      addLog('[AI] 未配置 DASHSCOPE_API_KEY，使用原始输入');
      return [query];
    }

    try {
      addLog('[AI] 正在分析关键词...');
      
      // 阿里百炼 API（OpenAI 兼容模式）
      const res = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${dashscopeKey}`
        },
        body: JSON.stringify({
          model: 'qwen-plus',
          messages: [
            { 
              role: 'system', 
              content: '你是音效库搜索助手。把用户描述转换成Eagle素材库搜索关键词，返回JSON数组格式，2-5个关键词。只返回数组，不要其他内容。例如：["雨声", "室内", "安静"]' 
            },
            { role: 'user', content: query }
          ],
          max_tokens: 100,
          temperature: 0.3
        })
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || '[]';
      
      let kws: string[] = [];
      try {
        // 清理可能的 markdown 代码块
        let cleanContent = content.trim();
        if (cleanContent.startsWith('```')) {
          cleanContent = cleanContent.replace(/```json?/g, '').replace(/```/g, '').trim();
        }
        const parsed = JSON.parse(cleanContent);
        kws = Array.isArray(parsed) ? parsed : [query];
      } catch {
        kws = content.split(/[,\n]/).map((s: string) => s.trim()).filter(Boolean);
      }

      addLog(`[AI] 解析关键词: ${kws.join(' / ')}`);
      return kws;
    } catch (e) {
      addLog(`[AI] 解析失败: ${e}`);
      return [query];
    }
  };

  // 搜索 Eagle
  const searchEagle = async (keyword: string): Promise<SoundItem[]> => {
    try {
      const res = await fetch(`http://localhost:41595/api/item/list?keyword=${encodeURIComponent(keyword)}`);
      const data = await res.json();
      
      // 获取文件夹映射
      const folderRes = await fetch('http://localhost:41595/api/folder/list');
      let folderMap: Record<string, string> = {};
      if (folderRes.ok) {
        const fd = await folderRes.json();
        folderMap = (fd.data || []).reduce((acc: Record<string, string>, f: { id: string; name: string }) => {
          acc[f.id] = f.name;
          return acc;
        }, {});
      }

      return (data.data || []).map((item: { id: string; name: string; ext: string; folders?: string[] }) => ({
        id: item.id,
        name: item.name,
        ext: item.ext || '',
        folders: (item.folders || []).map((fid: string) => folderMap[fid] || fid)
      }));
    } catch {
      return [];
    }
  };

  // 执行搜索
  const doSearch = async () => {
    const query = inputValue.trim();
    if (!query) return;

    setResults([]);
    setLogs([]);
    setIsSearching(true);

    addLog('[SYSTEM] 正在连接 Eagle API...');
    const ok = await checkEagle();
    if (!ok) {
      setIsSearching(false);
      return;
    }

    const kws = await getKeywords(query);
    setKeywords(kws);

    addLog('[SEARCH] 搜索中...');
    
    const all: SoundItem[] = [];
    for (const kw of kws) {
      const items = await searchEagle(kw);
      all.push(...items);
    }

    // 去重
    const seen = new Set<string>();
    const unique: SoundItem[] = [];
    for (const item of all) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        unique.push(item);
      }
    }

    const limited = unique.slice(0, 20);
    setResults(limited);

    addLog(limited.length > 0 
      ? `[FOUND] 发现 ${limited.length} 个匹配文件` 
      : '[FOUND] 未找到匹配文件');
    addLog('[DONE] 搜索完成 ✓');
    setIsSearching(false);
  };

  // 在 Eagle 中打开
  const openInEagle = async (item: SoundItem) => {
    try {
      await fetch('http://localhost:41595/api/item/highlight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: [item.id] })
      });
      addLog(`[OPEN] 已定位: ${item.name}`);
    } catch {
      addLog('[ERROR] 打开失败');
    }
  };

  return (
    <div className="sound-tab">
      <div className="search-section">
        <div className="section-header">
          <span className="section-title">◈ Sound Search</span>
          <span className={`eagle-status ${eagleConnected ? 'connected' : 'disconnected'}`}>
            {eagleConnected ? '●' : '○'} Eagle {eagleConnected ? 'CONNECTED' : 'OFFLINE'}
          </span>
        </div>
        
        <div className="search-input-area">
          <span className="input-prompt">&gt;&gt;</span>
          <input
            type="text"
            className="search-input"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch()}
            placeholder="描述你想找的音效... 例如：下雨天室内安静氛围"
            disabled={isSearching}
          />
          <button className="search-btn" onClick={doSearch} disabled={isSearching || !inputValue.trim()}>
            {isSearching ? '[ 搜索中... ]' : '[ 搜索 ]'}
          </button>
        </div>

        {keywords.length > 0 && (
          <div className="keywords-area">
            <span className="keywords-label">关键词:</span>
            {keywords.map((kw, idx) => (
              <span key={idx} className="keyword-tag">{kw}</span>
            ))}
          </div>
        )}
      </div>

      <div className="results-section">
        <div className="output-area" ref={outputRef}>
          {logs.map((log, idx) => (
            <div key={idx} className="output-line">{log}</div>
          ))}
          {logs.length === 0 && (
            <div className="output-placeholder">
              <span className="placeholder-icon">◈</span>
              <span>输入描述开始搜索音效...</span>
            </div>
          )}
        </div>

        {results.length > 0 && (
          <div className="results-list">
            <div className="results-header">
              <span>◈ 搜索结果 ({results.length})</span>
            </div>
            <div className="results-items">
              {results.map((item, idx) => (
                <div key={item.id} className="result-item">
                  <span className="result-index">[{String(idx + 1).padStart(2, '0')}]</span>
                  <span className="result-name">{item.name}</span>
                  <span className="result-ext">.{item.ext.toUpperCase()}</span>
                  <span className="result-folder">/{item.folders.length > 0 ? item.folders.join('/') : '未分类'}/</span>
                  <button className="open-btn" onClick={() => openInEagle(item)}>[ 打开 ]</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SoundTab;