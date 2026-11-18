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

  const regimeLabel =
    puzzle.regime === 'UPTREND_CHANNEL'
      ? '月線大升通道 (只買不空)'
      : puzzle.regime === 'DOWNTREND_CHANNEL'
      ? '月線大跌通道 (嚴禁做多・只空不買)'
      : '月中線過渡震盪區 (多空觀望)';

  const trendQuality =
    puzzle.ker >= 0.6
      ? `單邊強勢趨勢 (KER ${puzzle.ker})`
      : puzzle.ker <= 0.3
      ? `中樞震盪洗盤期 (KER ${puzzle.ker})`
      : `波段推進期 (KER ${puzzle.ker})`;

  const signalBadgeMap: Record<PuzzleState['signal'], string> = {
    GOLDEN_BUY: `🔥【信心 ${puzzle.signalStrength}%・踩週中線奇點重倉補回 (${Math.round(puzzle.positionSizingHint * 100)}%)】`,
    ADD_POSITION: `🟢【信心 ${puzzle.signalStrength}%・升浪奇點分批低吸 (${Math.round(puzzle.positionSizingHint * 100)}%)】`,
    PARTIAL_PROFIT: `🟠【信心 ${puzzle.signalStrength}%・高位奇點鎖利減倉 (${Math.round(puzzle.positionSizingHint * 100)}%)】`,
    FULL_CLEAR: `🚨【信心 ${puzzle.signalStrength}%・月線破位全數清倉】`,
    SHORT_ENTRY: `🟣【信心 ${puzzle.signalStrength}%・月線大跌通道反彈沽空 (${Math.round(puzzle.positionSizingHint * 100)}%)】`,
    COVER_SHORT: `💎【信心 ${puzzle.signalStrength}%・熊市下方奇點全數平空】`,
    HOLD:
      puzzle.regime === 'UPTREND_CHANNEL'
        ? `🟢【信心 ${puzzle.signalStrength}%・大升通道安穩持倉】`
        : puzzle.regime === 'DOWNTREND_CHANNEL'
        ? `🚨【信心 ${puzzle.signalStrength}%・月線破位禁買觀望】`
        : `⚖️【信心 ${puzzle.signalStrength}%・過渡區觀望等待確認】`
  };

  const confidenceTag = signalBadgeMap[puzzle.signal];
  const reasonsSummary = puzzle.reasons.join('；');
  const riskText = puzzle.riskFlags.length > 0 ? puzzle.riskFlags.join('；') : '無異常結構風險';

  const coreAction = `${reasonsSummary}。參考低吸區 $${puzzle.levels.buyZone.low}–$${puzzle.levels.buyZone.high}，止盈區 $${puzzle.levels.takeProfitZone.low}–$${puzzle.levels.takeProfitZone.high}，月線失效位 $${puzzle.levels.invalidationPrice}（嚴守 -8% 單筆硬止損）。`;

  const keyPointsBlock =
    puzzle.keyPoints && puzzle.keyPoints.length > 0
      ? `\n• T+1 觀察重點：\n  - ${puzzle.keyPoints.join('\n  - ')}`
      : '';

  const fullReport = [
    `📊 【${puzzle.symbol} 拼圖量化引擎・最新單日預警】(${puzzle.schema} | ${puzzle.signalDate || puzzle.asOfDate})`,
    `${confidenceTag}`,
    `• 大局定性：${regimeLabel}｜${trendQuality}`,
    `• 四維原生結構：季線(${Q.bars}根)中線 $${Q.midline} / TFDR ${Q.tfdr}｜月線(${M.bars}根)中線 $${M.midline} / TFDR ${M.tfdr}｜週線(${W.bars}根)中線 $${W.midline} / TFDR ${W.tfdr}｜日線中線 $${D.midline} / TFDR ${D.tfdr}`,
    `• 關鍵座標：現價 $${puzzle.currentPrice}｜買入埋伏 $${puzzle.levels.buyZone.low}–$${puzzle.levels.buyZone.high}｜高拋目標 $${puzzle.levels.takeProfitZone.low}–$${puzzle.levels.takeProfitZone.high}｜失效止損 $${puzzle.levels.invalidationPrice}`,
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
  const syntheticPuzzle: PuzzleState = {
    schema: 'puzzle/v2-strict',
    symbol: input.symbol,
    signalDate: todayStr,
    asOfDate: todayStr,
    asOfIndex: Math.max(0, input.closes.length - 1),
    currentPrice: input.currentPrice,
    timeframes: {
      Q: { bars: 0, haBull: input.isMonthlyUptrend, haLow: 0, prevHaLow: 0, midline: input.monthlyMidline, prevMidline: input.monthlyMidline, atr: 0, tfdr: input.monthlyTFDR, sampleOK: false, isLastBarComplete: false },
      M: { bars: 0, haBull: input.isMonthlyUptrend, haLow: 0, prevHaLow: 0, midline: input.monthlyMidline, prevMidline: input.monthlyMidline, atr: 0, tfdr: input.monthlyTFDR, sampleOK: false, isLastBarComplete: false },
      W: { bars: 0, haBull: input.isMonthlyUptrend, haLow: 0, prevHaLow: 0, midline: input.weeklyMidline, prevMidline: input.weeklyMidline, atr: 0, tfdr: input.weeklyTFDR, sampleOK: false, isLastBarComplete: false },
      D: { bars: input.closes.length, haBull: input.isMonthlyUptrend, haLow: 0, prevHaLow: 0, midline: input.weeklyMidline, prevMidline: input.weeklyMidline, atr: 0, tfdr: input.dailyTFDR, sampleOK: true, isLastBarComplete: true }
    },
    regime: input.isMonthlyUptrend && input.currentPrice >= input.monthlyMidline ? 'UPTREND_CHANNEL' : 'DOWNTREND_CHANNEL',
    signal: 'HOLD',
    signalStrength: 50,
    positionSizingHint: 0,
    levels: {
      buyZone: { low: input.band15, high: input.weeklyMidline },
      takeProfitZone: { low: input.band90, high: input.band90 },
      invalidationPrice: input.monthlyMidline
    },
    ker: calculateKaufmanER(input.closes, 14),
    shortLock8dActive: false,
    reasons: ['等待原生四維拼圖計算完成'],
    keyPoints: ['等待原生四維拼圖計算完成'],
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
