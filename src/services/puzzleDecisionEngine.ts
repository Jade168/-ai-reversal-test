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
  haHigh: number;
  prevHaHigh: number;
  haLow: number;
  prevHaLow: number;
  haBreakUp: boolean;
  haBreakDown: boolean;
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
  dTfdrLow6?: number;
  dTfdrHigh3?: number;
  dTfdrHigh6?: number;
  dHaBull?: boolean;
  dHaBreakUp?: boolean;
  dHaBreakDown?: boolean;
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
  qHaBull?: boolean;
  mHaBull?: boolean;
  wHaBull?: boolean;
  qHaBreakUp?: boolean;
  qHaBreakDown?: boolean;
  mHaBreakUp?: boolean;
  mHaBreakDown?: boolean;
  wHaBreakUp?: boolean;
  wHaBreakDown?: boolean;
  isMonthlyBreakDown?: boolean;
  isMonthlyBreakUp?: boolean;
  currMHaHigh?: number | null;
  currMHaLow?: number | null;
  prevMHaHigh?: number | null;
  prevMHaLow?: number | null;
  qPeriodEnd: string | null;
  mPeriodEnd: string | null;
  wPeriodEnd: string | null;
}

export type ConductionScenario =
  | 'SCENARIO_A_BEAR_CEILING'
  | 'SCENARIO_B_BULL_FLOOR'
  | 'TRANSITION';

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
  conductionScenario: ConductionScenario;
  reverseToShort?: boolean;
  reverseShortRatio?: number;
  reasons: {
    touchW: boolean;
    regimeOK: boolean;
    tfdrTurnUp: boolean;
    haTwoUp: boolean;
    dBreakUp?: boolean;
    dBreakDown?: boolean;
    wBreakUp?: boolean;
    wBreakDown?: boolean;
    dTfdrLow6?: number;
    dTfdrHigh6?: number;
    ha5Stand?: boolean;
    wTfdrUp?: boolean;
    bullShieldActive?: boolean;
    belowBoth50?: boolean;
    aboveQ50?: boolean;
    aboveM50?: boolean;
    aboveW50?: boolean;
    mqStrongFloor?: boolean;
    mqWeakCeiling?: boolean;
    haBreakUpMQ?: boolean;
    haBreakDownMQ?: boolean;
    isMonthlyBreakDown?: boolean;
    isMonthlyBreakUp?: boolean;
    justMonthlyBreakDown?: boolean;
    inDiscountZone?: boolean;
    isBullRegime?: boolean;
    isBearRegime?: boolean;
  };
  regime: 'BULL' | 'NEUTRAL' | 'BEAR';
  sizeRatio: number; // 0 / 0.35 / 0.4 / 0.8 / 1.0
  invalidationPrice: number | null;
  compactHint: string;
}

export interface TimeSpacePrompt {
  triggerDate: string;
  currentPrice: number;
  qMid50: number;
  mMid50: number;
  wMid50: number;
  q50Line: number;
  m50Line: number;
  qHigh: number;
  qLow: number;
  mHigh: number;
  mLow: number;
  wHigh: number;
  wLow: number;
  dTfdr: number;
  wTfdr: number;
  mTfdr: number;
  qTfdr: number;
  dBreakUp: boolean;
  dBreakDown: boolean;
  wBreakUp: boolean;
  wBreakDown: boolean;
  dTfdrLow6: number;
  dTfdrHigh6: number;
  distTo13: number;
  distTo23: number;
  distTo85: number;
  distTo95: number;
  isMonthlyBreakDown: boolean;
  isMonthlyBreakUp: boolean;
  monthlyHaStatusLabel: string;
  inDiscountZone: boolean;
  isBullRegime: boolean;
  isBearRegime: boolean;
  trendBannerLabel: string;
  conductionScenario: ConductionScenario;
  conductionLabel: string;
  haDirectionSummary: string;
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
  ha: { open: number; close: number; high: number; low: number; isBull: boolean }[];
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
    haHigh: number;
    prevHaHigh: number;
    haLow: number;
    prevHaLow: number;
    haBreakUp: boolean;
    haBreakDown: boolean;
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
      haHigh: 0,
      prevHaHigh: 0,
      haLow: 0,
      prevHaLow: 0,
      haBreakUp: false,
      haBreakDown: false,
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
  const haHi = Math.max(bar.high, haOpen, haClose);
  const haLo = Math.min(bar.low, haOpen, haClose);
  const isBull = haClose > haOpen;
  state.ha.push({ open: haOpen, close: haClose, high: haHi, low: haLo, isBull });

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

  const currHa = state.ha[compLen - 1];
  const prevHa = compLen > 1 ? state.ha[compLen - 2] : currHa;
  const haBreakUp = compLen > 1 && currHa.high > prevHa.high && currHa.isBull;
  const haBreakDown = compLen > 1 && currHa.low < prevHa.low && !currHa.isBull;

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
    haBull: currHa.isBull,
    haHigh: Number(currHa.high.toFixed(2)),
    prevHaHigh: Number(prevHa.high.toFixed(2)),
    haLow: Number(currHa.low.toFixed(2)),
    prevHaLow: Number(prevHa.low.toFixed(2)),
    haBreakUp,
    haBreakDown,
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
 * 嚴格截斷至當日 (無未來函數) 的即時週期能量與原生平均 K 線破梯方向（融合已完結柱 + 當期截至今日累積結構）
 * 並同步計算當月 vs 前月高低破位：
 * - isMonthlyBreakDown: curr_HA.high < prev_HA.high && curr_HA.low < prev_HA.low
 * - isMonthlyBreakUp:   curr_HA.high > prev_HA.high && curr_HA.low >= prev_HA.low
 */
function getLivePeriodTelemetry(
  state: IncrementalPeriodState,
  isWeekly: boolean
): {
  tfdr: number | null;
  haBull: boolean;
  haBreakUp: boolean;
  haBreakDown: boolean;
  isPeriodHighLowBreakDown: boolean;
  isPeriodHighLowBreakUp: boolean;
  currHaHigh: number | null;
  currHaLow: number | null;
  prevHaHigh: number | null;
  prevHaLow: number | null;
} {
  const snap = state.snapshot;
  const active = state.active;
  if (!active || state.ha.length === 0 || state.sealedLastKey === active.key) {
    const len = state.ha.length;
    const currHa = len > 0 ? state.ha[len - 1] : null;
    const prevHa = len > 1 ? state.ha[len - 2] : null;
    const isPeriodHighLowBreakDown = Boolean(
      currHa && prevHa && currHa.high < prevHa.high && currHa.low < prevHa.low
    );
    const isPeriodHighLowBreakUp = Boolean(
      currHa && prevHa && currHa.high > prevHa.high && currHa.low >= prevHa.low
    );
    return {
      tfdr: snap.tfdr,
      haBull: snap.haBull,
      haBreakUp: snap.haBreakUp,
      haBreakDown: snap.haBreakDown,
      isPeriodHighLowBreakDown,
      isPeriodHighLowBreakUp,
      currHaHigh: currHa ? Number(currHa.high.toFixed(2)) : null,
      currHaLow: currHa ? Number(currHa.low.toFixed(2)) : null,
      prevHaHigh: prevHa ? Number(prevHa.high.toFixed(2)) : null,
      prevHaLow: prevHa ? Number(prevHa.low.toFixed(2)) : null
    };
  }

  const lastSealedHa = state.ha[state.ha.length - 1];
  const liveHaClose = (active.open + active.high + active.low + active.close) / 4;
  const liveHaOpen = (lastSealedHa.open + lastSealedHa.close) / 2;
  const liveHaHigh = Math.max(active.high, liveHaOpen, liveHaClose);
  const liveHaLow = Math.min(active.low, liveHaOpen, liveHaClose);
  const liveHaBull = liveHaClose > liveHaOpen;

  const liveHaBreakUp = liveHaHigh > lastSealedHa.high && liveHaBull;
  const liveHaBreakDown = liveHaLow < lastSealedHa.low && !liveHaBull;
  const isPeriodHighLowBreakDown = liveHaHigh < lastSealedHa.high && liveHaLow < lastSealedHa.low;
  const isPeriodHighLowBreakUp = liveHaHigh > lastSealedHa.high && liveHaLow >= lastSealedHa.low;

  let liveTfdr = snap.tfdr;
  if (snap.midline != null && snap.atr > 0) {
    let raw = 50 + ((active.close - snap.midline) / (snap.atr * 2.2)) * 22;
    if (isWeekly) {
      const compLen = state.bars.length;
      const recStart = Math.max(0, compLen - 13);
      let maxC = -Infinity;
      let minC = Infinity;
      for (let i = recStart; i < compLen; i++) {
        if (state.bars[i].close > maxC) maxC = state.bars[i].close;
        if (state.bars[i].close < minC) minC = state.bars[i].close;
      }
      if (active.close >= maxC) raw = Math.max(raw, 86);
      if (active.close <= minC || active.low <= snap.band15) raw = Math.min(raw, 14);
    }
    liveTfdr = Math.max(0, Math.min(100, Math.round(raw)));
  }

  return {
    tfdr: liveTfdr,
    haBull: liveHaBull,
    haBreakUp: liveHaBreakUp,
    haBreakDown: liveHaBreakDown,
    isPeriodHighLowBreakDown,
    isPeriodHighLowBreakUp,
    currHaHigh: Number(liveHaHigh.toFixed(2)),
    currHaLow: Number(liveHaLow.toFixed(2)),
    prevHaHigh: Number(lastSealedHa.high.toFixed(2)),
    prevHaLow: Number(lastSealedHa.low.toFixed(2))
  };
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
 * 純順勢月/季 50 中間線分水嶺決策引擎：
 * - 上升浪大勢 (isBullRegime): price >= mMid50 || price >= qMid50（以月/季50生命中軸為準，早期樣本未滿則回退箱體50%）
 *   → 100% 禁空只買：日 TFDR <= 25 且日 HA 轉陽升穿前高 => 80% 重倉買入坐貨；日 TFDR >= 88 且日/週雙 HA 跌破前低 => 減倉 40%（留60%底倉）
 * - 下跌浪大勢 (isBearRegime): price < mMid50 && price < qMid50
 *   → 清倉禁買只空：立即清倉多單；日 TFDR >= 80 且轉陰跌穿前低 => 開立 35% 輕倉空單；日 TFDR <= 18 且轉陽升穿或收復多頭 => 100% 平空
 */
export function evaluatePuzzleVerdict(
  curr: OverlayPoint,
  prev: OverlayPoint,
  prior20Low: number
): PuzzleVerdict {
  const { close, low, haOpen, haClose, dTfdr, qMid50, mMid50, wMid50 } = curr;
  const m50Trend = curr.mMid ?? mMid50;
  const q50Trend = curr.qMid ?? qMid50;

  // 若月/季 50 中間線尚未成形，嚴格觀望
  if (
    m50Trend == null ||
    q50Trend == null ||
    !Number.isFinite(m50Trend) ||
    !Number.isFinite(q50Trend)
  ) {
    return {
      isPuzzleCross: false,
      signal: 'HOLD',
      conductionScenario: 'TRANSITION',
      reasons: {
        touchW: false,
        regimeOK: false,
        tfdrTurnUp: false,
        haTwoUp: false,
        isBullRegime: false,
        isBearRegime: false
      },
      regime: 'NEUTRAL',
      sizeRatio: 0,
      invalidationPrice: null,
      compactHint: `樣本累積中｜日TFDR ${dTfdr}`
    };
  }

  const aboveQ50 = close >= q50Trend;
  const aboveM50 = close >= m50Trend;
  const aboveW50 = wMid50 != null ? close >= wMid50 : true;
  const isBullRegime = aboveM50 || aboveQ50;
  const isBearRegime = !isBullRegime; // close < m50Trend && close < q50Trend

  const dHaBull = haClose > haOpen;
  const dHaTurnedBull = dHaBull && haClose > prev.haClose;
  const haTwoUp = dHaTurnedBull && prev.haClose >= prev.haOpen;

  const dBreakUp = Boolean(curr.dHaBreakUp);
  const dBreakDown = Boolean(curr.dHaBreakDown);
  const wBreakUp = Boolean(curr.wHaBreakUp);
  const wBreakDown = Boolean(curr.wHaBreakDown);
  const qHaBull = Boolean(curr.qHaBull);
  const mHaBull = Boolean(curr.mHaBull);
  const qHaUp = Boolean(curr.qHaBreakUp);
  const mHaUp = Boolean(curr.mHaBreakUp);
  const qHaDown = Boolean(curr.qHaBreakDown);
  const mHaDown = Boolean(curr.mHaBreakDown);

  const dTfdrLow6 = curr.dTfdrLow6 ?? curr.dTfdrLow5 ?? Math.min(dTfdr, prev.dTfdr);
  const dTfdrHigh6 = curr.dTfdrHigh6 ?? curr.dTfdrHigh3 ?? Math.max(dTfdr, prev.dTfdr);

  const prevWMid50 = prev.wMid50 ?? wMid50 ?? close;
  const touchW =
    wMid50 != null &&
    aboveW50 &&
    (prev.close < prevWMid50 || prev.low <= prevWMid50 * 1.005) &&
    close > prior20Low * 0.995;

  const fullClearLine = Number(Math.max(0.01, Math.min(m50Trend, q50Trend)).toFixed(2));
  const conductionScenario: ConductionScenario = isBullRegime
    ? 'SCENARIO_B_BULL_FLOOR'
    : 'SCENARIO_A_BEAR_CEILING';
  const regime: PuzzleVerdict['regime'] = isBullRegime ? 'BULL' : 'BEAR';

  let signal: PuzzleVerdict['signal'] = 'HOLD';
  let sizeRatio = 0;
  let isPuzzleCross = false;
  let tfdrTurnUp = false;
  let invalidationPrice = fullClearLine;

  if (isBullRegime) {
    // ═══ 上升浪大勢 (只買不空・100% 禁空) ═══
    if (dTfdr >= 88 && dBreakDown && wBreakDown) {
      // 高位止盈：日線 >= 88 極頂奇點 AND 日/週雙平均K跌破前低 → 減倉 40%，留 60% 核心底倉
      signal = 'PARTIAL_PROFIT';
      sizeRatio = 0.40;
    } else if (dTfdr <= 25 && dHaBull && dBreakUp) {
      // 低位扣扳機：日線 TFDR <= 25 (13/23 綠色地板帶) 且日 HA 轉陽升穿前高 → 80% 重倉買入坐貨
      signal = 'GOLDEN_BUY';
      sizeRatio = 0.80;
      isPuzzleCross = true;
      tfdrTurnUp = true;
      invalidationPrice = Number(Math.min(fullClearLine, Math.min(prior20Low, low) * 0.96).toFixed(2));
    } else {
      // 大勢未轉熊 → 死抱核心倉位觀望
      signal = 'HOLD';
      sizeRatio = 0;
    }
  } else {
    // ═══ 下跌浪大勢 (清倉禁買・只空不買) ═══
    if (dTfdr <= 18 && dHaBull && dBreakUp) {
      // 下跌浪極底反彈平空：日線 <= 18 且轉陽升穿 → 100% 平空
      signal = 'COVER_SHORT';
      sizeRatio = 1.0;
    } else if (dTfdr >= 80 && !dHaBull && dBreakDown) {
      // 下跌浪反彈沽空：日線 >= 80 上緣奇點且轉陰跌穿前低 → 開立 35% 輕倉空單
      signal = 'SHORT_ENTRY';
      sizeRatio = 0.35;
    } else {
      // 跌穿且不升穿月/季50中間線 → 立即 100% 清空多單，嚴禁任何做多抄底
      signal = 'FULL_CLEAR';
      sizeRatio = 1.0;
    }
  }

  const regimeBanner = isBullRegime
    ? '穩站月/季50之上・上升浪只買不空'
    : '跌穿月/季50之下・下跌浪禁買只空';
  const haTag = `日HA:${dBreakUp ? '升穿▲' : dBreakDown ? '跌穿▼' : dHaBull ? '陽' : '陰'}/週HA:${wBreakUp ? '升穿▲' : wBreakDown ? '跌穿▼' : curr.wHaBull ? '陽' : '陰'}`;
  const compactHint = `${regimeBanner}｜月50:$${m50Trend.toFixed(2)} 季50:$${q50Trend.toFixed(2)}｜${haTag}｜日TFDR:${dTfdr}`;

  return {
    isPuzzleCross,
    signal,
    conductionScenario,
    reverseToShort: false,
    reverseShortRatio: 0,
    reasons: {
      touchW,
      regimeOK: isBullRegime,
      tfdrTurnUp,
      haTwoUp,
      dBreakUp,
      dBreakDown,
      wBreakUp,
      wBreakDown,
      dTfdrLow6,
      dTfdrHigh6,
      ha5Stand: curr.ha5High == null || close >= curr.ha5High,
      wTfdrUp: curr.wTfdr == null ? true : curr.wTfdr >= (curr.prevWTfdr ?? curr.wTfdr),
      bullShieldActive: isBullRegime,
      belowBoth50: isBearRegime,
      aboveQ50,
      aboveM50,
      aboveW50,
      mqStrongFloor: isBullRegime,
      mqWeakCeiling: isBearRegime,
      haBreakUpMQ: qHaUp || mHaUp || (mHaBull && qHaBull),
      haBreakDownMQ: qHaDown || mHaDown || (!mHaBull && !qHaBull),
      isMonthlyBreakDown: Boolean(curr.isMonthlyBreakDown),
      isMonthlyBreakUp: Boolean(curr.isMonthlyBreakUp),
      justMonthlyBreakDown: Boolean(curr.isMonthlyBreakDown) && !Boolean(prev.isMonthlyBreakDown),
      inDiscountZone: true,
      isBullRegime,
      isBearRegime
    },
    regime,
    sizeRatio,
    invalidationPrice,
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

  const haD: { open: number; close: number; high: number; low: number; isBull: boolean }[] = new Array(n);
  let lastHighIdx = 0;
  let lastLowIdx = 0;
  let prevHighInterval = 14;
  let prevLowInterval = 14;
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
    const dHaHi = Math.max(bar.high, dHaOpen, dHaClose);
    const dHaLo = Math.min(bar.low, dHaOpen, dHaClose);
    const dHaBull = dHaClose > dHaOpen;
    haD[i] = { open: dHaOpen, close: dHaClose, high: dHaHi, low: dHaLo, isBull: dHaBull };

    const dHaBreakUp = i > 0 && dHaHi > haD[i - 1].high && dHaBull;
    const dHaBreakDown = i > 0 && dHaLo < haD[i - 1].low && !dHaBull;

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
    for (let j = Math.max(0, i - 14); j < i; j++) {
      const c = sorted[j].close;
      if (c > maxC) maxC = c;
      if (c < minC) minC = c;
    }
    const band15 = Number((dMidline - dAtr * 3.1).toFixed(2));
    const v1 = i >= 1 ? bar.close - sorted[i - 1].close : 0;
    const v0 = i >= 2 ? sorted[i - 1].close - sorted[i - 2].close : v1;
    const accel = v1 - v0;

    let dTfdrRaw = 50 + ((bar.close - dMidline) / (dAtr * 2.0)) * 20;
    if (i >= 14 && bar.close >= maxC) {
      const interval = Math.max(1, i - lastHighIdx);
      const compression = Math.min(2.5, prevHighInterval / interval);
      if (dTfdrRaw >= 72) {
        dTfdrRaw = Math.max(dTfdrRaw, Math.min(94, 72 + compression * 8.5));
        if (dTfdrRaw >= 84 && compression >= 2.0 && interval <= 4 && accel < 0 && v1 > 0) {
          dTfdrRaw = Math.max(dTfdrRaw, 95);
        }
      }
      prevHighInterval = interval;
      lastHighIdx = i;
    }
    if (i >= 14 && (bar.close <= minC || bar.low <= band15)) {
      const interval = Math.max(1, i - lastLowIdx);
      const compression = Math.min(2.5, prevLowInterval / interval);
      if (dTfdrRaw <= 32 || bar.low <= band15) {
        dTfdrRaw = Math.min(dTfdrRaw, Math.max(2, 28 - compression * 10));
        if ((dTfdrRaw <= 24 || bar.low <= band15) && interval <= 4 && accel > 0 && v1 < 0) {
          dTfdrRaw = Math.min(dTfdrRaw, 12);
        }
      }
      prevLowInterval = interval;
      lastLowIdx = i;
    }
    const dTfdr = Math.max(0, Math.min(100, Math.round(dTfdrRaw)));

    const prevDTfdr = i > 0 ? overlays[i - 1].dTfdr : dTfdr;
    let dTfdrLow3 = dTfdr;
    let dTfdrHigh3 = dTfdr;
    for (let j = Math.max(0, i - 3); j < i; j++) {
      if (overlays[j].dTfdr < dTfdrLow3) dTfdrLow3 = overlays[j].dTfdr;
      if (overlays[j].dTfdr > dTfdrHigh3) dTfdrHigh3 = overlays[j].dTfdr;
    }
    let dTfdrLow5 = dTfdrLow3;
    for (let j = Math.max(0, i - 5); j < Math.max(0, i - 3); j++) {
      if (overlays[j].dTfdr < dTfdrLow5) dTfdrLow5 = overlays[j].dTfdr;
    }
    let dTfdrLow6 = dTfdr;
    let dTfdrHigh6 = dTfdr;
    for (let j = Math.max(0, i - 5); j < i; j++) {
      if (overlays[j].dTfdr < dTfdrLow6) dTfdrLow6 = overlays[j].dTfdr;
      if (overlays[j].dTfdr > dTfdrHigh6) dTfdrHigh6 = overlays[j].dTfdr;
    }

    const ha5Start = Math.max(0, i - 4);
    let ha5Sum = 0;
    for (let j = ha5Start; j <= i; j++) {
      ha5Sum += Math.max(sorted[j].high, haD[j].open, haD[j].close);
    }
    const ha5High = Number((ha5Sum / (i - ha5Start + 1)).toFixed(4));

    const liveQ = getLivePeriodTelemetry(stateQ, false);
    const liveM = getLivePeriodTelemetry(stateM, false);
    const liveW = getLivePeriodTelemetry(stateW, true);
    const qTfdrEffective = stateQ.snapshot.sampleOK ? liveQ.tfdr : null;

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
      dTfdrLow6,
      dTfdrHigh3,
      dTfdrHigh6,
      dHaBull,
      dHaBreakUp,
      dHaBreakDown,
      ha5High,
      prevWTfdr: i > 0 ? overlays[i - 1].wTfdr : stateW.snapshot.prevTfdr,
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
      mTfdr: liveM.tfdr,
      wTfdr: liveW.tfdr,
      qHaBull: liveQ.haBull,
      mHaBull: liveM.haBull,
      wHaBull: liveW.haBull,
      qHaBreakUp: liveQ.haBreakUp,
      qHaBreakDown: liveQ.haBreakDown,
      mHaBreakUp: liveM.haBreakUp,
      mHaBreakDown: liveM.haBreakDown,
      wHaBreakUp: liveW.haBreakUp,
      wHaBreakDown: liveW.haBreakDown,
      isMonthlyBreakDown: liveM.isPeriodHighLowBreakDown,
      isMonthlyBreakUp: liveM.isPeriodHighLowBreakUp,
      currMHaHigh: liveM.currHaHigh,
      currMHaLow: liveM.currHaLow,
      prevMHaHigh: liveM.prevHaHigh,
      prevMHaLow: liveM.prevHaLow,
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
    isLastComplete: boolean,
    isWeekly: boolean
  ): TimeframeFeature => {
    const box = getEffectiveBox50(s);
    const live = getLivePeriodTelemetry(s, isWeekly);
    return {
      bars: s.snapshot.count,
      haBull: live.haBull,
      haHigh: s.snapshot.haHigh,
      prevHaHigh: s.snapshot.prevHaHigh,
      haLow: s.snapshot.haLow,
      prevHaLow: s.snapshot.prevHaLow,
      haBreakUp: live.haBreakUp,
      haBreakDown: live.haBreakDown,
      midline: box.mid50 ?? s.snapshot.midline ?? 0,
      prevMidline: s.snapshot.prevMidline ?? 0,
      high: box.high ?? 0,
      low: box.low ?? 0,
      mid50: box.mid50 ?? 0,
      atr: s.snapshot.atr,
      tfdr: live.tfdr ?? s.snapshot.tfdr ?? 50,
      prevTfdr: s.snapshot.prevTfdr ?? 50,
      rsi: s.snapshot.rsi,
      mom: s.snapshot.mom,
      sampleOK: s.snapshot.sampleOK,
      isLastBarComplete: isLastComplete
    };
  };

  const lastBarMeta = n > 0 ? getCalendarMeta(sorted[n - 1].date) : null;
  const dCurrHaHigh = n > 0 ? haD[n - 1].high : 0;
  const dPrevHaHigh = n > 1 ? haD[n - 2].high : dCurrHaHigh;
  const latestD: TimeframeFeature = {
    bars: n,
    haBull: n > 0 ? haD[n - 1].isBull : false,
    haHigh: Number(dCurrHaHigh.toFixed(2)),
    prevHaHigh: Number(dPrevHaHigh.toFixed(2)),
    haLow: n > 0 ? haD[n - 1].low : 0,
    prevHaLow: n > 1 ? haD[n - 2].low : n > 0 ? haD[0].low : 0,
    haBreakUp: n > 1 && haD[n - 1].high > haD[n - 2].high && haD[n - 1].isBull,
    haBreakDown: n > 1 && haD[n - 1].low < haD[n - 2].low && !haD[n - 1].isBull,
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
    latestQ: toFeature(stateQ, Boolean(lastBarMeta?.isQuarterEnd), false),
    latestM: toFeature(stateM, Boolean(lastBarMeta?.isMonthEnd), false),
    latestW: toFeature(stateW, Boolean(lastBarMeta?.isWeekEnd), true),
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
  const q50Line = currOverlay.qMid ?? qMid50;
  const m50Line = currOverlay.mMid ?? mMid50;
  const qHigh = currOverlay.qHigh ?? currBar.high;
  const qLow = currOverlay.qLow ?? currBar.low;
  const mHigh = currOverlay.mHigh ?? currBar.high;
  const mLow = currOverlay.mLow ?? currBar.low;
  const wHigh = currOverlay.wHigh ?? currBar.high;
  const wLow = currOverlay.wLow ?? currBar.low;

  const isBullRegime = Boolean(verdict.reasons.isBullRegime ?? verdict.regime === 'BULL');
  const isBearRegime = !isBullRegime;
  const trendBannerLabel = isBullRegime
    ? '穩站月/季50之上・上升浪只買不空'
    : '跌穿月/季50之下・下跌浪禁買只空';

  const tol = Math.max(currOverlay.close * 0.005, featD.atr * 0.8);
  const invalidationPrice = verdict.invalidationPrice ?? Number(Math.min(m50Line, q50Line).toFixed(2));

  const buyAnchor = verdict.isPuzzleCross
    ? currOverlay.close
    : isBullRegime
    ? Math.max(m50Line, q50Line * 0.98)
    : currOverlay.close;
  const rawBuyHigh = Math.max(buyAnchor, Math.min(wMid50 * 1.005, currOverlay.close * 1.02));
  const rawBuyLow = isBullRegime
    ? Math.min(rawBuyHigh, Math.max(invalidationPrice, Math.min(wLow, buyAnchor - tol * 0.8)))
    : Math.min(rawBuyHigh, Math.max(0.01, Math.min(wLow, currOverlay.close) - tol * 0.5));
  const buyZone = {
    low: Number(Math.min(rawBuyLow, rawBuyHigh).toFixed(2)),
    high: Number(Math.max(rawBuyLow, rawBuyHigh).toFixed(2))
  };
  const takeProfitAnchor = Math.max(
    currOverlay.close,
    wHigh,
    mHigh,
    featD.tfdr >= 88 ? currOverlay.close : wMid50 + tol * 2.2
  );
  const takeProfitZone = {
    low: Number((takeProfitAnchor - tol * 0.5).toFixed(2)),
    high: Number((takeProfitAnchor + tol * 0.7).toFixed(2))
  };

  const dTfdr = currOverlay.dTfdr;
  const wTfdr = currOverlay.wTfdr ?? featW.tfdr;
  const mTfdr = currOverlay.mTfdr ?? featM.tfdr;
  const qTfdr = currOverlay.qTfdr ?? featQ.tfdr;
  const dTfdrLow6 = currOverlay.dTfdrLow6 ?? dTfdr;
  const dTfdrHigh6 = currOverlay.dTfdrHigh6 ?? dTfdr;
  const dBreakUp = featD.haBreakUp;
  const dBreakDown = featD.haBreakDown;
  const wBreakUp = featW.haBreakUp;
  const wBreakDown = featW.haBreakDown;
  const isMonthlyBreakDown = Boolean(currOverlay.isMonthlyBreakDown);
  const isMonthlyBreakUp = Boolean(currOverlay.isMonthlyBreakUp);
  const inDiscountZone = isBullRegime;
  const monthlyHaStatusLabel = trendBannerLabel;
  const distTo13 = Math.max(0, dTfdr - 13);
  const distTo23 = Math.max(0, dTfdr - 23);
  const distTo85 = Math.max(0, 88 - dTfdr);
  const distTo95 = Math.max(0, 95 - dTfdr);
  const conductionScenario = verdict.conductionScenario;

  const singularityStatus: TimeSpacePrompt['singularityStatus'] =
    dTfdr >= 88 || (isBearRegime && dTfdr >= 80)
      ? 'UPPER_EXPANSION'
      : dTfdr <= 25
      ? 'LOWER_EXPANSION'
      : 'SAFE_MID_ZONE';
  const singularityLabel =
    dTfdr >= 88
      ? `極頂警戒帶 (日TFDR ${dTfdr} ≥ 88)`
      : isBearRegime && dTfdr >= 80
      ? `下跌浪反彈上緣沽空帶 (日TFDR ${dTfdr} ≥ 80)`
      : dTfdr <= 18
      ? `極致地板奇點 (日TFDR ${dTfdr} ≤ 18)`
      : dTfdr <= 25
      ? `13/25 綠色地板觸發帶 (日TFDR ${dTfdr} ≤ 25)`
      : `濾噪區 (日TFDR ${dTfdr} · 距25底+${Math.max(0, dTfdr - 25)} / 距88頂-${distTo85})`;

  const conductionLabel = trendBannerLabel;

  const fmtHaArrow = (lbl: string, f: TimeframeFeature) =>
    f.haBreakUp ? `${lbl}:升穿前高▲` : f.haBreakDown ? `${lbl}:跌穿前低▼` : f.haBull ? `${lbl}:陽` : `${lbl}:陰`;
  const haDirectionSummary = `${fmtHaArrow('日', featD)}｜${fmtHaArrow('週', featW)}｜月50:$${m50Line.toFixed(2)}/季50:$${q50Line.toFixed(2)}`;

  const regimeLabel = trendBannerLabel;

  const actionTitleMap: Record<PuzzleVerdict['signal'], string> = {
    GOLDEN_BUY: '🔥 上升浪低位奇點轉陽・80% 重倉買入坐貨（只買不空）',
    ADD_POSITION: '🟢 上升浪低位加倉坐貨',
    PARTIAL_PROFIT: '🟠 日線≥88極頂＋日週雙HA跌穿・減倉40%（保留60%核心底倉）',
    FULL_CLEAR: '🚨 跌穿月/季50中間線・100%清倉多單並嚴禁做多',
    HALT_REDUCE: '🛑 回撤熔斷控險・減半倉位',
    SHORT_ENTRY: '🟣 下跌浪日線≥80反彈轉陰跌穿・開立35%輕倉空單',
    COVER_SHORT: '💎 日線≤18轉陽升穿或收復50線・100%平空',
    HOLD: isBullRegime
      ? '🛡️ 穩站月/季50之上・死抱核心多單不瞎折騰（100%禁空）'
      : '🚫 跌穿月/季50之下・空倉禁買靜待≥80反彈沽空訊號'
  };

  const timeSpacePrompt: TimeSpacePrompt = {
    triggerDate: currBar.date,
    currentPrice: currOverlay.close,
    qMid50: Number(qMid50.toFixed(2)),
    mMid50: Number(mMid50.toFixed(2)),
    wMid50: Number(wMid50.toFixed(2)),
    q50Line: Number(q50Line.toFixed(2)),
    m50Line: Number(m50Line.toFixed(2)),
    qHigh: Number(qHigh.toFixed(2)),
    qLow: Number(qLow.toFixed(2)),
    mHigh: Number(mHigh.toFixed(2)),
    mLow: Number(mLow.toFixed(2)),
    wHigh: Number(wHigh.toFixed(2)),
    wLow: Number(wLow.toFixed(2)),
    dTfdr,
    wTfdr,
    mTfdr,
    qTfdr,
    dBreakUp,
    dBreakDown,
    wBreakUp,
    wBreakDown,
    dTfdrLow6,
    dTfdrHigh6,
    distTo13,
    distTo23,
    distTo85,
    distTo95,
    isMonthlyBreakDown,
    isMonthlyBreakUp,
    monthlyHaStatusLabel,
    inDiscountZone,
    isBullRegime,
    isBearRegime,
    trendBannerLabel,
    conductionScenario,
    conductionLabel,
    haDirectionSummary,
    singularityStatus,
    singularityLabel,
    regimeLabel,
    actionTitle: actionTitleMap[verdict.signal],
    buyZone,
    takeProfitZone,
    invalidationPrice,
    compactHint: `${trendBannerLabel}｜月50:$${m50Line.toFixed(2)} 季50:$${q50Line.toFixed(2)}｜${haDirectionSummary}｜日TFDR:${dTfdr}`
  };

  const reasons: string[] = [
    `大勢定性：${trendBannerLabel}（現價 $${currOverlay.close} vs 月50 $${m50Line.toFixed(2)} / 季50 $${q50Line.toFixed(2)}）`,
    `日/週平均K破梯：${haDirectionSummary}`,
    `奇點數值：日TFDR ${dTfdr}（近6日區間 ${dTfdrLow6}~${dTfdrHigh6}）`
  ];

  const riskFlags: string[] = [];
  if (isBearRegime) riskFlags.push('跌穿月/季50之下(清倉禁買)');
  if (!featQ.sampleOK) riskFlags.push(`季線累積 ${featQ.bars} 根(<24)`);
  if (!featW.sampleOK) riskFlags.push(`週線累積 ${featW.bars} 根(<20)`);
  if (ker < 0.3) riskFlags.push(`KER(${ker})偏低`);

  if (verdict.signal === 'GOLDEN_BUY') {
    reasons.push(
      `穩站月/季50之上，日線TFDR回調至 ${dTfdr} (≤25) 且日HA轉陽升穿前高，重倉買入 80% 坐貨吃主升浪`
    );
  } else if (verdict.signal === 'PARTIAL_PROFIT') {
    reasons.push(`上升浪日線達 ${dTfdr} (≥88) 且日/週HA雙重跌破前低，減倉 40% 鎖利、保留 60% 核心底倉`);
  } else if (verdict.signal === 'FULL_CLEAR') {
    reasons.push(`價格跌穿月50($${m50Line.toFixed(2)})與季50($${q50Line.toFixed(2)})雙分水嶺，立即 100% 清空多單並嚴禁抄底`);
  } else if (verdict.signal === 'SHORT_ENTRY') {
    reasons.push(`下跌浪反彈日線達 ${dTfdr} (≥80) 且日HA轉陰跌穿前低，開立 35% 輕倉空單`);
  } else if (verdict.signal === 'COVER_SHORT') {
    reasons.push(`日TFDR(${dTfdr})≤18 且日HA升穿前高，空單 100% 平倉`);
  }

  const keyPoints: string[] = [
    trendBannerLabel,
    `${haDirectionSummary}｜日TFDR ${dTfdr}`
  ];

  const signalStrength =
    verdict.signal === 'GOLDEN_BUY'
      ? dTfdr <= 13
        ? 95
        : 88
      : verdict.signal === 'FULL_CLEAR'
      ? 92
      : verdict.signal === 'PARTIAL_PROFIT'
      ? 86
      : verdict.signal === 'SHORT_ENTRY'
      ? 82
      : verdict.signal === 'COVER_SHORT'
      ? 85
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
    shortLock8dActive: isBullRegime,
    reasons,
    keyPoints,
    riskFlags,
    provenance: { computedBy: 'computePuzzleDecision', llmGeneratedNumbers: [] }
  };
}
