import React, { useState } from 'react';
import { FourierState } from '../types/quant';
import { RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

interface FourierPanelProps {
  symbol: string;
  fourier: FourierState;
  onRefresh: () => void;
}

export const FourierPanel: React.FC<FourierPanelProps> = ({
  symbol,
  fourier,
  onRefresh
}) => {
  const [expanded, setExpanded] = useState(false);
  const { spectrum, prob, ribbon, techInfo } = fourier;

  const ribbonColorHex =
    ribbon.color === 'red' ? '#f87171' : ribbon.color === 'green' ? '#4ade80' : '#94a3b8';
  const ribbonTrendText =
    ribbon.trend === 'up' ? '↑ 看多' : ribbon.trend === 'down' ? '↓ 看空' : '— 震盪';

  const techScoreColor =
    techInfo.score > 15 ? '#4ade80' : techInfo.score < -15 ? '#f87171' : '#94a3b8';
  const techSign = techInfo.score > 0 ? '+' : '';

  return (
    <div className="bg-[#1e293b]/90 border border-[#334155] rounded-lg p-2 mb-1 text-white shadow-sm">
      {/* Compact Header */}
      <div className="flex items-center justify-between gap-2 pb-1 mb-1.5 border-b border-[#334155]/60">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-bold text-[#facc15] truncate">
            📐 Z軸時空共振｜{symbol || 'STK'}
          </span>
          <span className="text-[10px] font-mono text-gray-300 hidden sm:inline">
            {ribbonTrendText} · {techSign}{techInfo.score}分
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setExpanded(prev => !prev)}
            className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-[10px] text-slate-300 flex items-center gap-0.5 transition"
            title={expanded ? '收合精簡' : '展開詳情'}
          >
            <span>{expanded ? '精簡' : '詳情'}</span>
            {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
          <button
            onClick={onRefresh}
            className="py-0.5 px-2 bg-[#3b82f6] hover:bg-[#2563eb] rounded text-white text-[10px] font-bold flex items-center gap-1 transition"
            title="刷新Z軸"
          >
            <RefreshCw size={10} />
            <span>刷新</span>
          </button>
        </div>
      </div>

      {/* Compact Single-Row Summary (Always visible) */}
      <div className="grid grid-cols-3 gap-1.5 bg-[#0f172a]/70 p-1.5 rounded border border-[#334155]/40 text-[11px]">
        <div className="truncate">
          <span className="text-[#facc15] text-[9px] block">5日方向概率</span>
          <span className="font-mono font-bold">
            <span className="text-[#4ade80]">▲{prob.up}%</span>{' '}
            <span className="text-[#f87171]">▼{prob.down}%</span>
          </span>
        </div>
        <div className="truncate">
          <span className="text-gray-400 text-[9px] block">彩帶多空</span>
          <span className="font-mono font-bold" style={{ color: ribbonColorHex }}>
            {ribbonTrendText} ({Math.round(ribbon.strength)}%)
          </span>
        </div>
        <div className="truncate">
          <span className="text-gray-400 text-[9px] block">技術評分</span>
          <span className="font-mono font-bold" style={{ color: techScoreColor }}>
            {techSign}{techInfo.score} 分
          </span>
        </div>
      </div>

      {/* Expanded Details (Collapsible) */}
      {expanded && (
        <div className="mt-1.5 space-y-1.5">
          <div
            className="w-full h-6 rounded flex items-center px-2 font-mono text-[10.5px] font-bold text-white"
            style={{ backgroundColor: ribbonColorHex }}
          >
            <span>
              彩帶: {ribbon.color === 'red' ? '紅色 (強勢)' : ribbon.color === 'green' ? '綠色 (偏弱)' : '灰色 (震盪)'} |
              趨勢: {ribbonTrendText} | 強度: {Math.round(ribbon.strength)}%
            </span>
          </div>

          <div className="flex items-center flex-wrap gap-1 text-[10px]">
            <span className="text-[#facc15] font-semibold">🎯 ISET 週期:</span>
            {spectrum.length > 0 ? (
              spectrum.map((s, idx) => (
                <span
                  key={idx}
                  className="bg-[#facc15] text-[#0f172a] px-1.5 py-0.5 rounded-full text-[9.5px] font-bold"
                >
                  {s.period}天 ({(s.amplitude * 100).toFixed(1)}%)
                </span>
              ))
            ) : (
              <span className="text-gray-400">載入行情數據後自動解算</span>
            )}
          </div>

          <div className="text-[9.5px] text-slate-400 px-1 truncate">
            明細：{techInfo.detail || 'RSI | MACD | %B | ATR'}
          </div>
        </div>
      )}
    </div>
  );
};
