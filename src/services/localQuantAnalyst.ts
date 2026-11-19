import { RawKline } from '../types/quant';
import { MultiTimeframeTFDR, TFDRPoint } from './tfdrIndicator';
import { computePuzzleDecision, OHLCBar, PuzzleState } from './puzzleDecisionEngine';

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
    ADD_POSITION: `🟢【信心 ${puzzle.signalStrength}%・低位加倉坐貨 (${Math.round(puzzle.positionSizingHint * 100)}%)】`,
    PARTIAL_PROFIT: `🟠【信心 ${puzzle.signalStrength}%・跌穿奇點低減倉45% (保留55%核心底倉)】`,
    FULL_CLEAR: `🚨【信心 ${puzzle.signalStrength}%・跌穿月/季50線 100%清倉禁買】`,
    WEEKLY_BREAK_TRIM: `🚨【信心 ${puzzle.signalStrength}%・週線大陰突變減倉40% (保留60%核心底倉)】`,
    HALT_REDUCE: `🛑【回撤熔斷控險・強制減半持倉】`,
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
  return evaluatePuzzleExpertSummary(puzzle).fullReport;
}

export function evaluateLocalExpertSummary(input: LocalAnalysisInput): LocalExpertSummary {
  if (input.puzzle) {
    return evaluatePuzzleExpertSummary(input.puzzle);
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

export function generateLocalExpertReport(input: LocalAnalysisInput): string {
  return evaluateLocalExpertSummary(input).fullReport;
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
  const { symbol, currentPrice, dailyKlines, tfdr, latestTfdrPoint } = params;
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
    puzzle
  };
}
