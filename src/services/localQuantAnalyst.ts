import { RawKline } from '../types/quant';
import { MultiTimeframeTFDR, TFDRPoint } from './tfdrIndicator';

export interface LocalAnalysisInput {
  symbol: string;
  currentPrice: number;
  closes: number[];          // 日線收盤價陣列
  weeklyMidline: number;     // 週線中間線(20週生命線)
  monthlyMidline: number;    // 月線中間線(12月生命線)
  isMonthlyUptrend: boolean; // 本月平均K是否穩站月線中線且未破上月低點
  dailyTFDR: number;
  weeklyTFDR: number;
  monthlyTFDR: number;
  band90: number;            // TFDR 90 逃頂參考價
  band15: number;            // TFDR 15 抄底參考價
}

export interface LocalExpertSummary {
  isMonthlyUptrend: boolean;
  ker: number;
  confidenceTag: string;
  regimeLabel: string;
  trendQuality: string;
  coreAction: string;
  fullReport: string;
}

/**
 * 開源量化核心 1：考夫曼趨勢效率比 (Kaufman Efficiency Ratio, KER)
 * 輸出 0~1：> 0.6 代表極強單邊大趨勢，< 0.3 代表無序震盪洗盤
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
 * 本地專家系統結構化結論生成器（供對話報告與右側決策中樞共用，確保 100% 一致）
 */
export function evaluateLocalExpertSummary(input: LocalAnalysisInput): LocalExpertSummary {
  const {
    symbol,
    currentPrice,
    closes,
    weeklyMidline,
    monthlyMidline,
    isMonthlyUptrend,
    dailyTFDR,
    weeklyTFDR,
    monthlyTFDR,
    band90,
    band15
  } = input;

  const ker = calculateKaufmanER(closes, 14);
  const safeWeeklyMid = weeklyMidline > 0 ? weeklyMidline : currentPrice || 1;
  const safeMonthlyMid = monthlyMidline > 0 ? monthlyMidline : currentPrice || 1;
  const safePrice = currentPrice > 0 ? currentPrice : 1;

  const distToWeeklyMidPct = (((currentPrice - safeWeeklyMid) / safeWeeklyMid) * 100).toFixed(1);
  const distToMonthlyMidPct = (((currentPrice - safeMonthlyMid) / safeMonthlyMid) * 100).toFixed(1);
  const upsideTo90Pct = (((band90 - currentPrice) / safePrice) * 100).toFixed(1);
  const downsideTo15Pct = (((currentPrice - band15) / safePrice) * 100).toFixed(1);

  // 1. 趨勢性質判定 (結合考夫曼效率比)
  const trendQuality =
    ker >= 0.6
      ? `單邊強勢主升/主跌浪 (考夫曼效率比 ${ker}，動能極純粹)`
      : ker <= 0.3
      ? `中樞箱體洗盤期 (考夫曼效率比 ${ker}，切忌追高殺低)`
      : `溫和波段推進期 (考夫曼效率比 ${ker})`;

  // 嚴格防呆：只要現價跌穿月線生命線，無論傳入參數為何，無條件強制判定為月線大跌通道
  const effectiveIsMonthlyUptrend =
    isMonthlyUptrend && currentPrice >= monthlyMidline;

  const isBelowWeeklyMid = currentPrice < weeklyMidline * 0.97;

  // 2. 動態實戰劇本推演
  let coreAction = '';
  let confidenceTag = '';

  if (effectiveIsMonthlyUptrend) {
    // 處於月線大升通道（已確保 currentPrice >= monthlyMidline）
    if (dailyTFDR <= 25 && !isBelowWeeklyMid && Math.abs(Number(distToWeeklyMidPct)) <= 5.0) {
      confidenceTag = '🔥【98% 頂級信心・踩週中線奇點補回】';
      coreAction = `絕佳複利補回點！價格精準回踩週線生命線($${weeklyMidline.toFixed(2)})獲得支撐，且日線TFDR已跌入下方奇點(${dailyTFDR})。建議把之前高位套現的資金連本帶利重倉補回(3-4份)，單筆硬止損設 -8%。`;
    } else if (dailyTFDR >= 84) {
      if (ker >= 0.55) {
        confidenceTag = `🟡【90% 主升浪鎖利30%・KER=${ker}死抱70%底倉】`;
        coreAction = `日線動能達高位奇點(${dailyTFDR})，但考夫曼效率比 KER=${ker} (>=0.55) 顯示正處於極強單邊主升浪！僅減倉 30% 鎖利，死抱 70% 核心底倉避免賣飛十倍股。`;
      } else {
        confidenceTag = `🟠【85% 複利高拋・KER=${ker}鎖利65%留35%底倉】`;
        coreAction = `日線動能已達高位奇點(${dailyTFDR})，且 KER=${ker} (<0.55) 屬震盪洗盤結構！建議高拋 65% 鎖定波段利潤，保留 35% 核心底倉，等回踩週線中線($${weeklyMidline.toFixed(2)})再全數補回。`;
      }
    } else if (isBelowWeeklyMid) {
      confidenceTag = '⚠️【守穩月中線但跌破週中線・暫停加倉防接飛刀】';
      coreAction = `現價已跌破週線生命線($${weeklyMidline.toFixed(2)})達 ${distToWeeklyMidPct}%（但仍守在月線生命線 $${monthlyMidline.toFixed(2)} 上方 +${distToMonthlyMidPct}%）。跌破週中線後嚴禁重倉補回，待重新站回週線中線之上再行低吸，嚴守 -8% 止損線。`;
    } else {
      confidenceTag = '🟢【80% 多頭持倉・大升通道運行中】';
      coreAction = `目前穩站月線生命線($${monthlyMidline.toFixed(2)})上方 +${distToMonthlyMidPct}%，大升通道健康（嚴禁開立空單）。上方距離 TFDR 90 逃頂線($${band90})仍有 ${Number(upsideTo90Pct) >= 0 ? '+' : ''}${upsideTo90Pct}% 空間（下方距 TFDR 15 地板約 ${downsideTo15Pct}%），安穩持倉讓利潤奔跑。`;
    }
  } else {
    // 已跌穿月線生命線（或月K破位），正式進入大跌通道
    const monthlyBreakWarning = `🚨 警告：現價已跌穿月線生命線($${monthlyMidline.toFixed(2)}) 達 ${distToMonthlyMidPct}%，正式進入大跌通道！`;
    if (dailyTFDR >= 80) {
      confidenceTag = '🟣【95% 滿格信心・月線大跌通道反彈沽空】';
      coreAction = `${monthlyBreakWarning} 且反彈觸及日線上方奇點(${dailyTFDR})，屬於大熊市誘多反彈！100% 禁止做多接飛刀，建議順勢重倉沽空（止損 -8%），目標下看 TFDR 15 地板線($${band15})。`;
    } else {
      confidenceTag = '🚨【月線破位禁買令・空頭主導】';
      coreAction = `${monthlyBreakWarning} 系統啟動絕對禁買令（100% 禁止買入做多）！若持有空單可繼續持有（-8% 風控止損），空倉者耐心等反彈至週線中線($${weeklyMidline.toFixed(2)})阻力或日線 TFDR>=80 再行沽空。`;
    }
  }

  const regimeLabel = effectiveIsMonthlyUptrend
    ? '月線大升通道 (只買不空)'
    : '月線大跌通道 (嚴禁做多・只空不買)';

  const fullReport = [
    `📊 【${symbol} 開源量化・零流量深度診斷】`,
    `${confidenceTag}`,
    `• 大局定性：${regimeLabel}｜${trendQuality}`,
    `• 空間座標：現價 $${currentPrice}｜距週中線 ${distToWeeklyMidPct}%｜距月中線 ${distToMonthlyMidPct}%`,
    `• 奇點能量：日TFDR ${dailyTFDR} / 週TFDR ${weeklyTFDR} / 月TFDR ${monthlyTFDR} (上方90頂: $${band90} / 下方15底: $${band15})`,
    `• 操盤指令：${coreAction}`
  ].join('\n');

  return {
    isMonthlyUptrend: effectiveIsMonthlyUptrend,
    ker,
    confidenceTag,
    regimeLabel,
    trendQuality,
    coreAction,
    fullReport
  };
}

/**
 * 零流量・本地資深量化操盤手報告生成器 (0 Token 消耗，0.01秒生成)
 */
export function generateLocalExpertReport(input: LocalAnalysisInput): string {
  return evaluateLocalExpertSummary(input).fullReport;
}

interface SimpleBar {
  open: number;
  high: number;
  low: number;
  close: number;
}

function aggregateBars(bars: SimpleBar[], step: number): SimpleBar[] {
  const out: SimpleBar[] = [];
  for (let i = 0; i < bars.length; i += step) {
    const chunk = bars.slice(i, i + step);
    if (chunk.length === 0) continue;
    let hi = -Infinity;
    let lo = Infinity;
    for (const b of chunk) {
      if (b.high > hi) hi = b.high;
      if (b.low < lo) lo = b.low;
    }
    out.push({
      open: chunk[0].open,
      high: hi,
      low: lo,
      close: chunk[chunk.length - 1].close
    });
  }
  return out;
}

function computeLastHeikinAshiMidline(bars: SimpleBar[], period: number): {
  midline: number;
  lastLow: number;
  prevLow: number;
} {
  if (bars.length === 0) return { midline: 0, lastLow: 0, prevLow: 0 };
  const haCloses: number[] = [];
  const haLows: number[] = [];
  let prevOpen = (bars[0].open + bars[0].close) / 2;
  let prevClose = (bars[0].open + bars[0].high + bars[0].low + bars[0].close) / 4;

  for (let i = 0; i < bars.length; i++) {
    const d = bars[i];
    const haClose = (d.open + d.high + d.low + d.close) / 4;
    const haOpen = i === 0 ? prevOpen : (prevOpen + prevClose) / 2;
    const haLow = Math.min(d.low, haOpen, haClose);
    haCloses.push(haClose);
    haLows.push(haLow);
    prevOpen = haOpen;
    prevClose = haClose;
  }

  const start = Math.max(0, haCloses.length - period);
  let sum = 0;
  for (let k = start; k < haCloses.length; k++) {
    sum += haCloses[k];
  }
  const lastLow = haLows[haLows.length - 1];
  const prevLow = haLows.length > 1 ? haLows[haLows.length - 2] : lastLow;

  return {
    midline: sum / (haCloses.length - start),
    lastLow,
    prevLow
  };
}

/**
 * 將現有專案的 dailyKlines、tfdr 與 latestTfdrPoint 安全組裝為 LocalAnalysisInput
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

  const dailyCloses = dailyKlines.map(bar => Number(bar.c));
  const calcSma = (arr: number[], period: number) => {
    const slice = arr.slice(-period);
    if (slice.length === 0) return currentPrice;
    return slice.reduce((sum, val) => sum + val, 0) / slice.length;
  };

  const weeklyMidline = calcSma(dailyCloses, 100) || currentPrice;
  const monthlyMidline = calcSma(dailyCloses, 250) || currentPrice;

  // 與回測大腦保持一致：現價 >= 250 日月線生命線即為月線大升通道
  const isMonthlyUptrend = currentPrice >= monthlyMidline;

  return {
    symbol,
    currentPrice,
    closes: dailyCloses,
    weeklyMidline,
    monthlyMidline,
    isMonthlyUptrend,
    dailyTFDR: tfdr.dailyScore,
    weeklyTFDR: tfdr.weeklyScore,
    monthlyTFDR: tfdr.monthlyScore,
    band90: latestTfdrPoint?.band90 ?? Number((currentPrice * 1.12).toFixed(2)),
    band15: latestTfdrPoint?.band15 ?? Number((currentPrice * 0.88).toFixed(2))
  };
}
