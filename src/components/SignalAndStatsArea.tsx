import React, { useState } from 'react';
import { ModelBar, SymbolInfo, BacktestStats, ResonanceAnalysis, TradeLog } from '../types/quant';
import { MultiTimeframeTFDR, TFDRPoint } from '../services/tfdrIndicator';
import { LocalExpertSummary } from '../services/localQuantAnalyst';
import { SleeveBacktestResult } from '../services/sleeveBacktest';

interface SignalAndStatsAreaProps {
  lastBar: ModelBar | null;
  symbolInfo: SymbolInfo | null;
  stats: BacktestStats | null;
  resonance: ResonanceAnalysis | null;
  sentiment: string;
  userBuyPrice: string;
  tfdr?: MultiTimeframeTFDR | null;
  latestTfdrPoint?: TFDRPoint | null;
  expertSummary?: LocalExpertSummary | null;
  tradeLogs?: TradeLog[];
  sleeveResult?: SleeveBacktestResult | null;
}

export const SignalAndStatsArea: React.FC<SignalAndStatsAreaProps> = ({
  lastBar,
  symbolInfo,
  stats,
  resonance,
  sentiment,
  userBuyPrice,
  tfdr,
  latestTfdrPoint,
  expertSummary,
  tradeLogs = [],
  sleeveResult = null
}) => {
  if (!lastBar || !symbolInfo || !stats) return null;

  // 底部共振分析框預設收合（單行摘要條），把螢幕空間讓畀 K 線圖同交易紀錄框；撳一下先展開全文
  const [resonanceExpanded, setResonanceExpanded] = useState(false);

  // 回測模式開關：雙袖版（2026-11-22 最終方案）預設；現行版一切照舊，開關只切換顯示邊套已計算結果
  const [backtestMode, setBacktestMode] = useState<'sleeve' | 'current'>('sleeve');
  const showSleeve = backtestMode === 'sleeve' && !!sleeveResult;
  const sleeveStats = showSleeve ? sleeveResult!.stats : null;
  const sleeveReadout = showSleeve ? sleeveResult!.readout : null;

  const isStrongBuy = lastBar.buySignal || lastBar.reversalSignal === 'STRONG_BUY';
  const isCriticalSell = lastBar.sellSignal || lastBar.reversalSignal === 'CRITICAL_SELL';

  const quantStatus = isStrongBuy
    ? '🟢 STRONG BUY'
    : isCriticalSell
    ? '🔴 CRITICAL SELL'
    : '🟡 STATUS: HOLD';

  const riskBadgeClass =
    tfdr?.riskLevel === 'EXTREME_TOP'
      ? 'bg-red-600 text-white'
      : tfdr?.riskLevel === 'EXTREME_BOTTOM'
      ? 'bg-emerald-600 text-white'
      : tfdr?.riskLevel === 'SHORT_OVERHEAT'
      ? 'bg-orange-500 text-white'
      : isStrongBuy
      ? 'bg-emerald-700 text-emerald-100'
      : isCriticalSell
      ? 'bg-red-700 text-red-100'
      : 'bg-slate-700 text-amber-300';

  const numericBuyPrice = userBuyPrice ? parseFloat(userBuyPrice) : null;
  const isTotalReturnProfit = parseFloat(stats.totalReturn) >= 0;

  return (
    <div className="mb-1 space-y-1">
      {/* Date & Live Price Header */}
      <div className="flex items-center justify-between text-xs">
        <span className="px-1.5 py-0.5 rounded-xs bg-[#1f2937] text-gray-400 text-[10px]">
          日期：{lastBar.date?.split(' ')[0]}
        </span>
        <span className="px-2 py-0.5 rounded-xs bg-emerald-500/20 text-emerald-400 font-bold text-sm">
          最新價：${lastBar.c.toFixed(2)}
        </span>
      </div>

      {/* ⚡ 雙核終極量化決策中樞（合併 TFDR 奇點矩陣 + 量化訊號框 + 回測統計） */}
      <div className="bg-slate-900/90 border border-indigo-500/40 rounded-lg p-3 mb-2 shadow-lg">
        {/* 頂部標題與日週月奇點分數並排 */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-800">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-amber-400">⚡ 雙核量化決策中樞</span>
            <span className={`px-2 py-0.5 text-xs font-bold rounded ${riskBadgeClass}`}>
              {quantStatus}{tfdr ? ` · ${tfdr.regimeTitle}` : ''}
            </span>
          </div>

          {/* 日/週/月 TFDR 分數膠囊 */}
          {tfdr && (
            <div className="flex items-center gap-1.5 text-xs flex-wrap">
              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                日線TFDR: <b className="text-white font-mono">{tfdr.dailyScore}</b>
              </span>
              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                週線TFDR: <b className="text-white font-mono">{tfdr.weeklyScore}</b>
              </span>
              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                月線TFDR: <b className="text-white font-mono">{tfdr.monthlyScore}</b>
              </span>
            </div>
          )}
        </div>

        {/* 明確的操作指令與 TFDR 逃頂/抄底參考價（同步左側專家分析大腦結論） */}
        <div className="text-xs text-slate-200 bg-slate-800/60 p-2 rounded mb-2 leading-relaxed">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className="text-indigo-400 font-bold">【明確操作指令】</span>
            {expertSummary && (
              <span className="font-bold text-amber-300">{expertSummary.confidenceTag}</span>
            )}
          </div>
          <div>
            {expertSummary
              ? expertSummary.coreAction
              : tfdr?.actionAdvice || '按原定 1836.15 數律支撐阻力位執行波段操作。'}
          </div>
          {expertSummary && (
            <div className="mt-1 text-[10.5px] text-slate-400">
              {expertSummary.regimeLabel} ｜ {expertSummary.trendQuality}
            </div>
          )}
          <div className="mt-1 flex flex-wrap gap-3 text-[11px]">
            <span className="text-red-400">
              🔴 TFDR 90 逃頂參考: <b className="font-mono">${latestTfdrPoint ? latestTfdrPoint.band90.toFixed(2) : '--'}</b>
            </span>
            <span className="text-emerald-400">
              🟢 TFDR 15 抄底參考: <b className="font-mono">${latestTfdrPoint ? latestTfdrPoint.band15.toFixed(2) : '--'}</b>
            </span>
          </div>
        </div>

        {/* 回測模式開關（雙袖版預設；現行版照舊） */}
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-[10px] text-slate-400 font-bold">回測模式：</span>
          <button
            type="button"
            onClick={() => setBacktestMode('sleeve')}
            className={`px-2 py-0.5 text-[11px] font-bold rounded ${backtestMode === 'sleeve' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'}`}
          >
            雙袖版（新）
          </button>
          <button
            type="button"
            onClick={() => setBacktestMode('current')}
            className={`px-2 py-0.5 text-[11px] font-bold rounded ${backtestMode === 'current' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'}`}
          >
            現行版
          </button>
          {backtestMode === 'sleeve' && !sleeveResult && (
            <span className="text-[10px] text-amber-400">雙袖版未有結果，暫顯示現行版</span>
          )}
        </div>

        {/* 四合一面板＋雙袖核心狀態讀數（只做顯示，唔揸核心開關） */}
        {sleeveReadout && (
          <div className="text-xs text-slate-200 bg-slate-800/60 p-2 rounded mb-2 leading-relaxed">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <span className="text-indigo-400 font-bold">【四合一面板・雙袖核心狀態】</span>
              <span className="text-slate-400 text-[10.5px]">{sleeveReadout.date}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-1">
              {(
                [
                  ['均線', sleeveReadout.pillars.ma],
                  ['奇點', sleeveReadout.pillars.singularity],
                  ['月季50', sleeveReadout.pillars.mq50],
                  ['月HA', sleeveReadout.pillars.mHa]
                ] as [string, number][]
              ).map(([name, v]) => (
                <span key={name} className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                  {v === 1 ? '🟢' : v === -1 ? '🔴' : '⚪'} {name}
                </span>
              ))}
              <span className="px-1.5 py-0.5 rounded bg-indigo-900/70 text-indigo-200 font-bold">
                總分 {sleeveReadout.pillars.upCount}/4 向上
              </span>
            </div>
            <div>
              核心方向：{sleeveReadout.directionUp ? '🟢 向上' : '🔴 向下'}（均線{sleeveReadout.maUp ? '🟢' : '🔴'}｜奇點{sleeveReadout.singularityUp ? '🟢' : '🔴'}）
              ｜核心狀態：{sleeveReadout.coreInMarket ? `在場 ${sleeveReadout.coreHoldingShares.toLocaleString()} 股` : '空倉'}
              ｜10% 袖：{sleeveReadout.tMode === 'T' ? '做 T 模式' : '反彈模式'}（持股 {sleeveReadout.tHoldingShares.toLocaleString()}）
            </div>
            <div className="mt-0.5">
              沽出層：
              {sleeveReadout.sellLayer.status === 'FLAT'
                ? '核心空倉'
                : sleeveReadout.sellLayer.status === 'IDLE'
                ? '未武裝（未有頂確認）'
                : sleeveReadout.sellLayer.status === 'CONFIRMED_GATED'
                ? `已確認待觸發（${sleeveReadout.sellLayer.viaDiv && sleeveReadout.sellLayer.viaMacd ? '背馳＋MACD' : sleeveReadout.sellLayer.viaDiv ? '背馳路' : 'MACD 路'}）・趨勢閘 A 未過，唔沽`
                : `已確認（${sleeveReadout.sellLayer.viaDiv && sleeveReadout.sellLayer.viaMacd ? '背馳＋MACD' : sleeveReadout.sellLayer.viaDiv ? '背馳路' : 'MACD 路'}）＋閘 A 通過・奇點沽出觸發即全出`}
              ｜月均線：<b className="font-mono">${sleeveReadout.maValue != null ? sleeveReadout.maValue.toFixed(2) : '--'}</b>
              ｜現價對均線：<b className="font-mono">{sleeveReadout.closeVsMaPct != null ? `${sleeveReadout.closeVsMaPct >= 0 ? '+' : ''}${sleeveReadout.closeVsMaPct.toFixed(1)}%` : '--'}</b>
            </div>
          </div>
        )}

        {showSleeve && sleeveStats ? (
        <div className="grid grid-cols-3 gap-1">
          <div className="bg-black/45 p-1.5 rounded-sm text-center border border-slate-800">
            <div className="text-[9px] text-[#888] mb-0.5">總收益率（雙袖）</div>
            <div className={`text-xs font-bold ${sleeveStats.totalReturn >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
              {sleeveStats.totalReturn.toFixed(2)}%
            </div>
          </div>
          <div className="bg-black/45 p-1.5 rounded-sm text-center border border-slate-800">
            <div className="text-[9px] text-[#888] mb-0.5">期末淨值</div>
            <div className="text-xs font-bold text-gray-200">${Math.round(sleeveStats.finalFund).toLocaleString()}</div>
          </div>
          <div className="bg-black/45 p-1.5 rounded-sm text-center border border-slate-800">
            <div className="text-[9px] text-[#888] mb-0.5">最大回撤</div>
            <div className="text-xs font-bold text-[#ef4444]">{sleeveStats.maxDrawdown.toFixed(2)}%</div>
          </div>
          <div className="bg-black/45 p-1.5 rounded-sm text-center border border-slate-800">
            <div className="text-[9px] text-[#888] mb-0.5">核心成交</div>
            <div className="text-xs font-bold text-[#ffd700]">{sleeveStats.coreTradeCount}</div>
          </div>
          <div className="bg-black/45 p-1.5 rounded-sm text-center border border-slate-800">
            <div className="text-[9px] text-[#888] mb-0.5">做 T 成交</div>
            <div className="text-xs font-bold text-[#ffd700]">{sleeveStats.tTradeCount}</div>
          </div>
          <div className="bg-black/45 p-1.5 rounded-sm text-center border border-slate-800">
            <div className="text-[9px] text-[#888] mb-0.5">強制沽出</div>
            <div className="text-xs font-bold text-orange-400">{sleeveStats.overrideSellCount}</div>
          </div>
          <div className="bg-black/45 p-1.5 rounded-sm text-center border border-slate-800">
            <div className="text-[9px] text-[#888] mb-0.5">定時買回</div>
            <div className="text-xs font-bold text-emerald-400">{sleeveStats.buybackCount}</div>
          </div>
          <div className="bg-black/45 p-1.5 rounded-sm text-center border border-slate-800">
            <div className="text-[9px] text-[#888] mb-0.5">核心在場</div>
            <div className="text-xs font-bold text-gray-200">{sleeveStats.coreHeldRatio.toFixed(1)}%</div>
          </div>
          <div className="bg-black/45 p-1.5 rounded-sm text-center border border-slate-800">
            <div className="text-[9px] text-[#888] mb-0.5">核心袖期末</div>
            <div className="text-xs font-bold text-gray-200">${Math.round(sleeveStats.coreFinalEquity).toLocaleString()}</div>
          </div>
          <div className="bg-black/45 p-1.5 rounded-sm text-center border border-slate-800">
            <div className="text-[9px] text-[#888] mb-0.5">T 袖期末</div>
            <div className="text-xs font-bold text-gray-200">${Math.round(sleeveStats.tFinalEquity).toLocaleString()}</div>
          </div>
          <div className="bg-black/45 p-1.5 rounded-sm text-center border border-slate-800">
            <div className="text-[9px] text-[#888] mb-0.5">交易日數</div>
            <div className="text-xs font-bold text-gray-200">{sleeveStats.tradingDays}</div>
          </div>
          <div className="bg-black/45 p-1.5 rounded-sm text-center border border-slate-800">
            <div className="text-[9px] text-[#888] mb-0.5">回測區間</div>
            <div className="text-[10px] font-bold text-gray-200">{sleeveStats.startDate.slice(2)} ~ {sleeveStats.endDate.slice(2)}</div>
          </div>
        </div>
        ) : (
        <>
        {/* 總收益率、勝率、盈虧比等核心回測網格 */}
        <div className="grid grid-cols-3 gap-1">
          <div className="bg-black/45 p-1.5 rounded-sm text-center border border-slate-800">
            <div className="text-[9px] text-[#888] mb-0.5">總收益率</div>
            <div className={`text-xs font-bold ${isTotalReturnProfit ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
              {stats.totalReturn}%
            </div>
          </div>

          <div className="bg-black/45 p-1.5 rounded-sm text-center border border-slate-800">
            <div className="text-[9px] text-[#888] mb-0.5">勝率</div>
            <div className="text-xs font-bold text-[#10b981]">{stats.winRate}%</div>
          </div>

          <div className="bg-black/45 p-1.5 rounded-sm text-center border border-slate-800">
            <div className="text-[9px] text-[#888] mb-0.5">盈虧比</div>
            <div className="text-xs font-bold text-gray-200">{stats.profitLossRatio}</div>
          </div>

          <div className="bg-black/45 p-1.5 rounded-sm text-center border border-slate-800">
            <div className="text-[9px] text-[#888] mb-0.5">最大回撤</div>
            <div className="text-xs font-bold text-[#ef4444]">{stats.maxDrawdown}%</div>
          </div>

          <div className="bg-black/45 p-1.5 rounded-sm text-center border border-slate-800">
            <div className="text-[9px] text-[#888] mb-0.5">交易次數</div>
            <div className="text-xs font-bold text-[#ffd700]">{stats.tradeCount}</div>
          </div>

          <div className="bg-black/45 p-1.5 rounded-sm text-center border border-slate-800">
            <div className="text-[9px] text-[#888] mb-0.5">年化收益</div>
            <div className="text-xs font-bold text-gray-200">{stats.annualReturn}%</div>
          </div>
        </div>
        </>
        )}

        {showSleeve ? (
        <div className="text-[10px] text-center text-gray-500 mt-1.5">
          雙袖版（2026-11-22 最終方案）｜核心 90% 跟 V2 大方向（奇點狀態 OR 月線 10 個月均線＋兩日確認）全入/全出・沽出層留底：頂確認（背馳路：60 日新高區＋RSI 曾 ≥70＋背馳／MACD 路：月線 MACD(6,13,5) 紅柱高位轉弱）＋奇點沽出觸發＋趨勢閘 A（月均線斜率向上＋收市高均線 ≥10%）→ 次日全出・定時 15 個交易日買回（期間方向已轉下就唔入）・10% 袖：向上做 T（奇點買入／回踩入、高拋／全清／週線減倉出）、向下反彈（只奇點買入、升穿均線即出）・T 日決策、T+1 開盤成交・單邊 0.25%・兩袖各自複利、唔互相撥款・四合一面板只做顯示，唔揸開關
        </div>
        ) : (
        <div className="text-[10px] text-center text-gray-500 mt-1.5">
          T-1無未來函數決策｜T日開盤驗假破成交（單邊0.25%成本・四態大勢倉位上限 S1/S2 80%・S3 30%・月線過熱（mTFDR≥85／曾觸90未真正見底反轉）買入上限20%・月線破底100%禁買・週線大陰（實體&gt;1.2倍ATR或≥3.5%＋高位背景）跌穿前兩枝100%禁買＋即時清倉・解鎖後第一筆買入限倉40%（右側確認，唔係底部全倉）・強勢大升浪（季／月TFDR≥60或季月週HA齊升）分級做T（35–48買50%／≤35買100%）・逼空追擊（48–62＋三級HA齊升＋日HA轉陽破前高）買40%・買入要 ma3 拐頭向上（ma3&gt;prevMa3）＋奇點武裝後 1–7 日內＋日TFDR&lt;62／週TFDR&lt;68（禁追高；S3 收緊到日TFDR&lt;45）・ma3 刺穿 band90 拐頭＋浮盈≥5% 高拋45%・全新買入唔同波段重複加倉・弱勢期只做≤35深回調・護盾過熱期關閉・總回撤&gt;25%暫停開倉・&lt;15%解鎖・單筆 ≥ 5% 本金）
        </div>
        )}

        {!showSleeve && (<>
        {/* 整合於決策中樞底部的雙核回測交易紀錄 */}
        <div className="mt-3 pt-2.5 border-t border-slate-800">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-amber-400">
              📜 統一引擎回測帳本（T日預警 ➔ T+1開盤驗假破・上下滑動檢視）
            </span>
            <span className="text-[11px] text-slate-400">共 {tradeLogs.length} 筆操盤指令</span>
          </div>
          <div className="max-h-[520px] min-h-[450px] overflow-y-auto pr-1 space-y-1.5 overscroll-contain">
            {tradeLogs.length > 0 ? (
              tradeLogs.map((log, idx) => {
                const actionColor =
                  log.action.includes('買入') ||
                  log.action.includes('補回') ||
                  log.action.includes('低吸')
                    ? 'text-emerald-400'
                    : log.action.includes('沽空')
                    ? 'text-purple-400'
                    : log.action.includes('平空')
                    ? 'text-cyan-400'
                    : log.action.includes('鎖利')
                    ? 'text-amber-400'
                    : log.action.includes('減倉')
                    ? 'text-orange-400'
                    : 'text-red-400';

                const isCompliant = log.complianceTag?.includes('精準執行');

                return (
                  <div
                    key={idx}
                    className="text-xs p-2 rounded bg-slate-800/80 border border-slate-700/60 flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center flex-wrap gap-1.5 min-w-0">
                        <span className="text-slate-400 font-mono text-[10.5px]">
                          [預警 {log.signalDate || log.date} ➔ 成交 {log.execDate || log.date}]
                        </span>
                        <span className={`font-bold ${actionColor}`}>
                          {log.action} {log.shares.toLocaleString()}股
                        </span>
                        {log.complianceTag && (
                          <span
                            className={`px-1.5 py-0.2 text-[10px] rounded border font-semibold ${
                              isCompliant
                                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-600/40'
                                : 'bg-amber-950/80 text-amber-300 border-amber-600/40'
                            }`}
                          >
                            {log.complianceTag}
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-[11px] shrink-0">
                        <span className="text-slate-200">@ ${log.price}</span>
                        {log.profitPct !== null && (
                          <span
                            className={`ml-1.5 font-bold ${
                              log.profitPct >= 0 ? 'text-emerald-400' : 'text-red-400'
                            }`}
                          >
                            {log.profitPct >= 0 ? `+${log.profitPct}%` : `${log.profitPct}%`}
                          </span>
                        )}
                      </div>
                    </div>
                    {log.puzzleHint && (
                      <div className="text-[10px] text-indigo-300/90 font-mono truncate">
                        拼圖區間：{log.puzzleHint}
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
                      <span className="truncate">觸發依據：{log.source}</span>
                      {log.holdingType === 'SHORT' ? (
                        <span className="shrink-0 text-purple-400 font-medium">
                          操作後空單持倉：{log.totalHolding.toLocaleString()} 股
                        </span>
                      ) : log.holdingType === 'LONG' ? (
                        <span className="shrink-0 text-emerald-400 font-medium">
                          操作後多單持倉：{log.totalHolding.toLocaleString()} 股
                        </span>
                      ) : (
                        <span className="shrink-0 text-slate-400">
                          操作後總持倉：0 股 (空倉)
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-slate-500 text-center py-4 text-xs">
                點擊「啟動分析」生成數律＋TFDR 雙向多空破梯回測紀錄...
              </div>
            )}
          </div>
        </div>
        </>)}

        {/* 雙袖版回測帳本（模式開關切換顯示，現行版帳本原封不動） */}
        {showSleeve && sleeveResult && (
        <div className="mt-3 pt-2.5 border-t border-slate-800">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-amber-400">
              📜 雙袖版回測帳本（T日決策 ➔ T+1開盤成交・上下滑動檢視）
            </span>
            <span className="text-[11px] text-slate-400">共 {sleeveResult.logs.length} 筆操盤指令</span>
          </div>
          <div className="max-h-[520px] min-h-[450px] overflow-y-auto pr-1 space-y-1.5 overscroll-contain">
            {sleeveResult.logs.length > 0 ? (
              sleeveResult.logs.map((log, idx) => {
                const actionColor =
                  log.reason === 'OVERRIDE_SELL'
                    ? 'text-orange-400'
                    : log.side === 'BUY'
                    ? 'text-emerald-400'
                    : 'text-red-400';
                return (
                  <div
                    key={idx}
                    className="text-xs p-2 rounded bg-slate-800/80 border border-slate-700/60 flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center flex-wrap gap-1.5 min-w-0">
                        <span className="text-slate-400 font-mono text-[10.5px]">
                          [決策 {log.signalDate} ➔ 成交 {log.date}]
                        </span>
                        <span className={`font-bold ${actionColor}`}>
                          {log.sleeveLabel} {log.actionLabel} {log.shares.toLocaleString()}股
                        </span>
                      </div>
                      <div className="font-mono text-[11px] shrink-0">
                        <span className="text-slate-200">@ ${log.price.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
                      <span className="truncate">觸發依據：{log.reasonLabel}</span>
                      <span className="shrink-0 text-slate-400">
                        操作後{log.sleeveLabel}持倉：{log.holdingAfter.toLocaleString()} 股
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-slate-500 text-center py-4 text-xs">
                雙袖版未有成交紀錄...
              </div>
            )}
          </div>
        </div>
        )}
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

      {/* 🔮 369 + 142857 複合共振分析顯示區（預設收合為單行摘要條，撳一下展開全文） */}
      {resonance && (
        <div
          className={`mt-1.5 rounded-md border border-[#8b5cf6] bg-linear-to-br from-[#1a0b2e] to-[#0d1b2a] text-xs overflow-hidden ${
            resonanceExpanded ? '' : 'max-h-[72px]'
          }`}
        >
          <button
            type="button"
            onClick={() => setResonanceExpanded(v => !v)}
            className="w-full flex items-center justify-between gap-2 px-2 py-1.5 text-left"
            title={resonanceExpanded ? '收合複合共振分析' : '展開複合共振分析'}
          >
            <span className="text-[#8b5cf6] font-bold truncate">
              🔮 369 + 142857 複合共振分析｜{resonance.signal}｜現價 ${lastBar.c.toFixed(2)}｜支撐 $
              {resonance.suggestions.strongBuy}｜阻力 ${resonance.suggestions.sellZone}
            </span>
            <span className="text-[10px] text-gray-400 font-normal shrink-0">
              {resonanceExpanded ? '▲ 收合' : '▼ 展開'}
            </span>
          </button>

          {resonanceExpanded && (
            <div className="p-2 pt-0">
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
