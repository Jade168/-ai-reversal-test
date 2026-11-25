import { RawKline } from '../types/quant';
import { MultiTimeframeTFDR, TFDRPoint } from './tfdrIndicator';
import {
  buildFullPuzzleTimeline,
  computePuzzleDecision,
  OHLCBar,
  OverlayPoint,
  PuzzleState
} from './puzzleDecisionEngine';
import { qqpModelOverlapLines } from './qqpModelSignals';

export interface LocalAnalysisInput {
  symbol: string;
  currentPrice: number;
  closes: number[];
  weeklyMidline: number;
  monthlyMidline: number;
  isMonthlyUptrend: boolean;
  dailyTFDR: number;
  weeklyTFDR: number;
  monthlyTFDR: number;
  band90: number;
  band15: number;
  puzzle?: PuzzleState;
  haStructure?: HaStructureContext | null;
}

export interface LocalExpertSummary {
  isMonthlyUptrend: boolean;
  ker: number;
  confidenceTag: string;
  regimeLabel: string;
  trendQuality: string;
  coreAction: string;
  fullReport: string;
  puzzle?: PuzzleState;
}

/**
 * HA 趨勢結構上下文（2026-11-22 新增）：全部數字直接讀取決策引擎 buildFullPuzzleTimeline 嘅輸出
 * （單層 HA overlay + 最新一日裁決），唔另行發明任何公式。目的係令 AI 專家看板同圖表、引擎三者
 * 睇住同一套 HA 轉折結構，同時將真實市場價位（原始 OHLC）分開標註，建議可以直接按真實價掛單。
 */
export interface HaStructureContext {
  asOfDate: string;
  haBull: boolean;
  haStreak: number; // 連陽／連陰第幾根（日線 HA）
  haOpen: number;
  haClose: number;
  justBrokeUp: boolean; // 最新一日日線 HA 破梯向上（currHa.high > prevHa.high 且陽）
  justBrokeDown: boolean; // 最新一日日線 HA 破梯向下
  flippedBull: boolean; // 最新一日 HA 由陰轉陽
  flippedBear: boolean; // 最新一日 HA 由陽轉陰
  haSteps: Array<{ date: string; haLow: number; haHigh: number }>; // 最近 3 日 HA 梯級（引擎 haLowOf/haHighOf 公式）
  stepsDirection: 'UP' | 'DOWN' | 'MIXED'; // 級級上／級級落／混合
  sellTrigger: number | null; // 引擎沽方扣扳機線（奇點燭 HA 低位，收市跌穿先觸發）
  buyTrigger: number | null; // 引擎買方扣扳機線（奇點燭 HA 高位，收市升穿先觸發）
  singularityDate: string | null;
  invalidationPrice: number | null;
  lastBar: { date: string; open: number; high: number; low: number; close: number }; // 最新一日真實 OHLC
}

export function buildHaStructureContext(dailyData: OHLCBar[]): HaStructureContext | null {
  if (!dailyData || dailyData.length < 70) return null;
  try {
    const timeline = buildFullPuzzleTimeline(dailyData);
    const overlays = timeline.overlays;
    const n = overlays.length;
    if (n === 0) return null;
    const bullOf = (op: OverlayPoint): boolean => op.dHaBull ?? op.haClose >= op.haOpen;
    const haLowOf = (op: OverlayPoint): number => Math.min(op.low, op.haOpen, op.haClose);
    const haHighOf = (op: OverlayPoint): number => Math.max(op.high, op.haOpen, op.haClose);
    const last = overlays[n - 1];
    const prev = n > 1 ? overlays[n - 2] : null;
    const haBull = bullOf(last);
    let streak = 0;
    for (let i = n - 1; i >= 0; i--) {
      if (bullOf(overlays[i]) === haBull) streak++;
      else break;
    }
    const steps = overlays.slice(-3).map(op => ({
      date: op.date,
      haLow: Number(haLowOf(op).toFixed(2)),
      haHigh: Number(haHighOf(op).toFixed(2))
    }));
    const lowsUp = steps.length >= 2 && steps.every((st, i) => i === 0 || st.haLow > steps[i - 1].haLow);
    const lowsDown = steps.length >= 2 && steps.every((st, i) => i === 0 || st.haLow < steps[i - 1].haLow);
    const verdict = timeline.verdicts[n - 1];
    return {
      asOfDate: last.date,
      haBull,
      haStreak: streak,
      haOpen: Number(last.haOpen.toFixed(2)),
      haClose: Number(last.haClose.toFixed(2)),
      justBrokeUp: Boolean(last.dHaBreakUp),
      justBrokeDown: Boolean(last.dHaBreakDown),
      flippedBull: Boolean(prev && !bullOf(prev) && haBull),
      flippedBear: Boolean(prev && bullOf(prev) && !haBull),
      haSteps: steps,
      stepsDirection: lowsUp ? 'UP' : lowsDown ? 'DOWN' : 'MIXED',
      sellTrigger: verdict?.singularityLow ?? null,
      buyTrigger: verdict?.singularityHigh ?? null,
      singularityDate: verdict?.singularityDate ?? null,
      invalidationPrice: verdict?.invalidationPrice ?? null,
      lastBar: { date: last.date, open: last.open, high: last.high, low: last.low, close: last.close }
    };
  } catch {
    return null;
  }
}

export function formatHaStructureBlocks(
  ctx: HaStructureContext,
  zones: { buyLow: number; buyHigh: number; tpLow: number; tpHigh: number }
): string[] {
  const fmt = (x: number): number => Number(x.toFixed(2));
  const turnParts: string[] = [];
  if (ctx.flippedBull || ctx.justBrokeUp) turnParts.push('今日 HA 由陰轉陽／破梯向上（低買轉折）');
  if (ctx.flippedBear || ctx.justBrokeDown) turnParts.push('今日 HA 由陽轉陰／破梯向下（高沽轉折）');
  const turnText = turnParts.length > 0 ? turnParts.join('；') : '今日無 HA 轉折';
  const stepsText = ctx.haSteps.map(st => `$${st.haLow}`).join(' → ');
  const stepsLabel =
    ctx.stepsDirection === 'UP' ? '級級上（梯級向上）' : ctx.stepsDirection === 'DOWN' ? '級級落（梯級向下）' : '梯級橫行混合';
  const armParts: string[] = [];
  if (ctx.sellTrigger != null)
    armParts.push(
      `沽方扣扳機線 $${fmt(ctx.sellTrigger)}（收市跌穿先減倉${ctx.singularityDate ? `，奇點燭 ${ctx.singularityDate}` : ''}）`
    );
  if (ctx.buyTrigger != null)
    armParts.push(
      `買方扣扳機線 $${fmt(ctx.buyTrigger)}（收市升穿先買入${ctx.singularityDate ? `，奇點燭 ${ctx.singularityDate}` : ''}）`
    );
  const armText = armParts.length > 0 ? armParts.join('｜') : '目前無奇點武裝（中區觀望）';
  return [
    `• 【HA 趨勢結構・單層平均K（引擎推導）】${ctx.haBull ? '連陽' : '連陰'}第 ${ctx.haStreak} 根（HA 開 $${ctx.haOpen}／HA 收 $${ctx.haClose}）｜近3日 HA 梯級低位 ${stepsText}・${stepsLabel}｜${turnText}`,
    `• 【奇點武裝・引擎觸發位（真實價）】${armText}${ctx.invalidationPrice != null ? `｜失效位 $${fmt(ctx.invalidationPrice)}` : ''}`,
    `• 【真實執行價位・原始 OHLC（可直接掛單）】最新一日（${ctx.lastBar.date}）開 $${fmt(ctx.lastBar.open)}／高 $${fmt(ctx.lastBar.high)}／低 $${fmt(ctx.lastBar.low)}／收 $${fmt(ctx.lastBar.close)}｜低吸區 $${fmt(zones.buyLow)}–$${fmt(zones.buyHigh)}｜高拋區 $${fmt(zones.tpLow)}–$${fmt(zones.tpHigh)}｜註：全部價位均為真實市場價，引擎以次日開市價執行`
  ];
}

/**
 * 開源量化核心：考夫曼趨勢效率比 (Kaufman Efficiency Ratio, KER)
 */
export function calculateKaufmanER(closes: number[], period: number = 14): number {
  if (closes.length <= period) return 0.5;
  const endIdx = closes.length - 1;
  const startIdx = endIdx - period;
  const netChange = Math.abs(closes[endIdx] - closes[startIdx]);
  let sumVolatility = 0;
  for (let i = startIdx + 1; i <= endIdx; i++) {
    sumVolatility += Math.abs(closes[i] - closes[i - 1]);
  }
  return sumVolatility === 0 ? 0 : Number((netChange / sumVolatility).toFixed(2));
}

/**
 * 純模板插值：嚴格讀取 computePuzzleDecision 輸出的 PuzzleState JSON 物件，不另行重算任何數值
 */
export function evaluatePuzzleExpertSummary(puzzle: PuzzleState): LocalExpertSummary {
  const { D } = puzzle.timeframes;
  const tsp = puzzle.timeSpacePrompt;

  const regimeLabel = tsp.trendBannerLabel || tsp.conductionLabel ||
    (puzzle.regime === 'UPTREND_CHANNEL'
      ? '穩站月/季50之上・上升浪只買不空'
      : '跌穿月/季50之下・下跌浪禁買只空');

  const trendQuality =
    puzzle.ker >= 0.6
      ? `單邊強勢趨勢 (KER ${puzzle.ker})`
      : puzzle.ker <= 0.3
      ? `中樞震盪洗盤期 (KER ${puzzle.ker})`
      : `波段推進期 (KER ${puzzle.ker})`;

  const signalBadgeMap: Record<PuzzleState['signal'], string> = {
    GOLDEN_BUY: `🔥【信心 ${puzzle.signalStrength}%・上升浪重倉買入 (${Math.round(puzzle.positionSizingHint * 100)}%)】`,
    BULL_DIP_BUY: `📈【信心 ${puzzle.signalStrength}%・牛市回踩中線拐頭補滿80%】`,
    PARTIAL_PROFIT: `🟠【信心 ${puzzle.signalStrength}%・跌穿奇點低減倉45% (保留55%核心底倉)】`,
    FULL_CLEAR: `🚨【信心 ${puzzle.signalStrength}%・跌穿月/季50線 100%清倉禁買】`,
    WEEKLY_BREAK_TRIM: `🚨【信心 ${puzzle.signalStrength}%・週線大陰突變減倉40% (保留60%核心底倉)】`,
    SHORT_ENTRY: `🟣【信心 ${puzzle.signalStrength}%・下跌浪≥80輕倉沽空 (${Math.round(puzzle.positionSizingHint * 100)}%)】`,
    COVER_SHORT: `💎【信心 ${puzzle.signalStrength}%・空單100%平倉】`,
    HOLD:
      tsp.isBullRegime
        ? `🛡️【信心 ${puzzle.signalStrength}%・穩站月/季50之上・死抱核心多單(禁空)】`
        : `🚫【信心 ${puzzle.signalStrength}%・跌穿月/季50之下・空倉禁買觀望】`
  };

  const confidenceTag = signalBadgeMap[puzzle.signal];

  const coreAction = `${tsp.actionTitle}。月50中間線 $${tsp.m50Line}｜季50中間線 $${tsp.q50Line}（${tsp.haDirectionSummary}）。低吸埋伏 $${tsp.buyZone.low}–$${tsp.buyZone.high}，高拋警戒 $${tsp.takeProfitZone.low}–$${tsp.takeProfitZone.high}，50線分水嶺 $${tsp.invalidationPrice}。`;

  const fullReport = [
    `📊 【${puzzle.symbol} 最新時空提示單】(${tsp.triggerDate} | 現價 $${puzzle.currentPrice})`,
    `${confidenceTag}`,
    `• 大勢定性：${tsp.trendBannerLabel}（月50 $${tsp.m50Line} / 季50 $${tsp.q50Line}）`,
    `• 日/週平均K破梯：${tsp.haDirectionSummary}｜${trendQuality}`,
    `• 奇點與區間：日TFDR ${D.tfdr} (近6日 ${tsp.dTfdrLow6}~${tsp.dTfdrHigh6})｜買入≤25 / 減倉≥88 / 下跌浪沽空≥80`,
    `• 關鍵座標：低吸 $${tsp.buyZone.low}–$${tsp.buyZone.high}｜高拋 $${tsp.takeProfitZone.low}–$${tsp.takeProfitZone.high}｜50線分水嶺 $${tsp.invalidationPrice}`,
    `• 操盤指令：${tsp.actionTitle}`
  ].join('\n');

  return {
    isMonthlyUptrend: puzzle.regime === 'UPTREND_CHANNEL',
    ker: puzzle.ker,
    confidenceTag,
    regimeLabel,
    trendQuality,
    coreAction,
    fullReport,
    puzzle
  };
}

export function generatePuzzleExpertReport(symbol: string, dailyData: OHLCBar[]): string {
  if (!dailyData || dailyData.length === 0) return '';
  const puzzle = computePuzzleDecision(symbol, dailyData, dailyData.length - 1);
  const summary = evaluatePuzzleExpertSummary(puzzle);
  // (v5 應用版第 4 項，純文字標記——唔改任何決策欄位／閾值／數字／verdict)：
  // 最新一個引擎沽出日／買入日喺 ±5 日內撞到模型頂／底嗰陣，加一行「模型確認」標記
  // （確認頂／底做主標記，快頂／底做輔助）；撞唔到就唔加行。計唔到就當無事發生。
  let overlapLines: string[] = [];
  try {
    const timeline = buildFullPuzzleTimeline(dailyData);
    const sellDates: string[] = [];
    const buyDates: string[] = [];
    timeline.verdicts.forEach((v, i) => {
      if (v.signal === 'PARTIAL_PROFIT') sellDates.push(timeline.sorted[i].date);
      if (v.signal === 'GOLDEN_BUY') buyDates.push(timeline.sorted[i].date);
    });
    overlapLines = qqpModelOverlapLines(
      dailyData.map(b => ({ date: b.date, o: b.open, h: b.high, l: b.low, c: b.close })),
      sellDates,
      buyDates
    );
  } catch {
    overlapLines = [];
  }
  const withOverlap = (report: string): string =>
    overlapLines.length > 0 ? `${report}\n${overlapLines.join('\n')}` : report;
  const haCtx = buildHaStructureContext(dailyData);
  if (!haCtx) return withOverlap(summary.fullReport);
  const blocks = formatHaStructureBlocks(haCtx, {
    buyLow: puzzle.levels.buyZone.low,
    buyHigh: puzzle.levels.buyZone.high,
    tpLow: puzzle.levels.takeProfitZone.low,
    tpHigh: puzzle.levels.takeProfitZone.high
  });
  return withOverlap([...summary.fullReport.split('\n'), ...blocks].join('\n'));
}

export function evaluateLocalExpertSummary(input: LocalAnalysisInput): LocalExpertSummary {
  if (input.puzzle) {
    const summary = evaluatePuzzleExpertSummary(input.puzzle);
    if (input.haStructure) {
      const blocks = formatHaStructureBlocks(input.haStructure, {
        buyLow: input.puzzle.levels.buyZone.low,
        buyHigh: input.puzzle.levels.buyZone.high,
        tpLow: input.puzzle.levels.takeProfitZone.low,
        tpHigh: input.puzzle.levels.takeProfitZone.high
      });
      return { ...summary, fullReport: [...summary.fullReport.split('\n'), ...blocks].join('\n') };
    }
    return summary;
  }
  const todayStr = new Date().toISOString().slice(0, 10);
  const invPrice = Number(input.monthlyMidline.toFixed(2));
  const isBullRegime = input.isMonthlyUptrend && input.currentPrice >= input.monthlyMidline;
  const syntheticScenario = isBullRegime
    ? 'SCENARIO_B_BULL_FLOOR'
    : 'SCENARIO_A_BEAR_CEILING';
  const trendBannerLabel = isBullRegime
    ? '穩站月/季50之上・上升浪只買不空'
    : '跌穿月/季50之下・下跌浪禁買只空';
  const syntheticPuzzle: PuzzleState = {
    schema: 'puzzle/v2-strict',
    symbol: input.symbol,
    signalDate: todayStr,
    asOfDate: todayStr,
    asOfIndex: Math.max(0, input.closes.length - 1),
    currentPrice: input.currentPrice,
    isPuzzleCross: false,
    timeSpacePrompt: {
      triggerDate: todayStr,
      currentPrice: input.currentPrice,
      qMid50: input.monthlyMidline,
      mMid50: input.monthlyMidline,
      wMid50: input.weeklyMidline,
      q50Line: input.monthlyMidline,
      m50Line: input.monthlyMidline,
      qHigh: input.currentPrice,
      qLow: input.monthlyMidline,
      mHigh: input.currentPrice,
      mLow: input.monthlyMidline,
      wHigh: input.currentPrice,
      wLow: input.weeklyMidline,
      dTfdr: input.dailyTFDR,
      wTfdr: input.weeklyTFDR,
      mTfdr: input.monthlyTFDR,
      qTfdr: input.monthlyTFDR,
      dBreakUp: false,
      dBreakDown: false,
      wBreakUp: false,
      wBreakDown: false,
      dTfdrLow6: input.dailyTFDR,
      dTfdrHigh6: input.dailyTFDR,
      distTo13: Math.max(0, input.dailyTFDR - 13),
      distTo23: Math.max(0, input.dailyTFDR - 23),
      distTo85: Math.max(0, 88 - input.dailyTFDR),
      distTo95: Math.max(0, 95 - input.dailyTFDR),
      isMonthlyBreakDown: false,
      isMonthlyBreakUp: false,
      monthlyHaStatusLabel: trendBannerLabel,
      inDiscountZone: isBullRegime,
      isBullRegime,
      isBearRegime: !isBullRegime,
      trendBannerLabel,
      conductionScenario: syntheticScenario,
      conductionLabel: trendBannerLabel,
      haDirectionSummary: isBullRegime ? '季:陽｜月:陽｜週:陽' : '季:陰｜月:陰｜週:陰',
      singularityStatus:
        input.dailyTFDR >= 88
          ? 'UPPER_EXPANSION'
          : input.dailyTFDR <= 25
          ? 'LOWER_EXPANSION'
          : 'SAFE_MID_ZONE',
      singularityLabel: '等待完整日線運算',
      regimeLabel: trendBannerLabel,
      actionTitle: isBullRegime
        ? '🛡️ 穩站月/季50之上・死抱核心多單（100%禁空）'
        : '🚫 跌穿月/季50之下・空倉禁買觀望',
      buyZone: { low: input.band15, high: input.weeklyMidline },
      takeProfitZone: { low: input.band90, high: input.band90 },
      invalidationPrice: invPrice,
      compactHint: `${trendBannerLabel}｜月50:$${input.monthlyMidline}｜日TFDR:${input.dailyTFDR}`
    },
    timeframes: {
      Q: { bars: 0, haBull: input.isMonthlyUptrend, haHigh: input.currentPrice, prevHaHigh: input.currentPrice, haLow: 0, prevHaLow: 0, haBreakUp: false, haBreakDown: false, midline: input.monthlyMidline, prevMidline: input.monthlyMidline, high: input.currentPrice, low: input.monthlyMidline, mid50: input.monthlyMidline, atr: 0, tfdr: input.monthlyTFDR, rsi: 50, mom: Number(((50 + input.monthlyTFDR) / 2).toFixed(1)), sampleOK: false, isLastBarComplete: false },
      M: { bars: 0, haBull: input.isMonthlyUptrend, haHigh: input.currentPrice, prevHaHigh: input.currentPrice, haLow: 0, prevHaLow: 0, haBreakUp: false, haBreakDown: false, midline: input.monthlyMidline, prevMidline: input.monthlyMidline, high: input.currentPrice, low: input.monthlyMidline, mid50: input.monthlyMidline, atr: 0, tfdr: input.monthlyTFDR, rsi: 50, mom: Number(((50 + input.monthlyTFDR) / 2).toFixed(1)), sampleOK: false, isLastBarComplete: false },
      W: { bars: 0, haBull: input.isMonthlyUptrend, haHigh: input.currentPrice, prevHaHigh: input.currentPrice, haLow: 0, prevHaLow: 0, haBreakUp: false, haBreakDown: false, midline: input.weeklyMidline, prevMidline: input.weeklyMidline, high: input.currentPrice, low: input.weeklyMidline, mid50: input.weeklyMidline, atr: 0, tfdr: input.weeklyTFDR, rsi: 50, mom: Number(((50 + input.weeklyTFDR) / 2).toFixed(1)), sampleOK: false, isLastBarComplete: false },
      D: { bars: input.closes.length, haBull: input.isMonthlyUptrend, haHigh: input.currentPrice, prevHaHigh: input.currentPrice, haLow: 0, prevHaLow: 0, haBreakUp: false, haBreakDown: false, midline: input.weeklyMidline, prevMidline: input.weeklyMidline, high: input.currentPrice, low: input.weeklyMidline, mid50: input.currentPrice, atr: 0, tfdr: input.dailyTFDR, rsi: 50, mom: Number(((50 + input.dailyTFDR) / 2).toFixed(1)), sampleOK: true, isLastBarComplete: true }
    },
    regime: input.isMonthlyUptrend && input.currentPrice >= input.monthlyMidline ? 'UPTREND_CHANNEL' : 'DOWNTREND_CHANNEL',
    signal: 'HOLD',
    signalStrength: 50,
    positionSizingHint: 0,
    levels: {
      buyZone: { low: input.band15, high: input.weeklyMidline },
      takeProfitZone: { low: input.band90, high: input.band90 },
      invalidationPrice: invPrice
    },
    ker: calculateKaufmanER(input.closes, 14),
    shortLock8dActive: false,
    reasons: ['等待原生四週期 50% 切線計算完成'],
    keyPoints: ['等待原生四週期 50% 切線計算完成'],
    riskFlags: [],
    provenance: { computedBy: 'computePuzzleDecision', llmGeneratedNumbers: [] }
  };
  return evaluatePuzzleExpertSummary(syntheticPuzzle);
}

/**
 * 將現有專案的 dailyKlines 組裝為 LocalAnalysisInput（內部直接調用 computePuzzleDecision）
 */
export function buildLocalAnalysisInput(params: {
  symbol: string;
  currentPrice: number;
  dailyKlines: RawKline[];
  tfdr: MultiTimeframeTFDR;
  latestTfdrPoint?: TFDRPoint | null;
}): LocalAnalysisInput | null {
  const { symbol, currentPrice, dailyKlines, latestTfdrPoint } = params;
  if (!dailyKlines || dailyKlines.length === 0 || !Number.isFinite(currentPrice) || currentPrice <= 0) {
    return null;
  }

  const dailyData: OHLCBar[] = dailyKlines.map(bar => ({
    date: (bar.date || '').split(' ')[0],
    open: Number(bar.o),
    high: Number(bar.h),
    low: Number(bar.l),
    close: Number(bar.c)
  }));

  const puzzle = computePuzzleDecision(symbol, dailyData, dailyData.length - 1);

  return {
    symbol,
    currentPrice: puzzle.currentPrice,
    closes: dailyData.map(b => b.close),
    weeklyMidline: puzzle.timeframes.W.midline,
    monthlyMidline: puzzle.timeframes.M.midline,
    isMonthlyUptrend: puzzle.regime === 'UPTREND_CHANNEL',
    dailyTFDR: puzzle.timeframes.D.tfdr,
    weeklyTFDR: puzzle.timeframes.W.tfdr,
    monthlyTFDR: puzzle.timeframes.M.tfdr,
    band90: latestTfdrPoint?.band90 ?? puzzle.levels.takeProfitZone.high,
    band15: latestTfdrPoint?.band15 ?? puzzle.levels.buyZone.low,
    puzzle,
    haStructure: buildHaStructureContext(dailyData)
  };
}
