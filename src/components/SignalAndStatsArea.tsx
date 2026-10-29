import React from 'react';
import { ModelBar, SymbolInfo, BacktestStats, ResonanceAnalysis } from '../types/quant';

interface SignalAndStatsAreaProps {
  lastBar: ModelBar | null;
  symbolInfo: SymbolInfo | null;
  stats: BacktestStats | null;
  resonance: ResonanceAnalysis | null;
  sentiment: string;
  userBuyPrice: string;
}

export const SignalAndStatsArea: React.FC<SignalAndStatsAreaProps> = ({
  lastBar,
  symbolInfo,
  stats,
  resonance,
  sentiment,
  userBuyPrice
}) => {
  if (!lastBar || !symbolInfo || !stats) return null;

  const isStrongBuy = lastBar.buySignal || lastBar.reversalSignal === 'STRONG_BUY';
  const isCriticalSell = lastBar.sellSignal || lastBar.reversalSignal === 'CRITICAL_SELL';

  let signalClass = 'bg-white/5 border border-slate-700 text-white';
  let signalText = '🟡 STATUS: HOLD';

  if (isStrongBuy) {
    signalClass = 'bg-emerald-500/15 border border-emerald-500 text-emerald-400';
    signalText = '🟢 STRONG BUY（時空共振買入）';
  } else if (isCriticalSell) {
    signalClass = 'bg-red-500/15 border border-red-500 text-red-400';
    signalText = '🔴 CRITICAL SELL（時空共振賣出）';
  }

  const numericBuyPrice = userBuyPrice ? parseFloat(userBuyPrice) : null;
  const isTotalReturnProfit = parseFloat(stats.totalReturn) >= 0;

  return (
    <div className="mb-1 space-y-1">
      {/* Date & Live Price Header */}
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="px-1.5 py-0.5 rounded-xs bg-[#1f2937] text-gray-400 text-[10px]">
          日期：{lastBar.date?.split(' ')[0]}
        </span>
        <span className="px-2 py-0.5 rounded-xs bg-emerald-500/20 text-emerald-400 font-bold text-sm">
          最新價：${lastBar.c.toFixed(2)}
        </span>
      </div>

      {/* Main Signal Box */}
      <div className={`p-2 rounded-md text-center text-sm font-bold shadow-xs ${signalClass}`}>
        {signalText}
      </div>

      {/* Cosmic Status Banner */}
      <div
        className="text-[11px] text-center font-bold py-1 px-2 rounded-sm border border-[#334155]/50"
        style={{
          background: isStrongBuy ? '#064e3b' : isCriticalSell ? '#7f1d1d' : '#1e293b',
          color: isStrongBuy ? '#34d399' : isCriticalSell ? '#f87171' : '#fbbf24'
        }}
      >
        {isStrongBuy
          ? '🟢 STATUS: STRONG BUY · 時空共振點'
          : isCriticalSell
          ? '🔴 STATUS: CRITICAL SELL · 時空反轉點'
          : '🟡 STATUS: HOLD · 實驗量化訊號'}
      </div>

      {/* Next bar execution note */}
      <div className="text-[10px] text-center text-gray-400 py-0.5">
        下一棒開市價模擬成交；未計手續費及滑點
      </div>

      {/* 6-Grid Stats Panel */}
      <div className="grid grid-cols-3 gap-1 my-1">
        <div className="bg-[#111] p-1.5 rounded-sm text-center border border-[#222]">
          <div className="text-[9px] text-[#888] mb-0.5">總收益率</div>
          <div className={`text-xs font-bold ${isTotalReturnProfit ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
            {stats.totalReturn}%
          </div>
        </div>

        <div className="bg-[#111] p-1.5 rounded-sm text-center border border-[#222]">
          <div className="text-[9px] text-[#888] mb-0.5">勝率</div>
          <div className="text-xs font-bold text-[#10b981]">{stats.winRate}%</div>
        </div>

        <div className="bg-[#111] p-1.5 rounded-sm text-center border border-[#222]">
          <div className="text-[9px] text-[#888] mb-0.5">盈虧比</div>
          <div className="text-xs font-bold text-gray-200">{stats.profitLossRatio}</div>
        </div>

        <div className="bg-[#111] p-1.5 rounded-sm text-center border border-[#222]">
          <div className="text-[9px] text-[#888] mb-0.5">最大回撤</div>
          <div className="text-xs font-bold text-[#ef4444]">{stats.maxDrawdown}%</div>
        </div>

        <div className="bg-[#111] p-1.5 rounded-sm text-center border border-[#222]">
          <div className="text-[9px] text-[#888] mb-0.5">交易次數</div>
          <div className="text-xs font-bold text-[#ffd700]">{stats.tradeCount}</div>
        </div>

        <div className="bg-[#111] p-1.5 rounded-sm text-center border border-[#222]">
          <div className="text-[9px] text-[#888] mb-0.5">年化收益</div>
          <div className="text-xs font-bold text-gray-200">{stats.annualReturn}%</div>
        </div>
      </div>

      {/* Key Levels Tags */}
      <div className="flex flex-wrap gap-1 text-[10px] my-1">
        <span className="px-1.5 py-0.5 rounded-xs bg-[#1f2937] text-gray-300">
          核心線：${lastBar.coreGravityLine.toFixed(2)}
        </span>
        <span className="px-1.5 py-0.5 rounded-xs bg-emerald-500/20 text-emerald-400 font-bold">
          強支撐：${lastBar.supportLine1.toFixed(2)}
        </span>
        <span className="px-1.5 py-0.5 rounded-xs bg-[#1f2937] text-gray-300">
          弱支撐：${lastBar.supportLine2.toFixed(2)}
        </span>
        <span className="px-1.5 py-0.5 rounded-xs bg-purple-500/20 text-purple-300 font-bold">
          阻力：${lastBar.resistanceLine.toFixed(2)}
        </span>
      </div>

      {/* 🔮 369 + 142857 複合共振分析顯示區 */}
      {resonance && (
        <div className="mt-1.5 p-2 bg-linear-to-br from-[#1a0b2e] to-[#0d1b2a] rounded-md border border-[#8b5cf6] text-xs">
          <div className="text-[#8b5cf6] font-bold mb-1.5 flex items-center justify-between">
            <span>🔮 369 + 142857 複合共振分析</span>
            <span className="text-[10px] text-gray-400 font-normal">江恩循環 × 數律樞紐</span>
          </div>

          <div className="grid grid-cols-3 gap-1 mb-1.5">
            <div className="bg-[#111] p-1 rounded-sm text-center border border-[#222]">
              <div className="text-[#666] text-[9px]">現價</div>
              <div className="text-white font-bold">${lastBar.c.toFixed(2)}</div>
              <div className="text-[#8b5cf6] text-[9px]">歸元 {resonance.guiYuan.current}</div>
            </div>
            <div className="bg-[#111] p-1 rounded-sm text-center border border-[#222]">
              <div className="text-[#666] text-[9px]">142857支撐</div>
              <div className="text-[#10b981] font-bold">${resonance.suggestions.strongBuy}</div>
              <div className="text-[#666] text-[9px]">0.71倍</div>
            </div>
            <div className="bg-[#111] p-1 rounded-sm text-center border border-[#222]">
              <div className="text-[#666] text-[9px]">142857阻力</div>
              <div className="text-[#ef4444] font-bold">${resonance.suggestions.sellZone}</div>
              <div className="text-[#666] text-[9px]">1.14倍</div>
            </div>
          </div>

          <div className="bg-[#222] p-1.5 rounded-sm mb-1.5 text-center">
            <div
              className="font-bold text-xs"
              style={{
                color: resonance.signal.includes('買')
                  ? '#10b981'
                  : resonance.signal.includes('賣')
                  ? '#ef4444'
                  : '#ffd700'
              }}
            >
              {resonance.signal}
            </div>
            <div className="text-[#999] text-[10px]">{resonance.action}</div>
          </div>

          <div className="grid grid-cols-2 gap-1 mb-1.5">
            <div className="bg-[#1a2e1a] p-1.5 rounded-sm border-l-2 border-[#10b981]">
              <div className="text-[#10b981] text-[9px]">🟢 溝貨區</div>
              <div className="text-white font-bold text-[10px]">
                ${resonance.suggestions.strongBuy} - ${resonance.suggestions.buyZone}
              </div>
            </div>
            <div className="bg-[#2e1a1a] p-1.5 rounded-sm border-l-2 border-[#ef4444]">
              <div className="text-[#ef4444] text-[9px]">🔴 賣出區</div>
              <div className="text-white font-bold text-[10px]">
                ${resonance.suggestions.sellZone} - ${resonance.suggestions.target2}
              </div>
            </div>
          </div>

          <div className="p-1.5 bg-[#111] rounded-sm text-[10px] space-y-0.5">
            <div className="text-[#666] font-semibold">📋 操作建議：</div>
            <div className="text-[#10b981]">
              買入：${resonance.suggestions.strongBuy} | 目標1：${resonance.suggestions.target1} | 目標2：${resonance.suggestions.target2}
            </div>
            <div className="text-[#ffd700]">止蝕防守：${resonance.suggestions.stopLoss}</div>
          </div>

          {numericBuyPrice && (
            <div className="mt-1.5 p-1.5 bg-[#1a0b2e] rounded-sm text-[10px] border border-[#8b5cf6]/60">
              <div className="text-[#8b5cf6]">
                💰 你的買入價：${numericBuyPrice} (歸元 {resonance.guiYuan.buy})
              </div>
              <div
                className="font-bold mt-0.5"
                style={{ color: lastBar.c < numericBuyPrice ? '#10b981' : '#ef4444' }}
              >
                {lastBar.c < numericBuyPrice
                  ? '✅ 錯價機會！現價低於買入成本，可於溝貨區分批攤平'
                  : '❌ 現價高於買入價，注意逢高鎖利'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* News Sentiment Tag */}
      {sentiment && (
        <div className="flex items-center gap-1.5 text-xs pt-0.5">
          <span className="px-2 py-0.5 rounded-xs bg-yellow-500/20 text-[#ffd700] text-[10px] font-bold">
            新聞情感：{sentiment}
          </span>
        </div>
      )}
    </div>
  );
};
