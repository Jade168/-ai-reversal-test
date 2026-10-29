import React, { useState } from 'react';

interface QuantControlPanelProps {
  symbol: string;
  setSymbol: (s: string) => void;
  period: string;
  setPeriod: (p: string) => void;
  assetType: string;
  setAssetType: (a: string) => void;
  fund: number;
  setFund: (f: number) => void;
  buyPrice: string;
  setBuyPrice: (bp: string) => void;
  coreInt: number;
  setCoreInt: (c: number) => void;
  coreDec: number;
  setCoreDec: (d: number) => void;
  onRunAnalysis: () => void;
  onStartReplay: () => void;
  isReplaying: boolean;
  onRunBatchScan: (symbols: string) => void;
  onExportReport: () => void;
  isScanningBatch: boolean;
}

export const QuantControlPanel: React.FC<QuantControlPanelProps> = ({
  symbol,
  setSymbol,
  period,
  setPeriod,
  assetType,
  setAssetType,
  fund,
  setFund,
  buyPrice,
  setBuyPrice,
  coreInt,
  setCoreInt,
  coreDec,
  setCoreDec,
  onRunAnalysis,
  onStartReplay,
  isReplaying,
  onRunBatchScan,
  onExportReport,
  isScanningBatch
}) => {
  const [batchInput, setBatchInput] = useState('TSLA,00700,NVDA,AAPL');

  return (
    <div className="bg-[#0a0a0a] p-2 rounded-md mb-1 border border-[#1f2937]">
      {/* Quick Period Selector Row */}
      <div className="flex items-center gap-1 mb-2 pb-1.5 border-b border-[#1f2937]/60 overflow-x-auto text-[11px]">
        <span className="text-gray-400 shrink-0 text-[10px] font-mono mr-1">週期窗口:</span>
        <button
          type="button"
          onClick={() => setPeriod('monthly')}
          className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
            period === 'monthly'
              ? 'bg-[#8b5cf6] text-white shadow-xs font-bold'
              : 'bg-[#1e1e24] text-gray-300 hover:bg-[#2a2a34]'
          }`}
        >
          🌕 Monthly (月線·20年宏觀)
        </button>
        <button
          type="button"
          onClick={() => setPeriod('weekly')}
          className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
            period === 'weekly'
              ? 'bg-[#6366f1] text-white shadow-xs font-bold'
              : 'bg-[#1e1e24] text-gray-300 hover:bg-[#2a2a34]'
          }`}
        >
          🌖 週線 (10年波段)
        </button>
        <button
          type="button"
          onClick={() => setPeriod('daily')}
          className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
            period === 'daily'
              ? 'bg-[#3b82f6] text-white shadow-xs font-bold'
              : 'bg-[#1e1e24] text-gray-300 hover:bg-[#2a2a34]'
          }`}
        >
          🌗 日線 (10年常規)
        </button>
        <button
          type="button"
          onClick={() => setPeriod('5min')}
          className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
            period === '5min'
              ? 'bg-[#10b981] text-white shadow-xs font-bold'
              : 'bg-[#1e1e24] text-gray-300 hover:bg-[#2a2a34]'
          }`}
        >
          ⏱️ 5分鐘 (超短線)
        </button>
      </div>

      {/* Parameter Row 1 */}
      <div className="flex flex-wrap items-center gap-1 mb-1.5">
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="代碼：TSLA/00700/^GSPC"
          className="flex-1 min-w-[110px] h-8 px-2 text-xs bg-[#030712] border border-[#374151] rounded text-white outline-hidden focus:border-[#6366f1]"
          list="symbolList"
        />
        <datalist id="symbolList">
          <option value="TSLA" />
          <option value="NVDA" />
          <option value="AAPL" />
          <option value="DIS" />
          <option value="00700" />
          <option value="03690" />
          <option value="09988" />
          <option value="XAUUSD" />
          <option value="EURUSD" />
          <option value="BTCUSD" />
          <option value="^GSPC" />
          <option value="^HSI" />
        </datalist>

        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="w-[85px] sm:w-[20%] h-8 px-1.5 text-xs bg-[#030712] border border-[#374151] rounded text-white outline-hidden focus:border-[#6366f1]"
          title="選擇K線週期（月線支援15-20年歷史）"
        >
          <option value="monthly">月線 (15-20年)</option>
          <option value="weekly">週線 (5-10年)</option>
          <option value="daily">日線 (5-10年)</option>
          <option value="5min">5分鐘</option>
        </select>

        <select
          value={assetType}
          onChange={(e) => setAssetType(e.target.value)}
          className="w-[75px] sm:w-[18%] h-8 px-1.5 text-xs bg-[#030712] border border-[#374151] rounded text-white outline-hidden"
        >
          <option value="stock">股票</option>
          <option value="index">指數</option>
          <option value="forex">外匯</option>
          <option value="crypto">加密</option>
        </select>

        <input
          type="number"
          value={fund}
          onChange={(e) => setFund(Number(e.target.value))}
          placeholder="本金"
          className="w-[85px] sm:w-[16%] h-8 px-2 text-xs bg-[#030712] border border-[#374151] rounded text-white outline-hidden"
        />

        <input
          type="number"
          step="0.01"
          value={buyPrice}
          onChange={(e) => setBuyPrice(e.target.value)}
          placeholder="買入價(可選)"
          className="w-[95px] sm:w-[18%] h-8 px-2 text-xs bg-[#030712] border border-[#374151] rounded text-white outline-hidden"
        />
      </div>

      {/* Parameter Row 2 */}
      <div className="flex flex-wrap items-center gap-1 mb-1.5">
        <input
          type="number"
          step="0.01"
          value={coreInt}
          onChange={(e) => setCoreInt(Number(e.target.value))}
          placeholder="核心數"
          className="flex-1 min-w-[70px] h-8 px-2 text-xs bg-[#030712] border border-[#374151] rounded text-white outline-hidden"
        />
        <input
          type="number"
          step="0.01"
          value={coreDec}
          onChange={(e) => setCoreDec(Number(e.target.value))}
          placeholder="偏差"
          className="flex-1 min-w-[70px] h-8 px-2 text-xs bg-[#030712] border border-[#374151] rounded text-white outline-hidden"
        />
        <button
          onClick={onRunAnalysis}
          className="flex-1 min-w-[110px] h-8 text-xs font-bold rounded bg-linear-to-br from-[#6366f1] to-[#a855f7] text-white hover:opacity-95 transition active:scale-98 shadow-sm"
        >
          📊 啟動分析
        </button>
        <button
          onClick={onStartReplay}
          disabled={isReplaying}
          className="flex-1 min-w-[110px] h-8 text-xs font-bold rounded bg-linear-to-br from-[#f59e0b] to-[#ef4444] text-white hover:opacity-95 transition active:scale-98 disabled:opacity-50 shadow-sm"
        >
          {isReplaying ? '⏸️ 回放進行中...' : '▶️ 回放回測'}
        </button>
      </div>

      {/* Batch Scan Row */}
      <div className="flex items-center gap-1 mb-1.5">
        <input
          value={batchInput}
          onChange={(e) => setBatchInput(e.target.value)}
          placeholder="批量代碼：TSLA,00700,NVDA,AAPL"
          className="flex-1 h-8 px-2 text-xs bg-[#030712] border border-[#374151] rounded text-white outline-hidden focus:border-[#6366f1]"
        />
        <button
          onClick={() => onRunBatchScan(batchInput)}
          disabled={isScanningBatch}
          className="w-[36%] max-w-[160px] h-8 px-2 text-xs font-bold rounded bg-linear-to-br from-[#6366f1] to-[#a855f7] text-white hover:opacity-95 transition active:scale-98 disabled:opacity-50 truncate"
        >
          {isScanningBatch ? '掃描中...' : '📋 批量掃描信號'}
        </button>
      </div>

      {/* Export Report Row */}
      <div>
        <button
          onClick={onExportReport}
          className="w-full h-8 text-xs font-bold rounded bg-linear-to-br from-[#6366f1] to-[#a855f7] text-white hover:opacity-95 transition active:scale-98 shadow-xs"
        >
          📊 導出完整回測報告
        </button>
      </div>
    </div>
  );
};
