import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { ModelBar, RawKline } from '../types/quant';
import { calculateDynamicReversals } from '../services/quantCalculations';
import { calculateTFDRSeries } from '../services/tfdrIndicator';
import {
  buildFullPuzzleTimeline,
  buildNestedPuzzlePiP,
  NestedPuzzlePiPData,
  OHLCBar,
  PuzzleState
} from '../services/puzzleDecisionEngine';
import { computeEnginePeriodSingularityLabels } from '../services/enginePeriodLabels';
import { computeQqpModelLayer, QqpModelLayer, QqpLeg, aggregateMonthlyBars, computeMonthlyLeg } from '../services/qqpModelSignals';
import { movingAverage, priorMovingAverage, displayEndIdx, clickBarIndex, sliderRangeEndDate } from '../services/chartMath';
import { ZoomIn, ZoomOut, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';

// L1 季線白/淺藍半透明箱體 + 50% 虛線 ｜ L2 月線黑 K 棒 + 50% 橫槓 ｜ L3 週線綠 K 棒 + 50% 橫槓 ｜ L4 日線黃色 HA K 棒 + 金星買點
const FourTimeframeOverlayPiP: React.FC<{
  puzzleState: PuzzleState;
  nestedData: NestedPuzzlePiPData | null;
  /** 【即日價・顯示專用】合資格即日棒（HeaderChart 已閘好）；淨係用嚟顯示標籤嗰格日期／收市價 */
  liveBar?: RawKline | null;
}> = ({ puzzleState, nestedData, liveBar = null }) => {
  // 桌面預設展開、手機版預設收合以免遮擋主圖
  const [pipCollapsed, setPipCollapsed] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const chartGeometry = useMemo(() => {
    if (!nestedData || nestedData.dCandles.length < 2) return null;
    const { qBoxes, mCandles, wCandles, dCandles, minPrice, maxPrice } = nestedData;
    const len = dCandles.length;
    const padPrice = (maxPrice - minPrice) * 0.04 || 1;
    const loP = minPrice - padPrice;
    const hiP = maxPrice + padPrice;
    const priceRange = Math.max(0.001, hiP - loP);

    const w = 344;
    const h = 148;
    const padLeft = 4;
    const padRight = 4;
    const padTop = 6;
    const padBottom = 6;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;
    const stepX = plotW / len;

    const toCenterX = (idx: number) => padLeft + idx * stepX + stepX / 2;
    const toLeftX = (idx: number) => padLeft + idx * stepX;
    const toRightX = (idx: number) => padLeft + (idx + 1) * stepX;
    const toPriceY = (v: number) =>
      padTop + (1 - (v - loP) / priceRange) * plotH;

    return {
      w,
      h,
      padLeft,
      plotW,
      padTop,
      padBottom,
      stepX,
      len,
      loP,
      hiP,
      qBoxes,
      mCandles,
      wCandles,
      dCandles,
      toCenterX,
      toLeftX,
      toRightX,
      toPriceY
    };
  }, [nestedData]);

  const activeCandle =
    nestedData && hoverIdx != null && nestedData.dCandles[hoverIdx]
      ? nestedData.dCandles[hoverIdx]
      : nestedData && nestedData.dCandles.length > 0
      ? nestedData.dCandles[nestedData.dCandles.length - 1]
      : null;

  const tsp = puzzleState.timeSpacePrompt;

  // 【即日價・顯示專用】未 hover 嗰陣，標籤顯示即日日期＋收市價＋「即日」；hover 緊就顯示返
  // hover 緊嗰支蠟燭（烘焙版）。小窗入面幅迷你圖本身繼續用烘焙數據，唔郁。
  const labelIsLive = hoverIdx == null && !!liveBar;
  const labelDate = labelIsLive ? (liveBar!.date || '').slice(0, 10) : activeCandle?.date;
  const labelClose = labelIsLive ? liveBar!.c : activeCandle?.close;

  return (
    <div
      className="absolute top-2 left-2 z-20 w-[328px] sm:w-[392px] max-w-[94vw] bg-slate-950/92 backdrop-blur-md border border-indigo-500/50 rounded-lg p-2 shadow-2xl select-none"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2 pb-1 mb-1.5 border-b border-slate-800">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10.5px] font-bold text-amber-400 truncate">
            🧩 四週期 50% 切線嵌套拼圖 (近1年)
          </span>
          {puzzleState.isPuzzleCross && (
            <span className="px-1 py-0.2 rounded bg-amber-500/20 border border-amber-400/60 text-amber-300 text-[9px] font-bold shrink-0">
              ★ 黃金買點
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setPipCollapsed(prev => !prev)}
          className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 flex items-center gap-0.5 shrink-0 transition"
          title={pipCollapsed ? '展開四週期 50% 切線嵌套拼圖' : '收合四週期 50% 切線嵌套拼圖'}
        >
          {pipCollapsed ? (
            <>
              展開 <ChevronDown size={11} />
            </>
          ) : (
            <>
              收合 <ChevronUp size={11} />
            </>
          )}
        </button>
      </div>

      {!pipCollapsed && (
        <>
          {chartGeometry && activeCandle && nestedData ? (
            <div className="relative bg-slate-900/95 rounded border border-slate-800 p-1">
              <div className="flex justify-between text-[8.5px] font-mono text-slate-400 px-0.5 mb-0.5">
                <span>高 ${nestedData.maxPrice.toFixed(2)}</span>
                <span className="text-slate-200">
                  {labelDate} · 收 ${labelClose != null ? labelClose.toFixed(2) : '--'}
                  {labelIsLive && <span className="text-amber-300 font-bold"> 即日</span>}
                </span>
              </div>

              <svg
                width="100%"
                height={chartGeometry.h}
                viewBox={`0 0 ${chartGeometry.w} ${chartGeometry.h}`}
                className="overflow-visible block cursor-crosshair"
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const relX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * chartGeometry.w;
                  const norm = Math.max(
                    0,
                    Math.min(1, (relX - chartGeometry.padLeft) / Math.max(1, chartGeometry.plotW))
                  );
                  const idx = Math.round(norm * (chartGeometry.len - 1));
                  setHoverIdx(idx);
                }}
                onMouseLeave={() => setHoverIdx(null)}
              >
                {/* L1 季線半透明方框（交替白 / 淺藍），嚴格貼合每季真實 [qLow, qHigh] + 50% 水平虛線 */}
                {chartGeometry.qBoxes.map((qb) => {
                  const x1 = chartGeometry.toLeftX(qb.startIdx);
                  const x2 = chartGeometry.toRightX(qb.endIdx);
                  const yTop = chartGeometry.toPriceY(qb.high);
                  const yBot = chartGeometry.toPriceY(qb.low);
                  const yMid50 = chartGeometry.toPriceY(qb.mid50);
                  const boxH = Math.max(2, yBot - yTop);
                  const fill = qb.isAltColor
                    ? 'rgba(56, 189, 248, 0.20)'
                    : 'rgba(255, 255, 255, 0.16)';
                  const stroke = qb.isAltColor
                    ? 'rgba(125, 211, 252, 0.45)'
                    : 'rgba(255, 255, 255, 0.35)';
                  return (
                    <g key={`q-${qb.key}`}>
                      <rect
                        x={x1}
                        y={yTop}
                        width={Math.max(2, x2 - x1)}
                        height={boxH}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth="0.7"
                      />
                      <line
                        x1={x1}
                        y1={yMid50}
                        x2={x2}
                        y2={yMid50}
                        stroke="#e2e8f0"
                        strokeWidth="1"
                        strokeDasharray="3,2"
                        opacity="0.85"
                      />
                    </g>
                  );
                })}

                {/* L2 月線黑色 K 棒 + 50% 橫槓 */}
                {chartGeometry.mCandles.map((mc) => {
                  const x1 = chartGeometry.toLeftX(mc.startIdx);
                  const x2 = chartGeometry.toRightX(mc.endIdx);
                  const spanW = Math.max(4, x2 - x1);
                  const cx = (x1 + x2) / 2;
                  const bodyW = Math.max(3, spanW * 0.58);
                  const yHigh = chartGeometry.toPriceY(mc.high);
                  const yLow = chartGeometry.toPriceY(mc.low);
                  const yOpen = chartGeometry.toPriceY(mc.open);
                  const yClose = chartGeometry.toPriceY(mc.close);
                  const yMid50 = chartGeometry.toPriceY(mc.mid50);
                  const bodyTop = Math.min(yOpen, yClose);
                  const bodyH = Math.max(2, Math.abs(yClose - yOpen));
                  return (
                    <g key={`m-${mc.key}`}>
                      <line
                        x1={cx}
                        y1={yHigh}
                        x2={cx}
                        y2={yLow}
                        stroke="#64748b"
                        strokeWidth="1"
                      />
                      <rect
                        x={cx - bodyW / 2}
                        y={bodyTop}
                        width={bodyW}
                        height={bodyH}
                        fill="rgba(9, 9, 11, 0.85)"
                        stroke="#94a3b8"
                        strokeWidth="0.75"
                      />
                      <line
                        x1={cx - bodyW / 2 - 1}
                        y1={yMid50}
                        x2={cx + bodyW / 2 + 1}
                        y2={yMid50}
                        stroke="#f8fafc"
                        strokeWidth="1.15"
                      />
                    </g>
                  );
                })}

                {/* L3 週線綠色 K 棒 + 50% 橫槓 */}
                {chartGeometry.wCandles.map((wc) => {
                  const x1 = chartGeometry.toLeftX(wc.startIdx);
                  const x2 = chartGeometry.toRightX(wc.endIdx);
                  const spanW = Math.max(2, x2 - x1);
                  const cx = (x1 + x2) / 2;
                  const bodyW = Math.max(1.8, spanW * 0.64);
                  const yHigh = chartGeometry.toPriceY(wc.high);
                  const yLow = chartGeometry.toPriceY(wc.low);
                  const yOpen = chartGeometry.toPriceY(wc.open);
                  const yClose = chartGeometry.toPriceY(wc.close);
                  const yMid50 = chartGeometry.toPriceY(wc.mid50);
                  const bodyTop = Math.min(yOpen, yClose);
                  const bodyH = Math.max(1.5, Math.abs(yClose - yOpen));
                  return (
                    <g key={`w-${wc.key}`}>
                      <line
                        x1={cx}
                        y1={yHigh}
                        x2={cx}
                        y2={yLow}
                        stroke="rgba(52, 211, 153, 0.72)"
                        strokeWidth="0.75"
                      />
                      <rect
                        x={cx - bodyW / 2}
                        y={bodyTop}
                        width={bodyW}
                        height={bodyH}
                        fill="rgba(16, 185, 129, 0.42)"
                        stroke="rgba(52, 211, 153, 0.82)"
                        strokeWidth="0.55"
                      />
                      <line
                        x1={cx - bodyW / 2 - 0.8}
                        y1={yMid50}
                        x2={cx + bodyW / 2 + 0.8}
                        y2={yMid50}
                        stroke="#6ee7b7"
                        strokeWidth="1.05"
                      />
                    </g>
                  );
                })}

                {/* L4 最前景：日線黃色 HA K 棒 + 黃金星 ★ 交匯買點 */}
                {chartGeometry.dCandles.map((dc, idx) => {
                  const cx = chartGeometry.toCenterX(idx);
                  const bodyW = Math.max(1, chartGeometry.stepX * 0.72);
                  const yHigh = chartGeometry.toPriceY(dc.high);
                  const yLow = chartGeometry.toPriceY(dc.low);
                  const yHaOpen = chartGeometry.toPriceY(dc.haOpen);
                  const yHaClose = chartGeometry.toPriceY(dc.haClose);
                  const bodyTop = Math.min(yHaOpen, yHaClose);
                  const bodyH = Math.max(1.2, Math.abs(yHaClose - yHaOpen));
                  const fill = dc.isHaBull ? '#facc15' : '#422006';
                  const stroke = dc.isHaBull ? '#fef08a' : '#ca8a04';
                  return (
                    <g key={`d-${dc.date}`}>
                      <line
                        x1={cx}
                        y1={yHigh}
                        x2={cx}
                        y2={yLow}
                        stroke={dc.isHaBull ? '#fde047' : '#a16207'}
                        strokeWidth="0.65"
                      />
                      <rect
                        x={cx - bodyW / 2}
                        y={bodyTop}
                        width={bodyW}
                        height={bodyH}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth="0.4"
                      />
                    </g>
                  );
                })}

                {/* 金色星形標記：上穿週線 50% 切線之 GOLDEN_BUY 交匯點 */}
                {chartGeometry.dCandles
                  .filter(dc => dc.isGoldenStar)
                  .map(dc => {
                    const cx = chartGeometry.toCenterX(dc.idx);
                    const cy = chartGeometry.toPriceY(dc.low) + 7;
                    return (
                      <g key={`star-${dc.date}`}>
                        <circle cx={cx} cy={cy - 2} r="5.5" fill="#fbbf24" opacity="0.25" />
                        <text
                          x={cx}
                          y={cy + 1.5}
                          textAnchor="middle"
                          fill="#fbbf24"
                          stroke="#78350f"
                          strokeWidth="0.35"
                          fontSize="10"
                          fontWeight="bold"
                        >
                          ★
                        </text>
                      </g>
                    );
                  })}

                {/* 懸停垂直指示線 */}
                {hoverIdx != null && chartGeometry.dCandles[hoverIdx] && (
                  <line
                    x1={chartGeometry.toCenterX(hoverIdx)}
                    y1={chartGeometry.padTop}
                    x2={chartGeometry.toCenterX(hoverIdx)}
                    y2={chartGeometry.h - chartGeometry.padBottom}
                    stroke="#94a3b8"
                    strokeWidth="0.8"
                    strokeDasharray="2,2"
                  />
                )}
              </svg>

              {/* 三層 50% 平衡切線即時數值註腳 */}
              <div className="mt-1 px-1 py-0.5 rounded bg-slate-950/90 border border-slate-800/80 text-[8.5px] font-mono text-slate-300 space-y-0.5">
                <div className="flex justify-between">
                  <span>低 ${nestedData.minPrice.toFixed(2)}</span>
                  <span className="text-amber-300">
                    日TFDR {activeCandle.dTfdr}｜金星買點 {nestedData.starCount} 枚
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-2">
                  <span className="text-sky-200">
                    季50%:${(activeCandle.qMid50 ?? tsp.qMid50).toFixed(2)}
                  </span>
                  <span className="text-slate-200">
                    月50%:${(activeCandle.mMid50 ?? tsp.mMid50).toFixed(2)}
                  </span>
                  <span className="text-emerald-300">
                    週50%:${(activeCandle.wMid50 ?? tsp.wMid50).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/90 p-2 rounded border border-slate-800 text-[10px] text-slate-400">
              一年期嵌套 50% 切線數據累積中...
            </div>
          )}

          {/* 圖層色碼對照與關鍵價位 */}
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 text-[9px] text-slate-300">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2 bg-sky-400/30 border border-sky-300/60 inline-block" /> 季箱50%
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2.5 bg-zinc-950 border border-slate-400 inline-block" /> 月黑K
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2.5 bg-emerald-500/45 border border-emerald-400 inline-block" /> 週綠K
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2.5 bg-yellow-400 inline-block" /> 日黃HA
            </span>
            <span className="flex items-center gap-1 text-amber-300 font-semibold">
              ★ 黃金買點
            </span>
          </div>

          <div className="mt-1 pt-1 border-t border-slate-800 text-[9.5px] text-slate-300 flex justify-between font-mono">
            <span>
              低吸:<b className="text-emerald-400">${tsp.buyZone.low}</b>
            </span>
            <span>
              高拋:<b className="text-amber-400">${tsp.takeProfitZone.low}</b>
            </span>
            <span>
              清倉:<b className="text-red-400">${tsp.invalidationPrice}</b>
            </span>
          </div>
        </>
      )}
    </div>
  );
};

/**
 * 【即日價・顯示專用】即日未完成棒可唔可以畫上圖（純函數，方便測試）：
 * 只限日線圖、非回放、日期新過最後一支烘焙棒。週／月／5 分鐘圖唔畫（即日棒係日線棒）。
 * 呢個判斷只影響蠟燭顯示，唔掂任何引擎／模型／指標計算（嗰啲全部繼續用 activeData）。
 */
export function getLiveDisplayBar(
  activeData: Array<{ date?: string }>,
  liveTodayBar: RawKline | null | undefined,
  timeframe: string | undefined,
  isReplay: boolean
): RawKline | null {
  if (!liveTodayBar || isReplay) return null;
  const tf = String(timeframe || '1d').toLowerCase();
  if (tf !== 'daily' && tf !== '1d') return null;
  const liveDate = (liveTodayBar.date || '').slice(0, 10);
  const lastDate = (activeData[activeData.length - 1]?.date || '').slice(0, 10);
  if (!liveDate || !lastDate || liveDate <= lastDate) return null;
  if (
    !Number.isFinite(liveTodayBar.o) ||
    !Number.isFinite(liveTodayBar.h) ||
    !Number.isFinite(liveTodayBar.l) ||
    !Number.isFinite(liveTodayBar.c)
  ) {
    return null;
  }
  return liveTodayBar;
}

/** 【即日價・顯示專用】即日棒轉做圖表 ModelBar：中性指標欄位，唔生任何訊號／標記／線。 */
export function toLiveModelBar(live: RawKline): ModelBar {
  return {
    timestamp: live.timestamp,
    date: live.date,
    o: live.o,
    h: live.h,
    l: live.l,
    c: live.c,
    vol: live.vol ?? 0,
    coreGravityLine: 0,
    supportLine1: 0,
    supportLine2: 0,
    resistanceLine: 0,
    pivot: 0,
    dateGuiYuan: 0,
    priceGuiYuan: 0,
    buySignal: false,
    sellSignal: false,
    isResonance: false,
    deviation: 0,
    sentiment: '',
    isLiveToday: true
  };
}

interface HeaderChartProps {
  data: ModelBar[];
  dailyKlines?: RawKline[];
  /** 即日未完成棒（顯示專用）：只畫多一支蠟燭，唔入任何計算 */
  liveTodayBar?: RawKline | null;
  isLoading: boolean;
  loadingMessage: string;
  isReplay: boolean;
  replayIndex: number;
  hologramLine?: number[];
  onBarClick?: (bar: ModelBar) => void;
  timeframe?: string;
  supportLevels?: number[];
  resistanceLevels?: number[];
  puzzleState?: PuzzleState | null;
}

export const HeaderChart: React.FC<HeaderChartProps> = ({
  data,
  dailyKlines = [],
  liveTodayBar = null,
  isLoading,
  loadingMessage,
  isReplay,
  replayIndex,
  hologramLine = [],
  timeframe = '1d',
  supportLevels = [],
  resistanceLevels = [],
  puzzleState = null
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sliderTrackRef = useRef<HTMLDivElement>(null);

  // 1. 圖表顯示模式狀態：【傳統數律共振】⇄【TFDR 奇點通道】
  const [chartMode, setChartMode] = useState<'CLASSIC' | 'TFDR'>('CLASSIC');

  // 奇點文字標籤顯示開關：只隱藏 TFDR 模式下「奇點買／奇點沽」細字標籤（小三角箭頭保留），K 線本身不受影響
  const [showSingularityLabels, setShowSingularityLabels] = useState<boolean>(true);

  // QQP v1.3＋tfdr55 模型頂／底顯示層開關（純顯示）：快訊號空心三角＋確認訊號實心三角
  const [showModelSignals, setShowModelSignals] = useState<boolean>(true);

  // 主圖燭體來源：HA＝引擎單層平均K（預設；燭身讀引擎 OverlayPoint.haOpen/haClose、影線用原始高低）；
  // RAW＝原始陰陽燭。純渲染切換——數據管線與引擎永遠只用原始 OHLC，呢個 state 唔會回寫任何數據。
  const [candleSource, setCandleSource] = useState<'HA' | 'RAW'>('HA');

  // Viewport / zoom / pan state
  const [viewRange, setViewRange] = useState<{ start: number; end: number } | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [selectedBar, setSelectedBar] = useState<{ barIdx: number; x: number; y: number } | null>(null);
  const [crosshairDismissed, setCrosshairDismissed] = useState(false);

  // 滑鼠 / 單指拖拽平移狀態
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number; moved: boolean; startIdx: number; endIdx: number }>({
    x: 0,
    y: 0,
    moved: false,
    startIdx: 0,
    endIdx: 0
  });
  // 記錄右上角白色十字星數據條座標矩形（供點擊直接隱藏）
  const infoPillRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  // 底部時間軸滑塊拖拽狀態
  const isSliderDraggingRef = useRef(false);
  const sliderDragStartRef = useRef<{ x: number; startIdx: number; endIdx: number }>({
    x: 0,
    startIdx: 0,
    endIdx: 0
  });

  // 雙指縮放初始距離
  const pinchStartRef = useRef<{ dist: number; startIdx: number; endIdx: number } | null>(null);

  // 2. 簡化高低位標籤文字函數（解決文字過長重疊問題）
  const formatShortSignalLabel = useCallback(
    (type: 'HIGH' | 'LOW', isStrong: boolean) => {
      if (chartMode === 'TFDR') {
        return type === 'HIGH' ? '奇點沽' : '奇點買';
      }
      if (type === 'HIGH') {
        return isStrong ? '強阻' : '頂';
      }
      return isStrong ? '強支' : '底';
    },
    [chartMode]
  );

  // Slice data based on replay
  const activeData = useMemo(() => {
    if (data.length === 0) return [];
    if (isReplay) {
      return data.slice(0, Math.min(replayIndex + 1, data.length));
    }
    return data;
  }, [data, isReplay, replayIndex]);

  // 【即日價・顯示專用】畫圖嗰陣先喺尾部加多一支即日蠟燭。activeData 本身一字唔郁：
  // tfdrSeries／boxMarkers／engineChartData／enginePeriodLabels／qqpModelLayer／
  // nestedPiPData 全部繼續讀 activeData（烘焙版），即日棒只入下面 drawChart 嘅
  // visibleBars，唔影響任何訊號／指標／引擎數字。
  const liveBar = useMemo(
    () => getLiveDisplayBar(activeData, liveTodayBar, timeframe, isReplay),
    [activeData, liveTodayBar, timeframe, isReplay]
  );
  const displayBars = useMemo<ModelBar[]>(
    () => (liveBar ? [...activeData, toLiveModelBar(liveBar)] : activeData),
    [activeData, liveBar]
  );

  // 【平均線・顯示專用】各時間框架一條平均線（方向參考，唔係支持位買入訊號）：
  // 日線 MA20（收市價 20 日平均）、週線 MA20（20 週收市平均——Peter 2026-11-26 話週 MA10
  // 離價太近，升勢嗰陣成日跌落線下，要遠多少少；實測 MA20 中位離價約 MA10 兩倍，升勢週跌穿率
  // 低約 10 個百分點）、月線 M10（之前 10 個
  // 已完結月份嘅月尾收市平均，唔包而家呢個月——數值同決策面板「月均線」一致，
  // NVDA 2026-11 係 $200.52）。5 分鐘圖唔畫。烘焙收市價＋即日棒現價一齊計
  // （即日棒只限日線圖），條線畫到最右邊；純顯示，唔入任何引擎／模型／TFDR／回測計算。
  // MA 支持研究已驗：掂到率高但守得住率近零（MA20 8%、MA50／MA100 0%），買掂到全部輸錢；
  // 入場仍然要等 HA 梯級反轉，唔可以用 MA 代替確認。
  const maLine = useMemo((): { label: string | null; values: number[]; title: string } => {
    const tf = String(timeframe || '1d').toLowerCase();
    const closes = displayBars.map(b => b.c);
    if (tf === 'weekly') {
      return {
        label: 'MA20（週）',
        values: movingAverage(closes, 20),
        title:
          'MA20（週）方向參考：週收市企 MA 之上＝升勢、跌穿之下＝跌勢。只做方向參考，唔係支持位買入訊號（研究：MA 掂到守得住率近零，買掂到全部輸錢；入場要等 HA 梯級反轉）。顯示專用，唔入任何引擎／模型計算'
      };
    }
    if (tf === 'monthly') {
      return {
        label: 'M10（月）',
        values: priorMovingAverage(closes, 10),
        title:
          'M10（月）方向參考：月收市企 M10 之上＝升勢、跌穿之下＝跌勢。數值同決策面板「月均線」一致（之前 10 個已完結月份平均，唔包而家呢個月）。只做方向參考，唔係支持位買入訊號。顯示專用，唔入任何引擎／模型計算'
      };
    }
    if (tf === 'daily' || tf === '1d') {
      return {
        label: 'MA20',
        values: movingAverage(closes, 20),
        title:
          'MA20 方向參考：收市企 MA 之上＝升勢、跌穿之下＝跌勢。只做方向參考，唔係支持位買入訊號（研究：MA 掂到守得住率 MA20 8%、MA50／MA100 0%，買掂到全部輸錢；入場要等 HA 梯級反轉）。顯示專用，唔入任何引擎／模型計算'
      };
    }
    return { label: null, values: [], title: '' };
  }, [displayBars, timeframe]);

  // 引擎對齊數據（純讀取引擎輸出，唔改任何數據管線）：以原始 OHLC 跑一次 buildFullPuzzleTimeline，取得
  // (1) 每日單層 HA 開/收（主圖 HA 燭身，與 PiP L4 層同一來源）、(2) 引擎奇點武裝點、扣扳機參考線區間、
  // 實際觸發日。主圖奇點標籤改讀呢份引擎狀態，同系統實際買賣 100% 同步，唔再用 tfdrIndicator 另一套公式。
  // 只喺日線圖啟用；週/月線圖改用下面 enginePeriodLabels（引擎週/月 TFDR＋85/15），兩者都唔可用時回退舊標籤。
  const engineChartData = useMemo(() => {
    if (!(timeframe === 'daily' || timeframe === '1d')) return null;
    const base: RawKline[] = dailyKlines.length > 0 ? dailyKlines : (activeData as unknown as RawKline[]);
    if (!base || base.length < 70 || activeData.length === 0) return null;
    try {
      const ohlc: OHLCBar[] = base.map(b => ({
        date: (b.date || '').slice(0, 10),
        open: Number(b.o),
        high: Number(b.h),
        low: Number(b.l),
        close: Number(b.c)
      }));
      const timeline = buildFullPuzzleTimeline(ohlc);
      const idxByDate = new Map<string, number>();
      activeData.forEach((b, i) => idxByDate.set((b.date || '').slice(0, 10), i));
      const haByDate = new Map<string, { haOpen: number; haClose: number }>();
      timeline.overlays.forEach(op => haByDate.set(op.date, { haOpen: op.haOpen, haClose: op.haClose }));
      const highs: Array<{ index: number; price: number }> = [];
      const lows: Array<{ index: number; price: number }> = [];
      const spans: Array<{ from: number; to: number; price: number; kind: 'SELL' | 'BUY' }> = [];
      const triggers: Array<{ index: number; price: number; kind: 'SELL' | 'BUY' }> = [];
      const armedDays: Array<{ idx: number; low: number | null; high: number | null }> = [];
      timeline.verdicts.forEach((v, i) => {
        const idx = idxByDate.get(timeline.sorted[i].date);
        if (idx == null) return;
        const prev = i > 0 ? timeline.verdicts[i - 1] : null;
        // 武裝點：觸發價首次出現或改變嗰日，就係設定該價嘅奇點燭本身
        if (v.singularityLow != null && (!prev || prev.singularityLow !== v.singularityLow)) {
          highs.push({ index: idx, price: activeData[idx].h });
        }
        if (v.singularityHigh != null && (!prev || prev.singularityHigh !== v.singularityHigh)) {
          lows.push({ index: idx, price: activeData[idx].l });
        }
        armedDays.push({ idx, low: v.singularityLow ?? null, high: v.singularityHigh ?? null });
        // 實際觸發日：引擎嗰日真係出咗奇點扣扳機裁決
        if (v.signal === 'PARTIAL_PROFIT') triggers.push({ index: idx, price: activeData[idx].h, kind: 'SELL' });
        if (v.signal === 'GOLDEN_BUY') triggers.push({ index: idx, price: activeData[idx].l, kind: 'BUY' });
      });
      // 扣扳機參考線區間：同一觸發價連續生效嘅日子
      const buildSpans = (key: 'low' | 'high', kind: 'SELL' | 'BUY') => {
        let cur: { from: number; price: number } | null = null;
        for (let k = 0; k < armedDays.length; k++) {
          const d = armedDays[k];
          const price = d[key];
          if (price != null) {
            if (!cur || cur.price !== price) {
              if (cur) spans.push({ from: cur.from, to: armedDays[k - 1].idx, price: cur.price, kind });
              cur = { from: d.idx, price };
            }
          } else if (cur) {
            spans.push({ from: cur.from, to: armedDays[k - 1].idx, price: cur.price, kind });
            cur = null;
          }
        }
        if (cur) spans.push({ from: cur.from, to: armedDays[armedDays.length - 1].idx, price: cur.price, kind });
      };
      buildSpans('low', 'SELL');
      buildSpans('high', 'BUY');
      return { haByDate, highs, lows, spans, triggers };
    } catch {
      return null;
    }
  }, [dailyKlines, activeData, timeframe]);

  // 週/月線圖奇點標籤（丙方案＋85/15）：改讀引擎週/月 TFDR——每支期燭攞嗰個週期最後一個交易日
  // 嘅引擎 overlay 值（收口嗰刻已知、零未來函數），≥85／≤15 連續入區為一簇，標籤貼簇內極值燭。
  // 只限週/月線圖；日線圖用上面 engineChartData。引擎數據唔可用時回 null，繪圖退回舊標籤。
  const enginePeriodLabels = useMemo(() => {
    if (!(timeframe === 'weekly' || timeframe === 'monthly')) return null;
    if (dailyKlines.length === 0 || activeData.length === 0) return null;
    const ohlc: OHLCBar[] = dailyKlines.map(b => ({
      date: (b.date || '').slice(0, 10),
      open: Number(b.o),
      high: Number(b.h),
      low: Number(b.l),
      close: Number(b.c)
    }));
    return computeEnginePeriodSingularityLabels(
      ohlc,
      activeData.map(b => ({ date: (b.date || '').slice(0, 10), h: b.h, l: b.l })),
      timeframe
    );
  }, [dailyKlines, activeData, timeframe]);

  // QQP v1.3＋tfdr55 模型頂／底層（純顯示——唔改任何引擎／交易判定）：
  // 日線圖用日線 K 線計 D 模型（入面聚合週線做一致），週線圖用週線 K 線計 W 模型
  // （月線一致由日線聚合傳入）；月線圖無模型，唔顯示。
  // 訊號點先按日期對返 activeData 嘅 index（replay 切片下，未來訊號自動唔見）。
  // 數據唔夠（<70 棒）或者計唔到就回 null，唔顯示、唔報錯。
  const qqpModelLayer = useMemo((): QqpModelLayer | null => {
    if (timeframe === 'monthly') return null;
    const period = timeframe === 'weekly' ? 'W' : 'D';
    const base: RawKline[] = period === 'D'
      ? (dailyKlines.length > 0 ? dailyKlines : (activeData as unknown as RawKline[]))
      : (activeData as unknown as RawKline[]);
    if (!base || base.length === 0 || activeData.length === 0) return null;
    // 週線圖：月線一致由完整日線聚合（無日線就當無一致，訊號照過）
    const monthlyForW =
      period === 'W' && dailyKlines.length > 0
        ? aggregateMonthlyBars(
            dailyKlines.map(b => ({
              date: (b.date || '').slice(0, 10),
              o: Number(b.o),
              h: Number(b.h),
              l: Number(b.l),
              c: Number(b.c),
              vol: b.vol
            }))
          )
        : null;
    const layer = computeQqpModelLayer(
      base.map(b => ({
        date: (b.date || '').slice(0, 10),
        o: Number(b.o),
        h: Number(b.h),
        l: Number(b.l),
        c: Number(b.c),
        vol: b.vol
      })),
      period,
      monthlyForW
    );
    if (!layer) return null;
    const idxByDate = new Map<string, number>();
    activeData.forEach((b, i) => idxByDate.set((b.date || '').slice(0, 10), i));
    const remap = (pts: Array<{ index: number; price: number; date: string }>) => {
      const out: Array<{ index: number; price: number; date: string }> = [];
      for (const p of pts) {
        const idx = idxByDate.get(p.date);
        if (idx != null) out.push({ index: idx, price: p.price, date: p.date });
      }
      return out;
    };
    return {
      ...layer,
      fastHighs: remap(layer.fastHighs),
      fastLows: remap(layer.fastLows),
      confirmedHighs: remap(layer.confirmedHighs),
      confirmedLows: remap(layer.confirmedLows)
    };
  }, [dailyKlines, activeData, timeframe]);

  // 【大周期・顯示專用】月線 25% zigzag 腿向：日線腿向一日 V 形反彈就翻得轉
  // （NVDA 2026-11-23 一日 +32% 確認底即翻上升腿，同版面其他向下訊號撞晒）；
  // 改用月線腿向——一個月先確認一次，唔會俾一日反彈翻轉。唔改 qqpModelLayer
  // 嘅日線／週線腿向（模型層其他地方繼續用）。月線由完整日線聚合；
  // 無日線嗰陣月線圖直接用 activeData（本身就係月線棒）。
  const monthlyLeg = useMemo((): { leg: QqpLeg; pivotDate: string | null; pivotPrice: number | null } | null => {
    const base: RawKline[] =
      dailyKlines.length > 0
        ? dailyKlines
        : timeframe === 'monthly'
          ? (activeData as unknown as RawKline[])
          : [];
    if (!base || base.length === 0) return null;
    try {
      const monthly = aggregateMonthlyBars(
        base.map(b => ({
          date: (b.date || '').slice(0, 10),
          o: Number(b.o),
          h: Number(b.h),
          l: Number(b.l),
          c: Number(b.c),
          vol: b.vol
        }))
      );
      if (!monthly || !monthly.bars || monthly.bars.length < 2) return null;
      return computeMonthlyLeg(monthly.bars);
    } catch {
      return null;
    }
  }, [dailyKlines, activeData, timeframe]);

  // 從完整日線（fallback 至 activeData）構建無未來函數一年期 (~250日) L1~L4 嵌套 50% 平衡切線拼圖
  // 嚴格鎖定主圖最新日：拼圖窗口錨定 activeData 最後一枝 K 線日期（近 250 個交易日正序），
  // 同主圖最新走勢 100% 實時對齊，唔再出現走勢倒掛。
  const nestedPiPData = useMemo<NestedPuzzlePiPData | null>(() => {
    const base: RawKline[] = dailyKlines.length > 0 ? dailyKlines : activeData;
    if (!base.length) return null;
    const replayCutoff =
      isReplay && activeData.length > 0 ? (activeData[activeData.length - 1].date || '').slice(0, 10) : null;
    const anchorDate =
      activeData.length > 0 ? (activeData[activeData.length - 1].date || '').slice(0, 10) : null;
    const ohlc: OHLCBar[] = base
      .map(b => ({
        date: (b.date || '').slice(0, 10),
        open: Number(b.o),
        high: Number(b.h),
        low: Number(b.l),
        close: Number(b.c)
      }))
      .filter(
        b =>
          Boolean(b.date) &&
          Number.isFinite(b.open) &&
          b.open > 0 &&
          Number.isFinite(b.close) &&
          b.close > 0 &&
          (!replayCutoff || b.date <= replayCutoff)
      )
      .sort((a, b) => a.date.localeCompare(b.date));

    if (ohlc.length < 2) return null;
    return buildNestedPuzzlePiP(ohlc, 250, anchorDate);
  }, [dailyKlines, activeData, isReplay]);

  // Reset or adjust viewRange on data changes (預設顯示最近約 35%，保留過往歷史供向左平移查看)
  useEffect(() => {
    setSelectedBar(null);
    setCrosshairDismissed(false);
    if (activeData.length > 0) {
      const defaultBars =
        activeData.length <= 80
          ? activeData.length
          : Math.max(80, Math.min(350, Math.round(activeData.length * 0.35)));
      setViewRange({
        start: Math.max(0, activeData.length - defaultBars),
        end: activeData.length - 1
      });
    } else {
      setViewRange(null);
    }
  }, [activeData.length]);

  // 計算傳統高低點框標記
  const boxMarkers = useMemo(() => {
    return calculateDynamicReversals(activeData, timeframe, supportLevels, resistanceLevels);
  }, [activeData, timeframe, supportLevels, resistanceLevels]);

  // 計算 TFDR 時空頻率減速共振序列
  const tfdrSeries = useMemo(() => {
    if (activeData.length === 0) return [];
    return calculateTFDRSeries(
      activeData.map(b => b.c),
      activeData.map(b => b.h),
      activeData.map(b => b.l)
    );
  }, [activeData]);

  // 計算 TFDR 歷史奇點轉折點（展示公式版：高位 score >= 90；低位 score <= 20 或最低價觸及/跌穿 band15 地板線）
  // 而家只做後備：日線圖用引擎 verdict、週/月線圖用引擎週/月 TFDR＋85/15，兩者都唔可用先退回呢份。
  const tfdrTurningPoints = useMemo(() => {
    const highs: Array<{ index: number; price: number }> = [];
    const lows: Array<{ index: number; price: number }> = [];
    if (activeData.length === 0 || tfdrSeries.length === 0) {
      return { highs, lows };
    }

    const isBuySingularityAt = (idx: number) =>
      idx >= 14 && (tfdrSeries[idx].score <= 20 || activeData[idx].l <= tfdrSeries[idx].band15);

    let i = 0;
    while (i < tfdrSeries.length) {
      if (i >= 14 && tfdrSeries[i].score >= 90) {
        let bestIdx = i;
        let bestHigh = activeData[i].h;
        let j = i + 1;
        while (j < tfdrSeries.length && tfdrSeries[j].score >= 90) {
          if (activeData[j].h >= bestHigh) {
            bestHigh = activeData[j].h;
            bestIdx = j;
          }
          j++;
        }
        highs.push({ index: bestIdx, price: bestHigh });
        i = j;
      } else {
        i++;
      }
    }

    i = 0;
    while (i < tfdrSeries.length) {
      if (isBuySingularityAt(i)) {
        let bestIdx = i;
        let bestLow = activeData[i].l;
        let j = i + 1;
        while (j < tfdrSeries.length && isBuySingularityAt(j)) {
          if (activeData[j].l <= bestLow) {
            bestLow = activeData[j].l;
            bestIdx = j;
          }
          j++;
        }
        lows.push({ index: bestIdx, price: bestLow });
        i = j;
      } else {
        i++;
      }
    }

    return { highs, lows };
  }, [activeData, tfdrSeries]);

  // Redraw canvas
  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    // Dark Background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    if (activeData.length === 0) {
      ctx.restore();
      return;
    }

    const startIdx = Math.max(0, viewRange?.start ?? Math.max(0, activeData.length - 80));
    // 即日棒：睇緊尾段嗰陣（viewRange 尾＝最後一支烘焙棒），endIdx 伸多一格包埋即日棒；
    // 已經向左平移咗嘅話唔伸，唔好將未完成棒畫入歷史窗口。
    // （同撳格／滑桿共用 displayEndIdx，保證三者用同一條顯示長度。）
    const baseEnd = viewRange?.end ?? activeData.length - 1;
    const endIdx = displayEndIdx(baseEnd, !!liveBar, activeData.length, displayBars.length);
    const visibleBars = displayBars.slice(startIdx, endIdx + 1);
    const visibleTfdr = tfdrSeries.slice(startIdx, endIdx + 1);

    if (visibleBars.length === 0) {
      ctx.restore();
      return;
    }

    // Chart margins
    const margin = { top: 20, right: 65, bottom: 25, left: 10 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    // Price Extents
    let minPrice = Math.min(...visibleBars.map(b => b.l));
    let maxPrice = Math.max(...visibleBars.map(b => b.h));
    // HA 視圖：價格範圍要包埋 HA 燭身（HA 開/收可略出當日原始高低之外，避免燭身被裁走）
    if (candleSource === 'HA' && engineChartData) {
      visibleBars.forEach(b => {
        const ha = engineChartData.haByDate.get((b.date || '').slice(0, 10));
        if (ha) {
          if (ha.haOpen < minPrice) minPrice = ha.haOpen;
          if (ha.haClose < minPrice) minPrice = ha.haClose;
          if (ha.haOpen > maxPrice) maxPrice = ha.haOpen;
          if (ha.haClose > maxPrice) maxPrice = ha.haClose;
        }
      });
    }

    const lastTfdr = tfdrSeries.length > 0 ? tfdrSeries[tfdrSeries.length - 1] : null;
    const isLatestInView = endIdx >= activeData.length - 1;
    const activeTfdrScore =
      (isLatestInView && lastTfdr ? lastTfdr.score : visibleTfdr[visibleTfdr.length - 1]?.score) ?? 50;
    const expandTopBands = activeTfdrScore >= 80;
    const expandBottomBands = activeTfdrScore <= 20;
    const showClassicTfdrTop = Boolean(chartMode === 'CLASSIC' && isLatestInView && lastTfdr && lastTfdr.score >= 80);
    const showClassicTfdrBottom = Boolean(chartMode === 'CLASSIC' && isLatestInView && lastTfdr && lastTfdr.score <= 20);

    if (chartMode === 'CLASSIC') {
      // CLASSIC 模式：納入核心線、支撐阻力與臨界單線
      visibleBars.forEach(b => {
        if (b.supportLine1 > 0) minPrice = Math.min(minPrice, b.supportLine1 * 0.99);
        if (b.resistanceLine > 0) maxPrice = Math.max(maxPrice, b.resistanceLine * 1.01);
        if (b.coreGravityLine > 0 && Math.abs(b.coreGravityLine - b.c) / b.c < 0.4) {
          minPrice = Math.min(minPrice, b.coreGravityLine * 0.99);
          maxPrice = Math.max(maxPrice, b.coreGravityLine * 1.01);
        }
      });

      if (showClassicTfdrTop && lastTfdr && lastTfdr.band90 > 0) {
        maxPrice = Math.max(maxPrice, lastTfdr.band90);
      }
      if (showClassicTfdrBottom && lastTfdr && lastTfdr.band15 > 0) {
        minPrice = Math.min(minPrice, lastTfdr.band15);
      }
    } else {
      // TFDR 動態展開模式：平常安全中區只納 band85/band15 兩條邊界線，進入 >=80 / <=20 才展開 band95 / band10 極值
      visibleTfdr.forEach((pt, idx) => {
        if (startIdx + idx >= 14 || visibleTfdr.length <= 14) {
          const topExt = expandTopBands ? pt.band95 : pt.band85;
          const botExt = expandBottomBands ? pt.band10 : pt.band15;
          if (topExt > 0) maxPrice = Math.max(maxPrice, topExt);
          if (botExt > 0) minPrice = Math.min(minPrice, botExt);
        }
      });
    }

    // Add padding to price range
    const priceRange = maxPrice - minPrice || 1;
    minPrice -= priceRange * 0.06;
    maxPrice += priceRange * 0.06;

    const getY = (price: number) => {
      return margin.top + plotH - ((price - minPrice) / (maxPrice - minPrice)) * plotH;
    };

    const barWidth = Math.max(1.5, (plotW / visibleBars.length) * 0.7);
    const stepX = plotW / visibleBars.length;

    const getX = (idxInVisible: number) => {
      return margin.left + idxInVisible * stepX + stepX / 2;
    };

    // 1. Grid Lines
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    const gridRows = 6;
    for (let r = 0; r <= gridRows; r++) {
      const y = margin.top + (plotH / gridRows) * r;
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(margin.left + plotW, y);
      ctx.stroke();

      const priceVal = maxPrice - ((maxPrice - minPrice) / gridRows) * r;
      ctx.fillStyle = '#666666';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(priceVal.toFixed(2), width - margin.right + 6, y + 3);
    }

    // 2~4. 圖層切換：CLASSIC 渲染傳統均線/支撐阻力；TFDR 隱藏繁雜均線改畫雙軌通道
    if (chartMode === 'CLASSIC') {
      // 1836.15 Scaled Core Gravity Line
      ctx.beginPath();
      let hasCorePoint = false;
      visibleBars.forEach((bar, i) => {
        if (bar.coreGravityLine > 0) {
          const x = getX(i);
          const y = getY(bar.coreGravityLine);
          if (!hasCorePoint) {
            ctx.moveTo(x, y);
            hasCorePoint = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      ctx.strokeStyle = '#8b5cf6';
      ctx.lineWidth = 2.4;
      ctx.stroke();

      // Dynamic Strong Support (Green dashed)
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      visibleBars.forEach((bar, i) => {
        const x = getX(i);
        const y = getY(bar.supportLine1);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // Dynamic Resistance (Orange dashed)
      ctx.beginPath();
      visibleBars.forEach((bar, i) => {
        const x = getX(i);
        const y = getY(bar.resistanceLine);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (visibleTfdr.length > 0) {
      // TFDR 動態展開奇點軌道：
      // - 安全中區 (20 < score < 80)：極簡雙邊界線（僅頂部 TFDR 85 邊界線 + 底部 TFDR 15 邊界線；係 TFDR 包絡線，唔係平均線／支持位）
      // - 衝入 >= 80 紅色高危區：動態展開頂部 3 條紅軌 (85 / 90 / 95) + 紅帶陰影，底部維持單線
      // - 跌入 <= 20 綠色奇點區：動態展開底部 3 條綠軌 (20/25 / 15 / 10) + 綠帶陰影，頂部維持單線
      ctx.save();

      if (expandTopBands) {
        ctx.beginPath();
        visibleTfdr.forEach((pt, i) => {
          const x = getX(i);
          const y = getY(pt.band95);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        for (let i = visibleTfdr.length - 1; i >= 0; i--) {
          ctx.lineTo(getX(i), getY(visibleTfdr[i].band85));
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(239, 68, 68, 0.10)';
        ctx.fill();
      }

      if (expandBottomBands) {
        ctx.beginPath();
        visibleTfdr.forEach((pt, i) => {
          const x = getX(i);
          const y = getY(pt.band25);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        for (let i = visibleTfdr.length - 1; i >= 0; i--) {
          ctx.lineTo(getX(i), getY(visibleTfdr[i].band10));
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(34, 197, 94, 0.10)';
        ctx.fill();
      }

      const drawDynamicCurve = (
        extractor: (pt: (typeof visibleTfdr)[number]) => number,
        color: string,
        lineWidth: number,
        dash: number[]
      ) => {
        ctx.beginPath();
        ctx.setLineDash(dash);
        visibleTfdr.forEach((pt, i) => {
          const x = getX(i);
          const y = getY(extractor(pt));
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      };

      // 上方軌道：平常只畫單線 85 邊界；>=80 時動態展開 90 / 95 紅軌
      drawDynamicCurve(pt => pt.band85, '#fca5a5', expandTopBands ? 1.1 : 1.4, [3, 3]);
      if (expandTopBands) {
        drawDynamicCurve(pt => pt.band90, '#f87171', 1.3, [5, 4]);
        drawDynamicCurve(pt => pt.band95, '#ef4444', 1.6, []);
      }

      // 下方軌道：平常只畫單線 15 邊界；<=20 時動態展開 20/25 / 10 綠軌
      drawDynamicCurve(pt => pt.band15, '#4ade80', expandBottomBands ? 1.2 : 1.4, [4, 3]);
      if (expandBottomBands) {
        drawDynamicCurve(pt => pt.band25, '#86efac', 1.1, [2, 3]);
        drawDynamicCurve(pt => pt.band10, '#22c55e', 1.6, []);
      }
      ctx.setLineDash([]);

      // 右側末端標註（根據目前是否處於動態展開狀態顯示）
      const rightMostTfdr = visibleTfdr[visibleTfdr.length - 1];
      if (rightMostTfdr) {
        const drawEndTag = (yCenter: number, text: string, color: string, bg: string) => {
          ctx.font = 'bold 9.5px -apple-system, BlinkMacSystemFont, sans-serif';
          const tw = ctx.measureText(text).width;
          const bw = tw + 8;
          const bh = 13;
          const bx = margin.left + plotW - bw - 3;
          const by = Math.max(margin.top + 1, Math.min(margin.top + plotH - bh - 1, yCenter - bh / 2));

          ctx.fillStyle = bg;
          ctx.strokeStyle = color;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.roundRect(bx, by, bw, bh, 2.5);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = color;
          ctx.textAlign = 'center';
          ctx.fillText(text, bx + bw / 2, by + 9.5);
        };

        if (expandTopBands) {
          const y95 = getY(rightMostTfdr.band95);
          const y90 = Math.max(y95 + 14, getY(rightMostTfdr.band90));
          const y85 = Math.max(y90 + 14, getY(rightMostTfdr.band85));
          drawEndTag(y95, '95 極頂', '#ef4444', 'rgba(69, 10, 10, 0.88)');
          drawEndTag(y90, '90 危險', '#f87171', 'rgba(69, 10, 10, 0.84)');
          drawEndTag(y85, '85 警戒', '#fca5a5', 'rgba(69, 10, 10, 0.78)');
        } else {
          drawEndTag(getY(rightMostTfdr.band85), 'TFDR 85 邊界', '#fca5a5', 'rgba(69, 10, 10, 0.72)');
        }

        if (expandBottomBands) {
          const y10 = getY(rightMostTfdr.band10);
          const y15 = Math.min(y10 - 14, getY(rightMostTfdr.band15));
          const y25 = Math.min(y15 - 14, getY(rightMostTfdr.band25));
          drawEndTag(y25, '25 警戒', '#86efac', 'rgba(5, 46, 22, 0.78)');
          drawEndTag(y15, '15 邊界', '#4ade80', 'rgba(5, 46, 22, 0.84)');
          drawEndTag(y10, '10 極底', '#22c55e', 'rgba(5, 46, 22, 0.88)');
        } else {
          drawEndTag(getY(rightMostTfdr.band15), 'TFDR 15 邊界', '#4ade80', 'rgba(5, 46, 22, 0.72)');
        }
      }
      ctx.restore();
    }

    // 5. Candlestick Bars（HA 模式：燭身用引擎單層 HA 開/收，影線維持原始高低；RAW 模式：原始陰陽燭）
    visibleBars.forEach((bar, i) => {
      const x = getX(i);
      const ha = candleSource === 'HA' ? engineChartData?.haByDate.get((bar.date || '').slice(0, 10)) : undefined;
      const bodyOpen = ha ? ha.haOpen : bar.o;
      const bodyClose = ha ? ha.haClose : bar.c;
      const isUp = bodyClose >= bodyOpen;
      const color = isUp ? '#10b981' : '#ef4444';

      const highY = getY(bar.h);
      const lowY = getY(bar.l);
      const openY = getY(bodyOpen);
      const closeY = getY(bodyClose);

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      // Body
      const topY = Math.min(openY, closeY);
      const bodyH = Math.max(1.5, Math.abs(openY - closeY));
      ctx.fillStyle = color;
      ctx.fillRect(x - barWidth / 2, topY, barWidth, bodyH);

      // 即日未完成棒：虛線框＋「即日」標記，睇得出係未收市（HA 模式下佢冇 HA 燭身，
      // 上面已經退回原始 OHLC 燭身，唔會扮成一支已確認嘅 HA 蠟燭）
      if ((bar as ModelBar).isLiveToday) {
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(x - barWidth / 2 - 0.5, topY - 0.5, barWidth + 1, bodyH + 1);
        ctx.restore();
        ctx.fillStyle = '#facc15';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('即日', x, Math.max(margin.top + 8, highY - 6));
      }

      // Date ticks across multi-year timeline
      if (i % Math.max(1, Math.floor(visibleBars.length / 8)) === 0) {
        ctx.fillStyle = '#888888';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        const rawDate = (bar.date || '').split(' ')[0];
        const dateLabel = rawDate.length >= 7 ? rawDate.slice(0, 7) : rawDate;
        ctx.fillText(dateLabel, x, height - 8);
      }
    });

    // 6 & 7. 信號與高低點標記（依 chartMode 分流，且加入水平防重疊間距）
    if (chartMode === 'CLASSIC') {
      let lastHighMarkerX = -999;
      boxMarkers.highs.forEach(marker => {
        if (marker.index >= startIdx && marker.index <= endIdx) {
          const i = marker.index - startIdx;
          const x = getX(i);
          if (x - lastHighMarkerX < 28) return;
          lastHighMarkerX = x;

          const y = getY(marker.price);
          const isStrong = Boolean(marker.isStrong);
          const labelText = formatShortSignalLabel('HIGH', isStrong);
          ctx.font = 'bold 9px sans-serif';
          const tw = ctx.measureText(labelText).width;
          const bw = Math.max(22, tw + 8);
          const bh = 14;
          const bx = Math.max(margin.left + 2, Math.min(margin.left + plotW - bw - 2, x - bw / 2));
          const by = Math.max(margin.top + 2, y - bh - 4);

          ctx.strokeStyle = isStrong ? '#f87171' : '#ef4444';
          ctx.lineWidth = isStrong ? 1.5 : 1.1;
          ctx.fillStyle = isStrong ? 'rgba(239, 68, 68, 0.35)' : 'rgba(239, 68, 68, 0.2)';
          ctx.beginPath();
          ctx.roundRect(bx, by, bw, bh, 3);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#fee2e2';
          ctx.textAlign = 'center';
          ctx.fillText(labelText, bx + bw / 2, by + 10.5);
        }
      });

      let lastLowMarkerX = -999;
      boxMarkers.lows.forEach(marker => {
        if (marker.index >= startIdx && marker.index <= endIdx) {
          const i = marker.index - startIdx;
          const x = getX(i);
          if (x - lastLowMarkerX < 28) return;
          lastLowMarkerX = x;

          const y = getY(marker.price);
          const isStrong = Boolean(marker.isStrong);
          const labelText = formatShortSignalLabel('LOW', isStrong);
          ctx.font = 'bold 9px sans-serif';
          const tw = ctx.measureText(labelText).width;
          const bw = Math.max(22, tw + 8);
          const bh = 14;
          const bx = Math.max(margin.left + 2, Math.min(margin.left + plotW - bw - 2, x - bw / 2));
          const by = Math.min(margin.top + plotH - bh - 2, y + 4);

          ctx.strokeStyle = isStrong ? '#34d399' : '#10b981';
          ctx.lineWidth = isStrong ? 1.5 : 1.1;
          ctx.fillStyle = isStrong ? 'rgba(16, 185, 129, 0.35)' : 'rgba(16, 185, 129, 0.2)';
          ctx.beginPath();
          ctx.roundRect(bx, by, bw, bh, 3);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#d1fae5';
          ctx.textAlign = 'center';
          ctx.fillText(labelText, bx + bw / 2, by + 10.5);
        }
      });

      // 極簡「強支」/「強阻」買賣信號箭頭 + 精簡短標籤
      let lastBuyBadgeX = -999;
      let lastSellBadgeX = -999;
      visibleBars.forEach((bar, i) => {
        const x = getX(i);
        const isStrongBuy = bar.buySignal || bar.reversalSignal === 'STRONG_BUY';
        const isCriticalSell = bar.sellSignal || bar.reversalSignal === 'CRITICAL_SELL';

        if (isStrongBuy && x - lastBuyBadgeX >= 32) {
          lastBuyBadgeX = x;
          const arrowTipY = getY(bar.l) + 4;
          ctx.beginPath();
          ctx.moveTo(x, arrowTipY);
          ctx.lineTo(x - 6, arrowTipY + 9);
          ctx.lineTo(x + 6, arrowTipY + 9);
          ctx.closePath();
          ctx.fillStyle = '#00ff7f';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 0.8;
          ctx.stroke();

          const text = formatShortSignalLabel('LOW', true);
          ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
          const textWidth = ctx.measureText(text).width;
          const badgeW = textWidth + 10;
          const badgeH = 17;
          const badgeX = Math.max(margin.left + 2, Math.min(margin.left + plotW - badgeW - 2, x - badgeW / 2));
          const badgeY = Math.min(margin.top + plotH - badgeH - 2, arrowTipY + 12);

          ctx.fillStyle = 'rgba(6, 78, 59, 0.92)';
          ctx.strokeStyle = '#00ff7f';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.fillText(text, badgeX + badgeW / 2, badgeY + 12);
        }

        if (isCriticalSell && x - lastSellBadgeX >= 32) {
          lastSellBadgeX = x;
          const arrowTipY = getY(bar.h) - 4;
          ctx.beginPath();
          ctx.moveTo(x, arrowTipY);
          ctx.lineTo(x - 6, arrowTipY - 9);
          ctx.lineTo(x + 6, arrowTipY - 9);
          ctx.closePath();
          ctx.fillStyle = '#ff4500';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 0.8;
          ctx.stroke();

          const text = formatShortSignalLabel('HIGH', true);
          ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
          const textWidth = ctx.measureText(text).width;
          const badgeW = textWidth + 10;
          const badgeH = 17;
          const badgeX = Math.max(margin.left + 2, Math.min(margin.left + plotW - badgeW - 2, x - badgeW / 2));
          const badgeY = Math.max(margin.top + 2, arrowTipY - 12 - badgeH);

          ctx.fillStyle = 'rgba(127, 29, 29, 0.92)';
          ctx.strokeStyle = '#ff4500';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.fillText(text, badgeX + badgeW / 2, badgeY + 12);
        }
      });

      // 8. Fourier Hologram Prediction Line (CLASSIC 模式保留全息線)
      // 全息線錨定最後一支烘焙棒（唔係即日棒——預測線係由烘焙收市價計出嚟，唔可以用未完成棒做錨）
      if (hologramLine.length > 0 && endIdx >= activeData.length - 1) {
        const lastBakedIdx = Math.max(0, activeData.length - 1 - startIdx);
        const lastX = getX(lastBakedIdx);
        ctx.beginPath();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = '#d8b4fe';
        ctx.lineWidth = 2;
        ctx.moveTo(lastX, getY(visibleBars[lastBakedIdx].c));

        hologramLine.forEach((val, fIdx) => {
          const fx = lastX + (fIdx + 1) * stepX;
          const fy = getY(val);
          ctx.lineTo(fx, fy);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 8.5 CLASSIC 模式極簡防眼花 TFDR 臨界單線（僅 score > 80 或 < 30 時於右側局部繪製）
      if (lastTfdr && (showClassicTfdrTop || showClassicTfdrBottom)) {
        const localStartX = margin.left + plotW * 0.7;
        const localEndX = margin.left + plotW;

        ctx.save();
        if (showClassicTfdrTop) {
          const yTop = getY(lastTfdr.band90);
          ctx.beginPath();
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.72)';
          ctx.lineWidth = 1.8;
          ctx.moveTo(localStartX, yTop);
          ctx.lineTo(localEndX, yTop);
          ctx.stroke();
          ctx.setLineDash([]);

          const labelText = `TFDR 90 危險頂 (${lastTfdr.band90})`;
          ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
          const textW = ctx.measureText(labelText).width;
          const boxW = textW + 10;
          const boxH = 16;
          const boxX = localEndX - boxW - 4;
          const boxY = Math.max(margin.top + 2, Math.min(margin.top + plotH - boxH - 2, yTop - boxH - 3));

          ctx.fillStyle = 'rgba(127, 29, 29, 0.78)';
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.75)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(boxX, boxY, boxW, boxH, 3);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#fecaca';
          ctx.textAlign = 'center';
          ctx.fillText(labelText, boxX + boxW / 2, boxY + 11.5);
        } else if (showClassicTfdrBottom) {
          const yBot = getY(lastTfdr.band15);
          ctx.beginPath();
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.72)';
          ctx.lineWidth = 1.8;
          ctx.moveTo(localStartX, yBot);
          ctx.lineTo(localEndX, yBot);
          ctx.stroke();
          ctx.setLineDash([]);

          const labelText = `TFDR 15 邊界 (${lastTfdr.band15})`;
          ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
          const textW = ctx.measureText(labelText).width;
          const boxW = textW + 10;
          const boxH = 16;
          const boxX = localEndX - boxW - 4;
          const boxY = Math.max(margin.top + 2, Math.min(margin.top + plotH - boxH - 2, yBot + 3));

          ctx.fillStyle = 'rgba(6, 78, 59, 0.78)';
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.75)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(boxX, boxY, boxW, boxH, 3);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#a7f3d0';
          ctx.textAlign = 'center';
          ctx.fillText(labelText, boxX + boxW / 2, boxY + 11.5);
        }
        ctx.restore();
      }
    } else {
      // TFDR 模式：(c) 奇點標籤改讀決策引擎狀態——日線圖：武裝點（singularityLow/High 首次設定嗰日）標「奇點沽／奇點買」，
      // 武裝期間畫扣扳機參考線，引擎實際扣扳機嗰日標「觸發」；同系統買賣 100% 同步。
      // 週/月線圖：改讀引擎週/月 TFDR（≥85／≤15 入區、簇極值貼標，丙方案＋85/15）。引擎數據唔可用先退回舊標籤。
      const singHighs = engineChartData
        ? engineChartData.highs
        : enginePeriodLabels
          ? enginePeriodLabels.highs
          : tfdrTurningPoints.highs;
      const singLows = engineChartData
        ? engineChartData.lows
        : enginePeriodLabels
          ? enginePeriodLabels.lows
          : tfdrTurningPoints.lows;
      if (engineChartData) {
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 1;
        engineChartData.spans.forEach(sp => {
          if (sp.to < startIdx || sp.from > endIdx) return;
          const from = Math.max(sp.from, startIdx);
          const to = Math.min(sp.to, endIdx);
          const y = getY(sp.price);
          ctx.strokeStyle = sp.kind === 'SELL' ? 'rgba(239, 68, 68, 0.75)' : 'rgba(16, 185, 129, 0.75)';
          ctx.beginPath();
          ctx.moveTo(getX(from - startIdx) - stepX / 2, y);
          ctx.lineTo(getX(to - startIdx) + stepX / 2, y);
          ctx.stroke();
        });
        ctx.restore();
        engineChartData.triggers.forEach(tr => {
          if (tr.index < startIdx || tr.index > endIdx) return;
          const x = getX(tr.index - startIdx);
          const isSell = tr.kind === 'SELL';
          const tipY = isSell ? getY(tr.price) - 16 : getY(tr.price) + 16;
          ctx.beginPath();
          if (isSell) {
            ctx.moveTo(x, tipY + 8);
            ctx.lineTo(x - 5, tipY);
            ctx.lineTo(x + 5, tipY);
          } else {
            ctx.moveTo(x, tipY - 8);
            ctx.lineTo(x - 5, tipY);
            ctx.lineTo(x + 5, tipY);
          }
          ctx.closePath();
          ctx.fillStyle = isSell ? '#f97316' : '#22c55e';
          ctx.fill();
          if (showSingularityLabels) {
            ctx.font = 'bold 9px -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.fillStyle = isSell ? '#fdba74' : '#86efac';
            ctx.textAlign = 'center';
            ctx.fillText('觸發', x, isSell ? tipY - 3 : tipY + 11);
          }
        });
      }
      let lastHighSingularityX = -999;
      singHighs.forEach(tp => {
        if (tp.index >= startIdx && tp.index <= endIdx) {
          const x = getX(tp.index - startIdx);
          if (x - lastHighSingularityX < 36) return;
          lastHighSingularityX = x;

          const arrowTipY = getY(tp.price) - 4;
          ctx.beginPath();
          ctx.moveTo(x, arrowTipY);
          ctx.lineTo(x - 6, arrowTipY - 9);
          ctx.lineTo(x + 6, arrowTipY - 9);
          ctx.closePath();
          ctx.fillStyle = '#ef4444';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 0.8;
          ctx.stroke();

          // 奇點文字標籤開關：隱藏時只唔畫細字標籤盒，小三角箭頭保留作位置提示
          if (showSingularityLabels) {
            const label = formatShortSignalLabel('HIGH', true);
            ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
            const tw = ctx.measureText(label).width;
            const bw = tw + 10;
            const bh = 17;
            const bx = Math.max(margin.left + 2, Math.min(margin.left + plotW - bw - 2, x - bw / 2));
            const by = Math.max(margin.top + 2, arrowTipY - 12 - bh);

            ctx.fillStyle = 'rgba(127, 29, 29, 0.92)';
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(bx, by, bw, bh, 4);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#fee2e2';
            ctx.textAlign = 'center';
            ctx.fillText(label, bx + bw / 2, by + 12);
          }
        }
      });

      let lastLowSingularityX = -999;
      singLows.forEach(tp => {
        if (tp.index >= startIdx && tp.index <= endIdx) {
          const x = getX(tp.index - startIdx);
          if (x - lastLowSingularityX < 36) return;
          lastLowSingularityX = x;

          const arrowTipY = getY(tp.price) + 4;
          ctx.beginPath();
          ctx.moveTo(x, arrowTipY);
          ctx.lineTo(x - 6, arrowTipY + 9);
          ctx.lineTo(x + 6, arrowTipY + 9);
          ctx.closePath();
          ctx.fillStyle = '#10b981';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 0.8;
          ctx.stroke();

          // 奇點文字標籤開關：隱藏時只唔畫細字標籤盒，小三角箭頭保留作位置提示
          if (showSingularityLabels) {
            const label = formatShortSignalLabel('LOW', true);
            ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
            const tw = ctx.measureText(label).width;
            const bw = tw + 10;
            const bh = 17;
            const bx = Math.max(margin.left + 2, Math.min(margin.left + plotW - bw - 2, x - bw / 2));
            const by = Math.min(margin.top + plotH - bh - 2, arrowTipY + 12);

            ctx.fillStyle = 'rgba(6, 78, 59, 0.92)';
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(bx, by, bw, bh, 4);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#d1fae5';
            ctx.textAlign = 'center';
            ctx.fillText(label, bx + bw / 2, by + 12);
          }
        }
      });
    }

    // 8b. QQP v1.3＋tfdr55 模型頂／底顯示層（純顯示）：快訊號＝空心三角（早期預警），確認頂反轉棒 TFDR>55 跳過沽；
    // 確認訊號＝實心三角＋「確認頂／確認底」標籤（武裝後 10 棒內有 HA 梯級反轉先確認，訊號精確約 0.64）。
    // 同一棒同時係快＋確認嗰陣只畫確認標記，唔重疊。月線圖無模型，qqpModelLayer 係 null。
    if (showModelSignals && qqpModelLayer) {
      const confHighIdx = new Set(qqpModelLayer.confirmedHighs.map(p => p.index));
      const confLowIdx = new Set(qqpModelLayer.confirmedLows.map(p => p.index));
      const drawModelTri = (
        pt: { index: number; price: number },
        isHigh: boolean,
        filled: boolean,
        color: string
      ) => {
        if (pt.index < startIdx || pt.index > endIdx) return false;
        const x = getX(pt.index - startIdx);
        const tipY = isHigh ? getY(pt.price) - 4 : getY(pt.price) + 4;
        ctx.beginPath();
        if (isHigh) {
          ctx.moveTo(x, tipY);
          ctx.lineTo(x - 5, tipY - 8);
          ctx.lineTo(x + 5, tipY - 8);
        } else {
          ctx.moveTo(x, tipY);
          ctx.lineTo(x - 5, tipY + 8);
          ctx.lineTo(x + 5, tipY + 8);
        }
        ctx.closePath();
        if (filled) {
          ctx.fillStyle = color;
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 0.8;
          ctx.stroke();
        } else {
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        return true;
      };
      const drawModelLabel = (
        pt: { index: number; price: number },
        isHigh: boolean,
        label: string,
        boxBg: string,
        boxBorder: string,
        textColor: string,
        lastX: number
      ): number => {
        const x = getX(pt.index - startIdx);
        if (x - lastX < 36) return lastX;
        const tipY = isHigh ? getY(pt.price) - 4 : getY(pt.price) + 4;
        ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
        const tw = ctx.measureText(label).width;
        const bw = tw + 10;
        const bh = 17;
        const bx = Math.max(margin.left + 2, Math.min(margin.left + plotW - bw - 2, x - bw / 2));
        const by = isHigh
          ? Math.max(margin.top + 2, tipY - 12 - bh)
          : Math.min(margin.top + plotH - bh - 2, tipY + 12);
        ctx.fillStyle = boxBg;
        ctx.strokeStyle = boxBorder;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.fillText(label, bx + bw / 2, by + 12);
        return x;
      };
      // 快訊號（空心）：確認點唔重畫
      let lastFastHighX = -999;
      qqpModelLayer.fastHighs.forEach(pt => {
        if (confHighIdx.has(pt.index)) return;
        const x = getX(pt.index - startIdx);
        if (pt.index < startIdx || pt.index > endIdx || x - lastFastHighX < 36) return;
        if (drawModelTri(pt, true, false, '#f87171')) lastFastHighX = x;
      });
      let lastFastLowX = -999;
      qqpModelLayer.fastLows.forEach(pt => {
        if (confLowIdx.has(pt.index)) return;
        const x = getX(pt.index - startIdx);
        if (pt.index < startIdx || pt.index > endIdx || x - lastFastLowX < 36) return;
        if (drawModelTri(pt, false, false, '#4ade80')) lastFastLowX = x;
      });
      // 確認訊號（實心＋標籤）
      let lastConfHighX = -999;
      qqpModelLayer.confirmedHighs.forEach(pt => {
        if (pt.index < startIdx || pt.index > endIdx) return;
        const x = getX(pt.index - startIdx);
        if (x - lastConfHighX < 36) return;
        if (!drawModelTri(pt, true, true, '#dc2626')) return;
        lastConfHighX = x;
        if (showSingularityLabels) {
          lastConfHighX = drawModelLabel(pt, true, '確認頂', 'rgba(127, 29, 29, 0.92)', '#dc2626', '#fee2e2', lastConfHighX);
        }
      });
      let lastConfLowX = -999;
      qqpModelLayer.confirmedLows.forEach(pt => {
        if (pt.index < startIdx || pt.index > endIdx) return;
        const x = getX(pt.index - startIdx);
        if (x - lastConfLowX < 36) return;
        if (!drawModelTri(pt, false, true, '#059669')) return;
        lastConfLowX = x;
        if (showSingularityLabels) {
          lastConfLowX = drawModelLabel(pt, false, '確認底', 'rgba(6, 78, 59, 0.92)', '#059669', '#d1fae5', lastConfLowX);
        }
      });
    }
    // 平均線（各時間框架一條：日線 MA20／週線 MA20／月線 M10；CLASSIC 同 TFDR 模式都畫）：
    // 收市價簡單平均，線尾標周期＋框架。純顯示，唔入任何計算。
    // 只做方向參考（收市企線之上＝升勢、之下＝跌勢），唔係支持位買入訊號。
    // 【修復】一定要喺燭（第 5 節）＋標記（第 6／7 節）之後先畫：之前喺燭之前畫，
    // 1.6px 天藍線俾不透明燭身遮咗 ~90%，「MA20」線尾標籤又俾最後幾支燭遮住，
    // 所以圖上完全見唔到（code 喺 bundle 入面，畫咗等於冇畫）。
    // 【修復】TFDR 模式唔好再收起均線：Peter 睇 TFDR 模式嗰陣預期見到平均線，
    // 收起咗佢就會誤認 TFDR 15 邊界做平均線。
    if (maLine.label && maLine.values.length > 0) {
      ctx.beginPath();
      ctx.setLineDash([]);
      let hasMaPoint = false;
      let lastMaIdx = -1;
      let lastMaVal = NaN;
      visibleBars.forEach((bar, i) => {
        const ma = maLine.values[startIdx + i];
        if (ma == null || !Number.isFinite(ma)) return;
        const x = getX(i);
        const y = getY(ma);
        if (!hasMaPoint) {
          ctx.moveTo(x, y);
          hasMaPoint = true;
        } else {
          ctx.lineTo(x, y);
        }
        lastMaIdx = i;
        lastMaVal = ma;
      });
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      if (lastMaIdx >= 0) {
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(maLine.label, getX(lastMaIdx) - 4, getY(lastMaVal) - 6);
      }
    }
    // 9. Interactive Crosshair & Tooltip (支援點擊空白處或白色數據條立即隱藏 / 再點一下重新查看)
    const activePointer =
      !crosshairDismissed &&
      (selectedBar && selectedBar.barIdx >= startIdx && selectedBar.barIdx <= endIdx
        ? {
            localIdx: selectedBar.barIdx - startIdx,
            y: Math.max(margin.top, Math.min(margin.top + plotH, selectedBar.y))
          }
        : mousePos && mousePos.x >= margin.left && mousePos.x <= margin.left + plotW
        ? {
            localIdx: Math.min(
              visibleBars.length - 1,
              Math.max(0, Math.floor((mousePos.x - margin.left) / stepX))
            ),
            y: Math.max(margin.top, Math.min(margin.top + plotH, mousePos.y))
          }
        : null);

    if (activePointer) {
      const hoveredBarIdx = activePointer.localIdx;
      const pointerY = activePointer.y;
      const hoveredBar = visibleBars[hoveredBarIdx];
      const hoveredTfdr = visibleTfdr[hoveredBarIdx];
      const hX = getX(hoveredBarIdx);

      // Vertical line
      ctx.beginPath();
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = '#555555';
      ctx.lineWidth = 1;
      ctx.moveTo(hX, margin.top);
      ctx.lineTo(hX, margin.top + plotH);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(margin.left, pointerY);
      ctx.lineTo(margin.left + plotW, pointerY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Floating Info Pill in top right (避免與左上角 PiP 拼圖小窗重疊；點擊可直接隱藏)
      const tfdrInfo = hoveredTfdr ? ` | TFDR:${hoveredTfdr.score}` : '';
      const infoText = `${hoveredBar.date?.split(' ')[0]} | O:${hoveredBar.o} H:${hoveredBar.h} L:${hoveredBar.l} C:${hoveredBar.c}${tfdrInfo}  ✕`;
      ctx.font = '11px monospace';
      const boxW = Math.min(plotW - 16, Math.max(300, ctx.measureText(infoText).width + 20));
      const boxX = margin.left + plotW - boxW - 8;
      const boxY = margin.top + 6;
      const boxH = 26;
      infoPillRectRef.current = { x: boxX, y: boxY, w: boxW, h: boxH };

      ctx.fillStyle = 'rgba(17, 24, 39, 0.92)';
      ctx.strokeStyle = '#4b5563';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.fillText(infoText, boxX + 8, boxY + 17);

      // Price Tag on Right Axis
      const hoverPrice = maxPrice - ((pointerY - margin.top) / plotH) * (maxPrice - minPrice);
      ctx.fillStyle = '#6366f1';
      ctx.fillRect(width - margin.right + 2, pointerY - 8, margin.right - 4, 16);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(hoverPrice.toFixed(2), width - margin.right + 6, pointerY + 4);
    } else {
      infoPillRectRef.current = null;
    }

    ctx.restore();
  }, [
    activeData,
    displayBars,
    liveBar,
    maLine,
    viewRange,
    boxMarkers,
    hologramLine,
    mousePos,
    selectedBar,
    crosshairDismissed,
    tfdrSeries,
    tfdrTurningPoints,
    engineChartData,
    enginePeriodLabels,
    qqpModelLayer,
    candleSource,
    chartMode,
    showSingularityLabels,
    showModelSignals,
    formatShortSignalLabel
  ]);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      drawChart();
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawChart]);

  // Re-render when data updates
  useEffect(() => {
    drawChart();
  }, [drawChart]);

  // 共用視口平移計算函數：保證可自由滑動回溯到第 0 根歷史 K 線
  const applyPanOffset = useCallback(
    (dx: number, startIdxBase: number, endIdxBase: number, containerWidth: number) => {
      if (activeData.length === 0) return;
      const plotWidth = Math.max(100, containerWidth - 75);
      const rangeLen = endIdxBase - startIdxBase + 1;
      const sensitivity = rangeLen / plotWidth;
      const deltaBars = Math.round(-dx * sensitivity);

      let newStart = startIdxBase + deltaBars;
      let newEnd = endIdxBase + deltaBars;

      if (newStart < 0) {
        newEnd -= newStart;
        newStart = 0;
      }
      if (newEnd >= activeData.length) {
        const overshoot = newEnd - (activeData.length - 1);
        newStart = Math.max(0, newStart - overshoot);
        newEnd = activeData.length - 1;
      }

      setViewRange({ start: newStart, end: newEnd });
    },
    [activeData.length]
  );

  // 全局 mouseup / touchend 監聽，防止滑鼠移出畫布外鬆開導致卡住
  useEffect(() => {
    const handleGlobalEnd = () => {
      isDraggingRef.current = false;
      isSliderDraggingRef.current = false;
      pinchStartRef.current = null;
    };
    window.addEventListener('mouseup', handleGlobalEnd);
    window.addEventListener('touchend', handleGlobalEnd);
    return () => {
      window.removeEventListener('mouseup', handleGlobalEnd);
      window.removeEventListener('touchend', handleGlobalEnd);
    };
  }, []);

  // Mouse wheel Zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!viewRange || activeData.length === 0) return;

    const zoomFactor = e.deltaY > 0 ? 1.15 : 0.85;
    const currentLen = viewRange.end - viewRange.start + 1;
    const newLen = Math.max(15, Math.min(activeData.length, Math.round(currentLen * zoomFactor)));

    const center = Math.round((viewRange.start + viewRange.end) / 2);
    let newStart = Math.max(0, center - Math.floor(newLen / 2));
    let newEnd = newStart + newLen - 1;

    if (newEnd >= activeData.length) {
      newEnd = activeData.length - 1;
      newStart = Math.max(0, newEnd - newLen + 1);
    }

    setViewRange({ start: newStart, end: newEnd });
  };

  // 點擊切換白色十字星數據條（點一下查看，點擊空白處或直接點擊白色數據條本身立刻隱藏）
  const toggleCrosshairAtPoint = useCallback(
    (localX: number, localY: number, canvasWidth: number) => {
      const pill = infoPillRectRef.current;
      const clickedOnPill =
        Boolean(pill) &&
        pill !== null &&
        localX >= pill.x &&
        localX <= pill.x + pill.w &&
        localY >= pill.y &&
        localY <= pill.y + pill.h;

      if (clickedOnPill || (!crosshairDismissed && (selectedBar !== null || mousePos !== null))) {
        setSelectedBar(null);
        setMousePos(null);
        setCrosshairDismissed(true);
        return;
      }

      if (!viewRange || activeData.length === 0) return;
      const marginLeft = 10;
      const marginRight = 65;
      const plotW = Math.max(1, canvasWidth - marginLeft - marginRight);
      // 撳格對齊畫圖：用同一條 displayEndIdx 計可見格數（烘焙棒＋即日棒），
      // 唔再用 viewRange（烘焙）長度——之前撳即日棒嗰格會跌返最後一支烘焙棒。
      const endIdx = displayEndIdx(viewRange.end, !!liveBar, activeData.length, displayBars.length);
      const visibleCount = Math.max(1, endIdx - viewRange.start + 1);
      const relX = Math.max(0, Math.min(plotW - 1, localX - marginLeft));
      const barIdx = clickBarIndex(viewRange.start, relX, plotW, visibleCount);

      setCrosshairDismissed(false);
      setSelectedBar({ barIdx, x: localX, y: localY });
      setMousePos({ x: localX, y: localY });
    },
    [crosshairDismissed, selectedBar, mousePos, viewRange, activeData.length, liveBar, displayBars]
  );

  // Mouse Drag / Pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!viewRange) return;
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      moved: false,
      startIdx: viewRange.start,
      endIdx: viewRange.end
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (!crosshairDismissed && !selectedBar) {
      setMousePos({ x, y });
    }

    if (isDraggingRef.current && viewRange) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      if (Math.hypot(dx, dy) >= 5) {
        dragStartRef.current.moved = true;
      }
      if (dragStartRef.current.moved) {
        applyPanOffset(dx, dragStartRef.current.startIdx, dragStartRef.current.endIdx, rect.width);
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    const wasMoved = dragStartRef.current.moved;
    isDraggingRef.current = false;
    if (!wasMoved && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      toggleCrosshairAtPoint(e.clientX - rect.left, e.clientY - rect.top, rect.width);
    }
  };

  const handleMouseLeave = () => {
    if (!selectedBar) {
      setMousePos(null);
      setCrosshairDismissed(false);
    }
  };

  // Single-finger Touch Pan + Two-finger Pinch Zoom
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!viewRange || activeData.length === 0) return;

    if (e.touches.length === 1) {
      isDraggingRef.current = true;
      pinchStartRef.current = null;
      dragStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        moved: false,
        startIdx: viewRange.start,
        endIdx: viewRange.end
      };
    } else if (e.touches.length === 2) {
      isDraggingRef.current = false;
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchStartRef.current = {
        dist: Math.max(1, dist),
        startIdx: viewRange.start,
        endIdx: viewRange.end
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || activeData.length === 0) return;
    const rect = canvas.getBoundingClientRect();

    if (e.touches.length === 1 && isDraggingRef.current) {
      const touchX = e.touches[0].clientX;
      const touchY = e.touches[0].clientY;
      const dx = touchX - dragStartRef.current.x;
      const dy = touchY - dragStartRef.current.y;
      if (Math.hypot(dx, dy) >= 6) {
        dragStartRef.current.moved = true;
      }
      if (dragStartRef.current.moved) {
        applyPanOffset(dx, dragStartRef.current.startIdx, dragStartRef.current.endIdx, rect.width);
        if (!crosshairDismissed) {
          setMousePos({
            x: touchX - rect.left,
            y: touchY - rect.top
          });
        }
      }
    } else if (e.touches.length === 2 && pinchStartRef.current) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scale = pinchStartRef.current.dist / Math.max(1, dist);
      const origLen = pinchStartRef.current.endIdx - pinchStartRef.current.startIdx + 1;
      const newLen = Math.max(15, Math.min(activeData.length, Math.round(origLen * scale)));
      const center = Math.round((pinchStartRef.current.startIdx + pinchStartRef.current.endIdx) / 2);

      let newStart = Math.max(0, center - Math.floor(newLen / 2));
      let newEnd = newStart + newLen - 1;
      if (newEnd >= activeData.length) {
        newEnd = activeData.length - 1;
        newStart = Math.max(0, newEnd - newLen + 1);
      }
      setViewRange({ start: newStart, end: newEnd });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const wasMoved = dragStartRef.current.moved;
    const wasSingleDrag = isDraggingRef.current && !pinchStartRef.current;
    isDraggingRef.current = false;
    pinchStartRef.current = null;
    if (wasSingleDrag && !wasMoved && e.changedTouches.length > 0 && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      toggleCrosshairAtPoint(
        e.changedTouches[0].clientX - rect.left,
        e.changedTouches[0].clientY - rect.top,
        rect.width
      );
    }
  };

  // 底部歷史時間軸滑塊拖拽（快速跳轉過往所有年份）
  const updateRangeFromSliderClientX = useCallback(
    (clientX: number, isThumbDrag: boolean) => {
      const track = sliderTrackRef.current;
      if (!track || !viewRange || activeData.length === 0) return null;
      const rect = track.getBoundingClientRect();
      const rangeLen = viewRange.end - viewRange.start + 1;

      if (isThumbDrag) {
        const dx = clientX - sliderDragStartRef.current.x;
        const deltaBars = Math.round((dx / Math.max(1, rect.width)) * activeData.length);
        let newStart = sliderDragStartRef.current.startIdx + deltaBars;
        let newEnd = sliderDragStartRef.current.endIdx + deltaBars;
        if (newStart < 0) {
          newEnd -= newStart;
          newStart = 0;
        }
        if (newEnd >= activeData.length) {
          const overshoot = newEnd - (activeData.length - 1);
          newStart = Math.max(0, newStart - overshoot);
          newEnd = activeData.length - 1;
        }
        setViewRange({ start: newStart, end: newEnd });
        return { start: newStart, end: newEnd };
      } else {
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
        const targetCenter = Math.round(ratio * (activeData.length - 1));
        let newStart = Math.max(0, targetCenter - Math.floor(rangeLen / 2));
        let newEnd = newStart + rangeLen - 1;
        if (newEnd >= activeData.length) {
          newEnd = activeData.length - 1;
          newStart = Math.max(0, newEnd - rangeLen + 1);
        }
        setViewRange({ start: newStart, end: newEnd });
        return { start: newStart, end: newEnd };
      }
    },
    [viewRange, activeData.length]
  );

  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (isSliderDraggingRef.current) {
        updateRangeFromSliderClientX(e.clientX, true);
      } else if (isDraggingRef.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const dx = e.clientX - dragStartRef.current.x;
        applyPanOffset(dx, dragStartRef.current.startIdx, dragStartRef.current.endIdx, rect.width);
      }
    };
    const handleWindowTouchMove = (e: TouchEvent) => {
      if (isSliderDraggingRef.current && e.touches.length === 1) {
        updateRangeFromSliderClientX(e.touches[0].clientX, true);
      }
    };
    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('touchmove', handleWindowTouchMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('touchmove', handleWindowTouchMove);
    };
  }, [updateRangeFromSliderClientX, applyPanOffset]);

  // Zoom controls
  const zoomIn = () => {
    if (!viewRange) return;
    const currentLen = viewRange.end - viewRange.start + 1;
    const newLen = Math.max(15, Math.round(currentLen * 0.75));
    const newStart = Math.max(0, viewRange.end - newLen + 1);
    setViewRange({ start: newStart, end: viewRange.end });
  };

  const zoomOut = () => {
    if (!viewRange) return;
    const currentLen = viewRange.end - viewRange.start + 1;
    const newLen = Math.min(activeData.length, Math.round(currentLen * 1.35));
    const newStart = Math.max(0, viewRange.end - newLen + 1);
    setViewRange({ start: newStart, end: viewRange.end });
  };

  const resetZoom = () => {
    if (activeData.length === 0) return;
    const defaultBars =
      activeData.length <= 80
        ? activeData.length
        : Math.max(80, Math.min(350, Math.round(activeData.length * 0.35)));
    setViewRange({
      start: Math.max(0, activeData.length - defaultBars),
      end: activeData.length - 1
    });
  };

  const showAll = () => {
    if (activeData.length === 0) return;
    setViewRange({
      start: 0,
      end: activeData.length - 1
    });
  };

  // 滑塊可視區百分比與日期區間顯示
  const sliderMetrics = useMemo(() => {
    if (!viewRange || activeData.length === 0) {
      return { leftPct: 0, widthPct: 100, startDate: '--', endDate: '--' };
    }
    const total = activeData.length;
    const leftPct = (viewRange.start / total) * 100;
    const widthPct = Math.max(4, ((viewRange.end - viewRange.start + 1) / total) * 100);
    const startDate = activeData[viewRange.start]?.date?.split(' ')[0] || '--';
    // 區間尾日期：即日棒喺視野尾嗰陣顯示即日日期，唔係停喺烘焙日期。
    const endDate = sliderRangeEndDate(
      viewRange.end,
      activeData.length,
      activeData[viewRange.end]?.date?.split(' ')[0] || '--',
      liveBar ? (liveBar.date || '').slice(0, 10) : null
    );
    return { leftPct, widthPct, startDate, endDate };
  }, [viewRange, activeData, liveBar]);

  return (
    <div className="w-full bg-[#111] rounded-lg mb-1 relative border border-[#333] overflow-hidden flex flex-col">
      {/* Top Mode Banner & Switch Toolbar */}
      <div className="px-3 py-1.5 bg-[#0d0d12] border-b border-[#222] flex items-center justify-between gap-2 flex-wrap select-none">
        <div className="text-xs text-gray-300 font-medium">
          {chartMode === 'CLASSIC'
            ? '目前顯示：1836.15 數律共振 + 強支強阻'
            : puzzleState?.timeSpacePrompt.singularityStatus === 'UPPER_EXPANSION'
            ? '目前顯示：TFDR 動態奇點軌道 ⚠️ 上方三線展開 (85/90/95 警戒)'
            : puzzleState?.timeSpacePrompt.singularityStatus === 'LOWER_EXPANSION'
            ? '目前顯示：TFDR 動態奇點軌道 🟢 下方三線展開 (25/15/10 邊界)'
            : '目前顯示：TFDR 動態奇點軌道 (安全中區雙線邊界：TFDR 85 · TFDR 15)'}
        </div>
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={showAll}
              className="px-1.5 py-0.5 bg-[#222] hover:bg-[#333] rounded text-[10px] text-gray-200 transition"
              title="查看完整歷史全景"
            >
              全景
            </button>
            <button
              onClick={zoomIn}
              className="p-1 hover:bg-[#222] rounded text-gray-300 hover:text-white transition"
              title="放大"
            >
              <ZoomIn size={14} />
            </button>
            <button
              onClick={zoomOut}
              className="p-1 hover:bg-[#222] rounded text-gray-300 hover:text-white transition"
              title="縮小"
            >
              <ZoomOut size={14} />
            </button>
            <button
              onClick={resetZoom}
              className="p-1 hover:bg-[#222] rounded text-gray-300 hover:text-white transition"
              title="重置視角"
            >
              <RotateCcw size={14} />
            </button>
          </div>

          <button
            onClick={() => setChartMode(prev => (prev === 'CLASSIC' ? 'TFDR' : 'CLASSIC'))}
            className="px-3 py-1 text-xs font-bold rounded bg-indigo-600 hover:bg-indigo-500 text-white shadow transition-colors"
          >
            {chartMode === 'CLASSIC' ? '🔄 切換 TFDR 奇點通道' : '🔄 切回 傳統數律圖'}
          </button>

          <button
            onClick={() => setShowSingularityLabels(prev => !prev)}
            className="px-2 py-1 text-xs font-bold rounded bg-[#222] hover:bg-[#333] text-gray-200 border border-[#444] transition"
            title="隱藏／顯示主圖上「奇點買／奇點沽」細字標籤（只在 TFDR 奇點通道模式生效；小三角箭頭會保留）"
          >
            {`奇點標籤: ${showSingularityLabels ? '顯示' : '隱藏'}`}
          </button>

          <button
            onClick={() => setShowModelSignals(prev => !prev)}
            className="px-2 py-1 text-xs font-bold rounded bg-[#222] hover:bg-[#333] text-gray-200 border border-[#444] transition"
            title="顯示／隱藏 QQP v1.3＋tfdr55 模型頂／底層：空心三角＝快訊號（早期預警），實心三角＝確認訊號（武裝後 10 棒內 HA 梯級反轉確認；確認頂反轉棒 TFDR>55 跳過沽）。純顯示，唔影響任何交易判定；月線圖無模型"
          >
            {`模型頂/底: ${showModelSignals ? '顯示' : '隱藏'}`}
          </button>

          <button
            onClick={() => setCandleSource(prev => (prev === 'HA' ? 'RAW' : 'HA'))}
            className="px-2 py-1 text-xs font-bold rounded bg-[#222] hover:bg-[#333] text-gray-200 border border-[#444] transition"
            title="主圖燭體切換：HA 平均燭＝引擎單層平均K線（燭身 HA 開/收＋原始高低影線）；原始陰陽燭＝真實 OHLC。只影響顯示，數據管線與引擎永遠用原始 OHLC"
          >
            {`主圖: ${candleSource === 'HA' ? 'HA 平均燭' : '原始陰陽燭'}`}
          </button>
        </div>
      </div>

      {/* Legend Bar */}
      <div className="px-3 py-1 bg-[#0a0a0a] border-b border-[#1c1c1c] flex items-center justify-between text-[11px] text-gray-400 select-none flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1 font-bold text-white">
            <span className="w-2.5 h-2.5 inline-block bg-[#10b981] rounded-xs"></span> {candleSource === 'HA' ? 'HA 陽線' : '陽線'}
          </span>
          <span className="flex items-center gap-1 font-bold text-white">
            <span className="w-2.5 h-2.5 inline-block bg-[#ef4444] rounded-xs"></span> {candleSource === 'HA' ? 'HA 陰線' : '陰線'}
          </span>
          {qqpModelLayer && (
            <>
              <span className="flex items-center gap-1 font-bold" title="QQP v1.3 快訊號：早期預警，空心三角，未經 HA 反轉確認">
                <span className="text-[#f87171]">▽</span>
                <span className="text-[#4ade80]">△</span>
                <span className="text-slate-300">快頂/快底</span>
              </span>
              <span
                className="flex items-center gap-1 font-bold"
                title="QQP v1.3＋tfdr55 確認訊號：武裝後 10 棒內有 HA 梯級反轉先確認，訊號精確約 0.64；確認頂反轉棒 TFDR>55 跳過沽；快訊號轉確認平均要等 11–12 日"
              >
                <span className="text-[#dc2626]">▼</span>
                <span className="text-[#059669]">▲</span>
                <span className="text-slate-300">確認頂/確認底（HA 反轉確認）</span>
              </span>
            </>
          )}
          {chartMode === 'CLASSIC' ? (
            <>
              <span className="flex items-center gap-1 text-[#8b5cf6] font-bold">
                <span className="w-3 h-0.5 inline-block bg-[#8b5cf6]"></span> 核心線
              </span>
              <span className="flex items-center gap-1 text-[#10b981]">
                <span className="w-3 h-0.5 inline-block border-b border-dashed border-[#10b981]"></span> 強支
              </span>
              <span className="flex items-center gap-1 text-[#f59e0b]">
                <span className="w-3 h-0.5 inline-block border-b border-dashed border-[#f59e0b]"></span> 強阻
              </span>
              {maLine.label && (
                <span className="flex items-center gap-1 text-[#38bdf8] font-bold" title={maLine.title}>
                  <span className="w-3 h-0.5 inline-block bg-[#38bdf8]"></span> {maLine.label}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="flex items-center gap-1 text-[#fca5a5]">
                <span className="w-3 h-0.5 inline-block border-b border-dotted border-[#fca5a5]"></span> TFDR 85 邊界
              </span>
              <span className="flex items-center gap-1 text-[#4ade80]">
                <span className="w-3 h-0.5 inline-block border-b border-dashed border-[#4ade80]"></span> TFDR 15 邊界
              </span>
              {maLine.label && (
                <span className="flex items-center gap-1 text-[#38bdf8] font-bold" title={maLine.title}>
                  <span className="w-3 h-0.5 inline-block bg-[#38bdf8]"></span> {maLine.label}
                </span>
              )}
              <span className="text-slate-400 text-[10px]">
                (進入 ≥80 / ≤20 動態展開三線奇點帶)
              </span>
              <span className="text-[#10b981]">▲ 奇點買</span>
              <span className="text-[#ef4444]">▼ 奇點沽</span>
            </>
          )}
        </div>
        <div className="text-[10px] text-gray-500 font-mono flex items-center gap-2">
          {monthlyLeg && (
            <span
              className={`px-1.5 py-0.5 rounded font-bold ${
                monthlyLeg.leg === 'up'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/60'
                  : monthlyLeg.leg === 'down'
                  ? 'bg-red-500/20 text-red-300 border border-red-400/60'
                  : 'bg-slate-500/20 text-slate-300 border border-slate-400/60'
              }`}
              title={`大周期腿向（月線 25% zigzag 最近確認拐點，只做牛熊定性，唔做預測過濾）${
                monthlyLeg.pivotDate
                  ? `；最新確認拐點 ${monthlyLeg.pivotDate} @ $${monthlyLeg.pivotPrice}`
                  : ''
              }`}
            >
              {monthlyLeg.leg === 'up'
                ? '▲ 大周期：上升腿'
                : monthlyLeg.leg === 'down'
                ? '▼ 大周期：下跌腿'
                : '大周期：腿向未明'}
            </span>
          )}
          區間：{sliderMetrics.startDate} ~ {sliderMetrics.endDate}
        </div>
      </div>

      {/* Main Canvas Container (單指觸控/滑鼠按住左右拖動全歷史平移) */}
      <div
        ref={containerRef}
        className="relative w-full h-[320px] md:h-[350px] bg-black cursor-grab active:cursor-grabbing touch-none"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/* 左上角：一年期四週期 50% 平衡切線嵌套拼圖 (SVG Overlay Canvas) */}
        {puzzleState && (
          <FourTimeframeOverlayPiP puzzleState={puzzleState} nestedData={nestedPiPData} liveBar={liveBar} />
        )}

        {/* Loading Overlay */}
        {(isLoading || activeData.length === 0) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/75 pointer-events-none">
            <div className="text-[#ffd700] text-xs font-semibold px-4 py-2 rounded bg-black/90 border border-[#333] shadow-lg animate-pulse">
              {loadingMessage || '⚡ 系統就緒，請輸入代碼啟動分析'}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Interactive Historical Timeline Slider */}
      {activeData.length > 0 && (
        <div className="px-3 py-1.5 bg-[#09090d] border-t border-[#1e1e24] select-none">
          <div
            ref={sliderTrackRef}
            className="relative w-full h-4 bg-[#18181f] rounded border border-[#2a2a35] cursor-pointer touch-none"
            onMouseDown={(e) => {
              if (!viewRange) return;
              isSliderDraggingRef.current = true;
              const jumped = updateRangeFromSliderClientX(e.clientX, false);
              sliderDragStartRef.current = {
                x: e.clientX,
                startIdx: jumped ? jumped.start : viewRange.start,
                endIdx: jumped ? jumped.end : viewRange.end
              };
            }}
            onTouchStart={(e) => {
              if (!viewRange || e.touches.length !== 1) return;
              isSliderDraggingRef.current = true;
              const jumped = updateRangeFromSliderClientX(e.touches[0].clientX, false);
              sliderDragStartRef.current = {
                x: e.touches[0].clientX,
                startIdx: jumped ? jumped.start : viewRange.start,
                endIdx: jumped ? jumped.end : viewRange.end
              };
            }}
          >
            <div
              className="absolute top-0 bottom-0 bg-indigo-500/35 border border-indigo-400/70 rounded cursor-ew-resize"
              style={{
                left: `${sliderMetrics.leftPct}%`,
                width: `${sliderMetrics.widthPct}%`
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                if (!viewRange) return;
                isSliderDraggingRef.current = true;
                sliderDragStartRef.current = {
                  x: e.clientX,
                  startIdx: viewRange.start,
                  endIdx: viewRange.end
                };
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                if (!viewRange || e.touches.length !== 1) return;
                isSliderDraggingRef.current = true;
                sliderDragStartRef.current = {
                  x: e.touches[0].clientX,
                  startIdx: viewRange.start,
                  endIdx: viewRange.end
                };
              }}
            />
          </div>
        </div>
      )}

      {/* Bottom Zoom Tip */}
      <div className="py-1 text-center text-[#666] text-[10px] bg-[#0a0a0a] border-t border-[#1a1a1a]">
        滾輪/雙指縮放 | 單指或滑鼠按住左右拖動回溯歷史 | 可拖動下方時間軸跳轉年份
      </div>
    </div>
  );
};
