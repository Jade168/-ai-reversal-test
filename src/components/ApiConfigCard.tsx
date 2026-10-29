import React, { useState, useEffect } from 'react';
import { ApiConfig } from '../types/quant';

interface ApiConfigCardProps {
  config: ApiConfig;
  onSaveConfig: (cfg: ApiConfig) => void;
  dataSource: string;
  onSwitchDataSource: (source: string) => void;
}

export const ApiConfigCard: React.FC<ApiConfigCardProps> = ({
  config,
  onSaveConfig,
  dataSource,
  onSwitchDataSource
}) => {
  const [provider, setProvider] = useState<'claude' | 'gemini' | 'custom'>(config.provider || 'claude');
  const [url, setUrl] = useState(config.url || '');
  const [key, setKey] = useState(config.key || '');
  const [statusMsg, setStatusMsg] = useState('狀態：未配置 | 支持Claude/Gemini/自定義API');
  const [statusColor, setStatusColor] = useState('#999');

  useEffect(() => {
    if (config.url) {
      setProvider(config.provider);
      setUrl(config.url);
      setKey(config.key);
      setStatusMsg(`狀態：已加載 ${config.provider.toUpperCase()} 配置`);
      setStatusColor('#f59e0b');
    }
  }, [config]);

  const handleProviderChange = (newProvider: 'claude' | 'gemini' | 'custom') => {
    setProvider(newProvider);
    if (newProvider === 'claude') {
      setUrl('https://api.anthropic.com/v1/messages');
    } else if (newProvider === 'gemini') {
      setUrl('http://127.0.0.1:7861/v1/chat/completions');
    } else {
      setUrl('');
    }
  };

  const handleSave = () => {
    if (!url.trim() || !key.trim()) {
      setStatusMsg('請輸入完整的 API 地址和密鑰');
      setStatusColor('#ef4444');
      return;
    }
    const newConfig: ApiConfig = { provider, url: url.trim(), key: key.trim() };
    onSaveConfig(newConfig);
    setStatusMsg(`狀態：${provider.toUpperCase()} 配置已保存`);
    setStatusColor('#10b981');
  };

  return (
    <div className="bg-[#0a0a0a] p-2 rounded-md mb-1 border border-[#f59e0b]/50">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1.5">
        <span className="text-[11px] font-semibold text-[#f59e0b]">
          🔐 AI API 本地配置（僅存在你嘅瀏覽器，唔會上傳到倉庫）
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-300">數據源：</span>
          <select
            value={dataSource}
            onChange={(e) => onSwitchDataSource(e.target.value)}
            className="h-6 px-2 py-0 text-[11px] bg-[#1f2937] text-white border border-[#374151] rounded"
          >
            <option value="eastmoney">東方財富數據源（默認）</option>
            <option value="free">免費數據源（無需密鑰）</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-1">
        <select
          value={provider}
          onChange={(e) => handleProviderChange(e.target.value as any)}
          className="w-[100px] sm:w-[15%] h-8 px-2 text-xs bg-[#030712] border border-[#374151] rounded text-white outline-hidden"
        >
          <option value="claude">Claude</option>
          <option value="gemini">Gemini</option>
          <option value="custom">自定義</option>
        </select>

        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={provider === 'claude' ? 'https://api.anthropic.com/v1/messages' : 'API地址'}
          className="flex-1 min-w-[180px] h-8 px-2 text-xs bg-[#030712] border border-[#374151] rounded text-white outline-hidden"
        />

        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="API密鑰 (sk-...)"
          className="w-[140px] sm:w-[28%] h-8 px-2 text-xs bg-[#030712] border border-[#374151] rounded text-white outline-hidden"
        />

        <button
          onClick={handleSave}
          className="h-8 px-3 text-xs font-bold rounded bg-linear-to-br from-[#6366f1] to-[#a855f7] text-white hover:opacity-90 transition active:scale-98"
        >
          保存
        </button>
      </div>

      <div className="text-[10px]" style={{ color: statusColor }}>
        {statusMsg}
      </div>
    </div>
  );
};
