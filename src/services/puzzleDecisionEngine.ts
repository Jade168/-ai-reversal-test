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
  rsi: number;
  mom: number;
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

// 輔助函數：計算標準 RSI(14) 動能指標 (0 - 100，50 為多空強弱中軸)
export function calcRSI(closes: number[], period: number = 14): number {
  if (closes.length <= period) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / period / (losses / period);
  return Number((100 - 100 / (1 + rs)).toFixed(1));
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
): TimeframeFeature & { band90: number; band15: number } {
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
      rsi: 50,
      mom: 50,
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

  // 僅取最近 15 根已收盤收盤價計算 RSI(14)，與全量傳入等價但零多餘配置
  const rsiStart = Math.max(0, compLen - 15);
  const recentCloses: number[] = [];
  for (let i = rsiStart; i < compLen; i++) recentCloses.push(bars[i].close);
  const rsi = calcRSI(recentCloses, 14);

  // 綜合動能分數 = (標準 RSI(14) + TFDR) / 2，50 為多空強弱中軸
  const mom = Number(((rsi + tfdr) / 2).toFixed(1));

  return {
    bars: n,
    haBull: ha[n - 1].isBull,
    haLow: ha[n - 1].low,
    prevHaLow: n > 1 ? ha[n - 2].low : ha[n - 1].low,
    midline: Number(midline.toFixed(2)),
    prevMidline: Number(prevMidline.toFixed(2)),
    atr: Number(atr.toFixed(2)),
    tfdr,
    rsi,
    mom,
    sampleOK: compLen >= minSample,
    isLastBarComplete: isComplete,
    band90,
    band15
  };
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

  // 嚴格截斷至 asOfIndex（防未來函數）
  const safeIdx = Math.max(0, Math.min(sorted.length - 1, asOfIndex));
  const frozen = sorted.slice(0, safeIdx + 1);
  const currBar = frozen[frozen.length - 1];
  const price = currBar.close;

  const featD = computeNativeFeatures(frozen, 20, 20);
  const featW = computeNativeFeatures(resampleByCalendarUTC(frozen, 'W'), 20, 20);
  const featM = computeNativeFeatures(resampleByCalendarUTC(frozen, 'M'), 12, 12);
  const featQ = computeNativeFeatures(resampleByCalendarUTC(frozen, 'Q'), 8, 30);

  const dMom = featD.mom;
  const wMom = featW.mom;
  const mMom = featM.mom;

  const kerSlice = frozen.slice(-15);
  const netChg = Math.abs(kerSlice[kerSlice.length - 1].close - kerSlice[0].close);
  let sumVol = 0;
  for (let i = 1; i < kerSlice.length; i++) {
    sumVol += Math.abs(kerSlice[i].close - kerSlice[i - 1].close);
  }
  const ker = sumVol === 0 ? 0 : Number((netChg / sumVol).toFixed(2));

  // 動能中軸定性
  const isBullHeart = mMom >= 50 && wMom >= 50; // 月線與週線雙站 50 中軸之上（大升浪心臟強勁）
  const isBearBreak = mMom < 48 && wMom < 48; // 週月雙破 48 中軸（牛市終結、大跌浪確立）
  const regime: PuzzleState['regime'] = isBullHeart
    ? 'UPTREND_CHANNEL'
    : isBearBreak
    ? 'DOWNTREND_CHANNEL'
    : 'CONSOLIDATION';

  // 動能文字標籤（讓圖表、專家與交易員 100% 同步）
  const mTag = mMom >= 50 ? '(>50)' : mMom < 42 ? '(<42深熊)' : mMom < 48 ? '(<48破軸)' : '(48-50過渡)';
  const wTag =
    wMom >= 78
      ? '(>=78過熱)'
      : wMom >= 50
      ? '(未穿50)'
      : wMom < 42
      ? '(<42深熊)'
      : wMom < 48
      ? '(<48破軸)'
      : '(48-50過渡)';
  const dTag =
    dMom <= 24 ? '(下方奇點)' : dMom >= 84 ? '(上方奇點沽)' : dMom >= 78 ? '(反彈高位)' : '(中性)';
  const momSummary = `月動能 ${mMom}${mTag} / 週動能 ${wMom}${wTag} / 日動能 ${dMom}${dTag}`;

  const tol = Math.max(price * 0.005, featD.atr * 0.8);
  const invalidationPrice = isBearBreak
    ? Number(featW.midline.toFixed(2))
    : Number(Math.min(featM.midline * 0.9, featD.band15 * 0.94).toFixed(2));

  // 買入區設在現價附近（健康低吸絕不追高）
  const buyAnchor = isBullHeart
    ? dMom <= 24
      ? price
      : Math.min(price, Math.max(featW.midline, featD.band15))
    : featD.band15;

  const buyZone = {
    low: Number((buyAnchor - tol * 0.7).toFixed(2)),
    high: Number((buyAnchor + tol * 0.5).toFixed(2))
  };
  const takeProfitAnchor = dMom >= 85 || dMom >= 78 ? Math.max(price, featD.band90) : featD.band90;
  const takeProfitZone = {
    low: Number((takeProfitAnchor - tol * 0.6).toFixed(2)),
    high: Number((takeProfitAnchor + tol * 0.6).toFixed(2))
  };

  let signal: PuzzleState['signal'] = 'HOLD';
  let signalStrength = 50;
  let positionSizingHint = 0;
  const reasons: string[] = [momSummary];
  const riskFlags: string[] = [];

  if (!featQ.sampleOK) riskFlags.push(`季線僅 ${featQ.bars} 根(<30)，降級參考`);
  if (!featW.sampleOK) riskFlags.push(`週線不足 20 週，降低權重`);
  if (ker < 0.3) riskFlags.push(`KER(${ker})偏低，處於震盪雜訊期`);

  if (isBullHeart) {
    // 鐵律一：大升浪黃金低吸 (mMom >= 50 && wMom >= 50 && dMom <= 24)
    if (dMom <= 24) {
      const isDeepGolden = dMom <= 20;
      signal = isDeepGolden ? 'GOLDEN_BUY' : 'ADD_POSITION';
      signalStrength = isDeepGolden ? 92 : 82;
      positionSizingHint = isDeepGolden ? 0.85 : 0.5;
      reasons.push(
        `週月站穩50中軸＋日動能跌至 ${dMom}(<=24奇點買區)，主升浪健康洗盤結束・現價附近低吸`
      );
    }
    // 鐵律二：(b)/(c) 主升浪高位奇點分級鎖利（不賣飛底倉）
    else if (dMom >= 85 && wMom >= 78) {
      signal = 'PARTIAL_PROFIT';
      signalStrength = 88;
      positionSizingHint = 0.6;
      reasons.push(
        `日動能 ${dMom}(>=85) 與 週動能 ${wMom}(>=78) 雙雙過熱，減持60%鎖定大波段利潤`
      );
    } else if (dMom >= 85 && wMom < 78) {
      signal = 'PARTIAL_PROFIT';
      signalStrength = 74;
      positionSizingHint = 0.2;
      reasons.push(
        `日動能 ${dMom}(>=85) 但 週動能 ${wMom}(<78未過熱)，僅減倉20%鎖利、死抱80%核心底倉`
      );
    } else {
      reasons.push(`週月站穩50中軸＋無固定止損割肉，安穩持有主升浪核心底倉`);
    }
  } else if (isBearBreak) {
    // 1. 嚴格沽空鐵律：必須「圖表日線真正出現奇點沽 (dMom >= 84)」且「月線生命線失守 (price < featM.midline)」且「月動能 < 42 且 週動能 < 42」且未站回週中線之上才允許開空！
    const canShort =
      dMom >= 84 &&
      price < featM.midline &&
      price < featW.midline &&
      mMom < 42 &&
      wMom < 42;
    // 2. 平空鎖利與風控：只要日線動能回落至 <= 28（見好就收），或週線動能重返 >= 48 / 價格站回週中線之上，立刻全數平空！
    if (dMom <= 28 || wMom >= 48 || price >= featW.midline) {
      signal = 'COVER_SHORT';
      signalStrength = 85;
      positionSizingHint = 1.0;
      const coverReason =
        dMom <= 28
          ? `大跌浪日動能回落至 ${dMom}(<=28下方奇點)`
          : price >= featW.midline
          ? `價格($${price})站回週中線($${featW.midline})之上`
          : `週動能重返 ${wMom}(>=48)`;
      reasons.push(`${coverReason}，觸發全數平空鎖利／及時止損`);
    } else if (canShort) {
      signal = 'SHORT_ENTRY';
      signalStrength = 85;
      positionSizingHint = 0.3; // 空單嚴格限制 30% 輕倉，防軋空
      reasons.push(`四圖共振走熊 + 日線觸及上方奇點沽(${dMom})，順勢輕倉沽空`);
    } else {
      signal = 'FULL_CLEAR';
      signalStrength = 90;
      positionSizingHint = 1.0;
      reasons.push(
        `週月雙破48中軸大跌浪確立，多單全數清倉離場並絕對禁買（未現dMom>=84奇點沽前嚴禁開空）`
      );
    }
  } else {
    // 過渡緩衝區（例如月線仍 >=50，週線處於 45-50 防守帶）
    const holdFloorMsg =
      wMom >= 45
        ? `週動能 ${wMom}(未跌穿45防守中軸)，拒絕割肉、維持持倉觀察`
        : `週動能 ${wMom}(<45偏弱)，暫停加倉等待週月共振確認`;
    reasons.push(holdFloorMsg);
  }

  const keyPoints: string[] = [
    `動能中軸：${momSummary}`,
    isBullHeart
      ? `大升浪保護：週月站穩50中軸（不設-8%固定止損，死抱80%核心底倉）`
      : isBearBreak
      ? `大跌浪警報：週月雙破48中軸（全清多單・禁買；須月/週<42且破月中線且日動能>=84始30%輕倉沽空，日<=28或站回週中線平空）`
      : `中軸過渡區：月${mMom} / 週${wMom}（守45週中軸不割肉，暫不開新倉）`,
    `關鍵區間：買入埋伏 $${buyZone.low}–$${buyZone.high}｜高拋目標 $${takeProfitZone.low}–$${takeProfitZone.high}`,
    `T+1 開盤驗證：單筆須 >= 5% 初始本金（過濾碎股）；買入須 <= $${(buyZone.high * 1.03).toFixed(2)} 不追高`
  ];

  const stripInternal = (
    f: TimeframeFeature & { band90?: number; band15?: number }
  ): TimeframeFeature => ({
    bars: f.bars,
    haBull: f.haBull,
    haLow: f.haLow,
    prevHaLow: f.prevHaLow,
    midline: f.midline,
    prevMidline: f.prevMidline,
    atr: f.atr,
    tfdr: f.tfdr,
    rsi: f.rsi,
    mom: f.mom,
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
      Q: stripInternal(featQ),
      M: stripInternal(featM),
      W: stripInternal(featW),
      D: stripInternal(featD)
    },
    regime,
    signal,
    signalStrength,
    positionSizingHint,
    levels: {
      buyZone,
      takeProfitZone,
      invalidationPrice
    },
    ker,
    shortLock8dActive: false,
    reasons,
    keyPoints,
    riskFlags,
    provenance: { computedBy: 'computePuzzleDecision', llmGeneratedNumbers: [] }
  };
}
