export interface OHLCBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface TimeframeFeature {
  bars: number;
  haBull: boolean;
  haLow: number;
  prevHaLow: number;
  midline: number;
  prevMidline: number;
  atr: number;
  tfdr: number;
  sampleOK: boolean;
  isLastBarComplete: boolean;
}

export interface PuzzleState {
  schema: 'puzzle/v2-strict';
  symbol: string;
  signalDate: string;
  asOfDate: string;
  asOfIndex: number;
  currentPrice: number;
  timeframes: {
    Q: TimeframeFeature;
    M: TimeframeFeature;
    W: TimeframeFeature;
    D: TimeframeFeature;
  };
  regime: 'UPTREND_CHANNEL' | 'DOWNTREND_CHANNEL' | 'CONSOLIDATION';
  signal:
    | 'GOLDEN_BUY'
    | 'ADD_POSITION'
    | 'PARTIAL_PROFIT'
    | 'FULL_CLEAR'
    | 'SHORT_ENTRY'
    | 'COVER_SHORT'
    | 'HOLD';
  signalStrength: number;
  positionSizingHint: number;
  levels: {
    buyZone: { low: number; high: number };
    takeProfitZone: { low: number; high: number };
    invalidationPrice: number;
  };
  ker: number;
  shortLock8dActive: boolean;
  reasons: string[];
  keyPoints: string[];
  riskFlags: string[];
  provenance: {
    computedBy: 'computePuzzleDecision';
    llmGeneratedNumbers: never[];
  };
}

const dateKeyCache = new Map<
  string,
  { y: number; m: number; d: number; dow: number; wKey: string; mKey: string; qKey: string }
>();

function getCalendarMeta(dateStr: string) {
  const key = dateStr.slice(0, 10);
  let meta = dateKeyCache.get(key);
  if (meta) return meta;
  const [y, m, d] = key.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const dow = utc.getUTCDay() || 7;
  const mon = new Date(utc);
  mon.setUTCDate(utc.getUTCDate() - dow + 1);
  meta = {
    y,
    m,
    d,
    dow: utc.getUTCDay(),
    wKey: mon.toISOString().slice(0, 10),
    mKey: `${y}-${String(m).padStart(2, '0')}`,
    qKey: `${y}-Q${Math.floor((m - 1) / 3) + 1}`
  };
  dateKeyCache.set(key, meta);
  return meta;
}

export function resampleByCalendarUTC(
  sortedDaily: OHLCBar[],
  unit: 'W' | 'M' | 'Q'
): (OHLCBar & { isComplete: boolean })[] {
  if (!sortedDaily.length) return [];
  const groups: { key: string; date: string; open: number; high: number; low: number; close: number }[] = [];
  const groupIndex = new Map<string, number>();

  for (let i = 0; i < sortedDaily.length; i++) {
    const bar = sortedDaily[i];
    const meta = getCalendarMeta(bar.date);
    const key = unit === 'M' ? meta.mKey : unit === 'Q' ? meta.qKey : meta.wKey;
    const existingIdx = groupIndex.get(key);
    if (existingIdx === undefined) {
      groupIndex.set(key, groups.length);
      groups.push({
        key,
        date: bar.date,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close
      });
    } else {
      const g = groups[existingIdx];
      g.date = bar.date;
      if (bar.high > g.high) g.high = bar.high;
      if (bar.low < g.low) g.low = bar.low;
      g.close = bar.close;
    }
  }

  groups.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const lastMeta = getCalendarMeta(sortedDaily[sortedDaily.length - 1].date);
  const next = new Date(Date.UTC(lastMeta.y, lastMeta.m - 1, lastMeta.d + 1));

  return groups.map((g, idx) => {
    let isComplete = true;
    if (idx === groups.length - 1) {
      if (unit === 'W') isComplete = lastMeta.dow === 5;
      else if (unit === 'M') isComplete = next.getUTCMonth() !== lastMeta.m - 1;
      else if (unit === 'Q')
        isComplete = Math.floor(next.getUTCMonth() / 3) !== Math.floor((lastMeta.m - 1) / 3);
    }
    return {
      date: g.date,
      open: g.open,
      high: g.high,
      low: g.low,
      close: g.close,
      isComplete
    };
  });
}

function computeNativeFeatures(
  bars: (OHLCBar & { isComplete?: boolean })[],
  midPeriod: number,
  minSample: number
): TimeframeFeature & { band90: number; band15: number; haCloses?: number[] } {
  const n = bars.length;
  if (!n) {
    return {
      bars: 0,
      haBull: false,
      haLow: 0,
      prevHaLow: 0,
      midline: 0,
      prevMidline: 0,
      atr: 0,
      tfdr: 50,
      sampleOK: false,
      isLastBarComplete: false,
      band90: 0,
      band15: 0
    };
  }
  const ha: { open: number; high: number; low: number; close: number; isBull: boolean }[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const close = (b.open + b.high + b.low + b.close) / 4;
    const open = i === 0 ? (b.open + b.close) / 2 : (ha[i - 1].open + ha[i - 1].close) / 2;
    const hi = b.high > open ? (b.high > close ? b.high : close) : (open > close ? open : close);
    const lo = b.low < open ? (b.low < close ? b.low : close) : (open < close ? open : close);
    ha[i] = {
      open,
      high: hi,
      low: lo,
      close,
      isBull: close > open
    };
  }
  const isComplete = bars[n - 1].isComplete !== false;
  const compLen = !isComplete && n > 1 ? n - 1 : n;

  const midStart = Math.max(0, compLen - midPeriod);
  let midSum = 0;
  for (let i = midStart; i < compLen; i++) midSum += ha[i].close;
  const midline = midSum / Math.max(1, compLen - midStart);

  // 前一根已收盤週期的動態中線（用於斜率鎖判斷）
  const prevCompLen = Math.max(1, compLen - 1);
  const prevMidStart = Math.max(0, prevCompLen - midPeriod);
  let prevMidSum = 0;
  for (let i = prevMidStart; i < prevCompLen; i++) prevMidSum += ha[i].close;
  const prevMidline = prevMidSum / Math.max(1, prevCompLen - prevMidStart);

  const atrP = Math.min(14, compLen);
  let atrSum = 0;
  for (let i = compLen - atrP; i < compLen; i++) {
    atrSum +=
      i <= 0
        ? bars[0].high - bars[0].low
        : Math.max(
            bars[i].high - bars[i].low,
            Math.abs(bars[i].high - bars[i - 1].close),
            Math.abs(bars[i].low - bars[i - 1].close)
          );
  }
  const atr = Math.max(0.0001, atrSum / Math.max(1, atrP));

  const recStart = Math.max(0, compLen - 14);
  const currC = bars[compLen - 1].close;
  const currL = bars[compLen - 1].low;
  let maxC = -Infinity;
  let minC = Infinity;
  for (let i = recStart; i < compLen; i++) {
    const c = bars[i].close;
    if (c > maxC) maxC = c;
    if (c < minC) minC = c;
  }
  const band90 = Number((midline + atr * 3.1).toFixed(2));
  const band15 = Number((midline - atr * 3.1).toFixed(2));

  let tfdr = 50 + ((currC - midline) / (atr * 2.2)) * 22;
  if (currC >= maxC) tfdr = Math.max(tfdr, 86);
  if (currC <= minC || currL <= band15) tfdr = Math.min(tfdr, 14);
  tfdr = Math.max(0, Math.min(100, Math.round(tfdr)));

  return {
    bars: n,
    haBull: ha[n - 1].isBull,
    haLow: ha[n - 1].low,
    prevHaLow: n > 1 ? ha[n - 2].low : ha[n - 1].low,
    midline: Number(midline.toFixed(2)),
    prevMidline: Number(prevMidline.toFixed(2)),
    atr: Number(atr.toFixed(2)),
    tfdr,
    sampleOK: compLen >= minSample,
    isLastBarComplete: isComplete,
    band90,
    band15,
    haCloses: ha.map(h => h.close)
  };
}

/**
 * 8日同向保護鎖：檢查過去 8 個交易日內是否出現過低位奇點（dScore <= 25 或觸及 band15）
 */
function hasRecentBottomSingularity8d(dailyBars: OHLCBar[], haCloses: number[]): boolean {
  const n = dailyBars.length;
  if (n < 2) return false;
  const startDay = Math.max(0, n - 8);
  for (let idx = startDay; idx < n; idx++) {
    const end = idx + 1;
    const midStart = Math.max(0, end - 20);
    let midSum = 0;
    for (let k = midStart; k < end; k++) midSum += haCloses[k];
    const mid = midSum / Math.max(1, end - midStart);

    const atrP = Math.min(14, end);
    let atrSum = 0;
    for (let k = end - atrP; k < end; k++) {
      atrSum +=
        k <= 0
          ? dailyBars[0].high - dailyBars[0].low
          : Math.max(
              dailyBars[k].high - dailyBars[k].low,
              Math.abs(dailyBars[k].high - dailyBars[k - 1].close),
              Math.abs(dailyBars[k].low - dailyBars[k - 1].close)
            );
    }
    const atr = Math.max(0.0001, atrSum / Math.max(1, atrP));
    const band15 = mid - atr * 3.1;

    const recStart = Math.max(0, end - 14);
    let minC = Infinity;
    for (let k = recStart; k < end; k++) {
      if (dailyBars[k].close < minC) minC = dailyBars[k].close;
    }

    const bar = dailyBars[idx];
    let dScore = 50 + ((bar.close - mid) / (atr * 2.2)) * 22;
    if (bar.close <= minC || bar.low <= band15) dScore = Math.min(dScore, 14);
    dScore = Math.max(0, Math.min(100, Math.round(dScore)));

    if (dScore <= 25 || bar.low <= band15) {
      return true;
    }
  }
  return false;
}

export function computePuzzleDecision(
  symbol: string,
  allDailyBars: OHLCBar[],
  asOfIndex: number
): PuzzleState {
  if (!allDailyBars?.length) throw new Error('Empty daily bars');
  let isAlreadySorted = true;
  for (let i = 1; i < allDailyBars.length; i++) {
    if (allDailyBars[i - 1].date > allDailyBars[i].date) {
      isAlreadySorted = false;
      break;
    }
  }
  const sorted = isAlreadySorted
    ? allDailyBars
    : [...allDailyBars].sort((a, b) => a.date.localeCompare(b.date));

  // 嚴格截斷至 asOfIndex 防止任何未來函數洩漏
  const safeIdx = Math.max(0, Math.min(sorted.length - 1, asOfIndex));
  const frozen = sorted.slice(0, safeIdx + 1);
  const currBar = frozen[frozen.length - 1];
  const price = currBar.close;

  const featDRaw = computeNativeFeatures(frozen, 20, 20);
  const featW = computeNativeFeatures(resampleByCalendarUTC(frozen, 'W'), 20, 20);
  const featM = computeNativeFeatures(resampleByCalendarUTC(frozen, 'M'), 12, 12);
  const featQ = computeNativeFeatures(resampleByCalendarUTC(frozen, 'Q'), 8, 30);

  const { haCloses: dailyHaCloses = [], ...featD } = featDRaw;

  const kerSlice = frozen.slice(-15);
  const netChg = Math.abs(kerSlice[kerSlice.length - 1].close - kerSlice[0].close);
  let sumVol = 0;
  for (let i = 1; i < kerSlice.length; i++) {
    sumVol += Math.abs(kerSlice[i].close - kerSlice[i - 1].close);
  }
  const ker = sumVol === 0 ? 0 : Number((netChg / sumVol).toFixed(2));

  // 1. 月線斜率鎖牛熊：只有當 price < featM.midline * 0.95 && featM.midline < prevMMid 才判定為 DOWNTREND_CHANNEL；否則一律鎖定 UPTREND_CHANNEL
  const prevMMid = featM.prevMidline;
  const isDown = price < featM.midline * 0.95 && featM.midline < prevMMid;
  const isUp = !isDown;

  // 2. 8日同向保護鎖：近 8 個交易日內曾出現低位奇點 (dScore <= 25 或觸及 band15) 則嚴禁 SHORT_ENTRY
  const shortLock8dActive = hasRecentBottomSingularity8d(frozen, dailyHaCloses);

  const tol = Math.max(price * 0.005, featD.atr * 0.8);
  const invalidationPrice = Number((featM.midline * 0.95).toFixed(2));
  const buyAnchor = isUp ? Math.max(featW.midline, featD.band15) : featD.band15;

  const buyZone = {
    low: Number((buyAnchor - tol).toFixed(2)),
    high: Number((buyAnchor + tol).toFixed(2))
  };
  const takeProfitZone = {
    low: Number((featD.band90 - tol).toFixed(2)),
    high: Number((featD.band90 + tol).toFixed(2))
  };

  let signal: PuzzleState['signal'] = 'HOLD';
  let signalStrength = 50;
  let positionSizingHint = 0;
  const reasons: string[] = [];
  const riskFlags: string[] = [];

  if (!featQ.sampleOK) riskFlags.push(`季線僅 ${featQ.bars} 根(<30)，降級參考`);
  if (!featW.sampleOK) riskFlags.push(`週線不足 20 週，降低權重`);
  if (ker < 0.3) riskFlags.push(`KER(${ker})偏低，處於震盪雜訊期`);
  if (shortLock8dActive) riskFlags.push('8日保護鎖啟動（近8日曾見低位奇點，禁止反手沽空）');

  if (isUp) {
    const slopeText =
      featM.midline >= prevMMid
        ? `月中線($${featM.midline})穩步上揚`
        : `價格守住月線95%鎖線($${invalidationPrice})`;
    reasons.push(`${slopeText}，鎖定大升通道（100% 禁空）`);

    if (featD.tfdr <= 22 && Math.abs(price - featW.midline) <= featW.atr * 1.2 && featW.sampleOK) {
      signal = 'GOLDEN_BUY';
      signalStrength = 92;
      positionSizingHint = 0.85;
      reasons.push(`回踩週中線($${featW.midline}) + 日線下方奇點(${featD.tfdr})交匯`);
    } else if (featD.tfdr <= 20) {
      signal = 'ADD_POSITION';
      signalStrength = 78;
      positionSizingHint = 0.4;
      reasons.push(`大升通道內觸及日線下方奇點(${featD.tfdr})，分批低吸`);
    } else if (featD.tfdr >= 85) {
      signal = 'PARTIAL_PROFIT';
      signalStrength = 82;
      positionSizingHint = ker >= 0.55 ? 0.3 : 0.65;
      reasons.push(`日線高位奇點(${featD.tfdr})，按 KER(${ker}) 高拋鎖利並留底倉`);
    }
  } else {
    reasons.push(
      `跌破月線95%保護位($${invalidationPrice})且月中線下彎($${prevMMid}➔$${featM.midline})，確認大跌通道`
    );
    if (featD.tfdr >= 82 && !shortLock8dActive) {
      signal = 'SHORT_ENTRY';
      signalStrength = 88;
      positionSizingHint = 0.7;
      reasons.push(`大跌通道反彈觸及上方奇點(${featD.tfdr})，通過8日鎖順勢沽空`);
    } else if (featD.tfdr >= 82 && shortLock8dActive) {
      signal = 'HOLD';
      signalStrength = 55;
      positionSizingHint = 0;
      reasons.push(`雖見上方奇點(${featD.tfdr})，但受8日同向保護鎖攔截禁空`);
    } else if (featD.tfdr <= 20) {
      signal = 'COVER_SHORT';
      signalStrength = 85;
      positionSizingHint = 1.0;
      reasons.push(`跌至日線下方奇點(${featD.tfdr})，全數平空鎖利`);
    }
  }

  // 4 條精華 keyPoints（供左側最新單卡與 T+1 開盤驗證展示）
  const keyPoints: string[] = [
    isUp
      ? `月線斜率鎖：大升通道確立（現價 $${price} / 失效線 $${invalidationPrice}，100% 禁空）`
      : `月線斜率鎖：大跌通道確認（月中線 $${prevMMid} ↘ $${featM.midline}，失效線 $${invalidationPrice}）`,
    `四維結構：季TFDR ${featQ.tfdr}｜月TFDR ${featM.tfdr}｜週TFDR ${featW.tfdr}｜日TFDR ${featD.tfdr}（KER ${ker}）`,
    `關鍵區間：買入埋伏 $${buyZone.low}–$${buyZone.high}｜高拋目標 $${takeProfitZone.low}–$${takeProfitZone.high}`,
    `T+1 開盤驗證：買入須守穩 $${invalidationPrice} 上且不高於 $${(buyZone.high * 1.03).toFixed(2)}；沽空須低於 $${(takeProfitZone.high * 1.02).toFixed(2)}${shortLock8dActive ? '（8日鎖禁空中）' : ''}`
  ];

  const cleanFeature = (f: TimeframeFeature & { band90?: number; band15?: number; haCloses?: number[] }): TimeframeFeature => ({
    bars: f.bars,
    haBull: f.haBull,
    haLow: f.haLow,
    prevHaLow: f.prevHaLow,
    midline: f.midline,
    prevMidline: f.prevMidline,
    atr: f.atr,
    tfdr: f.tfdr,
    sampleOK: f.sampleOK,
    isLastBarComplete: f.isLastBarComplete
  });

  return {
    schema: 'puzzle/v2-strict',
    symbol,
    signalDate: currBar.date,
    asOfDate: currBar.date,
    asOfIndex: safeIdx,
    currentPrice: price,
    timeframes: {
      Q: cleanFeature(featQ),
      M: cleanFeature(featM),
      W: cleanFeature(featW),
      D: cleanFeature(featD)
    },
    regime: isUp ? 'UPTREND_CHANNEL' : 'DOWNTREND_CHANNEL',
    signal,
    signalStrength,
    positionSizingHint,
    levels: {
      buyZone,
      takeProfitZone,
      invalidationPrice
    },
    ker,
    shortLock8dActive,
    reasons,
    keyPoints,
    riskFlags,
    provenance: { computedBy: 'computePuzzleDecision', llmGeneratedNumbers: [] }
  };
}
