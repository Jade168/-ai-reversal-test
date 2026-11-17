import { RawKline } from '../types/quant';
import { KLineBar, convertToHeikinAshi } from './quantCalculations';
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
 * 零流量・本地資深量化操盤手報告生成器 (0 Token 消耗，0.01秒生成)
 */
export function generateLocalExpertReport(input: LocalAnalysisInput): string {
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
      coreAction = `絕佳複利補回點！價格精準回踩週線生命線($${weeklyMidline.toFixed(2)})獲得支撐，且日線TFDR已跌入下方奇點(${dailyTFDR})。建議把之前高位套現的資金連本帶利重倉補回(3-4份)，止損設於月線中線下方。`;
    } else if (dailyTFDR >= 84) {
      confidenceTag = '🟠【85% 複利高拋・鎖利65%留35%底倉】';
      coreAction = `日線動能已達高位奇點(${dailyTFDR})，但月線大升通道完好！建議高拋 65% 鎖定波段利潤，保留 35% 核心底倉，等回踩週線中線($${weeklyMidline.toFixed(2)})且守穩不破時再全數補回。`;
    } else if (isBelowWeeklyMid) {
      confidenceTag = '⚠️【守穩月中線但跌破週中線・暫停加倉防接飛刀】';
      coreAction = `現價已跌破週線生命線($${weeklyMidline.toFixed(2)})達 ${distToWeeklyMidPct}%（但仍守在月線生命線 $${monthlyMidline.toFixed(2)} 上方 +${distToMonthlyMidPct}%）。跌破週中線後嚴禁重倉補回，待重新站回週線中線之上再行低吸，若再跌穿月線中線則全面清倉。`;
    } else {
      confidenceTag = '🟢【80% 多頭持倉・大升通道運行中】';
      coreAction = `目前穩站月線生命線($${monthlyMidline.toFixed(2)})上方 +${distToMonthlyMidPct}%，大升通道健康。上方距離 TFDR 90 逃頂線($${band90})仍有 ${Number(upsideTo90Pct) >= 0 ? '+' : ''}${upsideTo90Pct}% 空間（下方距 TFDR 15 地板約 ${downsideTo15Pct}%），建議安穩持倉讓利潤奔跑。`;
    }
  } else {
    // 已跌穿月線生命線（或月K破位），正式進入大跌通道
    const monthlyBreakWarning = `🚨 警告：現價已跌穿月線生命線($${monthlyMidline.toFixed(2)}) 達 ${distToMonthlyMidPct}%，正式進入大跌通道！`;
    if (dailyTFDR >= 80) {
      confidenceTag = '🟣【95% 滿格信心・月線大跌通道反彈沽空】';
      coreAction = `${monthlyBreakWarning} 且反彈觸及日線上方奇點(${dailyTFDR})，屬於大熊市誘多反彈！嚴禁做多接飛刀，建議順勢重倉沽空，目標下看 TFDR 15 地板線($${band15})。`;
    } else {
      confidenceTag = '🚨【月線破位禁買令・空頭主導】';
      coreAction = `${monthlyBreakWarning} 系統啟動絕對禁買令！即使日線出現低位反彈也僅為死貓跳，若持有空單可繼續持有，空倉者耐心等反彈至週線中線($${weeklyMidline.toFixed(2)})阻力再行沽空（下方15地板距 ${downsideTo15Pct}%）。`;
    }
  }

  return [
    `📊 【${symbol} 開源量化・零流量深度診斷】`,
    `${confidenceTag}`,
    `• 大局定性：${effectiveIsMonthlyUptrend ? '月線大升通道 (只買不空)' : '月線大跌通道 (嚴禁做多・只空不買)'}｜${trendQuality}`,
    `• 空間座標：現價 $${currentPrice}｜距週中線 ${distToWeeklyMidPct}%｜距月中線 ${distToMonthlyMidPct}%`,
    `• 奇點能量：日TFDR ${dailyTFDR} / 週TFDR ${weeklyTFDR} / 月TFDR ${monthlyTFDR} (上方90頂: $${band90} / 下方15底: $${band15})`,
    `• 操盤指令：${coreAction}`
  ].join('\n');
}

function aggregateBars(dailyBars: KLineBar[], step: number): KLineBar[] {
  const out: KLineBar[] = [];
  for (let i = 0; i < dailyBars.length; i += step) {
    const chunk = dailyBars.slice(i, i + step);
    if (chunk.length === 0) continue;
    let hi = -Infinity;
    let lo = Infinity;
    for (const b of chunk) {
      if (b.high > hi) hi = b.high;
      if (b.low < lo) lo = b.low;
    }
    out.push({
      date: chunk[chunk.length - 1].date,
      open: chunk[0].open,
      high: hi,
      low: lo,
      close: chunk[chunk.length - 1].close
    });
  }
  return out;
}

function computeLastMidline(haArr: ReturnType<typeof convertToHeikinAshi>, period: number): number {
  if (haArr.length === 0) return 0;
  const start = Math.max(0, haArr.length - period);
  let sum = 0;
  for (let k = start; k < haArr.length; k++) {
    sum += haArr[k].close;
  }
  return sum / (haArr.length - start);
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

  const dailyBars: KLineBar[] = dailyKlines.map(bar => ({
    date: (bar.date || '').split(' ')[0],
    open: Number(bar.o),
    high: Number(bar.h),
    low: Number(bar.l),
    close: Number(bar.c)
  }));

  const weeklyBars = aggregateBars(dailyBars, 5);
  const monthlyBars = aggregateBars(dailyBars, 21);

  const haWeekly = convertToHeikinAshi(weeklyBars);
  const haMonthly = convertToHeikinAshi(monthlyBars);

  const weeklyMidline = computeLastMidline(haWeekly, 20) || currentPrice;
  const monthlyMidline = computeLastMidline(haMonthly, 12) || currentPrice;

  const currMonth = haMonthly[haMonthly.length - 1];
  const prevMonth = haMonthly.length > 1 ? haMonthly[haMonthly.length - 2] : currMonth;
  // 必須同時滿足「現價 >= 月線中間線」且「本月平均K未跌穿上月低點」才算月線大升通道；
  // 只要現價低於月線中間線，無條件判定 isMonthlyUptrend = false！
  const isMonthlyBarIntact =
    Boolean(currMonth && prevMonth) ? currMonth.low >= prevMonth.low * 0.98 : true;
  const isMonthlyUptrend = currentPrice >= monthlyMidline && isMonthlyBarIntact;

  return {
    symbol,
    currentPrice,
    closes: dailyBars.map(b => b.close),
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
