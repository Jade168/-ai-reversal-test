import React, { useRef, useEffect, useState } from 'react';
import { ChatMessage } from '../types/quant';
import { PuzzleState } from '../services/puzzleDecisionEngine';

interface AiChatColumnProps {
  messages: ChatMessage[];
  aiReady: boolean;
  onInitAi: () => void;
  onSendLocal: (text: string) => void;
  onSendExpert: (text: string, forceRefresh?: boolean) => void;
  onRunZeroTokenDiagnosis?: () => void;
  isSendingExpert?: boolean;
  latestPuzzle?: PuzzleState | null;
}

export const AiChatColumn: React.FC<AiChatColumnProps> = ({
  messages,
  aiReady,
  onInitAi,
  onSendLocal,
  onSendExpert,
  onRunZeroTokenDiagnosis,
  isSendingExpert = false,
  latestPuzzle = null
}) => {
  const [inputText, setInputText] = useState('');
  const [forceRefreshCloud, setForceRefreshCloud] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputText.trim()) {
        onSendLocal(inputText.trim());
        setInputText('');
      }
    }
  };

  const handleLocalClick = () => {
    if (!inputText.trim()) return;
    onSendLocal(inputText.trim());
    setInputText('');
  };

  const handleExpertClick = () => {
    const query = inputText.trim() || '請結合月線通道、週線生命線與 TFDR 奇點給我完整實戰操盤報告';
    onSendExpert(query, forceRefreshCloud);
    setInputText('');
  };

  const signalLabelMap: Record<PuzzleState['signal'], string> = {
    GOLDEN_BUY: '🔥 80%重倉買入坐貨',
    BULL_DIP_BUY: '📈 牛市回踩中線拐頭補滿80%',
    PARTIAL_PROFIT: '🟠 減倉45%留55%底倉',
    FULL_CLEAR: '🚨 破50線100%清倉禁買',
    WEEKLY_BREAK_TRIM: '🚨 週線突變減倉40%留60%底倉',
    SHORT_ENTRY: '🟣 35%輕倉順勢沽空',
    COVER_SHORT: '💎 100%全數平空',
    HOLD: latestPuzzle?.timeSpacePrompt?.isBullRegime
      ? '🛡️ 死抱核心多單(禁空)'
      : '🚫 空倉禁買觀望'
  };

  return (
    <div className="bg-[#0a0a0a] p-2 rounded-md border border-[#8b5cf6] flex flex-col h-[520px] md:h-full min-h-[380px]">
      {/* Title */}
      <div className="text-[#8b5cf6] mb-1.5 text-[11px] font-semibold">
        🧠 數律AI大腦 v2.0｜東方財富真實數據·聯網分析·語音交互
      </div>

      {/* AI Init Row */}
      <div className="flex gap-1 mb-1.5">
        <button
          onClick={onInitAi}
          disabled={aiReady}
          className="flex-1 h-8 text-xs font-bold rounded text-white transition active:scale-98 disabled:opacity-80"
          style={{
            background: aiReady
              ? '#1f2937'
              : 'linear-gradient(135deg, #8b5cf6, #ec4899)'
          }}
        >
          {aiReady ? 'AI大腦已就緒' : '初始化AI'}
        </button>
        <span
          className="flex-1 h-8 text-xs rounded text-center flex items-center justify-center font-bold"
          style={{
            background: '#111',
            color: aiReady ? '#10b981' : '#94a3b8'
          }}
        >
          狀態: {aiReady ? '已連接 ✅' : '未連接'}
        </span>
      </div>

      {/* 單卡精簡覆蓋模式：僅渲染一張【最新時空提示單】卡片（月/季50分水嶺大勢 ＋ 日/週HA破梯 ＋ 奇點觸發帶） */}
      {latestPuzzle && (
        <div className="mb-1.5 p-2.5 rounded-md bg-slate-900/95 border border-indigo-500/50 text-xs shrink-0 shadow">
          <div className="flex items-center justify-between gap-2 pb-1.5 mb-1.5 border-b border-slate-800">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-amber-300">
                🎯 {latestPuzzle.symbol} 最新時空提示單
              </span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                {latestPuzzle.timeSpacePrompt.triggerDate} · ${latestPuzzle.currentPrice}
              </span>
            </div>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                latestPuzzle.signal === 'GOLDEN_BUY'
                  ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-600/40'
                  : latestPuzzle.signal === 'FULL_CLEAR' || latestPuzzle.signal === 'SHORT_ENTRY'
                  ? 'bg-red-950/90 text-red-300 border border-red-600/40'
                  : 'bg-slate-800 text-amber-300 border border-slate-700'
              }`}
            >
              {signalLabelMap[latestPuzzle.signal]}
            </span>
          </div>

          {/* 大勢分水嶺（月/季 50 中間線） */}
          <div
            className={`mb-1.5 px-2 py-1 rounded border font-mono text-[10.5px] flex items-center justify-between gap-2 ${
              latestPuzzle.timeSpacePrompt.isBullRegime
                ? 'bg-emerald-950/45 border-emerald-700/60'
                : 'bg-red-950/50 border-red-700/60'
            }`}
          >
            <span className="text-slate-400 shrink-0">大勢定性:</span>
            <span
              className={
                latestPuzzle.timeSpacePrompt.isBullRegime
                  ? 'text-emerald-300 font-bold'
                  : 'text-red-300 font-bold'
              }
            >
              {latestPuzzle.timeSpacePrompt.trendBannerLabel}
            </span>
          </div>

          {/* 日/週平均K破梯狀態 */}
          <div className="grid grid-cols-2 gap-1 mb-1.5 text-[10.5px] font-mono">
            <div className="px-2 py-1 rounded bg-slate-950/90 border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400">日線 HA:</span>
              <span
                className={
                  latestPuzzle.timeSpacePrompt.dBreakUp
                    ? 'text-emerald-400 font-bold'
                    : latestPuzzle.timeSpacePrompt.dBreakDown
                    ? 'text-red-400 font-bold'
                    : 'text-slate-200'
                }
              >
                {latestPuzzle.timeSpacePrompt.dBreakUp
                  ? '升穿前高 ▲'
                  : latestPuzzle.timeSpacePrompt.dBreakDown
                  ? '跌穿前低 ▼'
                  : latestPuzzle.timeframes.D.haBull
                  ? '陽梯延續'
                  : '陰梯整理'}
              </span>
            </div>
            <div className="px-2 py-1 rounded bg-slate-950/90 border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400">週線 HA:</span>
              <span
                className={
                  latestPuzzle.timeSpacePrompt.wBreakUp
                    ? 'text-emerald-400 font-bold'
                    : latestPuzzle.timeSpacePrompt.wBreakDown
                    ? 'text-red-400 font-bold'
                    : 'text-slate-200'
                }
              >
                {latestPuzzle.timeSpacePrompt.wBreakUp
                  ? '升穿前高 ▲'
                  : latestPuzzle.timeSpacePrompt.wBreakDown
                  ? '跌穿前低 ▼'
                  : latestPuzzle.timeframes.W.haBull
                  ? '陽梯延續'
                  : '陰梯整理'}
              </span>
            </div>
          </div>

          <div className="mb-1.5 px-2 py-1 rounded bg-slate-950/85 border border-slate-800 font-mono text-[10px] flex flex-wrap items-center justify-between gap-1">
            <span className="text-emerald-300">
              日TFDR <b>{latestPuzzle.timeSpacePrompt.dTfdr}</b> (買≤25 / 減≥88)
            </span>
            <span className="text-cyan-300">
              月50 <b>${latestPuzzle.timeSpacePrompt.m50Line}</b> · 季50 <b>${latestPuzzle.timeSpacePrompt.q50Line}</b>
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1 mb-1 text-[10.5px]">
            <div className="p-1.5 rounded bg-emerald-950/40 border border-emerald-700/40">
              <div className="text-emerald-400 text-[9.5px]">🟢 低吸埋伏區</div>
              <div className="font-mono font-bold text-white">
                ${latestPuzzle.timeSpacePrompt.buyZone.low}–${latestPuzzle.timeSpacePrompt.buyZone.high}
              </div>
            </div>
            <div className="p-1.5 rounded bg-red-950/40 border border-red-700/40">
              <div className="text-red-400 text-[9.5px]">🔴 高拋警戒區</div>
              <div className="font-mono font-bold text-white">
                ${latestPuzzle.timeSpacePrompt.takeProfitZone.low}–${latestPuzzle.timeSpacePrompt.takeProfitZone.high}
              </div>
            </div>
            <div className="p-1.5 rounded bg-amber-950/40 border border-amber-700/40">
              <div className="text-amber-400 text-[9.5px]">🛑 50線分水嶺</div>
              <div className="font-mono font-bold text-white">
                ${latestPuzzle.timeSpacePrompt.invalidationPrice}
              </div>
            </div>
          </div>

          <div className="text-[10.5px] text-indigo-200 font-medium truncate">
            ⚡ {latestPuzzle.timeSpacePrompt.actionTitle}
          </div>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 min-h-0 overflow-y-auto p-1.5 pr-1 overscroll-contain bg-[#050505] rounded-md mb-1.5 border border-[#222] space-y-2 text-xs">
        {messages.map((msg) => {
          if (msg.role === 'system') {
            return (
              <div
                key={msg.id}
                className="w-full text-center p-2 rounded bg-cyan-500/10 text-cyan-300 text-[11px] whitespace-pre-wrap leading-relaxed"
              >
                {msg.text}
              </div>
            );
          }

          if (msg.role === 'error') {
            return (
              <div
                key={msg.id}
                className="w-full p-2 rounded bg-red-950/70 border border-red-800 text-red-200 text-[11px]"
              >
                {msg.text}
              </div>
            );
          }

          if (msg.role === 'user') {
            return (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-[88%] p-2 px-3 rounded-lg bg-linear-to-br from-[#8b5cf6] to-[#ec4899] text-white whitespace-pre-wrap leading-relaxed">
                  {msg.text}
                </div>
              </div>
            );
          }

          if (msg.role === 'expert') {
            return (
              <div key={msg.id} className="flex justify-start">
                <div className="max-w-[94%] p-2.5 rounded-lg bg-[#1a0b2e] text-[#f5d0fe] border border-[#3b0764] whitespace-pre-wrap leading-relaxed text-[11.5px]">
                  <div className="font-bold text-[#d8b4fe] mb-1 flex items-center gap-1">
                    🌐 專家深度推演
                  </div>
                  {msg.text}
                </div>
              </div>
            );
          }

          // local AI
          return (
            <div key={msg.id} className="flex justify-start">
              <div className="max-w-[94%] p-2.5 rounded-lg bg-[#111] text-[#ddd] border border-[#333] whitespace-pre-wrap leading-relaxed">
                {msg.text}
              </div>
            </div>
          );
        })}
        {isSendingExpert && (
          <div className="text-center p-2 text-purple-300 text-[11px] animate-pulse">
            🌐 正在聯網調用專家大模型進行深度多維度推演...
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input Row */}
      <div className="flex gap-1 mb-1">
        <input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="提問：TSLA後市點睇？00700支持位？邊隻值得買？"
          className="flex-1 h-8 px-2 text-xs bg-[#111] border border-[#333] rounded text-white outline-hidden focus:border-[#8b5cf6]"
          autoComplete="off"
        />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-1 mb-1">
        <button
          onClick={handleLocalClick}
          className="flex-1 h-8 px-2 text-xs font-bold rounded bg-[#10b981] text-white hover:bg-[#059669] transition active:scale-98"
        >
          💬 AI對話
        </button>
        {onRunZeroTokenDiagnosis && (
          <button
            onClick={onRunZeroTokenDiagnosis}
            className="flex-1 h-8 px-2 text-xs font-bold rounded bg-amber-600 text-white hover:bg-amber-500 transition active:scale-98"
            title="開源量化零流量分析員（0 Token 消耗，0.01 秒生成）"
          >
            ⚡ 零流量診斷
          </button>
        )}
        <button
          onClick={handleExpertClick}
          disabled={isSendingExpert}
          className="flex-1 h-8 px-2 text-xs font-bold rounded bg-[#8b5cf6] text-white hover:bg-[#7c3aed] transition active:scale-98 disabled:opacity-50"
        >
          🌐 專家分析
        </button>
      </div>
      <label className="flex items-center justify-end gap-1.5 text-[10px] text-slate-400 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={forceRefreshCloud}
          onChange={(e) => setForceRefreshCloud(e.target.checked)}
          className="accent-purple-500 w-3 h-3"
        />
        <span>強制刷新雲端報告（跳過 4 小時省流快取）</span>
      </label>
    </div>
  );
};
