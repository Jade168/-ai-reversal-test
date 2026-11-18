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
  prevTfdr?: number;
  rsi: number;
  mom: number;
  sampleOK: boolean;
  isLastBarComplete: boolean;
}

export interface OverlayPoint {
  date: string;
  close: number;
  haOpen: number;
  haClose: number;
  dTfdr: number;
  dTfdrLow3?: number; // 近 3 日含當日之最低日線 TFDR（嚴格向後回望，消除 HA 連兩陽確認延遲）
  // 未完結週期一律為 null，絕不用當季／當月／當週未收盤數據偷看未來
  qMid: number | null;
  mMid: number | null;
  wMid: number | null;
  qTfdr: number | null;
  mTfdr: number | null;
  wTfdr: number | null;
  qPeriodEnd: string | null; // 供 tooltip 標註「截至 2026-Q3」
  mPeriodEnd: string | null;
  wPeriodEnd: string | null;
}

export interface PuzzleVerdict {
  isPuzzleCross: boolean; // 金色交匯圓點（派生計算，不緩存髒數據）
  signal:
    | 'GOLDEN_BUY'
    | 'ADD_POSITION'
    | 'PARTIAL_PROFIT'
    | 'FULL_CLEAR'
    | 'HALT_REDUCE'
    | 'HOLD';
  reasons: { touchW: boolean; regimeOK: boolean; tfdrTurnUp: boolean; haTwoUp: boolean };
  regime: 'BULL' | 'NEUTRAL' | 'BEAR';
  sizeRatio: number; // 0 / 0.3 / 0.6 / 1.0 倉位管理分檔
  invalidationPrice: number | null;
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
  const key = dateStr.slice(0, 10);
  let meta = dateKeyCache.get(key);
  if (meta) return meta;
  const [y, m, d] = key.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const dow = utc.getUTCDay() || 7;
  const mon = new Date(utc);
  mon.setUTCDate(utc.getUTCDate() - dow + 1);
  const next = new Date(Date.UTC(y, m - 1, d + 1));

  meta = {
    y,
    m,
    d,
    dow: utc.getUTCDay(),
    wKey: mon.toISOString().slice(0, 10),
    mKey: `${y}-${String(m).padStart(2, '0')}`,
    qKey: `${y}-Q${Math.floor((m - 1) / 3) + 1}`,
    isWeekEnd: utc.getUTCDay() === 5,
    isMonthEnd: next.getUTCMonth() !== m - 1,
    isQuarterEnd: Math.floor(next.getUTCMonth() / 3) !== Math.floor((m - 1) / 3)
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
  active: (OHLCBar & { key: string }) | null;
  sealedLastKey: string | null;
  snapshot: {
    count: number;
    midline: number | null;
    prevMidline: number | null;
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
  minSampleOK: number
): IncrementalPeriodState {
  return {
    bars: [],
    ha: [],
    midPeriod,
    minCompleteBars,
    minSampleOK,
    active: null,
    sealedLastKey: null,
    snapshot: {
      count: 0,
      midline: null,
      prevMidline: null,
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
  for (let i = midStart; i < compLen; i++) midSum += state.ha[i].close;
  const midlineVal = Number((midSum / Math.max(1, compLen - midStart)).toFixed(2));

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

  state.snapshot = {
    count: compLen,
    midline: hasEnough ? midlineVal : null,
    prevMidline: hasEnough ? prevMidVal : null,
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
  } else {
    state.active.date = bar.date;
    if (bar.high > state.active.high) state.active.high = bar.high;
    if (bar.low < state.active.low) state.active.low = bar.low;
    state.active.close = bar.close;
  }

  if (isExactCalendarEnd && state.sealedLastKey !== state.active.key) {
    sealPeriodBar(state, state.active);
    state.sealedLastKey = state.active.key;
  }
}

/**
 * 純函數：核心拼圖四條硬約束判定（封死半山腰接飛刀）
 */
export function evaluatePuzzleVerdict(
  curr: OverlayPoint,
  prev: OverlayPoint,
  prior20Low: number
): PuzzleVerdict {
  const { close, haOpen, haClose, dTfdr, wMid, mMid, qMid, qTfdr } = curr;

  // 若均線樣本不足（null），嚴格拒絕交易，絕不靜默誤判
  if (wMid == null || mMid == null || !Number.isFinite(wMid) || !Number.isFinite(mMid)) {
    return {
      isPuzzleCross: false,
      signal: 'HOLD',
      reasons: { touchW: false, regimeOK: false, tfdrTurnUp: false, haTwoUp: false },
      regime: 'NEUTRAL',
      sizeRatio: 0,
      invalidationPrice: null
    };
  }

  // 1. 週線生命線 = 雙邊帶扳機（補下界0.92 + 未破前20日最低，徹底封死懸空急跌誤買）
  const touchW = close <= wMid * 1.02 && close >= wMid * 0.92 && close > prior20Low;

  // 2. 月線生命線 = 牛市趨勢過濾；季線動能 = 重倉閘門
  const isBullTrend = close > mMid;
  const isQuarterStrong = qMid != null && qTfdr != null && qTfdr >= 50;
  const regimeOK = isBullTrend;

  // 3. TFDR 明確拐頭向上（當日或近 3 日內曾觸及 <= 25 超賣奇點，且當日明確抬頭且未過熱 <= 58）
  const recentOversold =
    dTfdr <= 25 || prev.dTfdr <= 25 || (curr.dTfdrLow3 != null && curr.dTfdrLow3 <= 25);
  const tfdrTurnUp = recentOversold && dTfdr > prev.dTfdr && dTfdr <= 58;

  // 4. 原生 Heikin-Ashi 連續兩根抬升（過濾單根反抽假陽線）
  const haTwoUp = haClose > haOpen && haClose > prev.haClose && prev.haClose > prev.haOpen;

  const isPuzzleCross = touchW && regimeOK && tfdrTurnUp && haTwoUp;

  // 倉位分檔管理（季線強則60%重倉，否則30%試探倉）
  let signal: PuzzleVerdict['signal'] = 'HOLD';
  let sizeRatio = 0;

  if (isPuzzleCross) {
    signal = isQuarterStrong ? 'GOLDEN_BUY' : 'ADD_POSITION';
    sizeRatio = isQuarterStrong ? 0.6 : 0.3;
  } else if (close < mMid * 0.96) {
    // 跌穿月線生命線4%：大升通道破壞，強制全數清倉保護利潤
    signal = 'FULL_CLEAR';
    sizeRatio = 1.0;
  } else if (dTfdr >= 86 && dTfdr < prev.dTfdr && haClose < haOpen) {
    // 高位奇點拐頭向下 + HA轉陰：分批高拋鎖利
    signal = 'PARTIAL_PROFIT';
    sizeRatio = isQuarterStrong ? 0.35 : 0.65;
  }

  return {
    isPuzzleCross,
    signal,
    reasons: { touchW, regimeOK, tfdrTurnUp, haTwoUp },
    regime: isBullTrend ? 'BULL' : close < mMid * 0.96 ? 'BEAR' : 'NEUTRAL',
    sizeRatio,
    invalidationPrice: Number((mMid * 0.96).toFixed(2))
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
  let isAlreadySorted = true;
  for (let i = 1; i < allDailyBars.length; i++) {
    if (allDailyBars[i - 1].date > allDailyBars[i].date) {
      isAlreadySorted = false;
      break;
    }
  }
  return isAlreadySorted
    ? allDailyBars
    : [...allDailyBars].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * O(N) 單趟無未來函數構建全歷史 OverlayPoint + PuzzleVerdict 時間軸
 * 嚴格保證每一根日線只讀取「已收盤完結」的 W / M / Q 週期生命線（未完結為 null）
 */
export function buildFullPuzzleTimeline(allDailyBars: OHLCBar[]): FullTimelineResult {
  const sorted = normalizeSortedDaily(allDailyBars);
  const n = sorted.length;
  const overlays: OverlayPoint[] = new Array(n);
  const verdicts: PuzzleVerdict[] = new Array(n);
  const prior20Lows: number[] = new Array(n);

  const stateW = createPeriodState(20, 20, 20);
  const stateM = createPeriodState(12, 12, 12);
  // 季線最少 8 根計算基礎數值；若不足 24 根則 sampleOK=false 並降級季線權重（qTfdr=null）
  const stateQ = createPeriodState(8, 8, 24);

  const haD: { open: number; close: number; low: number; isBull: boolean }[] = new Array(n);
  let lastDAtSnapshot = {
    midline: 0,
    prevMidline: 0,
    atr: 0,
    tfdr: 50,
    prevTfdr: 50,
    rsi: 50,
    mom: 50,
    band90: 0,
    band15: 0
  };

  for (let i = 0; i < n; i++) {
    const bar = sorted[i];
    const meta = getCalendarMeta(bar.date);

    // 計算 strictly prior 20-day low（不含當日，防止偷看當日低點）
    let p20Low = i === 0 ? bar.low : Infinity;
    for (let j = Math.max(0, i - 20); j < i; j++) {
      if (sorted[j].low < p20Low) p20Low = sorted[j].low;
    }
    prior20Lows[i] = p20Low;

    // 推進已完結週期（W / M / Q），未完結絕不使用當期盤中數據
    advancePeriodState(stateW, bar, meta.wKey, meta.isWeekEnd);
    advancePeriodState(stateM, bar, meta.mKey, meta.isMonthEnd);
    advancePeriodState(stateQ, bar, meta.qKey, meta.isQuarterEnd);

    // 推進日線 HA 與日線 TFDR
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
    const band90 = Number((dMidline + dAtr * 3.1).toFixed(2));
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

    // 僅若季線樣本 >= 24 根，才輸出完整 qTfdr 參與重倉閘門；不足 24 根降級為 null（強制 30% 試探倉）
    const qTfdrEffective = stateQ.snapshot.sampleOK ? stateQ.snapshot.tfdr : null;

    const point: OverlayPoint = {
      date: bar.date,
      close: Number(bar.close.toFixed(2)),
      haOpen: Number(dHaOpen.toFixed(4)),
      haClose: Number(dHaClose.toFixed(4)),
      dTfdr,
      dTfdrLow3,
      qMid: stateQ.snapshot.midline,
      mMid: stateM.snapshot.midline,
      wMid: stateW.snapshot.midline,
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
        band90,
        band15
      };
    }
  }

  const toFeature = (s: IncrementalPeriodState['snapshot'], isLastComplete: boolean): TimeframeFeature => ({
    bars: s.count,
    haBull: s.haBull,
    haLow: s.haLow,
    prevHaLow: s.prevHaLow,
    midline: s.midline ?? 0,
    prevMidline: s.prevMidline ?? 0,
    atr: s.atr,
    tfdr: s.tfdr ?? 50,
    prevTfdr: s.prevTfdr ?? 50,
    rsi: s.rsi,
    mom: s.mom,
    sampleOK: s.sampleOK,
    isLastBarComplete: isLastComplete
  });

  const lastBarMeta = n > 0 ? getCalendarMeta(sorted[n - 1].date) : null;
  const latestD: TimeframeFeature = {
    bars: n,
    haBull: n > 0 ? haD[n - 1].isBull : false,
    haLow: n > 0 ? haD[n - 1].low : 0,
    prevHaLow: n > 1 ? haD[n - 2].low : n > 0 ? haD[0].low : 0,
    midline: lastDAtSnapshot.midline,
    prevMidline: lastDAtSnapshot.prevMidline,
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
    latestQ: toFeature(stateQ.snapshot, Boolean(lastBarMeta?.isQuarterEnd)),
    latestM: toFeature(stateM.snapshot, Boolean(lastBarMeta?.isMonthEnd)),
    latestW: toFeature(stateW.snapshot, Boolean(lastBarMeta?.isWeekEnd)),
    latestD
  };
}

/**
 * 輸出最近 windowBars 根含已完結季/月/週階梯生命線與原生日 HA / TFDR 的 OverlayPoint 序列（無未來函數）
 */
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
  const currBar = timeline.sorted[n - 1];
  const currOverlay = timeline.overlays[n - 1];
  const verdict = timeline.verdicts[n - 1];
  const featQ = timeline.latestQ;
  const featM = timeline.latestM;
  const featW = timeline.latestW;
  const featD = timeline.latestD;

  const kerSlice = frozen.slice(-15);
  const netChg = Math.abs(kerSlice[kerSlice.length - 1].close - kerSlice[0].close);
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

  const dMom = featD.mom;
  const wMom = featW.mom;
  const mMom = featM.mom;
  const mTag = currOverlay.mMid == null ? '(樣本不足)' : currOverlay.close > currOverlay.mMid ? '(>月中線)' : '(<月中線)';
  const wTag = currOverlay.wMid == null ? '(樣本不足)' : verdict.reasons.touchW ? '(回踩週線帶)' : '(偏離週線)';
  const dTag = dMom <= 24 ? '(下方奇點)' : featD.tfdr >= 86 ? '(高位奇點)' : '(中性)';
  const momSummary = `月動能 ${mMom}${mTag} / 週動能 ${wMom}${wTag} / 日TFDR ${currOverlay.dTfdr}${dTag}`;

  const tol = Math.max(currOverlay.close * 0.005, featD.atr * 0.8);
  const wRef = currOverlay.wMid ?? currOverlay.close;
  const mRef = currOverlay.mMid ?? currOverlay.close;
  const invalidationPrice = verdict.invalidationPrice ?? Number((mRef * 0.96).toFixed(2));

  const buyAnchor = verdict.isPuzzleCross ? currOverlay.close : Math.min(currOverlay.close, wRef);
  const buyZone = {
    low: Number((Math.max(wRef * 0.92, buyAnchor - tol * 0.7)).toFixed(2)),
    high: Number((Math.min(wRef * 1.02, buyAnchor + tol * 0.5)).toFixed(2))
  };
  const takeProfitAnchor = Math.max(currOverlay.close, featD.tfdr >= 86 ? currOverlay.close : wRef + tol * 2);
  const takeProfitZone = {
    low: Number((takeProfitAnchor - tol * 0.6).toFixed(2)),
    high: Number((takeProfitAnchor + tol * 0.6).toFixed(2))
  };

  const reasons: string[] = [momSummary];
  const riskFlags: string[] = [];

  if (!featQ.sampleOK) riskFlags.push(`季線僅 ${featQ.bars} 根(<24)，降級季線權重`);
  if (!featW.sampleOK) riskFlags.push(`週線僅 ${featW.bars} 根(<20)，拒絕交易`);
  if (!featM.sampleOK) riskFlags.push(`月線僅 ${featM.bars} 根(<12)，拒絕交易`);
  if (ker < 0.3) riskFlags.push(`KER(${ker})偏低，處於震盪雜訊期`);

  if (verdict.isPuzzleCross) {
    reasons.push(
      `四重硬約束共振 PUZZLE_CROSS（觸週線雙邊帶$${currOverlay.wMid}＋站穩月中線$${currOverlay.mMid}＋TFDR=${currOverlay.dTfdr}拐頭向上＋原生HA連兩陽），分檔配置 ${Math.round(verdict.sizeRatio * 100)}%`
    );
  } else if (verdict.signal === 'FULL_CLEAR') {
    reasons.push(
      `跌穿已完結月線生命線 4% ($${currOverlay.close} < $${invalidationPrice})，大升通道破壞・全數清倉保護利潤`
    );
  } else if (verdict.signal === 'PARTIAL_PROFIT') {
    reasons.push(
      `高位奇點 TFDR(${currOverlay.dTfdr}>=86) 拐頭向下＋日HA轉陰，分批高拋鎖利 ${Math.round(verdict.sizeRatio * 100)}%`
    );
  } else {
    const missing: string[] = [];
    if (currOverlay.wMid == null || currOverlay.mMid == null) missing.push('週/月生命線樣本累積中');
    else {
      if (!verdict.reasons.touchW) missing.push('未處週線[0.92~1.02]雙邊帶且守前20日低點');
      if (!verdict.reasons.regimeOK) missing.push(`現價未站上已完結月中線$${currOverlay.mMid}`);
      if (!verdict.reasons.tfdrTurnUp) missing.push('TFDR未呈現<=25拐頭向上');
      if (!verdict.reasons.haTwoUp) missing.push('原生HA未連續兩根抬升');
    }
    reasons.push(`嚴格觀望：${missing.join('；')}`);
  }

  const keyPoints: string[] = [
    `動能中軸：${momSummary}`,
    `無未來函數校驗：季(截至 ${currOverlay.qPeriodEnd ?? '累積中'})｜月(截至 ${currOverlay.mPeriodEnd ?? '累積中'})｜週(截至 ${currOverlay.wPeriodEnd ?? '累積中'})`,
    `四條買入硬約束：週線雙邊帶[${verdict.reasons.touchW ? '✅' : '❌'}] / 月牛過濾[${verdict.reasons.regimeOK ? '✅' : '❌'}] / TFDR拐頭[${verdict.reasons.tfdrTurnUp ? '✅' : '❌'}] / HA連兩陽[${verdict.reasons.haTwoUp ? '✅' : '❌'}]`,
    `回撤熔斷紀律：回撤>25%停機並減半控險；須同時滿足回撤<15%＋連續5日不破20日新低＋新PUZZLE_CROSS始30%試探重啟`
  ];

  const signalStrength = verdict.isPuzzleCross
    ? verdict.signal === 'GOLDEN_BUY'
      ? 92
      : 82
    : verdict.signal === 'FULL_CLEAR'
    ? 90
    : verdict.signal === 'PARTIAL_PROFIT'
    ? 80
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
    shortLock8dActive: false,
    reasons,
    keyPoints,
    riskFlags,
    provenance: { computedBy: 'computePuzzleDecision', llmGeneratedNumbers: [] }
  };
}
