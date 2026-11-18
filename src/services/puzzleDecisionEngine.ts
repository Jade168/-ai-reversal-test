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
  high: number;
  low: number;
  mid50: number;
  atr: number;
  tfdr: number;
  prevTfdr?: number;
  rsi: number;
  mom: number;
  sampleOK: boolean;
  isLastBarComplete: boolean;
}

export interface OverlayPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  haOpen: number;
  haClose: number;
  dTfdr: number;
  dTfdrLow3?: number;
  dTfdrLow5?: number;
  ha5High?: number;
  prevWTfdr?: number | null;
  // 已完結週期階梯生命線（未完結為 null）
  qMid: number | null;
  mMid: number | null;
  wMid: number | null;
  // 季 / 月 / 週 50% 平衡切線與真實高低箱體（嚴格截斷至當日，絕無未來函數）
  qMid50: number | null;
  mMid50: number | null;
  wMid50: number | null;
  qHigh: number | null;
  qLow: number | null;
  mHigh: number | null;
  mLow: number | null;
  wHigh: number | null;
  wLow: number | null;
  qTfdr: number | null;
  mTfdr: number | null;
  wTfdr: number | null;
  qPeriodEnd: string | null;
  mPeriodEnd: string | null;
  wPeriodEnd: string | null;
}

export interface PuzzleVerdict {
  isPuzzleCross: boolean;
  signal:
    | 'GOLDEN_BUY'
    | 'ADD_POSITION'
    | 'PARTIAL_PROFIT'
    | 'FULL_CLEAR'
    | 'HALT_REDUCE'
    | 'SHORT_ENTRY'
    | 'COVER_SHORT'
    | 'HOLD';
  reasons: {
    touchW: boolean;
    regimeOK: boolean;
    tfdrTurnUp: boolean;
    haTwoUp: boolean;
    ha5Stand?: boolean;
    wTfdrUp?: boolean;
    bullShieldActive?: boolean;
    belowBoth50?: boolean;
    aboveQ50?: boolean;
    aboveM50?: boolean;
    aboveW50?: boolean;
  };
  regime: 'BULL' | 'NEUTRAL' | 'BEAR';
  sizeRatio: number; // 0 / 0.3 / 0.4 / 0.6 / 1.0
  invalidationPrice: number | null;
  compactHint: string;
}

export interface TimeSpacePrompt {
  triggerDate: string;
  currentPrice: number;
  qMid50: number;
  mMid50: number;
  wMid50: number;
  qHigh: number;
  qLow: number;
  mHigh: number;
  mLow: number;
  wHigh: number;
  wLow: number;
  dTfdr: number;
  singularityStatus: 'UPPER_EXPANSION' | 'LOWER_EXPANSION' | 'SAFE_MID_ZONE';
  singularityLabel: string;
  regimeLabel: string;
  actionTitle: string;
  buyZone: { low: number; high: number };
  takeProfitZone: { low: number; high: number };
  invalidationPrice: number;
  compactHint: string;
}

export interface PuzzleState {
  schema: 'puzzle/v2-strict';
  symbol: string;
  signalDate: string;
  asOfDate: string;
  asOfIndex: number;
  currentPrice: number;
  isPuzzleCross: boolean;
  verdict?: PuzzleVerdict;
  timeSpacePrompt: TimeSpacePrompt;
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
    | 'HALT_REDUCE'
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

export interface NestedPeriodBox {
  key: string;
  startIdx: number;
  endIdx: number;
  open: number;
  high: number;
  low: number;
  close: number;
  mid50: number;
  isBull: boolean;
  isAltColor: boolean;
}

export interface NestedDailyCandle {
  date: string;
  idx: number;
  open: number;
  high: number;
  low: number;
  close: number;
  haOpen: number;
  haClose: number;
  isHaBull: boolean;
  isGoldenStar: boolean;
  signal: PuzzleVerdict['signal'];
  dTfdr: number;
  qMid50: number | null;
  mMid50: number | null;
  wMid50: number | null;
}

export interface NestedPuzzlePiPData {
  qBoxes: NestedPeriodBox[];
  mCandles: NestedPeriodBox[];
  wCandles: NestedPeriodBox[];
  dCandles: NestedDailyCandle[];
  minPrice: number;
  maxPrice: number;
  starCount: number;
}

interface CalendarMeta {
  y: number;
  m: number;
  d: number;
  dow: number;
  wKey: string;
  mKey: string;
  qKey: string;
  isWeekEnd: boolean;
  isMonthEnd: boolean;
  isQuarterEnd: boolean;
}

const dateKeyCache = new Map<string, CalendarMeta>();

function getCalendarMeta(dateStr: string): CalendarMeta {
  const key = (dateStr || '').slice(0, 10);
  let meta = dateKeyCache.get(key);
  if (meta) return meta;
  const parts = key.split('-').map(Number);
  const y = Number.isFinite(parts[0]) && parts[0] > 1900 ? parts[0] : 1970;
  const m = Number.isFinite(parts[1]) && parts[1] >= 1 && parts[1] <= 12 ? parts[1] : 1;
  const d = Number.isFinite(parts[2]) && parts[2] >= 1 && parts[2] <= 31 ? parts[2] : 1;
  const utc = new Date(Date.UTC(y, m - 1, d));
  const safeUtc = Number.isNaN(utc.getTime()) ? new Date(Date.UTC(1970, 0, 1)) : utc;
  const dow = safeUtc.getUTCDay() || 7;
  const mon = new Date(safeUtc);
  mon.setUTCDate(safeUtc.getUTCDate() - dow + 1);
  const next = new Date(Date.UTC(safeUtc.getUTCFullYear(), safeUtc.getUTCMonth(), safeUtc.getUTCDate() + 1));

  meta = {
    y: safeUtc.getUTCFullYear(),
    m: safeUtc.getUTCMonth() + 1,
    d: safeUtc.getUTCDate(),
    dow: safeUtc.getUTCDay(),
    wKey: mon.toISOString().slice(0, 10),
    mKey: `${safeUtc.getUTCFullYear()}-${String(safeUtc.getUTCMonth() + 1).padStart(2, '0')}`,
    qKey: `${safeUtc.getUTCFullYear()}-Q${Math.floor(safeUtc.getUTCMonth() / 3) + 1}`,
    isWeekEnd: safeUtc.getUTCDay() === 5,
    isMonthEnd: next.getUTCMonth() !== safeUtc.getUTCMonth(),
    isQuarterEnd: Math.floor(next.getUTCMonth() / 3) !== Math.floor(safeUtc.getUTCMonth() / 3)
  };
  dateKeyCache.set(key, meta);
  return meta;
}

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
): (OHLCBar & { isComplete: boolean; periodKey: string })[] {
  if (!sortedDaily.length) return [];
  const groups: {
    key: string;
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
  }[] = [];
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

  return groups.map((g, idx) => {
    let isComplete = true;
    if (idx === groups.length - 1) {
      if (unit === 'W') isComplete = lastMeta.isWeekEnd;
      else if (unit === 'M') isComplete = lastMeta.isMonthEnd;
      else if (unit === 'Q') isComplete = lastMeta.isQuarterEnd;
    }
    return {
      date: g.date,
      open: g.open,
      high: g.high,
      low: g.low,
      close: g.close,
      isComplete,
      periodKey: g.key
    };
  });
}

interface IncrementalPeriodState {
  bars: (OHLCBar & { key: string })[];
  ha: { open: number; close: number; low: number; isBull: boolean }[];
  midPeriod: number;
  minCompleteBars: number;
  minSampleOK: number;
  minActiveBarsForMid50: number;
  active: (OHLCBar & { key: string }) | null;
  activeDayCount: number;
  sealedLastKey: string | null;
  snapshot: {
    count: number;
    midline: number | null;
    prevMidline: number | null;
    lastHigh: number | null;
    lastLow: number | null;
    lastMid50: number | null;
    atr: number;
    tfdr: number | null;
    prevTfdr: number | null;
    rsi: number;
    mom: number;
    haBull: boolean;
    haLow: number;
    prevHaLow: number;
    periodEnd: string | null;
    sampleOK: boolean;
    band90: number;
    band15: number;
  };
}

function createPeriodState(
  midPeriod: number,
  minCompleteBars: number,
  minSampleOK: number,
  minActiveBarsForMid50: number
): IncrementalPeriodState {
  return {
    bars: [],
    ha: [],
    midPeriod,
    minCompleteBars,
    minSampleOK,
    minActiveBarsForMid50,
    active: null,
    activeDayCount: 0,
    sealedLastKey: null,
    snapshot: {
      count: 0,
      midline: null,
      prevMidline: null,
      lastHigh: null,
      lastLow: null,
      lastMid50: null,
      atr: 0,
      tfdr: null,
      prevTfdr: null,
      rsi: 50,
      mom: 50,
      haBull: false,
      haLow: 0,
      prevHaLow: 0,
      periodEnd: null,
      sampleOK: false,
      band90: 0,
      band15: 0
    }
  };
}

function sealPeriodBar(state: IncrementalPeriodState, bar: OHLCBar & { key: string }) {
  const n = state.bars.length;
  state.bars.push(bar);
  const haClose = (bar.open + bar.high + bar.low + bar.close) / 4;
  const haOpen =
    n === 0 ? (bar.open + bar.close) / 2 : (state.ha[n - 1].open + state.ha[n - 1].close) / 2;
  const haLo = Math.min(bar.low, haOpen, haClose);
  state.ha.push({ open: haOpen, close: haClose, low: haLo, isBull: haClose > haOpen });

  const compLen = state.bars.length;
  const midStart = Math.max(0, compLen - state.midPeriod);
  let midSum = 0;
  let winLow = Infinity;
  let winHigh = -Infinity;
  for (let i = midStart; i < compLen; i++) {
    midSum += state.ha[i].close;
    if (state.bars[i].low < winLow) winLow = state.bars[i].low;
    if (state.bars[i].high > winHigh) winHigh = state.bars[i].high;
  }
  let midlineVal = Number((midSum / Math.max(1, compLen - midStart)).toFixed(2));
  if (Number.isFinite(winLow) && Number.isFinite(winHigh) && winHigh >= winLow) {
    midlineVal = Number(Math.max(winLow, Math.min(winHigh, midlineVal)).toFixed(2));
  }

  const prevLen = Math.max(1, compLen - 1);
  const prevMidStart = Math.max(0, prevLen - state.midPeriod);
  let prevMidSum = 0;
  for (let i = prevMidStart; i < prevLen; i++) prevMidSum += state.ha[i].close;
  const prevMidVal = Number((prevMidSum / Math.max(1, prevLen - prevMidStart)).toFixed(2));

  const atrP = Math.min(14, compLen);
  let atrSum = 0;
  for (let i = compLen - atrP; i < compLen; i++) {
    const b = state.bars[i];
    atrSum +=
      i <= 0
        ? b.high - b.low
        : Math.max(
            b.high - b.low,
            Math.abs(b.high - state.bars[i - 1].close),
            Math.abs(b.low - state.bars[i - 1].close)
          );
  }
  const atr = Math.max(0.0001, Number((atrSum / Math.max(1, atrP)).toFixed(4)));

  const recStart = Math.max(0, compLen - 14);
  let maxC = -Infinity;
  let minC = Infinity;
  for (let i = recStart; i < compLen; i++) {
    const c = state.bars[i].close;
    if (c > maxC) maxC = c;
    if (c < minC) minC = c;
  }
  const currC = bar.close;
  const currL = bar.low;
  const band90 = Number((midlineVal + atr * 3.1).toFixed(2));
  const band15 = Number((midlineVal - atr * 3.1).toFixed(2));

  let tfdr = 50 + ((currC - midlineVal) / (atr * 2.2)) * 22;
  if (currC >= maxC) tfdr = Math.max(tfdr, 86);
  if (currC <= minC || currL <= band15) tfdr = Math.min(tfdr, 14);
  tfdr = Math.max(0, Math.min(100, Math.round(tfdr)));

  const recentCloses: number[] = [];
  const rsiStart = Math.max(0, compLen - 15);
  for (let i = rsiStart; i < compLen; i++) recentCloses.push(state.bars[i].close);
  const rsi = calcRSI(recentCloses, 14);
  const mom = Number(((rsi + tfdr) / 2).toFixed(1));

  const hasEnough = compLen >= state.minCompleteBars;
  const sampleOK = compLen >= state.minSampleOK;
  const prevTfdr = state.snapshot.tfdr;
  const barMid50 = Number(((bar.high + bar.low) / 2).toFixed(2));

  state.snapshot = {
    count: compLen,
    midline: hasEnough ? midlineVal : null,
    prevMidline: hasEnough ? prevMidVal : null,
    lastHigh: Number(bar.high.toFixed(2)),
    lastLow: Number(bar.low.toFixed(2)),
    lastMid50: barMid50,
    atr: Number(atr.toFixed(2)),
    tfdr: hasEnough ? tfdr : null,
    prevTfdr: hasEnough ? prevTfdr ?? tfdr : null,
    rsi,
    mom,
    haBull: state.ha[compLen - 1].isBull,
    haLow: state.ha[compLen - 1].low,
    prevHaLow: compLen > 1 ? state.ha[compLen - 2].low : state.ha[compLen - 1].low,
    periodEnd: hasEnough ? bar.key : null,
    sampleOK,
    band90,
    band15
  };
}

function advancePeriodState(
  state: IncrementalPeriodState,
  bar: OHLCBar,
  periodKey: string,
  isExactCalendarEnd: boolean
) {
  if (state.active && state.active.key !== periodKey) {
    if (state.sealedLastKey !== state.active.key) {
      sealPeriodBar(state, state.active);
      state.sealedLastKey = state.active.key;
    }
    state.active = null;
    state.activeDayCount = 0;
  }

  if (!state.active) {
    state.active = {
      key: periodKey,
      date: bar.date,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close
    };
    state.activeDayCount = 1;
  } else {
    state.active.date = bar.date;
    if (bar.high > state.active.high) state.active.high = bar.high;
    if (bar.low < state.active.low) state.active.low = bar.low;
    state.active.close = bar.close;
    state.activeDayCount += 1;
  }

  if (isExactCalendarEnd && state.sealedLastKey !== state.active.key) {
    sealPeriodBar(state, state.active);
    state.sealedLastKey = state.active.key;
  }
}

/**
 * 取得截至當日 (無未來函數) 的「最近已完成或已成形當期」真實 High / Low 與 50% 平衡切線
 * - 若當期剛開局（例如週線第1日、月線前4日、季線前10日），沿用最近已完成週期箱體防止極窄開盤雜訊；
 * - 一旦當期累計交易日達標，直接採用當期截至今日之真實 High / Low，確保與嵌套拼圖 K 棒 100% 視覺同步。
 */
function getEffectiveBox50(state: IncrementalPeriodState): {
  high: number | null;
  low: number | null;
  mid50: number | null;
} {
  const active = state.active;
  const compHigh = state.snapshot.lastHigh;
  const compLow = state.snapshot.lastLow;

  if (
    active &&
    (state.activeDayCount >= state.minActiveBarsForMid50 || compHigh == null || compLow == null)
  ) {
    const high = Number(active.high.toFixed(2));
    const low = Number(active.low.toFixed(2));
    return { high, low, mid50: Number(((high + low) / 2).toFixed(2)) };
  }

  if (compHigh != null && compLow != null) {
    return {
      high: compHigh,
      low: compLow,
      mid50: Number(((compHigh + compLow) / 2).toFixed(2))
    };
  }

  return { high: null, low: null, mid50: null };
}

/**
 * 純函數：季/月/週 50% 平衡切線嵌套拼圖核心決策（封死半山腰接飛刀與牛市誤沽空）
 */
export function evaluatePuzzleVerdict(
  curr: OverlayPoint,
  prev: OverlayPoint,
  prior20Low: number
): PuzzleVerdict {
  const { close, low, haOpen, haClose, dTfdr, qMid50, mMid50, wMid50 } = curr;

  // 若 50% 平衡切線尚未成形或無週/月基本樣本，嚴格觀望
  if (
    qMid50 == null ||
    mMid50 == null ||
    wMid50 == null ||
    !Number.isFinite(qMid50) ||
    !Number.isFinite(mMid50) ||
    !Number.isFinite(wMid50)
  ) {
    return {
      isPuzzleCross: false,
      signal: 'HOLD',
      reasons: { touchW: false, regimeOK: false, tfdrTurnUp: false, haTwoUp: false },
      regime: 'NEUTRAL',
      sizeRatio: 0,
      invalidationPrice: null,
      compactHint: `樣本累積中｜日TFDR ${dTfdr}`
    };
  }

  const aboveQ50 = close >= qMid50;
  const aboveM50 = close >= mMid50;
  const aboveW50 = close >= wMid50;
  const belowBoth50 = !aboveQ50 && !aboveM50;

  // 鐵律 1：大局牛熊隔離（只要站在季線 50% 或月線 50% 之上，一律鎖定大升通道、100% 禁空）
  const isMacroBull = aboveQ50 || aboveM50;
  const regime: PuzzleVerdict['regime'] = isMacroBull ? 'BULL' : 'BEAR';

  // 清倉止損保護線：季線 50% 切線下方 6% (qMid50 * 0.94)
  const fullClearLine = Number((qMid50 * 0.94).toFixed(2));

  // 鐵律 2：黃金買點 (GOLDEN_BUY)
  // - 處於大升通道 (站在 qMid50 或 mMid50 之上)
  // - 價格曾回踩進入月/週 50% 切線下半部貼水區 (discount zone) 並觸及日線 TFDR 15/20 綠色低位區 (dTfdrLow5 <= 25)
  // - 日線 HA 黃色 K 棒轉陽 (haClose > haOpen) 且向上穿過/站上週線 50% 切線 (防半山腰接飛刀)
  const prevWMid50 = prev.wMid50 ?? wMid50;
  const touchedDiscount =
    low <= wMid50 * 1.005 ||
    prev.low <= prevWMid50 * 1.005 ||
    close <= mMid50 * 1.01 ||
    prev.close <= prevWMid50;
  const tfdrLowWindow = curr.dTfdrLow5 ?? curr.dTfdrLow3 ?? Math.min(dTfdr, prev.dTfdr);
  const touchedGreenZone = dTfdr <= 25 || prev.dTfdr <= 25 || tfdrLowWindow <= 25;
  const tfdrTurnUp = touchedGreenZone && dTfdr > prev.dTfdr && dTfdr <= 65;

  const crossedUpW50 =
    aboveW50 && (prev.close < prevWMid50 || prev.low <= prevWMid50 * 1.005);
  const haTurnedBull = haClose > haOpen && haClose > prev.haClose;
  const haTwoUp = haTurnedBull && prev.haClose >= prev.haOpen;
  const holdAbovePrior20Low = close > prior20Low * 0.995;

  const touchW = touchedDiscount && crossedUpW50 && holdAbovePrior20Low;
  const regimeOK = isMacroBull;
  const isPuzzleCross = regimeOK && touchW && tfdrTurnUp && haTurnedBull;

  // 鐵律 3：高位分段鎖利 (PARTIAL_PROFIT) 與破線全清 (FULL_CLEAR)
  // - 收盤跌破季線 50% 切線 6% (qMid50 * 0.94) -> 100% FULL_CLEAR
  // - 衝入上方 80/85/90 紅色警戒區 (dTfdr >= 80 或前日 >= 85) 且日線 HA 轉陰跌破前一日低點 -> 鎖利 60%，留 40% 底倉
  const hitRedZone = dTfdr >= 80 || prev.dTfdr >= 85;
  const haBearBreakPrevLow = haClose < haOpen && low < prev.low;

  // 鐵律 4：空頭趨勢沽空 (SHORT_ENTRY) 與平空 (COVER_SHORT)
  // - 只有當現價同時跌破季線 50% 與月線 50%（確認大跌通道）且日線衝至上方 85+ 紅區轉陰 -> 30% 輕倉沽空
  // - 當回踩至下方 <= 20 綠區轉陽，或收復大升通道 (aboveQ50 || aboveM50) -> 全數平空
  const shortTrigger =
    belowBoth50 &&
    (dTfdr >= 85 || prev.dTfdr >= 85) &&
    haClose < haOpen &&
    tfdrLowWindow > 20;
  const coverShortTrigger =
    isMacroBull || (dTfdr <= 20 && haClose > haOpen) || (tfdrLowWindow <= 20 && haTurnedBull);

  let signal: PuzzleVerdict['signal'] = 'HOLD';
  let sizeRatio = 0;

  if (close < fullClearLine) {
    signal = 'FULL_CLEAR';
    sizeRatio = 1.0;
  } else if (isPuzzleCross) {
    signal = aboveQ50 && aboveM50 ? 'GOLDEN_BUY' : 'ADD_POSITION';
    sizeRatio = aboveQ50 && aboveM50 ? 0.6 : 0.4;
  } else if (hitRedZone && haBearBreakPrevLow) {
    signal = 'PARTIAL_PROFIT';
    sizeRatio = 0.6; // 鎖定 60% 利潤，保留 40% 核心底倉
  } else if (shortTrigger) {
    signal = 'SHORT_ENTRY';
    sizeRatio = 0.3; // 熊市輕倉 30%
  } else if (coverShortTrigger && belowBoth50) {
    signal = 'COVER_SHORT';
    sizeRatio = 1.0;
  }

  const compactHint = `Q50:$${qMid50.toFixed(2)}｜M50:$${mMid50.toFixed(2)}｜W50:$${wMid50.toFixed(2)}｜日TFDR:${dTfdr}｜止損:$${fullClearLine.toFixed(2)}`;

  return {
    isPuzzleCross,
    signal,
    reasons: {
      touchW,
      regimeOK,
      tfdrTurnUp,
      haTwoUp,
      ha5Stand: curr.ha5High == null || close >= curr.ha5High,
      wTfdrUp: curr.wTfdr == null ? true : curr.wTfdr >= (curr.prevWTfdr ?? curr.wTfdr),
      bullShieldActive: aboveQ50,
      belowBoth50,
      aboveQ50,
      aboveM50,
      aboveW50
    },
    regime,
    sizeRatio,
    invalidationPrice: fullClearLine,
    compactHint
  };
}

export interface FullTimelineResult {
  sorted: OHLCBar[];
  overlays: OverlayPoint[];
  verdicts: PuzzleVerdict[];
  prior20Lows: number[];
  latestQ: TimeframeFeature;
  latestM: TimeframeFeature;
  latestW: TimeframeFeature;
  latestD: TimeframeFeature;
}

function normalizeSortedDaily(allDailyBars: OHLCBar[]): OHLCBar[] {
  if (!allDailyBars?.length) return [];
  const valid = allDailyBars
    .map(b => ({
      date: typeof b.date === 'string' ? b.date.slice(0, 10) : '',
      open: Number(b.open),
      high: Number(b.high),
      low: Number(b.low),
      close: Number(b.close)
    }))
    .filter(
      b =>
        /^\d{4}-\d{2}-\d{2}$/.test(b.date) &&
        Number.isFinite(b.open) &&
        b.open > 0 &&
        Number.isFinite(b.high) &&
        b.high > 0 &&
        Number.isFinite(b.low) &&
        b.low > 0 &&
        Number.isFinite(b.close) &&
        b.close > 0
    );
  let isAlreadySorted = true;
  for (let i = 1; i < valid.length; i++) {
    if (valid[i - 1].date > valid[i].date) {
      isAlreadySorted = false;
      break;
    }
  }
  return isAlreadySorted
    ? valid
    : [...valid].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * O(N) 單趟無未來函數構建全歷史 OverlayPoint + PuzzleVerdict 時間軸
 * 嚴格計算每根日線截至當日之季/月/週真實箱體與 50% 平衡切線 (qMid50 / mMid50 / wMid50)
 */
export function buildFullPuzzleTimeline(allDailyBars: OHLCBar[]): FullTimelineResult {
  const sorted = normalizeSortedDaily(allDailyBars);
  const n = sorted.length;
  const overlays: OverlayPoint[] = new Array(n);
  const verdicts: PuzzleVerdict[] = new Array(n);
  const prior20Lows: number[] = new Array(n);

  const stateW = createPeriodState(20, 4, 20, 2);
  const stateM = createPeriodState(12, 2, 12, 5);
  const stateQ = createPeriodState(8, 1, 24, 12);

  const haD: { open: number; close: number; low: number; isBull: boolean }[] = new Array(n);
  let lastDAtSnapshot = {
    midline: 0,
    prevMidline: 0,
    atr: 0,
    tfdr: 50,
    prevTfdr: 50,
    rsi: 50,
    mom: 50,
    high: 0,
    low: 0,
    mid50: 0
  };

  for (let i = 0; i < n; i++) {
    const bar = sorted[i];
    const meta = getCalendarMeta(bar.date);

    let p20Low = i === 0 ? bar.low : Infinity;
    for (let j = Math.max(0, i - 20); j < i; j++) {
      if (sorted[j].low < p20Low) p20Low = sorted[j].low;
    }
    prior20Lows[i] = p20Low;

    advancePeriodState(stateW, bar, meta.wKey, meta.isWeekEnd);
    advancePeriodState(stateM, bar, meta.mKey, meta.isMonthEnd);
    advancePeriodState(stateQ, bar, meta.qKey, meta.isQuarterEnd);

    const qBox50 = getEffectiveBox50(stateQ);
    const mBox50 = getEffectiveBox50(stateM);
    const wBox50 = getEffectiveBox50(stateW);

    const dHaClose = (bar.open + bar.high + bar.low + bar.close) / 4;
    const dHaOpen =
      i === 0 ? (bar.open + bar.close) / 2 : (haD[i - 1].open + haD[i - 1].close) / 2;
    const dHaLo = Math.min(bar.low, dHaOpen, dHaClose);
    haD[i] = { open: dHaOpen, close: dHaClose, low: dHaLo, isBull: dHaClose > dHaOpen };

    const dMidStart = Math.max(0, i + 1 - 20);
    let dMidSum = 0;
    for (let j = dMidStart; j <= i; j++) dMidSum += haD[j].close;
    const dMidline = Number((dMidSum / (i + 1 - dMidStart)).toFixed(2));

    let prevDMidline = dMidline;
    if (i >= 1) {
      const pStart = Math.max(0, i - 20);
      let pSum = 0;
      for (let j = pStart; j < i; j++) pSum += haD[j].close;
      prevDMidline = Number((pSum / Math.max(1, i - pStart)).toFixed(2));
    }

    const atrStart = Math.max(0, i + 1 - 14);
    let atrSum = 0;
    for (let j = atrStart; j <= i; j++) {
      const b = sorted[j];
      atrSum +=
        j === 0
          ? b.high - b.low
          : Math.max(
              b.high - b.low,
              Math.abs(b.high - sorted[j - 1].close),
              Math.abs(b.low - sorted[j - 1].close)
            );
    }
    const dAtr = Math.max(0.0001, atrSum / (i + 1 - atrStart));

    let maxC = -Infinity;
    let minC = Infinity;
    for (let j = atrStart; j <= i; j++) {
      const c = sorted[j].close;
      if (c > maxC) maxC = c;
      if (c < minC) minC = c;
    }
    const band15 = Number((dMidline - dAtr * 3.1).toFixed(2));
    let dTfdr = 50 + ((bar.close - dMidline) / (dAtr * 2.2)) * 22;
    if (bar.close >= maxC) dTfdr = Math.max(dTfdr, 86);
    if (bar.close <= minC || bar.low <= band15) dTfdr = Math.min(dTfdr, 14);
    dTfdr = Math.max(0, Math.min(100, Math.round(dTfdr)));

    const prevDTfdr = i > 0 ? overlays[i - 1].dTfdr : dTfdr;
    let dTfdrLow3 = dTfdr;
    for (let j = Math.max(0, i - 3); j < i; j++) {
      if (overlays[j].dTfdr < dTfdrLow3) dTfdrLow3 = overlays[j].dTfdr;
    }
    let dTfdrLow5 = dTfdrLow3;
    for (let j = Math.max(0, i - 5); j < Math.max(0, i - 3); j++) {
      if (overlays[j].dTfdr < dTfdrLow5) dTfdrLow5 = overlays[j].dTfdr;
    }

    const ha5Start = Math.max(0, i - 4);
    let ha5Sum = 0;
    for (let j = ha5Start; j <= i; j++) {
      ha5Sum += Math.max(sorted[j].high, haD[j].open, haD[j].close);
    }
    const ha5High = Number((ha5Sum / (i - ha5Start + 1)).toFixed(4));

    const qTfdrEffective = stateQ.snapshot.sampleOK ? stateQ.snapshot.tfdr : null;

    const point: OverlayPoint = {
      date: bar.date,
      open: Number(bar.open.toFixed(2)),
      high: Number(bar.high.toFixed(2)),
      low: Number(bar.low.toFixed(2)),
      close: Number(bar.close.toFixed(2)),
      haOpen: Number(dHaOpen.toFixed(4)),
      haClose: Number(dHaClose.toFixed(4)),
      dTfdr,
      dTfdrLow3,
      dTfdrLow5,
      ha5High,
      prevWTfdr: stateW.snapshot.prevTfdr,
      qMid: stateQ.snapshot.midline ?? qBox50.mid50,
      mMid: stateM.snapshot.midline ?? mBox50.mid50,
      wMid: stateW.snapshot.midline ?? wBox50.mid50,
      qMid50: qBox50.mid50,
      mMid50: mBox50.mid50,
      wMid50: wBox50.mid50,
      qHigh: qBox50.high,
      qLow: qBox50.low,
      mHigh: mBox50.high,
      mLow: mBox50.low,
      wHigh: wBox50.high,
      wLow: wBox50.low,
      qTfdr: qTfdrEffective,
      mTfdr: stateM.snapshot.tfdr,
      wTfdr: stateW.snapshot.tfdr,
      qPeriodEnd: stateQ.snapshot.periodEnd,
      mPeriodEnd: stateM.snapshot.periodEnd,
      wPeriodEnd: stateW.snapshot.periodEnd
    };
    overlays[i] = point;

    const prevPoint = i > 0 ? overlays[i - 1] : point;
    verdicts[i] = evaluatePuzzleVerdict(point, prevPoint, p20Low);

    if (i === n - 1) {
      const rsiCloses: number[] = [];
      for (let j = Math.max(0, n - 15); j < n; j++) rsiCloses.push(sorted[j].close);
      const dRsi = calcRSI(rsiCloses, 14);
      const dMom = Number(((dRsi + dTfdr) / 2).toFixed(1));
      lastDAtSnapshot = {
        midline: dMidline,
        prevMidline: prevDMidline,
        atr: Number(dAtr.toFixed(2)),
        tfdr: dTfdr,
        prevTfdr: prevDTfdr,
        rsi: dRsi,
        mom: dMom,
        high: Number(bar.high.toFixed(2)),
        low: Number(bar.low.toFixed(2)),
        mid50: Number(((bar.high + bar.low) / 2).toFixed(2))
      };
    }
  }

  const toFeature = (
    s: IncrementalPeriodState,
    isLastComplete: boolean
  ): TimeframeFeature => {
    const box = getEffectiveBox50(s);
    return {
      bars: s.snapshot.count,
      haBull: s.snapshot.haBull,
      haLow: s.snapshot.haLow,
      prevHaLow: s.snapshot.prevHaLow,
      midline: box.mid50 ?? s.snapshot.midline ?? 0,
      prevMidline: s.snapshot.prevMidline ?? 0,
      high: box.high ?? 0,
      low: box.low ?? 0,
      mid50: box.mid50 ?? 0,
      atr: s.snapshot.atr,
      tfdr: s.snapshot.tfdr ?? 50,
      prevTfdr: s.snapshot.prevTfdr ?? 50,
      rsi: s.snapshot.rsi,
      mom: s.snapshot.mom,
      sampleOK: s.snapshot.sampleOK,
      isLastBarComplete: isLastComplete
    };
  };

  const lastBarMeta = n > 0 ? getCalendarMeta(sorted[n - 1].date) : null;
  const latestD: TimeframeFeature = {
    bars: n,
    haBull: n > 0 ? haD[n - 1].isBull : false,
    haLow: n > 0 ? haD[n - 1].low : 0,
    prevHaLow: n > 1 ? haD[n - 2].low : n > 0 ? haD[0].low : 0,
    midline: lastDAtSnapshot.midline,
    prevMidline: lastDAtSnapshot.prevMidline,
    high: lastDAtSnapshot.high,
    low: lastDAtSnapshot.low,
    mid50: lastDAtSnapshot.mid50,
    atr: lastDAtSnapshot.atr,
    tfdr: lastDAtSnapshot.tfdr,
    prevTfdr: lastDAtSnapshot.prevTfdr,
    rsi: lastDAtSnapshot.rsi,
    mom: lastDAtSnapshot.mom,
    sampleOK: n >= 20,
    isLastBarComplete: true
  };

  return {
    sorted,
    overlays,
    verdicts,
    prior20Lows,
    latestQ: toFeature(stateQ, Boolean(lastBarMeta?.isQuarterEnd)),
    latestM: toFeature(stateM, Boolean(lastBarMeta?.isMonthEnd)),
    latestW: toFeature(stateW, Boolean(lastBarMeta?.isWeekEnd)),
    latestD
  };
}

/**
 * 構建近 1 年（約 252 個交易日）L1~L4 同時間軸・同價格軸嵌套 50% 平衡切線幾何結構（無未來函數）
 */
export function buildNestedPuzzlePiP(
  allDailyBars: OHLCBar[],
  windowDays: number = 252
): NestedPuzzlePiPData | null {
  const timeline = buildFullPuzzleTimeline(allDailyBars);
  const total = timeline.sorted.length;
  if (total < 2) return null;

  const startOffset = Math.max(0, total - Math.max(20, windowDays));
  const sliceLen = total - startOffset;

  const qBoxes: NestedPeriodBox[] = [];
  const mCandles: NestedPeriodBox[] = [];
  const wCandles: NestedPeriodBox[] = [];
  const dCandles: NestedDailyCandle[] = new Array(sliceLen);

  let minPrice = Infinity;
  let maxPrice = -Infinity;
  let starCount = 0;

  const pushGroup = (
    arr: NestedPeriodBox[],
    key: string,
    idxInSlice: number,
    bar: OHLCBar,
    isAltParity: boolean
  ) => {
    const last = arr[arr.length - 1];
    if (!last || last.key !== key) {
      arr.push({
        key,
        startIdx: idxInSlice,
        endIdx: idxInSlice,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        mid50: Number(((bar.high + bar.low) / 2).toFixed(2)),
        isBull: bar.close >= bar.open,
        isAltColor: isAltParity ? arr.length % 2 === 1 : false
      });
    } else {
      last.endIdx = idxInSlice;
      if (bar.high > last.high) last.high = bar.high;
      if (bar.low < last.low) last.low = bar.low;
      last.close = bar.close;
      last.mid50 = Number(((last.high + last.low) / 2).toFixed(2));
      last.isBull = last.close >= last.open;
    }
  };

  for (let i = 0; i < sliceLen; i++) {
    const gIdx = startOffset + i;
    const bar = timeline.sorted[gIdx];
    const ov = timeline.overlays[gIdx];
    const v = timeline.verdicts[gIdx];
    const meta = getCalendarMeta(bar.date);

    if (bar.low < minPrice) minPrice = bar.low;
    if (bar.high > maxPrice) maxPrice = bar.high;

    pushGroup(qBoxes, meta.qKey, i, bar, true);
    pushGroup(mCandles, meta.mKey, i, bar, false);
    pushGroup(wCandles, meta.wKey, i, bar, false);

    const isGoldenStar = Boolean(v.isPuzzleCross);
    if (isGoldenStar) starCount += 1;

    dCandles[i] = {
      date: bar.date,
      idx: i,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      haOpen: ov.haOpen,
      haClose: ov.haClose,
      isHaBull: ov.haClose >= ov.haOpen,
      isGoldenStar,
      signal: v.signal,
      dTfdr: ov.dTfdr,
      qMid50: ov.qMid50,
      mMid50: ov.mMid50,
      wMid50: ov.wMid50
    };
  }

  if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice) || maxPrice <= minPrice) {
    return null;
  }

  return {
    qBoxes,
    mCandles,
    wCandles,
    dCandles,
    minPrice,
    maxPrice,
    starCount
  };
}

export function computePuzzleOverlaySeries(
  allDailyBars: OHLCBar[],
  windowBars: number = 90
): OverlayPoint[] {
  if (!allDailyBars?.length) return [];
  const timeline = buildFullPuzzleTimeline(allDailyBars);
  const count = Math.max(1, windowBars);
  return timeline.overlays.slice(-count);
}

export function computePuzzleDecision(
  symbol: string,
  allDailyBars: OHLCBar[],
  asOfIndex: number
): PuzzleState {
  if (!allDailyBars?.length) throw new Error('Empty daily bars');
  const sorted = normalizeSortedDaily(allDailyBars);
  const safeIdx = Math.max(0, Math.min(sorted.length - 1, asOfIndex));
  const frozen = sorted.slice(0, safeIdx + 1);
  const timeline = buildFullPuzzleTimeline(frozen);
  const n = timeline.sorted.length;
  if (n === 0) throw new Error('No valid daily bars');
  const currBar = timeline.sorted[n - 1];
  const currOverlay = timeline.overlays[n - 1];
  const verdict = timeline.verdicts[n - 1];
  const featQ = timeline.latestQ;
  const featM = timeline.latestM;
  const featW = timeline.latestW;
  const featD = timeline.latestD;

  const kerSlice = timeline.sorted.slice(-15);
  const netChg =
    kerSlice.length >= 2
      ? Math.abs(kerSlice[kerSlice.length - 1].close - kerSlice[0].close)
      : 0;
  let sumVol = 0;
  for (let i = 1; i < kerSlice.length; i++) {
    sumVol += Math.abs(kerSlice[i].close - kerSlice[i - 1].close);
  }
  const ker = sumVol === 0 ? 0 : Number((netChg / sumVol).toFixed(2));

  const regime: PuzzleState['regime'] =
    verdict.regime === 'BULL'
      ? 'UPTREND_CHANNEL'
      : verdict.regime === 'BEAR'
      ? 'DOWNTREND_CHANNEL'
      : 'CONSOLIDATION';

  const qMid50 = currOverlay.qMid50 ?? currOverlay.close;
  const mMid50 = currOverlay.mMid50 ?? currOverlay.close;
  const wMid50 = currOverlay.wMid50 ?? currOverlay.close;
  const qHigh = currOverlay.qHigh ?? currBar.high;
  const qLow = currOverlay.qLow ?? currBar.low;
  const mHigh = currOverlay.mHigh ?? currBar.high;
  const mLow = currOverlay.mLow ?? currBar.low;
  const wHigh = currOverlay.wHigh ?? currBar.high;
  const wLow = currOverlay.wLow ?? currBar.low;

  const tol = Math.max(currOverlay.close * 0.005, featD.atr * 0.8);
  const invalidationPrice = verdict.invalidationPrice ?? Number((qMid50 * 0.94).toFixed(2));

  const buyAnchor = verdict.isPuzzleCross
    ? currOverlay.close
    : regime === 'UPTREND_CHANNEL'
    ? Math.min(wMid50, mMid50)
    : currOverlay.close;
  const rawBuyHigh = Math.max(buyAnchor, wMid50 * 1.005);
  const rawBuyLow =
    regime === 'UPTREND_CHANNEL'
      ? Math.min(rawBuyHigh, Math.max(invalidationPrice, Math.min(wLow, buyAnchor - tol * 0.6)))
      : Math.min(rawBuyHigh, Math.max(0.01, Math.min(wLow, currOverlay.close) - tol * 0.5));
  const buyZone = {
    low: Number(Math.min(rawBuyLow, rawBuyHigh).toFixed(2)),
    high: Number(Math.max(rawBuyLow, rawBuyHigh).toFixed(2))
  };
  const takeProfitAnchor = Math.max(
    currOverlay.close,
    wHigh,
    mHigh,
    featD.tfdr >= 80 ? currOverlay.close : wMid50 + tol * 2.2
  );
  const takeProfitZone = {
    low: Number((takeProfitAnchor - tol * 0.5).toFixed(2)),
    high: Number((takeProfitAnchor + tol * 0.7).toFixed(2))
  };

  const dTfdr = currOverlay.dTfdr;
  const singularityStatus: TimeSpacePrompt['singularityStatus'] =
    dTfdr >= 80 ? 'UPPER_EXPANSION' : dTfdr <= 20 ? 'LOWER_EXPANSION' : 'SAFE_MID_ZONE';
  const singularityLabel =
    singularityStatus === 'UPPER_EXPANSION'
      ? `上方三線展開 (日TFDR ${dTfdr} ≥ 80 · 85/90/95警戒)`
      : singularityStatus === 'LOWER_EXPANSION'
      ? `下方三線展開 (日TFDR ${dTfdr} ≤ 20 · 20/15/10奇點底)`
      : `安全雙線通道 (日TFDR ${dTfdr} · 僅顯示85壓力與15支撐)`;

  const regimeLabel =
    regime === 'UPTREND_CHANNEL'
      ? '大升通道（站在季/月50%切線之上・100%禁空）'
      : '大跌通道（跌破季與月雙重50%切線・允許輕倉順勢沽空）';

  const actionTitleMap: Record<PuzzleVerdict['signal'], string> = {
    GOLDEN_BUY: '🔥 黃金買入（回踩50%切線＋日綠底轉陽上穿週50線）',
    ADD_POSITION: '🟢 復甦低吸（重上週50線・分批建倉40%）',
    PARTIAL_PROFIT: '🟠 高位鎖利 60%（進入80+紅區且HA陰線破前低・留40%底倉）',
    FULL_CLEAR: '🚨 破季線50%下緣6%・強制全數清倉',
    HALT_REDUCE: '🛑 回撤熔斷控險・減半倉位',
    SHORT_ENTRY: '🟣 順勢輕空 30%（雙破季月50線＋日TFDR≥85轉陰）',
    COVER_SHORT: '💎 空單全數平倉（底部奇點或收復50%切線）',
    HOLD: regime === 'UPTREND_CHANNEL' ? '⚖️ 沿50%切線持倉觀望' : '⚠️ 空頭觀望等待反彈至85+'
  };

  const timeSpacePrompt: TimeSpacePrompt = {
    triggerDate: currBar.date,
    currentPrice: currOverlay.close,
    qMid50: Number(qMid50.toFixed(2)),
    mMid50: Number(mMid50.toFixed(2)),
    wMid50: Number(wMid50.toFixed(2)),
    qHigh: Number(qHigh.toFixed(2)),
    qLow: Number(qLow.toFixed(2)),
    mHigh: Number(mHigh.toFixed(2)),
    mLow: Number(mLow.toFixed(2)),
    wHigh: Number(wHigh.toFixed(2)),
    wLow: Number(wLow.toFixed(2)),
    dTfdr,
    singularityStatus,
    singularityLabel,
    regimeLabel,
    actionTitle: actionTitleMap[verdict.signal],
    buyZone,
    takeProfitZone,
    invalidationPrice,
    compactHint: `Q50:$${qMid50.toFixed(2)}｜M50:$${mMid50.toFixed(2)}｜W50:$${wMid50.toFixed(2)}｜${singularityStatus === 'UPPER_EXPANSION' ? '上紅展開' : singularityStatus === 'LOWER_EXPANSION' ? '下綠展開' : '雙線安全'}(TFDR ${dTfdr})｜止損:$${invalidationPrice.toFixed(2)}`
  };

  const reasons: string[] = [
    `三級50%平衡切線：季Q50 $${qMid50.toFixed(2)} (${currOverlay.close >= qMid50 ? '上方' : '下方'}) / 月M50 $${mMid50.toFixed(2)} (${currOverlay.close >= mMid50 ? '上方' : '下方'}) / 週W50 $${wMid50.toFixed(2)} (${currOverlay.close >= wMid50 ? '上方' : '下方'})`,
    `奇點軌道狀態：${singularityLabel}`
  ];

  const riskFlags: string[] = [];
  if (!featQ.sampleOK) riskFlags.push(`季線累積 ${featQ.bars} 根(<24)，維持嚴格 50% 箱體約束`);
  if (!featW.sampleOK) riskFlags.push(`週線累積 ${featW.bars} 根(<20)`);
  if (!featM.sampleOK) riskFlags.push(`月線累積 ${featM.bars} 根(<12)`);
  if (ker < 0.3) riskFlags.push(`KER(${ker})偏低，震盪區嚴防追高`);

  if (verdict.isPuzzleCross) {
    reasons.push(
      `T日預警觸發 ${verdict.signal}：回踩50%貼水區＋日綠底轉強＋HA黃燭翻陽上穿週50%線 ($${wMid50.toFixed(2)})，建議配置 ${Math.round(verdict.sizeRatio * 100)}%`
    );
  } else if (verdict.signal === 'FULL_CLEAR') {
    reasons.push(
      `跌穿季線50%保護下緣 6% ($${currOverlay.close} < $${invalidationPrice})，大升通道破壞・100% 全清避險`
    );
  } else if (verdict.signal === 'PARTIAL_PROFIT') {
    reasons.push(
      `日線衝入 80+ 紅色警戒區 (TFDR ${dTfdr}) 且 HA 轉陰破前低，分段鎖定 60% 利潤・保留 40% 核心底倉`
    );
  } else if (verdict.signal === 'SHORT_ENTRY') {
    reasons.push(
      `現價跌破季線50%($${qMid50.toFixed(2)})與月線50%($${mMid50.toFixed(2)})雙線，且日TFDR(${dTfdr}>=85)反彈衰竭轉陰，輕倉 30% 沽空`
    );
  } else {
    reasons.push(
      `${regime === 'UPTREND_CHANNEL' ? '大升通道禁空護盤' : '大跌通道觀望'}，待 T+1 開盤不跌破失效線 $${invalidationPrice} 再依切線訊號行動`
    );
  }

  const keyPoints: string[] = [
    `季50%切線 $${qMid50.toFixed(2)} [${qLow.toFixed(2)}~${qHigh.toFixed(2)}]｜月50% $${mMid50.toFixed(2)}｜週50% $${wMid50.toFixed(2)}`,
    `奇點軌道：${singularityLabel}`,
    `大升通道條件[站在Q50或M50之上：${verdict.reasons.regimeOK ? '✅ 禁空' : '❌ 雙破空頭'}]｜週50回踩上穿[${verdict.reasons.touchW ? '✅' : '⏳'}]｜綠底TFDR[${verdict.reasons.tfdrTurnUp ? '✅' : '⏳'}]`,
    `T+1 開盤驗假破：若開盤跌破失效保護線 $${invalidationPrice.toFixed(2)} 則放棄開倉並保護底倉`
  ];

  const signalStrength = verdict.isPuzzleCross
    ? verdict.signal === 'GOLDEN_BUY'
      ? 92
      : 84
    : verdict.signal === 'FULL_CLEAR'
    ? 92
    : verdict.signal === 'PARTIAL_PROFIT'
    ? 85
    : verdict.signal === 'SHORT_ENTRY'
    ? 78
    : 50;

  return {
    schema: 'puzzle/v2-strict',
    symbol,
    signalDate: currBar.date,
    asOfDate: currBar.date,
    asOfIndex: safeIdx,
    currentPrice: currOverlay.close,
    isPuzzleCross: verdict.isPuzzleCross,
    verdict,
    timeSpacePrompt,
    timeframes: {
      Q: featQ,
      M: featM,
      W: featW,
      D: featD
    },
    regime,
    signal: verdict.signal,
    signalStrength,
    positionSizingHint: verdict.sizeRatio,
    levels: {
      buyZone,
      takeProfitZone,
      invalidationPrice
    },
    ker,
    shortLock8dActive: regime === 'UPTREND_CHANNEL',
    reasons,
    keyPoints,
    riskFlags,
    provenance: { computedBy: 'computePuzzleDecision', llmGeneratedNumbers: [] }
  };
}
