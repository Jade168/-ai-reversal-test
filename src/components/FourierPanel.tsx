import React from 'react';
import { FourierState } from '../types/quant';
import { RefreshCw } from 'lucide-react';

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
  const { spectrum, prob, ribbon, techInfo } = fourier;

  const ribbonColorHex =
    ribbon.color === 'red' ? '#f87171' : ribbon.color === 'green' ? '#4ade80' : '#94a3b8';
  const ribbonTrendText =
    ribbon.trend === 'up' ? '↑ 看多' : ribbon.trend === 'down' ? '↓ 看空' : '— 震盪';

  const techScoreColor =
    techInfo.score > 15 ? '#4ade80' : techInfo.score < -15 ? '#f87171' : '#94a3b8';
  const techSign = techInfo.score > 0 ? '+' : '';

  return (
    <div className="bg-[#1e293b]/90 border border-[#334155] rounded-xl p-3 mb-1 text-white shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#334155]/60 pb-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-[#facc15]">
            📐 Z軸時空共振｜{symbol || 'STK'}
          </span>
          <span className="text-[10px] text-gray-400">FFT收益率譜 + 三源融合方向</span>
        </div>
        <button
          onClick={onRefresh}
          className="p-1 px-2.5 bg-[#3b82f6] hover:bg-[#2563eb] rounded-full text-white text-xs font-bold flex items-center gap-1 transition"
          title="刷新Z軸"
        >
          <RefreshCw size={12} />
          <span>刷新</span>
        </button>
      </div>

      {/* Ribbon Bar */}
      <div
        className="w-full h-7 rounded-md flex items-center px-3 mb-2 font-mono text-xs font-bold text-white shadow-inner transition-colors duration-300"
        style={{ backgroundColor: ribbonColorHex }}
      >
        <span>
          彩帶: {ribbon.color === 'red' ? '紅色 (強勢)' : ribbon.color === 'green' ? '綠色 (偏弱)' : '灰色 (震盪)'} |
          趨勢: {ribbonTrendText} | 能量強度: {Math.round(ribbon.strength)}%
        </span>
      </div>

      {/* Top Cycles */}
      <div className="flex items-center flex-wrap gap-1.5 mb-2.5 text-xs">
        <span className="text-[#facc15] font-semibold text-[11px]">🎯 ISET 核心週期:</span>
        {spectrum.length > 0 ? (
          spectrum.map((s, idx) => (
            <span
              key={idx}
              className="bg-[#facc15] text-[#0f172a] px-2 py-0.5 rounded-full text-[10px] font-bold"
            >
              {s.period}天 ({(s.amplitude * 100).toFixed(1)}%)
            </span>
          ))
        ) : (
          <span className="text-gray-400 text-[10px]">載入行情數據後自動解算</span>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-[#0f172a]/60 p-2 rounded-lg border border-[#334155]/40 text-xs">
        <div>
          <div className="text-[#facc15] text-[10px] mb-0.5 font-medium">📊 未來5日方向概率</div>
          <div className="font-mono font-bold flex items-center gap-2 text-xs">
            <span className="text-[#4ade80]">▲ {prob.up}%</span>
            <span className="text-[#f87171]">▼ {prob.down}%</span>
            <span className="text-[#94a3b8]">— {prob.flat}%</span>
          </div>
        </div>

        <div>
          <div className="text-gray-400 text-[10px] mb-0.5 font-medium">🎨 彩帶均線多空</div>
          <div className="font-mono font-bold text-xs" style={{ color: ribbonColorHex }}>
            {ribbonTrendText} ({Math.round(ribbon.strength)}%)
          </div>
        </div>

        <div>
          <div className="text-gray-400 text-[10px] mb-0.5 font-medium">📈 技術指標評分</div>
          <div className="font-mono font-bold text-xs" style={{ color: techScoreColor }}>
            {techSign}{techInfo.score} 分
          </div>
          <div className="text-[9px] text-[#64748b] truncate">{techInfo.detail || 'RSI | MACD | %B | ATR'}</div>
        </div>
      </div>
    </div>
  );
};
