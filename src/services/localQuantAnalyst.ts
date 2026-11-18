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
  const { Q, M, W, D } = puzzle.timeframes;
  const tsp = puzzle.timeSpacePrompt;

  const regimeLabel =
    puzzle.regime === 'UPTREND_CHANNEL'
      ? '大升通道（站在季/月50%切線之上・100%禁空）'
      : puzzle.regime === 'DOWNTREND_CHANNEL'
      ? '大跌通道（跌破季與月雙50%切線・只空不買）'
      : '切線過渡區 (觀望)';

  const trendQuality =
    puzzle.ker >= 0.6
      ? `單邊強勢趨勢 (KER ${puzzle.ker})`
      : puzzle.ker <= 0.3
      ? `中樞震盪洗盤期 (KER ${puzzle.ker})`
      : `波段推進期 (KER ${puzzle.ker})`;

  const signalBadgeMap: Record<PuzzleState['signal'], string> = {
    GOLDEN_BUY: `🔥【信心 ${puzzle.signalStrength}%・黃金買點上穿週50%線 (${Math.round(puzzle.positionSizingHint * 100)}%)】`,
    ADD_POSITION: `🟢【信心 ${puzzle.signalStrength}%・復甦重上週50%線 (${Math.round(puzzle.positionSizingHint * 100)}%)】`,
    PARTIAL_PROFIT: `🟠【信心 ${puzzle.signalStrength}%・80+紅區HA轉陰鎖利60% (留40%底倉)】`,
    FULL_CLEAR: `🚨【信心 ${puzzle.signalStrength}%・破季線50%下緣6%全數清倉】`,
    HALT_REDUCE: `🛑【回撤熔斷控險・強制減半持倉】`,
    SHORT_ENTRY: `🟣【信心 ${puzzle.signalStrength}%・雙破季月50%線＋85+輕倉沽空 (30%)】`,
    COVER_SHORT: `💎【信心 ${puzzle.signalStrength}%・空單全數平倉】`,
    HOLD:
      puzzle.regime === 'UPTREND_CHANNEL'
        ? `🟢【信心 ${puzzle.signalStrength}%・大升通道安穩持倉】`
        : puzzle.regime === 'DOWNTREND_CHANNEL'
        ? `🚨【信心 ${puzzle.signalStrength}%・大跌通道嚴禁抄底】`
        : `⚖️【信心 ${puzzle.signalStrength}%・過渡區觀望】`
  };

  const confidenceTag = signalBadgeMap[puzzle.signal];
  const reasonsSummary = puzzle.reasons.join('；');
  const riskText = puzzle.riskFlags.length > 0 ? puzzle.riskFlags.join('；') : '無異常結構風險';

  const coreAction = `${tsp.actionTitle}。季50%切線 $${tsp.qMid50}｜月50%切線 $${tsp.mMid50}｜週50%切線 $${tsp.wMid50}（${tsp.singularityLabel}）。低吸埋伏 $${tsp.buyZone.low}–$${tsp.buyZone.high}，高拋警戒 $${tsp.takeProfitZone.low}–$${tsp.takeProfitZone.high}，清倉保護線 $${tsp.invalidationPrice}。`;

  const keyPointsBlock =
    puzzle.keyPoints && puzzle.keyPoints.length > 0
      ? `\n• T+1 開盤觀察重點：\n  - ${puzzle.keyPoints.join('\n  - ')}`
      : '';

  const fullReport = [
    `📊 【${puzzle.symbol} 50% 切線嵌套拼圖・時空提示單】(${puzzle.schema} | ${tsp.triggerDate})`,
    `${confidenceTag}`,
    `• 大局定性：${regimeLabel}｜${trendQuality}`,
    `• 三級 50% 平衡切線：季 Q50 $${tsp.qMid50}｜月 M50 $${tsp.mMid50}｜週 W50 $${tsp.wMid50}`,
    `• 奇點軌道狀態：${tsp.singularityLabel}（季TFDR ${Q.tfdr} / 月TFDR ${M.tfdr} / 週TFDR ${W.tfdr} / 日TFDR ${D.tfdr}）`,
    `• 關鍵座標：現價 $${puzzle.currentPrice}｜低吸 $${tsp.buyZone.low}–$${tsp.buyZone.high}｜高拋 $${tsp.takeProfitZone.low}–$${tsp.takeProfitZone.high}｜清倉保護 $${tsp.invalidationPrice}`,
    `• 觸發依據：${reasonsSummary}`,
    `• 風險標記：${riskText}${keyPointsBlock}`,
    `• 操盤指令：${coreAction}`
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
  const invPrice = Number((input.monthlyMidline * 0.94).toFixed(2));
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
      qHigh: input.currentPrice,
      qLow: input.monthlyMidline,
      mHigh: input.currentPrice,
      mLow: input.monthlyMidline,
      wHigh: input.currentPrice,
      wLow: input.weeklyMidline,
      dTfdr: input.dailyTFDR,
      singularityStatus:
        input.dailyTFDR >= 80
          ? 'UPPER_EXPANSION'
          : input.dailyTFDR <= 20
          ? 'LOWER_EXPANSION'
          : 'SAFE_MID_ZONE',
      singularityLabel: '安全雙線通道 (等待完整日線)',
      regimeLabel: input.isMonthlyUptrend ? '大升通道(禁空)' : '大跌通道',
      actionTitle: '⚖️ 沿50%切線持倉觀望',
      buyZone: { low: input.band15, high: input.weeklyMidline },
      takeProfitZone: { low: input.band90, high: input.band90 },
      invalidationPrice: invPrice,
      compactHint: `Q50:$${input.monthlyMidline}｜M50:$${input.monthlyMidline}｜W50:$${input.weeklyMidline}｜日TFDR:${input.dailyTFDR}`
    },
    timeframes: {
      Q: { bars: 0, haBull: input.isMonthlyUptrend, haLow: 0, prevHaLow: 0, midline: input.monthlyMidline, prevMidline: input.monthlyMidline, high: input.currentPrice, low: input.monthlyMidline, mid50: input.monthlyMidline, atr: 0, tfdr: input.monthlyTFDR, rsi: 50, mom: Number(((50 + input.monthlyTFDR) / 2).toFixed(1)), sampleOK: false, isLastBarComplete: false },
      M: { bars: 0, haBull: input.isMonthlyUptrend, haLow: 0, prevHaLow: 0, midline: input.monthlyMidline, prevMidline: input.monthlyMidline, high: input.currentPrice, low: input.monthlyMidline, mid50: input.monthlyMidline, atr: 0, tfdr: input.monthlyTFDR, rsi: 50, mom: Number(((50 + input.monthlyTFDR) / 2).toFixed(1)), sampleOK: false, isLastBarComplete: false },
      W: { bars: 0, haBull: input.isMonthlyUptrend, haLow: 0, prevHaLow: 0, midline: input.weeklyMidline, prevMidline: input.weeklyMidline, high: input.currentPrice, low: input.weeklyMidline, mid50: input.weeklyMidline, atr: 0, tfdr: input.weeklyTFDR, rsi: 50, mom: Number(((50 + input.weeklyTFDR) / 2).toFixed(1)), sampleOK: false, isLastBarComplete: false },
      D: { bars: input.closes.length, haBull: input.isMonthlyUptrend, haLow: 0, prevHaLow: 0, midline: input.weeklyMidline, prevMidline: input.weeklyMidline, high: input.currentPrice, low: input.weeklyMidline, mid50: input.currentPrice, atr: 0, tfdr: input.dailyTFDR, rsi: 50, mom: Number(((50 + input.dailyTFDR) / 2).toFixed(1)), sampleOK: true, isLastBarComplete: true }
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
