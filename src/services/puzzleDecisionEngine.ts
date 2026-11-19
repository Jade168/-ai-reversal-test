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
  ma3?: number | null; // 3 日平均線（收市價 3 日均值）：3MA 探針，買入要站穩中間線之上，逃頂要刺穿 band90 後拐頭
  prevMa3?: number | null; // 上一日 3 日平均線（供 ma3 拐頭向下判斷：ma3 < prevMa3）
  band90?: number | null; // 日線上升最高軌道線（midline + ATR × 3.1）：ma3 向上刺穿此線後拐頭即頂部確認
  midline?: number | null; // 日線中間線（20 日 HA 收市均值／50% 中軸）：買入要 ma3 站穩此線之上
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
  isWeeklyBreakDown?: boolean; // 週線大陰跌穿前兩枝低位（currW.low < prev1W.low && < prev2W.low，且收陰）
  currMHaHigh?: number | null;
  currMHaLow?: number | null;
  prevMHaHigh?: number | null;
  prevMHaLow?: number | null;
  currWHaLow?: number | null;
  prevWHaLow?: number | null;
  prev2WHaLow?: number | null;
  currWeekHigh?: number | null; // 本週週線 HA 最高點（live，未完結週含當日累積；供參考）
  prevWeekHigh?: number | null; // 上週週線 HA 最高點（已完結週；供參考）
  currWeekHighRaw?: number | null; // 本週原始最高價（live，未完結週含當日累積；供週線鎖即時解鎖：升穿上週高即解鎖）
  prevWeekHighRaw?: number | null; // 上週原始最高價（已完結週；供週線鎖即時解鎖）
  wHaBodyDropPct?: number | null; // 本週週線 HA 實體跌幅（% open），收陽時為 0（供週線大陰 (a) 過濾）
  wHaBodyDropAtr?: number | null; // 本週週線 HA 實體跌幅／週線 ATR（供週線大陰 (a) 過濾）
  qPeriodEnd: string | null;
  mPeriodEnd: string | null;
  wPeriodEnd: string | null;
}

export type ConductionScenario =
  | 'SCENARIO_A_BEAR_CEILING'
  | 'SCENARIO_B_BULL_FLOOR'
  | 'TRANSITION';

// 四態大勢分類：S1 主升浪強勢期（季>=60 且 月>=55，雙雙穩站 50 線）／S2 牛市健康洗盤期
// （季>=60 且 月>=48，企穩季 50 線）／S3 牛熊過渡警戒期（季跌落 50–60）／S4 大跌浪防禦期
// （價錢雙雙跌穿月／季 50 線）。季 TFDR 為 null 時（上市未滿 24 季）退化用價位判定。
export type MarketState = 'S1' | 'S2' | 'S3' | 'S4';

/** 四態大勢分類：傳入季／月 TFDR、收市價與季／月 50% 切線，回傳狀態與新買入上限。 */
export function classifyMarketState(
  qTfdr: number | null | undefined,
  mTfdr: number | null | undefined,
  close: number,
  q50Trend: number,
  m50Trend: number
): { state: MarketState; maxBuyRatio: number } {
  const aboveQ50 = close >= q50Trend;
  const aboveM50 = close >= m50Trend;
  // S4 優先：價錢雙雙跌穿月／季 50 線 → 清倉禁買
  if (!aboveQ50 && !aboveM50) return { state: 'S4', maxBuyRatio: 0 };
  const q = qTfdr ?? -1;
  const m = mTfdr ?? -1;
  // 季 TFDR 未累積夠樣本（上市未滿 24 季）→ 退化用價位判定：雙雙站穩 80%，只企穩一條線 30%
  if (qTfdr == null) {
    if (aboveQ50 && aboveM50) return { state: 'S1', maxBuyRatio: 0.8 };
    return { state: 'S3', maxBuyRatio: 0.3 };
  }
  // S1：主升浪強勢期（季>=60 且 月>=55，雙雙穩站 50 線）
  if (q >= 60 && m >= 55 && aboveQ50 && aboveM50) return { state: 'S1', maxBuyRatio: 0.8 };
  // S2：牛市健康洗盤期（季線強勢護航，月線回調至 50 附近洗盤）
  if (q >= 60 && m >= 48 && aboveQ50) return { state: 'S2', maxBuyRatio: 0.8 };
  // S3：牛熊過渡警戒期（季線跌落 50–60）
  if (q >= 50 && q < 60) return { state: 'S3', maxBuyRatio: 0.3 };
  // 其餘（季 < 50 但價錢仍企穩至少一條線；或季 >= 60 但月深回調 < 48）→ 保守試探倉 30%
  return { state: 'S3', maxBuyRatio: 0.3 };
}

export interface PuzzleVerdict {
  isPuzzleCross: boolean;
  signal:
    | 'GOLDEN_BUY'
    | 'BULL_DIP_BUY'
    | 'ADD_POSITION'
    | 'PARTIAL_PROFIT'
    | 'FULL_CLEAR'
    | 'WEEKLY_BREAK_TRIM'
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
  sizeRatio: number; // 0 / 0.35 / 0.45 / 0.8 / 1.0
  invalidationPrice: number | null;
  // 奇點扣扳機價位（只作預警的奇點本身唔會直接觸發交易；以下價位先係扣扳機線）
  singularityLow?: number | null; // 賣出／沽空用：奇點 K 線（及平均K線）最低位，收市跌穿先扣扳機
  singularityHigh?: number | null; // 買入／平空用：奇點 K 線（及平均K線）最高位，收市升穿先扣扳機
  singularityDate?: string | null; // 觸發／武裝中的奇點 K 線日期
  lastSellPrice?: number | null; // 上次高拋成交參考價（收市價；回測會以實際 T 開盤成交價為準），供補回單 96% 折扣驗證
  isBuyback?: boolean; // 本次 GOLDEN_BUY 是否高拋後的補回單
  isStructuralStop?: boolean; // 本次 COVER_SHORT 是否結構止損（收市重返週線／月線 50 中間線），而非奇點買升穿平空
  isLongBullShield?: boolean; // 長牛護盾是否開啟：四態制下只在主升浪（S1）與牛市洗盤（S2）開啟；護盾開啟時回測高拋必須浮盈 >= +8% 先可以執行。規則 A／B 生效期間強制關閉（高位派發期保命優先，破位即減）
  marketState?: MarketState; // 四態大勢：S1 主升浪 / S2 牛市洗盤 / S3 過渡警戒 / S4 大跌浪防禦
  maxBuyRatio?: number; // 該態新買入上限：S1/S2 0.80，S3 0.30，S4 0；規則 A 過熱期壓到 0.20，規則 B 禁買期為 0
  crossedBelowM50?: boolean; // 本日收市首次由上往下跌穿月 50 線（前日收市在線上，本日收市在線下）
  monthlyOverheat?: boolean; // 規則 A：月線過熱降倉鎖是否生效（mTfdr ≥ 85，或曾觸及 ≥ 90 且未釋放到 ≤ 65）
  monthlyTopLock?: boolean; // 規則 B：月線破底禁買鎖是否生效（過熱期月 HA 破底，100% 禁買）
  weeklyBreakLock?: boolean; // 週線突變禁買鎖是否生效（週線大陰跌穿前兩枝低位，100% 禁買）
  isWeeklyBreakClear?: boolean; // 本次 FULL_CLEAR 是否由週線突變觸發（結構突變即離場），而非跌穿月／季 50 線
  isWeeklyBreakTrim?: boolean; // 本次 WEEKLY_BREAK_TRIM 是否由週線突變觸發（S2 減 40%，唔係 100% 全清；S1 零 Trim 死抱，唔減倉）
  isWeeklyReclaimUnlock?: boolean; // 本次週線鎖是否由第二條解鎖路解除（企返 50 線＋月動能回暖，或收市升穿破位週高點）
  buyTier?: 1 | 2 | null; // 分級做 T：本次 GOLDEN_BUY 嘅級別（Tier 1 中線回調買 50%／Tier 2 深回調買 100%），非買入時為 null
  isChaseBuy?: boolean; // 本次 GOLDEN_BUY 是否拋物線逼空追擊買入（48 < dTfdr ≤ 65，三級 HA 齊升，日 HA 轉陽破前高，買 40%）
  isUnlockCapBuy?: boolean; // 本次 GOLDEN_BUY 是否畀週線鎖解鎖限倉壓到 40%（右側確認倉，唔係底部全倉）
  isWeeklyInstantUnlock?: boolean; // 本次 GOLDEN_BUY 是否黃金大底即時解鎖週線鎖（武裝期間 dTfdr ≤ 25＋本週高升穿上週高，當日即解鎖，唔使等星期五收陽）
  isMa3TopExit?: boolean; // 本次 PARTIAL_PROFIT 是否 3MA 觸角逃頂（ma3 刺穿 band90 後拐頭向下）；回測用 +5% 浮盈門檻執行，唔受護盾 +8% 限制
  isBullDipBuy?: boolean; // 本次 BULL_DIP_BUY 是否牛市回踩中線拐頭買入（S1/S2 回踩日線中間線＋ma3 拐頭向上＋dTfdr < 62，補滿 80% 目標倉位，唔使等深跌奇點底）
  traderDirective?: string; // 交易員指令（一行白話：四態通道＋方向＋有效買入上限＋鎖狀態），交易員一睇就知而家係上升定下跌通道、買得幾多、禁做咩，唔會錯沽／錯買
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
    | 'BULL_DIP_BUY'
    | 'ADD_POSITION'
    | 'PARTIAL_PROFIT'
    | 'FULL_CLEAR'
    | 'WEEKLY_BREAK_TRIM'
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
  prev2HaLow: number | null;
  haOpen: number | null;
  haClose: number | null;
  atr: number;
} {
  const snap = state.snapshot;
  const active = state.active;
  if (!active || state.ha.length === 0 || state.sealedLastKey === active.key) {
    const len = state.ha.length;
    const currHa = len > 0 ? state.ha[len - 1] : null;
    const prevHa = len > 1 ? state.ha[len - 2] : null;
    const prev2Ha = len > 2 ? state.ha[len - 3] : null;
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
      prevHaLow: prevHa ? Number(prevHa.low.toFixed(2)) : null,
      prev2HaLow: prev2Ha ? Number(prev2Ha.low.toFixed(2)) : null,
      haOpen: currHa ? Number(currHa.open.toFixed(2)) : null,
      haClose: currHa ? Number(currHa.close.toFixed(2)) : null,
      atr: snap.atr
    };
  }

  const lastSealedHa = state.ha[state.ha.length - 1];
  const prev2SealedHa = state.ha.length > 1 ? state.ha[state.ha.length - 2] : null;
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
    prevHaLow: Number(lastSealedHa.low.toFixed(2)),
    prev2HaLow: prev2SealedHa ? Number(prev2SealedHa.low.toFixed(2)) : null,
    haOpen: Number(liveHaOpen.toFixed(2)),
    haClose: Number(liveHaClose.toFixed(2)),
    atr: snap.atr
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
 * 奇點扣扳機紀律（最純粹實戰標準）：奇點信號只係預警，絕不即日跟單。
 * - 賣出：日 TFDR ≥ 88 觸發上方紅色「奇點沽」預警後，武裝該奇點 K 線最低位；其後收市跌穿先高拋 45%（留 55% 底倉）。
 * - 買入：上升浪內日 TFDR ≤ 25 觸發綠色「奇點買」預警後，武裝該奇點 K 線最高位；其後收市升穿先買入。
 * - 沽空：下跌浪內日 TFDR ≥ 80 觸發「奇點沽」預警後，武裝奇點最低位；收市跌穿先開 35% 輕倉空單。
 * - 平空：下跌浪內日 TFDR ≤ 25 觸發「奇點買」預警後，武裝奇點最高位；收市升穿先全數平空。
 * 扣扳機一律用「收市價」穿破（唔用盤中最低／最高價），避免假突破；同一根 K 線唔可以又武裝又扣扳機，
 * 因為奇點 K 線本身的收市價永遠唔會跌穿自己的最低位／升穿自己的最高位，預警與扣扳機之間至少相隔一日。
 * 奇點簇價位：預警持續期間，「奇點 K 線」指簇內極值 K 線——賣出／沽空取最高價最高的 K 線（與主圖
 * tfdrTurningPoints 取最高 high 的標記一致），其最低位就係扣扳機線；買入／平空取最低價最低的 K 線，
 * 其最高位就係扣扳機線。預警中斷後再出現新預警，視為新一簇奇點，重新記錄。咁樣先食得盡強勢鈍化，
 * 又唔會因為第一日預警的低位太遠而永遠觸發唔到。
 */
export const SINGULARITY_SELL_TFDR = 88;
export const SINGULARITY_BUY_TFDR = 25;
export const SINGULARITY_SHORT_TFDR = 80;
export const SINGULARITY_COVER_TFDR = 25;
export const PARTIAL_PROFIT_RATIO = 0.45; // 高拋鎖利 45%，保留 55% 核心底倉
export const BUYBACK_DISCOUNT = 0.96; // 高拋後補回單：成交價必須低於上次沽價 ×96%（只限同波段 30 個交易日內）
export const LAST_SELL_EXPIRY_BARS = 30; // lastSellPrice 過期：高拋後超過 30 個交易日，96% 折扣錨點作廢，下一輪買入視為全新入場
export const SHORT_COOLDOWN_BARS = 15; // 空單止損平空後 15 個交易日內嚴禁重複開空（防連環止損冷卻）
// ── 月線大頂風控（規則 A＋B）──
export const MONTHLY_OVERHEAT_TFDR = 85; // 規則 A (A1)：月 TFDR ≥ 85 即過熱
export const MONTHLY_TOP_TFDR = 90; // 規則 A (A2)：月 TFDR 曾觸及 ≥ 90（月線奇點沽）
export const MONTHLY_RELEASE_TFDR = 65; // 規則 A 釋放：月 TFDR 回調到 ≤ 65 先解除過熱
export const MONTHLY_TOP_BUY_CAP = 0.2; // 規則 A 過熱期新買入上限 20%（全新買入＋補回單一律適用）
// ── 日線做 T 分級（只限 S1/S2 大升浪）──
export const TIER1_BUY_TFDR = 48; // S1/S2 買入武裝放寬到 dTfdr ≤ 48（涵蓋中線 45–48 回調，避開 50 以上橫行區）
export const TIER1_DEEP_TFDR = 35; // Tier 2 深回調：dTfdr ≤ 35；Tier 1 中線回調：35 < dTfdr ≤ 48
export const TIER1_SIZE_FACTOR = 0.5; // Tier 1 買入正常目標倉位的 50%（細注做 T）；Tier 2 買入 100%
// ── 3MA 探針＋奇點時效窗＋禁追高（放寬版，2026-11-19 下晝定案）──
// 數學死結修正：ma3 ≥ midline 同 dTfdr < 55 互相排斥（等 ma3 爬上滯後嘅 20 日線嗰陣，
// dTfdr 已經衝過 60），令 2019-06-04 真大底畀硬生生擋死（151 次觸發 0 次成功）。
// 新解：ma3 唔使升穿 midline，只要拐頭向上（ma3 > prevMa3）即代表短線動能翻多；
// 禁追高天花板校準到 dTfdr < 62／wTfdr < 68（放行底部拐頭買點，攔截波段頂追高）。
export const NO_CHASE_BUY_DTFDR = 62; // 高位禁追天花板：日線動能 dTfdr ≥ 62，100% 禁止任何追高買入（攔截波段最高點接盤）
export const NO_CHASE_BUY_WTFDR = 68; // 高位禁追天花板：週線動能 wTfdr ≥ 68，100% 禁止任何追高買入
export const NO_CHASE_BUY_DTFDR_S3 = 45; // S3 過渡警戒期（季線 50–60）收緊：日線動能 dTfdr ≥ 45 即禁買（弱勢震盪股唔好半山腰追高）
export const SINGULARITY_BUY_WINDOW_BARS = 7; // 奇點買時效窗：武裝後 1–7 個交易日內先有效，超過 7 日自動過期作廢
export const GOLDEN_BOTTOM_DTFDR = 25; // 黃金大底：買入武裝期間日線動能曾跌到 ≤ 25（深超賣真底部），先有資格即時解鎖週線鎖
export const WEEKLY_BREAK_TRIM_RATIO = 0.4; // 週線突變減倉 40%（S2 牛市洗盤，死守 60% 核心底倉；只有 S4 先 100% 全清；S1 零 Trim 死抱，唔減倉）
export const WEEKLY_BREAK_ARM_DAYS = 2; // 週線突變 2 日確認防抖（週線 HA 週中逐日重算會閃進閃出，連續 2 日都滿足突變條件先確認，過濾假破位）
// ── S1 極限泡沫區逃頂＋牛市回踩中線拐頭上車（讓利潤奔跑，2026-11-19）──
export const S1_BUBBLE_DTFDR = 92; // S1 極限泡沫區：日線動能 dTfdr ≥ 92 先准許 3MA 觸角逃頂減倉（唔係泡沫區，S1 死抱唔賣）
export const S1_BUBBLE_TRIM_RATIO = 0.25; // S1 極限泡沫區逃頂最多減倉 25%（死守 75%–80% 核心底倉吃滿整段魚身）
export const BULL_DIP_MIDLINE_TOLERANCE = 1.02; // 牛市回踩中線：當日低位 ≤ 日線中間線 × 1.02（誤差 ≤ 2%），即回踩到 20 日中線附近
// ── 拋物線逼空主升浪順勢追擊 ──
export const CHASE_BUY_TFDR_LOW = 48; // 追擊區間下限：dTfdr > 48（唔係 Tier 1 回調區）
export const CHASE_BUY_TFDR_HIGH = 65; // 追擊區間上限：dTfdr ≤ 65（中線強勢區）
export const CHASE_BUY_SIZE_RATIO = 0.4; // 逼空追擊建倉 40%（唔使等日線跌到 ≤48 先買）
// ── 週線鎖解鎖限倉 ──
export const WEEKLY_UNLOCK_BUY_CAP = 0.4; // 週線鎖解鎖後第一筆買入上限 40%（右側確認倉：解鎖嗰陣已過最便宜底部，絕不 80% 全倉）

/** 跨交易日保存的奇點武裝狀態：必須由 buildFullPuzzleTimeline 按時間順序逐日傳入同一個 tracker，絕不能逐日重建。 */
export interface SingularityTriggerState {
  sellLow: number | null;
  sellDate: string | null;
  buyHigh: number | null;
  buyDate: string | null;
  shortLow: number | null;
  shortDate: string | null;
  coverHigh: number | null;
  coverDate: string | null;
  lastSellPrice: number | null;
  lastSellIndex: number | null; // 高拋當日的 K 線索引（供 30 個交易日過期判斷）
  shortOpen: boolean; // 時間軸模型中的空單在手狀態（SHORT_ENTRY 設 true，任何 COVER_SHORT／轉回上升浪設 false）
  shortCooldownUntil: number | null; // 嚴禁開空直至該 K 線索引（含）：空單止損平空後設為止損日 + 15
  // 簇內極值 K 線的價位（賣出／沽空：簇內最高 high；買入／平空：簇內最低 low）
  sellBestHigh: number | null;
  buyBestLow: number | null;
  shortBestHigh: number | null;
  coverBestLow: number | null;
  buyArmMinDTfdr: number | null; // 本次買入武裝期間見過的最低日 TFDR（決定分級做 T：≤35 為 Tier 2 全額，35–48 為 Tier 1 半額）
  buyArmIndex: number | null; // 本次買入武裝當日的 K 線索引（供奇點 1–7 日時效窗：觸發必須喺武裝後 1–7 日內，超過 7 日自動過期）
  buyArmDeepOversold: boolean; // 本次買入武裝係黃金大底（武裝期間任何一日 dTfdr 跌到 ≤ 25，深超賣真底部；供週線鎖即時解鎖用）
}

export function createSingularityTriggerState(): SingularityTriggerState {
  return {
    sellLow: null,
    sellDate: null,
    buyHigh: null,
    buyDate: null,
    shortLow: null,
    shortDate: null,
    coverHigh: null,
    coverDate: null,
    lastSellPrice: null,
    lastSellIndex: null,
    shortOpen: false,
    shortCooldownUntil: null,
    sellBestHigh: null,
    buyBestLow: null,
    shortBestHigh: null,
    coverBestLow: null,
    buyArmMinDTfdr: null,
    buyArmIndex: null,
    buyArmDeepOversold: false
  };
}

/**
 * 月線大頂風控狀態（規則 A＋B）：必須由 buildFullPuzzleTimeline 按時間順序逐日傳入同一個 state，絕不能逐日重建。
 * - 規則 A（月線過熱降倉鎖）：mTfdr ≥ 85，或曾觸及 ≥ 90 且之後從未出現真正底部反轉
 *   （月 TFDR 回調到 ≤ 65 且月 HA 正式轉陽唔再破底）→ 新買入上限壓到 20%。
 *   刻意唔設 3 個月到期日：AAPL 2012 證明派發期可以拖 8 個月而唔釋放（2–3 月見頂，9 月買入嗰陣
 *   月 TFDR 最低只係 69）；而單靠 mTfdr ≤ 65 釋放會提前 2–3 日解除警報（10-23 跌到 64，
 *   10-25 月 HA 先破底），令規則 B 永遠觸發唔到。
 * - 規則 B（月線破底禁買鎖）：規則 A 生效期間，月 HA「高不過前高＋低破前低」→ 100% 禁買，直至月 HA
 *   正式走出底部轉陽且唔再破底先解鎖。
 */
export interface MonthlyTopState {
  lastM90Index: number | null; // 上次 mTfdr >= 90 嗰支 bar（規則 A 觸發錨點）
  lastM65Index: number | null; // 上次真正底部反轉嗰支 bar（mTfdr <= 65 且月 HA 轉陽唔破底，規則 A 釋放錨點）
  topLock: boolean; // 規則 B 100% 禁買鎖是否生效中
}

export function createMonthlyTopState(): MonthlyTopState {
  return { lastM90Index: null, lastM65Index: null, topLock: false };
}

/**
 * 週線突變狀態（Rule 1＋2：週線大陰跌穿前兩枝禁買鎖＋結構突變即離場）。
 * - 觸發（(a)+(b) 雙重過濾，缺一不可）：週線平均K線收陰且最低點直接跌穿前面兩枝週線低位
 *   （currW.low < prev1W.low && currW.low < prev2W.low，AAPL 2012-10 見頂嗰枝大陰燭），
 *   且 (a) 真大陰燭：本週週線 HA 實體跌幅 > 1.2 倍週線 ATR 或 >= 3.5%，
 *   且 (b) 高位見頂背景：月線過熱（規則 A）生效中，或過去 4 週內週線 TFDR 曾觸及 >= 75。
 *   牛市正常洗盤細陰燭（2012-04-16）會被 (a) 過濾，上升途中普通震盪會被 (b) 過濾。
 * - 生效期間：100% 禁止一切做多買入與補回單（maxBuyRatio=0）；觸發當日強制清倉離場（signal=FULL_CLEAR）。
 * - 解鎖：週線平均K線重新轉陽且最高點升穿上一枝週線高位（wHaBreakUp）。
 * - 解鎖限倉 40%（右側確認紀律）：解鎖嗰刻價錢已經離開最恐慌地板價（AAPL 2012-06 解鎖嗰陣
 *   $16.8，地板 $15.3），錯過咗最便宜嘅「黃金第一買點」，所以解鎖後第一筆買入（GOLDEN_BUY／
 *   逼空追擊）倉位上限強制鎖定 40%，絕不給 80% 全倉；該筆買入訊號發出後解除限倉，後續再回踩
 *   出現新低位奇點且大勢 S1/S2 先按規則逐步加注（unlockCapActive）。
 */
export interface WeeklyBreakState {
  breakLock: boolean; // 週線突變禁買鎖是否生效中
  lastW75Index: number | null; // 上次 wTfdr >= 75 嗰支 bar（(b) 高位背景錨點：過去 4 週 ≈ 20 交易日內曾觸及）
  unlockCapActive: boolean; // 週線鎖剛解鎖：下一筆買入限倉 40%（右側確認倉，唔係底部全倉）；買入訊號發出後解除
  pendingBreakDays: number; // 週線突變連續確認日數（2 日確認防抖：連續 2 日都滿足突變條件先確認，過濾週中閃進閃出假破位）
  originalWeeklyHigh: number | null; // 破位嗰週嘅原始週高點（解鎖第二條路參考：收市升穿佢即代表結構修復；解鎖後清除）
}

export function createWeeklyBreakState(): WeeklyBreakState {
  return { breakLock: false, lastW75Index: null, unlockCapActive: false, pendingBreakDays: 0, originalWeeklyHigh: null };
}

/** 奇點 K 線（及平均K線）最低位 = 原 K 線 low 與平均K線 open/close 三者最低。 */
function haLowOf(curr: OverlayPoint): number {
  return Math.min(curr.low, curr.haOpen, curr.haClose);
}

/** 奇點 K 線（及平均K線）最高位 = 原 K 線 high 與平均K線 open/close 三者最高。 */
function haHighOf(curr: OverlayPoint): number {
  return Math.max(curr.high, curr.haOpen, curr.haClose);
}

/**
 * 純順勢月/季 50 中間線分水嶺決策引擎：
 * - 上升浪大勢 (isBullRegime): price >= mMid50 || price >= qMid50（以月/季50生命中軸為準，早期樣本未滿則回退箱體50%）
 *   → 100% 禁空只買：日 TFDR <= 25 觸發「奇點買」預警後武裝奇點最高位，收市升穿先 80% 重倉買入坐貨；
 *     日 TFDR >= 88 觸發「奇點沽」預警後武裝奇點最低位，收市跌穿先減倉 45%（留55%底倉）。
 *     高拋後的補回單另須週線未穿 50 中位（收市 ≥ wMid50）且成交價低於上次沽價 ×96%。
 *     lastSellPrice 設有 30 個交易日過期：高拋後超過 30 日未補回，折扣錨點作廢，下一輪買入視為全新入場；
 *     股價跌穿月/季 50 轉熊時亦會即時清除 lastSellPrice，重返 50 線之上即全新一輪。
 * - 下跌浪大勢 (isBearRegime): price < mMid50 && price < qMid50
 *   → 清倉禁買只空：立即清倉多單；日 TFDR >= 80 觸發「奇點沽」預警後武裝奇點最低位，收市跌穿先開立 35% 輕倉空單；
 *     日 TFDR <= 25 觸發「奇點買」預警後武裝奇點最高位，收市升穿先 100% 平空。
 *     空單取消 -8% 硬止損，改為結構止損：收市重返週線／月線 50 中間線之上即平空止損，止損後 15 個交易日內嚴禁重複開空。
 * 注意：本函數係有狀態的——tracker 必須跨日共用。直接呼叫而不傳 tracker 時會用全新狀態，當日只會武裝、唔會扣扳機。
 */
export function evaluatePuzzleVerdict(
  curr: OverlayPoint,
  prev: OverlayPoint,
  prior20Low: number,
  tracker?: SingularityTriggerState,
  barIndex?: number,
  monthlyTop?: MonthlyTopState,
  weeklyBreak?: WeeklyBreakState
): PuzzleVerdict {
  const idx = barIndex ?? -1; // K 線索引：buildFullPuzzleTimeline 傳入；唔傳時（-1）30 日過期與 15 日冷卻無法計算，一律沿用舊有保守行為
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
  // 奇點扣扳機狀態（由 buildFullPuzzleTimeline 逐日傳入共用 tracker；唔傳 tracker 時用全新狀態，
  // 當日只能武裝、唔會扣扳機）。放喺呢度（鎖評估之前），因為週線鎖即時解鎖要讀 trigger.buyHigh／
  // buyArmDeepOversold；原本放喺牛市分支之前，嗰陣鎖已經計完，讀唔到。
  const trigger = tracker ?? createSingularityTriggerState();
  // 四態大勢分類（季 60／月 55／月 48 門檻；季 TFDR 為 null 時退化用價位判定）。
  // 門檻經真實數據校準：AAPL 慢牛股季線強勢中樞約 58，設 65 會卡死八年零交易，設 60 先入到 S1/S2；
  // 季線跌落 50–60（NVDA 2026-10-28 季 62）即入 S3 試探倉 30%，封死假反彈重倉。
  const { state: marketState, maxBuyRatio: stateMaxBuyRatio } = classifyMarketState(
    curr.qTfdr,
    curr.mTfdr,
    close,
    q50Trend,
    m50Trend
  );
  // ── 月線大頂風控（規則 A＋B）──
  // 規則 A（月線過熱降倉鎖）：(A1) 當前 mTfdr ≥ 85；或 (A2) 月 TFDR 曾觸及 ≥ 90，之後從未出現
  //   真正底部反轉（月 TFDR 回調到 ≤ 65 且月 HA 正式轉陽唔再破底）釋放。刻意唔設 3 個月到期日：
  //   AAPL 2012 證明派發期可以拖 8 個月而唔釋放（2–3 月見頂，9 月買入嗰陣月 TFDR 最低只係 69），
  //   而單靠 mTfdr ≤ 65 釋放會提前 2–3 日解除警報（10-23 跌到 64，10-25 月 HA 先破底），令規則 B
  //   永遠觸發唔到。mTfdr 為 null 時唔更新錨點。
  const topState = monthlyTop ?? createMonthlyTopState();
  const mTfdrNow = curr.mTfdr;
  if (mTfdrNow != null && idx >= 0) {
    if (mTfdrNow >= MONTHLY_TOP_TFDR) topState.lastM90Index = idx;
    // 釋放錨點：只在真正底部反轉嗰陣更新——月 TFDR 回調到 ≤ 65 之餘，月 HA 亦要正式轉陽且唔再破底。
    // 單靠 mTfdr ≤ 65 會提前釋放（AAPL 2012：10-23 跌到 64 釋放，10-25 月 HA 先破底，規則 B
    // 永遠觸發唔到，11 月重倉 80% 接飛刀）。呢個修法確保規則 A 喺破底嗰陣仍然生效，規則 B 先捉到。
    if (mTfdrNow <= MONTHLY_RELEASE_TFDR && curr.mHaBull && !curr.mHaBreakDown) {
      topState.lastM65Index = idx;
    }
  }
  const monthlyOverheat =
    (mTfdrNow != null && mTfdrNow >= MONTHLY_OVERHEAT_TFDR) ||
    (topState.lastM90Index != null &&
      (topState.lastM65Index == null || topState.lastM65Index < topState.lastM90Index));
  // 規則 B（月線破底禁買鎖）：月 HA「高不過前高＋低破前低」本身就係大頂確認（Peter 核心教導），
  //   但只在月線曾經見頂（mTfdr 曾觸及 ≥ 90，lastM90Index 錨點）嘅背景下先生效，避免喺從未見頂
  //   嘅橫行市過度禁買。唔要求規則 A 當刻生效——因為月 TFDR 回調到 ≤ 65（規則 A 釋放）同月 HA
  //   破底（確認見頂）可以相差幾日（AAPL 2012：10-19 跌到 63 釋放，10-25 月 HA 先破底），
  //   若要求規則 A 生效，規則 B 永遠觸發唔到，11 月重倉 80% 接飛刀。見頂錨點喺完全復甦嗰陣
  //   清除（解鎖嗰陣月 TFDR 已回升到 ≥ 65），否則會永久保留，令規則 B 喺往後每一次月 HA 破底
  //   都觸發（NVDA 實測：回報由 +988% 跌到 +70%）。喺 S4（價跌穿雙 50 線）嗰陣 maxBuyRatio
  //   本來就係 0，規則 B 觸發亦無影響。一經觸發即鎖定，唔會因條件消失而自動解除。
  //   解鎖要等月 HA 正式走出底部轉陽且唔再破底。用 if / else if：觸發日唔評估解鎖，避免同一日
  //   又觸發又解鎖（月 HA 轉陽但低位仍穿前低嘅「走低高收」燭）。
  if (curr.isMonthlyBreakDown && topState.lastM90Index != null) {
    topState.topLock = true;
  } else if (topState.topLock && curr.mHaBull && !curr.mHaBreakDown) {
    topState.topLock = false;
    // 完全復甦（月 HA 轉陽且月 TFDR 已回升到 ≥ 65）：清除見頂錨點，之前嘅見頂警戒解除。
    // 若月 TFDR 仲係 < 65，錨點保留，之後再破底仍會觸發規則 B。
    if (mTfdrNow != null && mTfdrNow >= MONTHLY_RELEASE_TFDR) {
      topState.lastM90Index = null;
      topState.lastM65Index = null;
    }
  }
  const monthlyTopLock = topState.topLock;
  // 週線突變禁買鎖（Rule 1，(a)+(b) 雙重過濾）：必須同時滿足三個條件先觸發——
  //   (基礎結構) 週線平均K線收陰且最低點直接跌穿前面兩枝週線低位（AAPL 2012-10 見頂嗰枝大陰燭）；
  //   (a) 真大陰燭：本週週線 HA 實體跌幅 > 1.2 倍週線 ATR，或實體跌幅 >= 3.5%（過濾牛市正常洗盤細陰燭）；
  //   (b) 高位見頂背景：月線過熱（規則 A）生效中，或過去 4 週（20 交易日）內週線 TFDR 曾觸及 >= 75
  //   （確認係高位見頂破位，唔係上升途中普通震盪）。三者缺一都唔觸發。
  //   生效期間 100% 禁止一切做多買入與補回單（maxBuyRatio=0），徹底過濾下跌浪中所有日線假底反彈陷阱。
  //   解鎖：(a) 週線平均K線重新轉陽且最高點升穿上一枝週線高位（wHaBreakUp，等星期五收陽）；
  //   (b) 即時解鎖（黃金大底＋本週原始高升穿上週原始高，見下文獨立條件，當日即解鎖）；
  //   (c) 第二條解鎖路（企返 50 線＋月動能回暖，或收市升穿破位週高點，見下文獨立條件）。
  //   用 if / else if：觸發日唔評估解鎖。justTriggered 供結構突變即離場（Rule 2）用。
  const wbState = weeklyBreak ?? createWeeklyBreakState();
  // 本日是否黃金大底即時解鎖週線鎖（喺下文即時解鎖條件入面設定，供 compactHint 同 verdict 用）
  let isWeeklyInstantUnlock = false;
  // 本日是否由第二條解鎖路解除週線鎖（企返 50 線＋月動能回暖，或收市升穿破位週高點）
  let isWeeklyReclaimUnlock = false;
  if (curr.wTfdr != null && curr.wTfdr >= 75 && idx >= 0) {
    wbState.lastW75Index = idx;
  }
  const w75Recent =
    (idx >= 0 && wbState.lastW75Index != null && idx - wbState.lastW75Index <= 20) ||
    (curr.wTfdr != null && curr.wTfdr >= 75);
  const weeklyBigBear = (curr.wHaBodyDropAtr ?? 0) > 1.2 || (curr.wHaBodyDropPct ?? 0) >= 3.5;
  const weeklyHighTop = monthlyOverheat || w75Recent;
  const weeklyBreakTriggered = Boolean(curr.isWeeklyBreakDown) && weeklyBigBear && weeklyHighTop;
  // 2 日確認防抖：週線 HA 週中逐日重算會閃進閃出（週四未成立、週五成立），必須連續 2 日都滿足
  // 突變條件先確認，過濾假破位。唔滿足嗰日即刻清零，唔可以隔日累積。
  if (weeklyBreakTriggered) {
    wbState.pendingBreakDays += 1;
  } else {
    wbState.pendingBreakDays = 0;
  }
  const weeklyBreakConfirmed = wbState.pendingBreakDays >= WEEKLY_BREAK_ARM_DAYS;
  let weeklyBreakJustTriggered = false;
  if (weeklyBreakConfirmed) {
    if (!wbState.breakLock) {
      weeklyBreakJustTriggered = true;
      // 記錄破位嗰週嘅原始週高點（解鎖第二條路參考：收市升穿佢即代表結構修復）
      wbState.originalWeeklyHigh = curr.currWeekHighRaw ?? null;
    }
    wbState.breakLock = true;
  } else if (wbState.breakLock && curr.wHaBreakUp) {
    wbState.breakLock = false;
    wbState.originalWeeklyHigh = null;
    // 解鎖限倉 40%：鎖定解除嗰刻，價錢已經離開最恐慌地板（右側確認起漲段），錯過咗最便宜嘅
    // 「黃金第一買點」，所以下一筆買入限倉 40%，絕不給 80% 全倉；該筆買入訊號發出後解除限倉。
    wbState.unlockCapActive = true;
  }
  // 週線鎖即時解鎖（黃金大底＋本週原始高升穿上週原始高）：鎖定期間，若存在深超賣黃金底武裝
  // （武裝期間 dTfdr 曾 ≤ 25）且本週原始最高價已升穿上週原始最高價，當日即解除週線鎖，
  // 唔使等星期五週線收陽。注意：呢度只解鎖，唔直接買入；買入仍然要等 GOLDEN_BUY 扣扳機
  // （收市升穿奇點高＋三重門）。用原始高而唔用 HA 高：HA 高點會畀平均K線平滑墊高，突破比
  // 原始價滯後 2 日（2019-06-04 案例：原始週高 06-05 已經升穿，HA 週高要等到 06-07，
  // 嗰陣 dTfdr 已經 64，畀禁追高擋死）。大熊市週高不斷下移嗰陣 currWeekHighRaw 永遠唔會
  // 升穿 prevWeekHighRaw，假底繼續被擋。解鎖後第一筆買入同樣限倉 40%（unlockCapActive）。
  if (
    wbState.breakLock &&
    !weeklyBreakJustTriggered &&
    trigger.buyHigh != null &&
    trigger.buyArmDeepOversold &&
    curr.currWeekHighRaw != null &&
    curr.prevWeekHighRaw != null &&
    curr.currWeekHighRaw > curr.prevWeekHighRaw
  ) {
    wbState.breakLock = false;
    wbState.originalWeeklyHigh = null;
    wbState.unlockCapActive = true;
    isWeeklyInstantUnlock = true;
  }
  // 週線鎖解鎖第二條路（企返 50 線＋月動能回暖，或收市升穿破位週高點）：舊版只有 wHaBreakUp
  // （等星期五收陽）同即時解鎖（黃金大底＋週高升穿）兩條路，喺 00700 呢類長期箱體震盪股上
  // 根本觸發唔到，減倉出嚟嘅 40% 現金一路凍結、回補率接近 0%。而家加多條路：價錢重新企穩
  // 季／月 50 線之上且月 TFDR 回暖（>= 48），或收市升穿破位嗰週嘅原始高點，即代表結構已修復，
  // 解除禁買鎖（保留解鎖限倉保護）。觸發日唔評估（唔可以即日解返）。S4 大跌浪價錢喺雙 50 線
  // 之下，企返 50 線條件唔成立，鎖繼續生效，唔會喺真跌浪誤解鎖。
  if (wbState.breakLock && !weeklyBreakJustTriggered) {
    const unlockByNewHigh =
      wbState.originalWeeklyHigh != null && close > wbState.originalWeeklyHigh;
    const unlockByReclaim =
      qMid50 != null &&
      mMid50 != null &&
      close > qMid50 &&
      close > mMid50 &&
      curr.mTfdr != null &&
      curr.mTfdr >= 48;
    if (unlockByNewHigh || unlockByReclaim) {
      wbState.breakLock = false;
      wbState.originalWeeklyHigh = null;
      wbState.unlockCapActive = true;
      isWeeklyReclaimUnlock = true;
    }
  }
  const weeklyBreakLock = wbState.breakLock;
  // 規則 A 壓上限到 20%（全新買入＋補回單一律適用）；規則 B／週線突變鎖 100% 禁買（上限 0）。
  // 回測分支 F 已用 verdict.maxBuyRatio 設上限（maxBuyRatio 0 ⇒ 0 股 ⇒ 唔成交），所以引擎呢度改就夠，唔使改回測。
  const maxBuyRatio = monthlyTopLock || weeklyBreakLock
    ? 0
    : monthlyOverheat
    ? Math.min(stateMaxBuyRatio, MONTHLY_TOP_BUY_CAP)
    : stateMaxBuyRatio;
  // 月 50 線首次穿越：前日收市在線上、本日收市跌穿線下（只在穿越瞬間成立一次，下一日
  // 前日收市已在線下即不再觸發）。供狀態③減半倉分支用。
  const prevM50Trend = prev.mMid ?? prev.mMid50 ?? m50Trend;
  const crossedBelowM50 = prev.close >= prevM50Trend && close < m50Trend;
  // 長牛護盾（四態制）：只在主升浪（S1）與牛市洗盤（S2）開啟。規則 A／B 生效期間強制關閉
  // （高位派發期保命優先，破位即減，唔等 +8% 盈利）。護盾開啟時，回測高拋必須滿足
  // 浮盈 >= +8%（todayOpen >= avgCost * 1.08）先可以執行；未達標跳過本次減倉（奇點武裝已由引擎
  // 喺 PARTIAL_PROFIT 觸發時清除，等下一個奇點頂再評估）。狀態③過渡期保命優先，破位即減倉，
  // 唔等盈利。TFDR 未累積夠樣本時為 null，退化分類已處理。
  const isLongBullShield = (marketState === 'S1' || marketState === 'S2') && !monthlyOverheat && !monthlyTopLock && !weeklyBreakLock;

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
  // 三級平均K線同時向上梯級（季／月／週皆陽且週線唔破底）：強勢大升浪確認，供 Tier 1 同逼空追擊買入共用。
  const haStaircaseUp = qHaBull && mHaBull && Boolean(curr.wHaBull) && !wBreakDown;

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

  // 本日扣扳機時記錄的已觸發價位（供 verdict 回傳；未觸發時回傳現正武裝中的價位）
  let firedSellLow: number | null = null;
  let firedBuyHigh: number | null = null;
  let firedShortLow: number | null = null;
  let firedCoverHigh: number | null = null;
  let firedSellDate: string | null = null;
  let firedBuyDate: string | null = null;
  let firedShortDate: string | null = null;
  let firedCoverDate: string | null = null;
  let buybackRefPrice: number | null = null;
  let isBuybackTrade = false;
  let isStructuralStop = false;
  let buyTier: 1 | 2 | null = null; // 分級做 T：本次 GOLDEN_BUY 嘅級別（Tier 1 買 50%／Tier 2 買 100%）
  let isMa3TopExit = false; // 本次 PARTIAL_PROFIT 是否 3MA 觸角逃頂（ma3 刺穿 band90 後拐頭向下）
  let isBullDipBuy = false; // 本次 BULL_DIP_BUY 是否牛市回踩中線拐頭買入（S1/S2 回踩日線中間線＋ma3 拐頭向上＋dTfdr < 62）

  if (isBullRegime) {
    // 轉回上升浪：清除下跌浪的沽空武裝；多單的 lastSellPrice 保留作補回折扣參考
    trigger.shortLow = null;
    trigger.shortDate = null;
    trigger.shortBestHigh = null;
    trigger.coverHigh = null;
    trigger.coverDate = null;
    trigger.coverBestLow = null;
    // 重返上升浪即平空止損：當時有空單在手，回測會喺下一開盤平空；此後 15 個交易日內嚴禁重複開空（防震盪連環止損）
    if (trigger.shortOpen) {
      trigger.shortOpen = false;
      if (idx >= 0) trigger.shortCooldownUntil = idx + SHORT_COOLDOWN_BARS;
    }
    // lastSellPrice 30 個交易日過期：同波段高拋低吸窗口已過，折扣錨點作廢，下一輪買入視為全新入場
    if (
      trigger.lastSellPrice != null &&
      trigger.lastSellIndex != null &&
      idx >= 0 &&
      idx - trigger.lastSellIndex > LAST_SELL_EXPIRY_BARS
    ) {
      trigger.lastSellPrice = null;
      trigger.lastSellIndex = null;
    }
    // 奇點買 1–7 日時效窗過期：買入武裝超過 7 個交易日未觸發，自動作廢清除，絕不追買過期信號。
    // （觸發當日嘅時效檢查喺買入扣扳機入面；呢度處理收市未升穿觸發價、武裝一直掛住嘅情況。）
    if (
      trigger.buyHigh != null &&
      trigger.buyArmIndex != null &&
      idx >= 0 &&
      idx - trigger.buyArmIndex > SINGULARITY_BUY_WINDOW_BARS
    ) {
      trigger.buyHigh = null;
      trigger.buyDate = null;
      trigger.buyBestLow = null;
      trigger.buyArmMinDTfdr = null;
      trigger.buyArmIndex = null;
      trigger.buyArmDeepOversold = false;
    }

    // (1) 先檢查賣出扣扳機：收市跌穿早前已武裝的奇點最低位。
    //     必須用武裝前的價位檢查，唔可以用本日新低即時拉低佢，否則永遠觸發唔到。
    if (trigger.sellLow != null && close < trigger.sellLow) {
      firedSellLow = trigger.sellLow;
      firedSellDate = trigger.sellDate;
      trigger.lastSellPrice = close;
      trigger.lastSellIndex = idx >= 0 ? idx : null;
      buybackRefPrice = close;
      trigger.sellLow = null;
      trigger.sellDate = null;
      trigger.sellBestHigh = null;
      signal = 'PARTIAL_PROFIT';
      sizeRatio = PARTIAL_PROFIT_RATIO;
    } else if (
      // (1b) 3MA 觸角極限逃頂：3 日平均線向上刺穿日線上升最高軌道線（band90）之後開始拐頭向下
      //     （ma3 < prevMa3），即頂部確認，立刻高拋鎖利 45% 留 55% 底倉。唔使等奇點沽武裝
      //     （dTfdr ≥ 88）先賣，賣喺最頂尖區域。浮盈門檻（todayOpen ≥ avgCost × 1.05）由回測
      //     分支 E 檢查（isMa3TopExit），引擎呢度只認技術形態。觸發後同樣設定 lastSellPrice，
      //     等日後回調出現新買入武裝先可以補回；同時清除奇點沽武裝（本波段已高拋一次，唔重複減倉）。
      //     S1 最強主升浪例外（讓利潤奔跑）：只有喺極限泡沫區（dTfdr ≥ 92）先准許逃頂，
      //     而且最多減倉 25%（死守 75%–80% 核心底倉），唔係泡沫區 S1 死抱唔賣。
      curr.ma3 != null &&
      curr.prevMa3 != null &&
      curr.band90 != null &&
      curr.ma3 > curr.band90 &&
      curr.ma3 < curr.prevMa3 &&
      (marketState !== 'S1' || dTfdr >= S1_BUBBLE_DTFDR)
    ) {
      isMa3TopExit = true;
      trigger.lastSellPrice = close;
      trigger.lastSellIndex = idx >= 0 ? idx : null;
      buybackRefPrice = close;
      trigger.sellLow = null;
      trigger.sellDate = null;
      trigger.sellBestHigh = null;
      signal = 'PARTIAL_PROFIT';
      sizeRatio = marketState === 'S1' ? S1_BUBBLE_TRIM_RATIO : PARTIAL_PROFIT_RATIO;
    } else if (trigger.buyHigh != null && close > trigger.buyHigh) {
      // (2) 再檢查買入扣扳機：收市升穿早前已武裝的奇點最高位
      firedBuyHigh = trigger.buyHigh;
      firedBuyDate = trigger.buyDate;
      const isBuyback = trigger.lastSellPrice != null;
      const weeklyNotBroken = wMid50 == null ? true : close >= wMid50;
      const discountOk =
        !isBuyback ||
        trigger.lastSellPrice == null ||
        close < trigger.lastSellPrice * BUYBACK_DISCOUNT;
      // 精準買入三重門（放寬版：ma3 拐頭向上＋禁追高 62/68＋7 日窗），全新買入同補回單一律適用：
      //   (a) 時效窗：武裝後 1–7 日內先有效（buyArmIndex 有記錄時先檢查；直接呼叫無 tracker 嗰陣
      //       唔檢查，等同舊行為）。超過 7 日：清除武裝，絕不追買過期信號。
      //   (b) 高位禁追：dTfdr ≥ 62 或 wTfdr ≥ 68，100% 禁止追高買入（攔截波段最高點接盤單，
      //       如 AAPL $331、TSLA $461、NVDA $229 類型）；S3 過渡警戒期收緊到 dTfdr ≥ 45。
      //   (c) 3MA 拐頭向上：ma3 ≤ prevMa3（3 日線仲跌緊／橫行）堅決唔買；ma3 > prevMa3 先代表
      //       短線動能翻多。唔再要求 ma3 ≥ midline——底部反轉嗰陣 20 日線本身就係滯後阻力線，
      //       等 ma3 爬上中線嗰陣 dTfdr 早已衝過天花板（數學死結，見 AAPL 2019-06-04）。
      //   (b)(c) 擋住嗰陣保留武裝（唔清除），等時效窗內回調到合適位置再觸發；(a) 過期先清除。
      const buyAge =
        trigger.buyArmIndex != null && idx >= 0 ? idx - trigger.buyArmIndex : null;
      const buyWindowExpired = buyAge != null && buyAge > SINGULARITY_BUY_WINDOW_BARS;
      const buyTooYoung = buyAge != null && buyAge < 1;
      // S3 過渡期日線天花板收緊到 45（弱勢震盪唔追高）；其餘狀態用 62
      const chaseDTfdrCeiling =
        marketState === 'S3' ? NO_CHASE_BUY_DTFDR_S3 : NO_CHASE_BUY_DTFDR;
      const buyChasingHigh =
        dTfdr >= chaseDTfdrCeiling ||
        (curr.wTfdr != null && curr.wTfdr >= NO_CHASE_BUY_WTFDR);
      const buyMa3NotTurningUp =
        curr.ma3 != null && curr.prevMa3 != null && curr.ma3 <= curr.prevMa3;
      if (buyWindowExpired || buyTooYoung) {
        // 時效窗過期：清除武裝，絕不追買過期信號
        trigger.buyHigh = null;
        trigger.buyDate = null;
        trigger.buyBestLow = null;
        trigger.buyArmMinDTfdr = null;
        trigger.buyArmIndex = null;
        trigger.buyArmDeepOversold = false;
        signal = 'HOLD';
        sizeRatio = 0;
      } else if (buyChasingHigh || buyMa3NotTurningUp) {
        // 高位禁追／3MA 未拐頭向上：堅決唔買，保留武裝等時效窗內回調再觸發
        signal = 'HOLD';
        sizeRatio = 0;
      } else if (!isBuyback || (weeklyNotBroken && discountOk)) {
        isBuybackTrade = isBuyback;
        buybackRefPrice = trigger.lastSellPrice;
        signal = 'GOLDEN_BUY';
        // 買入倉位跟四態大勢上限（已扣減規則 A 20%／規則 B 0 上限）：S1/S2 重倉 80%，S3 試探倉 30%
        // （回測再以 maxBuyRatio 設上限作雙重保障）。分級做 T（只限 S1/S2）：武裝期間最低日 TFDR
        // 喺 35–48（Tier 1 中線健康回調）買入正常目標嘅 50% 細注；≤ 35（Tier 2 深回調黃金坑）
        // 買入 100% 全額。S3 維持原有門檻與 30% 上限，唔分級。武裝期間最低 dTfdr 未記錄時（直接呼叫
        // 而無共用 tracker），預設 Tier 2 全額，等同舊有行為。
        let buySizeRatio = maxBuyRatio;
        if (marketState === 'S1' || marketState === 'S2') {
          const armMin = trigger.buyArmMinDTfdr;
          if (armMin != null && armMin > TIER1_DEEP_TFDR) {
            buyTier = 1;
            buySizeRatio = maxBuyRatio * TIER1_SIZE_FACTOR;
          } else {
            buyTier = 2;
          }
        }
        sizeRatio = buySizeRatio;
        isPuzzleCross = true;
        tfdrTurnUp = true;
        invalidationPrice = Number(Math.min(fullClearLine, Math.min(prior20Low, low) * 0.96).toFixed(2));
        // 武裝清除：只有喺買入可以執行（maxBuyRatio > 0）嗰陣先清除；若畀鎖擋住（maxBuyRatio == 0，
        // 例如週線鎖未解），保留武裝等解鎖後再觸發，唔好浪費黃金底訊號（2019-06-04 案例：06-04
        // GOLDEN_BUY 觸發但週線鎖未解，武裝保留，06-05 原始週高升穿即解鎖，06-05 再觸發買入）。
        // 同理，補回單嘅 lastSellPrice 亦只有喺可以執行嗰陣先清除，唔係買回折扣參考會無端端消失。
        if (maxBuyRatio > 0) {
          trigger.buyHigh = null;
          trigger.buyDate = null;
          trigger.buyBestLow = null;
          trigger.buyArmMinDTfdr = null;
          trigger.buyArmIndex = null;
          trigger.buyArmDeepOversold = false;
          // 補回單已成交（以收市價作參考），清除 lastSellPrice，下一輪高拋先會重新設定
          if (isBuyback) {
            trigger.lastSellPrice = null;
            trigger.lastSellIndex = null;
          }
        }
      } else {
        // 高拋補回條件未滿足（週線穿 50 或未平過上次沽價 96%）：堅決唔買，保留武裝等下一個交易日
        signal = 'HOLD';
        sizeRatio = 0;
      }
    } else if (
      // (2b) 牛市回踩中線拐頭上車（讓利潤奔跑：S1/S2 唔再死等一年先出現一次嘅深跌奇點底）：
      //     大勢 S1/S2（價錢穩站季／月 50 線之上），且未觸發規則 A 月線過熱、規則 B 月線破底鎖、
      //     週線突變鎖（maxBuyRatio > 0 已涵蓋規則 B／週線鎖；規則 A 只壓上限到 20%，要額外排除）。
      //     當日低位回踩到日線中間線（20 日線）附近（low ≤ midline × 1.02），且 ma3 拐頭向上
      //     （ma3 > prevMa3，短線動能翻多），且 dTfdr < 62（唔追高），即直接買入補滿到四態上限
      //     （S1/S2 80%）。回測分支 F 用總淨值計倉位補差額；已有倉在手時受「順勢加倉唔攤平」
      //     規管（開盤價要高過平均成本先補），唔會喺跌勢中加倉接飛刀。唔碰奇點武裝狀態，
      //     奇點買武裝照常保留，等升穿奇點高再觸發 GOLDEN_BUY。
      (marketState === 'S1' || marketState === 'S2') &&
      !monthlyOverheat &&
      maxBuyRatio > 0 &&
      curr.midline != null &&
      low <= curr.midline * BULL_DIP_MIDLINE_TOLERANCE &&
      curr.ma3 != null &&
      curr.prevMa3 != null &&
      curr.ma3 > curr.prevMa3 &&
      dTfdr < NO_CHASE_BUY_DTFDR
    ) {
      isBullDipBuy = true;
      signal = 'BULL_DIP_BUY';
      sizeRatio = maxBuyRatio;
      isPuzzleCross = true;
      tfdrTurnUp = true;
      invalidationPrice = Number(Math.min(fullClearLine, Math.min(prior20Low, low) * 0.96).toFixed(2));
    } else {
      // (3) 無扣扳機：只做預警武裝／更新奇點簇極值 K 線（賣出：簇內最高 high 的 K 線；買入：簇內最低 low 的 K 線）
      if (dTfdr >= SINGULARITY_SELL_TFDR) {
        if (trigger.sellLow == null || curr.high > (trigger.sellBestHigh ?? -Infinity)) {
          trigger.sellLow = haLowOf(curr);
          trigger.sellBestHigh = curr.high;
          trigger.sellDate = curr.date;
        }
      }
      // 買入武裝：Tier 1 中線回調（35–48）只限真正強勢大升浪（季 TFDR ≥ 60 且月 TFDR ≥ 60），
      // 涵蓋中線 45–48 附近回調，但唔碰 50 以上橫行區；月線動能 < 60（弱勢震盪期，如 00700）
      // 只做 dTfdr ≤ 35 深回調，唔做中線高頻 T；S3/S4 維持原有 ≤ 25。
      // 橫行區（無奇點預警、無明確拐點）唔武裝，唔做 T。武裝期間追蹤最低 dTfdr，決定觸發時 Tier。
      // S1/S2 本身已要求季 ≥ 60，呢度再加月 ≥ 60 作雙重確認；季 TFDR 為 null（退化分類）時視為唔強勢，只做深回調。
      // 大升浪順勢上車（Rule 3）：除咗 TFDR 強勢，季／月／週平均K線同時處於向上梯級
      //   （三者皆陽且週線唔破底）亦視為強勢大升浪，准許 Tier 1 中線買入，唔再死等幾乎唔出現嘅 ≤ 25
      //   深跌極底，完整吃下級級上升主升浪（AAPL 2012-01 至 04：$12.40 一路漲到 $19.62 單邊逼空，日線根本冇跌到 ≤ 25）。
      const isStrongUptrend =
        (marketState === 'S1' || marketState === 'S2') &&
        (((curr.qTfdr ?? -1) >= 60 && (curr.mTfdr ?? -1) >= 60) || haStaircaseUp);
      const buyArmThreshold = isStrongUptrend
        ? TIER1_BUY_TFDR
        : marketState === 'S1' || marketState === 'S2'
        ? TIER1_DEEP_TFDR
        : SINGULARITY_BUY_TFDR;
      if (dTfdr <= buyArmThreshold) {
        if (trigger.buyArmMinDTfdr == null || dTfdr < trigger.buyArmMinDTfdr) {
          trigger.buyArmMinDTfdr = dTfdr;
        }
        if (trigger.buyHigh == null || curr.low < (trigger.buyBestLow ?? Infinity)) {
          trigger.buyHigh = haHighOf(curr);
          trigger.buyBestLow = curr.low;
          trigger.buyDate = curr.date;
          trigger.buyArmIndex = idx >= 0 ? idx : null;
        }
        // 黃金大底標記：武裝期間任何一日 dTfdr 跌到 ≤ 25（深超賣），即係真正底部，唔係普通回調；
        // 一經標記即保留到武裝清除（供週線鎖即時解鎖用：只有黃金大底先可以本週高升穿上週高即日解鎖）
        if (dTfdr <= GOLDEN_BOTTOM_DTFDR) {
          trigger.buyArmDeepOversold = true;
        }
      }
      signal = 'HOLD';
      sizeRatio = 0;
    }
  } else {
    // ═══ 下跌浪大勢 (清倉禁買・只空不買) ═══
    // 轉入下跌浪：清除上升浪的武裝；全數清倉後補回折扣不再適用。
    // 呢個清除同時就係「重返 50 線重置」：股價跌穿月/季 50 線嗰一刻錨點已經清零，日後重新升穿並站穩 50 線之上，買入即全新一輪，唔受舊沽價限制。
    trigger.sellLow = null;
    trigger.sellDate = null;
    trigger.sellBestHigh = null;
    trigger.buyHigh = null;
    trigger.buyDate = null;
    trigger.buyBestLow = null;
    trigger.buyArmMinDTfdr = null;
    trigger.buyArmIndex = null;
    trigger.buyArmDeepOversold = false;
    trigger.lastSellPrice = null;
    trigger.lastSellIndex = null;

    // (1) 先檢查平空扣扳機：收市升穿早前已武裝的奇點最高位
    if (trigger.coverHigh != null && close > trigger.coverHigh) {
      firedCoverHigh = trigger.coverHigh;
      firedCoverDate = trigger.coverDate;
      trigger.coverHigh = null;
      trigger.coverDate = null;
      trigger.coverBestLow = null;
      trigger.shortOpen = false;
      signal = 'COVER_SHORT';
      sizeRatio = 1.0;
    } else if (
      trigger.shortOpen &&
      ((wMid50 != null && close >= wMid50) || (mMid50 != null && close >= mMid50))
    ) {
      // (1b) 結構止損平空：收市重返週線／月線 50 中間線之上，下跌浪論述失效（取代舊 -8% 硬止損，避免震盪洗盤掃損）
      isStructuralStop = true;
      trigger.shortOpen = false;
      if (idx >= 0) trigger.shortCooldownUntil = idx + SHORT_COOLDOWN_BARS;
      trigger.shortLow = null;
      trigger.shortDate = null;
      trigger.shortBestHigh = null;
      trigger.coverHigh = null;
      trigger.coverDate = null;
      trigger.coverBestLow = null;
      signal = 'COVER_SHORT';
      sizeRatio = 1.0;
    } else if (
      trigger.shortLow != null &&
      close < trigger.shortLow &&
      (trigger.shortCooldownUntil == null || idx < 0 || idx > trigger.shortCooldownUntil)
    ) {
      // (2) 再檢查沽空扣扳機：收市跌穿早前已武裝的奇點最低位；止損冷卻期內嚴禁重複開空
      firedShortLow = trigger.shortLow;
      firedShortDate = trigger.shortDate;
      trigger.shortLow = null;
      trigger.shortDate = null;
      trigger.shortBestHigh = null;
      trigger.shortOpen = true;
      signal = 'SHORT_ENTRY';
      sizeRatio = 0.35;
    } else {
      // (3) 無扣扳機：只做預警武裝／更新奇點簇極值 K 線（沽空：簇內最高 high 的 K 線；平空：簇內最低 low 的 K 線）；其餘時間立即 100% 清空多單，嚴禁抄底
      if (dTfdr >= SINGULARITY_SHORT_TFDR) {
        if (trigger.shortLow == null || curr.high > (trigger.shortBestHigh ?? -Infinity)) {
          trigger.shortLow = haLowOf(curr);
          trigger.shortBestHigh = curr.high;
          trigger.shortDate = curr.date;
        }
      }
      if (dTfdr <= SINGULARITY_COVER_TFDR) {
        if (trigger.coverHigh == null || curr.low < (trigger.coverBestLow ?? Infinity)) {
          trigger.coverHigh = haHighOf(curr);
          trigger.coverBestLow = curr.low;
          trigger.coverDate = curr.date;
        }
      }
      signal = 'FULL_CLEAR';
      sizeRatio = 1.0;
    }
  }

  // 拋物線逼空主升浪順勢追擊：超級逼空行情（季／月／週三級 HA 全陽梯級向上，未觸發規則 A/B
  //   與週線突變鎖）入面，日線連 48 都跌唔到，死等 ≤48 只會完全踏空（AAPL 2012-01 至 04：
  //   $12.40 一路漲到 $19.62，日線根本冇跌到 ≤48）。所以當日線喺 48 < dTfdr ≤ 65 中線強勢區
  //   出現日線 HA 轉陽（前日陰→今日陽）並升穿前一日高點（close > prev.high），即允許 40% 順勢追擊建倉。
  //   只在無其他訊號（signal 仍係 HOLD）嗰陣觸發，唔會覆寫 PARTIAL／FULL_CLEAR／SHORT。
  //   唔經奇點武裝（唔使等 ≤25／≤48 預警），所以 buyTier 為 null、isBuyback 為 false。
  //   結構突變即離場（下文）優先級更高：若同日週線突變觸發，FULL_CLEAR 會覆寫呢個追擊買入。
  let isChaseBuy = false;
  // 逼空追擊同樣受放寬版三重門規管：dTfdr < 62（S3 收緊到 < 45）／wTfdr < 68／ma3 拐頭向上。
  // S3 過渡期追擊區 48–65 全部高過 45 天花板，即係 S3 唔做逼空追擊（弱勢過渡唔追高）。
  const chaseDTfdrCeiling =
    marketState === 'S3' ? NO_CHASE_BUY_DTFDR_S3 : NO_CHASE_BUY_DTFDR;
  if (
    signal === 'HOLD' &&
    !monthlyOverheat &&
    !monthlyTopLock &&
    !weeklyBreakLock &&
    haStaircaseUp &&
    dTfdr > CHASE_BUY_TFDR_LOW &&
    dTfdr <= CHASE_BUY_TFDR_HIGH &&
    // 高位禁追同樣適用於逼空追擊：dTfdr ≥ 天花板或 wTfdr ≥ 68 一律唔追（追擊區間實際收窄到 48–62）；
    // 3MA 拐頭向上同樣適用：ma3 ≤ prevMa3（仲跌緊）唔追
    dTfdr < chaseDTfdrCeiling &&
    (curr.wTfdr == null || curr.wTfdr < NO_CHASE_BUY_WTFDR) &&
    (curr.ma3 == null || curr.prevMa3 == null || curr.ma3 > curr.prevMa3) &&
    dHaBull &&
    !prev.dHaBull &&
    close > prev.high
  ) {
    signal = 'GOLDEN_BUY';
    sizeRatio = CHASE_BUY_SIZE_RATIO;
    isChaseBuy = true;
  }

  // 週線鎖解鎖限倉 40%（右側確認紀律）：週線鎖剛解鎖嗰陣，價錢已經離開最恐慌地板價（右側確認
  //   起漲段），錯過咗最便宜嘅「黃金第一買點」，所以解鎖後第一筆買入（GOLDEN_BUY／逼空追擊）
  //   倉位上限強制鎖定 40%，絕不給 80% 全倉。限倉只對第一筆買入生效：訊號發出後即解除，
  //   後續再回踩出現新低位奇點且大勢 S1/S2 先按規則逐步加注。限倉同四態上限／規則 A 20% 上限
  //   取最小值（S3 30% 仍然較細，唔受影響）；Tier 1（50%）本身已係 40%，限倉唔會再壓細佢。
  //   結構突變即離場（下文）優先級更高：若同日週線突變觸發，FULL_CLEAR 會覆寫呢個買入，限倉唔消耗。
  let isUnlockCapBuy = false;
  if (signal === 'GOLDEN_BUY' && wbState.unlockCapActive) {
    if (sizeRatio > WEEKLY_UNLOCK_BUY_CAP) {
      sizeRatio = WEEKLY_UNLOCK_BUY_CAP;
      isUnlockCapBuy = true;
    }
    // 限倉只對第一筆買入生效：無論今次買入係咪畀限倉壓細，訊號發出即解除（回測若因 canAct／
    // entryLocked 擋走執行，引擎唔知情，下一筆買入會恢復正常倉位——呢個係引擎預先算 verdict 嘅固有限制）。
    wbState.unlockCapActive = false;
  }

  // 結構突變即離場（Rule 2）：週線大陰跌穿前兩枝低位嗰日（經 2 日確認防抖），唔問盈虧、唔看護盾，
  //   第一時間離場，唔等跌穿月／季 50 線先割肉（AAPL 2012-10 見頂第一時間逃頂，唔拖到 2013-01）。
  //   權限拆分＋按大勢分級（讓利潤奔跑）：只有真正跌穿月／季 50 線（S4 大跌浪）先 FULL_CLEAR 100% 全清；
  //   S2 牛市洗盤減 40%（死守 60% 底倉）；S1 最強主升浪零 Trim 死抱（完全唔減倉，唔好喺主升浪
  //   中途站畀週線小波動震落車）；S3 過渡警戒期完全唔觸發 TRIM（避免同「跌穿月 50 減半」雙重疊加
  //   砍倉，鎖仍然生效禁買，減倉由 S3 減半機制 E2 處理）。S1/S3 唔減倉唔代表唔設防：週線鎖仍然
  //   生效禁買（maxBuyRatio=0），解鎖要靠第二條路（企返 50 線＋月動能回暖／升穿破位週高）。
  //   只在鎖定由 false→true 嘅觸發日覆寫一次；鎖定持續期間其後嗰啲日只係 HOLD（maxBuyRatio=0 禁買），
  //   唔重複發離場訊號。回測分支 D／D2 會按 isWeeklyBreakClear／isWeeklyBreakTrim 改寫 log 原因。
  //   TRIM 同 PARTIAL_PROFIT 一樣設定 lastSellPrice（減倉價），日後回調可補回。
  let isWeeklyBreakClear = false;
  let isWeeklyBreakTrim = false;
  if (weeklyBreakJustTriggered) {
    if (marketState === 'S4') {
      signal = 'FULL_CLEAR';
      sizeRatio = 1.0;
      isWeeklyBreakClear = true;
    } else if (marketState === 'S3' || marketState === 'S1') {
      // S1 零 Trim 死抱／S3 唔觸發 TRIM（唔覆寫 signal，唔設 lastSellPrice）；鎖仍然生效
      // （maxBuyRatio=0 禁買）。S1 唔減倉：主升浪中途嘅週線小波動唔值得交籌碼；
      // S3 減倉由首次跌穿月 50 減半機制（回測分支 E2）處理，避免雙重砍倉。
    } else {
      signal = 'WEEKLY_BREAK_TRIM';
      sizeRatio = WEEKLY_BREAK_TRIM_RATIO;
      isWeeklyBreakTrim = true;
      trigger.lastSellPrice = close;
      trigger.lastSellIndex = idx >= 0 ? idx : null;
    }
  }

  // 交易員指令（一行白話，唔使交易員自己由數字推斷通道）：引擎已經計好四態通道（S1/S2 上升、
  //   S3 過渡、S4 下跌）＋有效買入上限（maxBuyRatio，已扣減規則 A 20%／規則 B 0／週線鎖 0）
  //   ＋鎖狀態，組合成一句指令，交易員一睇就知而家係咩通道、買得幾多、禁做咩，唔會錯沽／錯買。
  //   舊版只講二元「穩站月/季50之上・上升浪只買不空」／「跌穿月/季50之下・下跌浪禁買只空」，
  //   S1/S2/S3 睇落一模一樣，交易員分唔到主升浪（上限 80%）同過渡警戒（上限 30%），
  //   見到 PARTIAL_PROFIT「減倉45%」又以為見頂清晒倉——而家通道＋上限＋鎖一次過講清楚。
  //   呢句同時係 compactHint 嘅開頭（交易紀錄 puzzleHint）同專家「大勢定性」行（trendBannerLabel），
  //   兩邊同一個來源，唔會打架。
  const channelLabel =
    marketState === 'S1'
      ? '🟢 上升通道・主升浪'
      : marketState === 'S2'
      ? '🟢 上升通道・牛市洗盤'
      : marketState === 'S3'
      ? '🟡 過渡通道・警戒'
      : '🔴 下跌通道・大跌浪';
  const directionLabel =
    marketState === 'S4'
      ? '禁買，防守為主'
      : marketState === 'S3'
      ? '小倉試探，禁重倉'
      : '只做多，禁沽空';
  const capLabel =
    maxBuyRatio <= 0 ? '買入上限 0%・禁買' : `買入上限 ${Math.round(maxBuyRatio * 100)}%`;
  const lockLabel = monthlyTopLock
    ? '｜月線大頂鎖'
    : weeklyBreakLock
    ? '｜週線突變鎖'
    : monthlyOverheat
    ? '｜月線過熱'
    : '';
  const traderDirective = `${channelLabel}｜${directionLabel}｜${capLabel}${lockLabel}`;
  const haTag = `日HA:${dBreakUp ? '升穿▲' : dBreakDown ? '跌穿▼' : dHaBull ? '陽' : '陰'}/週HA:${wBreakUp ? '升穿▲' : wBreakDown ? '跌穿▼' : curr.wHaBull ? '陽' : '陰'}`;
  let compactHint = `${traderDirective}｜四態:${marketState}｜月50:$${m50Trend.toFixed(2)} 季50:$${q50Trend.toFixed(2)}｜${haTag}｜日TFDR:${dTfdr}`;
  if (weeklyBreakLock) {
    compactHint += `｜週線突變禁買鎖`;
  } else if (monthlyTopLock) {
    compactHint += `｜月線破底禁買鎖`;
  } else if (monthlyOverheat) {
    compactHint += `｜月線過熱・買入上限20%`;
  }
  if (isWeeklyBreakClear) {
    compactHint += `｜週線大陰跌穿前兩枝・結構突變清倉`;
  }
  if (isWeeklyBreakTrim) {
    compactHint += `｜週線大陰跌穿前兩枝・減倉${Math.round(sizeRatio * 100)}%留${100 - Math.round(sizeRatio * 100)}%底倉`;
  }
  if (signal === 'GOLDEN_BUY' && buyTier != null) {
    compactHint += buyTier === 1 ? `｜分級做T Tier1 50%` : `｜分級做T Tier2 100%`;
  }
  if (isChaseBuy) {
    compactHint += `｜逼空追擊買40%`;
  }
  if (isUnlockCapBuy) {
    compactHint += `｜解鎖限倉40%`;
  }
  if (isWeeklyInstantUnlock) {
    compactHint += `｜黃金大底即時解鎖週線鎖（本週高升穿上週高）`;
  }
  if (isWeeklyReclaimUnlock) {
    compactHint += `｜企返50線＋月動能回暖解鎖週線鎖`;
  }
  if (isMa3TopExit) {
    compactHint += `｜3MA刺穿band90拐頭・逃頂高拋${Math.round(sizeRatio * 100)}%${marketState === 'S1' ? '（S1極限泡沫區）' : ''}`;
  }
  if (isBullDipBuy) {
    compactHint += `｜牛市回踩中線拐頭・補滿${Math.round(sizeRatio * 100)}%`;
  }

  // 在 compactHint 標註本日扣扳機價位／現正武裝中的奇點價位，方便回測 log 與 UI 對數
  const armedLow = firedSellLow ?? firedShortLow ?? trigger.sellLow ?? trigger.shortLow;
  const armedHigh = firedBuyHigh ?? firedCoverHigh ?? trigger.buyHigh ?? trigger.coverHigh;
  if (signal === 'PARTIAL_PROFIT' && firedSellLow != null) {
    compactHint += `｜跌穿奇點低 $${firedSellLow.toFixed(2)}・高拋45%`;
  } else if (signal === 'GOLDEN_BUY' && firedBuyHigh != null) {
    compactHint += `｜升穿奇點高 $${firedBuyHigh.toFixed(2)}${isBuybackTrade ? '・補回單' : ''}`;
  } else if (signal === 'SHORT_ENTRY' && firedShortLow != null) {
    compactHint += `｜跌穿奇點低 $${firedShortLow.toFixed(2)}・沽空35%`;
  } else if (signal === 'COVER_SHORT' && isStructuralStop) {
    compactHint += `｜重返週線／月線50・結構止損平空`;
  } else if (signal === 'COVER_SHORT' && firedCoverHigh != null) {
    compactHint += `｜升穿奇點高 $${firedCoverHigh.toFixed(2)}・平空`;
  } else if (armedLow != null && isBullRegime) {
    compactHint += `｜奇點沽已預警・跌穿 $${armedLow.toFixed(2)} 才賣`;
  } else if (armedHigh != null && isBullRegime) {
    compactHint += `｜奇點買已預警・升穿 $${armedHigh.toFixed(2)} 才買`;
  } else if (armedLow != null && isBearRegime) {
    compactHint += `｜奇點沽已預警・跌穿 $${armedLow.toFixed(2)} 才沽空`;
  } else if (armedHigh != null && isBearRegime) {
    compactHint += `｜奇點買已預警・升穿 $${armedHigh.toFixed(2)} 才平空`;
  }

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
    singularityLow: firedSellLow ?? firedShortLow ?? trigger.sellLow ?? trigger.shortLow ?? null,
    singularityHigh: firedBuyHigh ?? firedCoverHigh ?? trigger.buyHigh ?? trigger.coverHigh ?? null,
    singularityDate:
      firedSellDate ??
      firedBuyDate ??
      firedShortDate ??
      firedCoverDate ??
      trigger.sellDate ??
      trigger.buyDate ??
      trigger.shortDate ??
      trigger.coverDate ??
      null,
    lastSellPrice: buybackRefPrice ?? trigger.lastSellPrice ?? null,
    isBuyback: isBuybackTrade,
    isStructuralStop,
    isLongBullShield,
    marketState,
    maxBuyRatio,
    crossedBelowM50,
    monthlyOverheat,
    monthlyTopLock,
    weeklyBreakLock,
    isWeeklyBreakClear,
    isWeeklyBreakTrim,
    isBullDipBuy,
    traderDirective,
    buyTier,
    isChaseBuy,
    isUnlockCapBuy,
    isWeeklyInstantUnlock,
    isWeeklyReclaimUnlock,
    isMa3TopExit,
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
  // 奇點扣扳機狀態：全條時間軸共用同一個 tracker，按時間順序逐日推進（預警武裝 → 其後交易日收市穿破先扣扳機）。
  // 絕對唔可以每日起一個新 tracker，否則武裝永遠等唔到扣扳機。
  const singularityTracker = createSingularityTriggerState();
  // 月線大頂風控狀態（規則 A＋B）：同樣全條時間軸共用同一個 state，逐日推進（曾觸及 90 嘅錨點要跨日保留）。
  const monthlyTopState = createMonthlyTopState();
  // 週線突變狀態（Rule 1＋2）：同樣全條時間軸共用同一個 state，逐日推進（禁買鎖要跨日保留，直到週線轉陽破高先解鎖）。
  const weeklyBreakState = createWeeklyBreakState();
  let lastHighIdx = 0;
  let lastLowIdx = 0;
  let prevHighInterval = 14;
  let prevLowInterval = 14;
  // 原始週高追蹤（ISO 週，星期一為首日）：供週線鎖即時解鎖用（本週原始高升穿上週原始高）。
  // HA 高點會畀平均K線平滑墊高，突破比原始價滯後 2 日（2019-06-04 案例：HA 週高 06-07 先升穿，
  // 原始週高 06-05 已經升穿，差 2 日，追唔到黃金底）。所以即時解鎖用原始高，唔用 HA 高。
  let currWKey: string | null = null;
  let currWeekHighRaw: number | null = null;
  let prevWeekHighRaw: number | null = null;
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

    // 原始週高追蹤：新一週開始嗰陣，上週高點封存為 prevWeekHighRaw，本週高點由當日 high 重新起計
    if (meta.wKey !== currWKey) {
      prevWeekHighRaw = currWeekHighRaw;
      currWKey = meta.wKey;
      currWeekHighRaw = bar.high;
    } else if (currWeekHighRaw == null || bar.high > currWeekHighRaw) {
      currWeekHighRaw = bar.high;
    }

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
    const band90 = Number((dMidline + dAtr * 3.1).toFixed(2)); // 日線上升最高軌道線：3MA 刺穿此線後拐頭即頂部確認（3MA 觸角逃頂）
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

    // 3 日平均線（3MA 探針）：收市價 3 日均值。買入要 ma3 站穩中間線之上；逃頂要 ma3 刺穿 band90 後拐頭向下。
    // 未滿 3 支 K 線時為 null，買入／逃頂條件退化為唔檢查（等同舊行為）。
    const ma3 =
      i >= 2
        ? Number(((sorted[i].close + sorted[i - 1].close + sorted[i - 2].close) / 3).toFixed(2))
        : null;
    const prevMa3 =
      i >= 3
        ? Number(
            ((sorted[i - 1].close + sorted[i - 2].close + sorted[i - 3].close) / 3).toFixed(2)
          )
        : null;

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
      ma3,
      prevMa3,
      band90,
      midline: dMidline,
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
      isWeeklyBreakDown:
        !liveW.haBull &&
        liveW.currHaLow != null &&
        liveW.prevHaLow != null &&
        liveW.prev2HaLow != null &&
        liveW.currHaLow < liveW.prevHaLow &&
        liveW.currHaLow < liveW.prev2HaLow,
      currMHaHigh: liveM.currHaHigh,
      currMHaLow: liveM.currHaLow,
      prevMHaHigh: liveM.prevHaHigh,
      prevMHaLow: liveM.prevHaLow,
      currWHaLow: liveW.currHaLow,
      prevWHaLow: liveW.prevHaLow,
      prev2WHaLow: liveW.prev2HaLow,
      currWeekHigh: liveW.currHaHigh,
      prevWeekHigh: liveW.prevHaHigh,
      currWeekHighRaw,
      prevWeekHighRaw,
      // 週線 HA 實體跌幅（只計收陰嗰陣；收陽為 0）。(a) 真大陰過濾：實體跌幅 > 1.2 倍週線 ATR，或 >= 3.5%。
      wHaBodyDropPct:
        !liveW.haBull && liveW.haOpen != null && liveW.haClose != null && liveW.haOpen > 0
          ? Number((((liveW.haOpen - liveW.haClose) / liveW.haOpen) * 100).toFixed(2))
          : 0,
      wHaBodyDropAtr:
        !liveW.haBull && liveW.haOpen != null && liveW.haClose != null && liveW.atr > 0
          ? Number(((liveW.haOpen - liveW.haClose) / liveW.atr).toFixed(2))
          : 0,
      qPeriodEnd: stateQ.snapshot.periodEnd,
      mPeriodEnd: stateM.snapshot.periodEnd,
      wPeriodEnd: stateW.snapshot.periodEnd
    };
    overlays[i] = point;

    const prevPoint = i > 0 ? overlays[i - 1] : point;
    verdicts[i] = evaluatePuzzleVerdict(point, prevPoint, p20Low, singularityTracker, i, monthlyTopState, weeklyBreakState);

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
  windowDays: number = 250,
  asOfDate?: string | null
): NestedPuzzlePiPData | null {
  const timeline = buildFullPuzzleTimeline(allDailyBars);
  const total = timeline.sorted.length;
  if (total < 2) return null;

  // 錨定主圖最新日：只取截至 asOfDate（主圖最後一枝 K 線日期）嘅最近 windowDays 枝日線，
  // 確保拼圖小窗同主圖最新走勢 100% 實時對齊。唔錨定嘅話，dailyKlines 同主圖數據尾日
  // 唔同（例如換股後 dailyKlines 未更新、或 replay 模式）就會出現拼圖走勢倒掛。
  // 時間軸本身仍然用完整歷史計算（季／月 TFDR 要多年數據），只係顯示窗口錨定。
  let endIdx = total - 1;
  if (asOfDate) {
    while (endIdx >= 0 && timeline.sorted[endIdx].date > asOfDate) endIdx--;
    if (endIdx < 0) endIdx = total - 1;
  }
  const startOffset = Math.max(0, endIdx + 1 - Math.max(20, windowDays));
  const sliceLen = endIdx + 1 - startOffset;

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
  // 專家「大勢定性」行用 verdict 嘅交易員指令（四態通道＋方向＋有效買入上限＋鎖狀態），
  // 唔再用二元「穩站月/季50之上・上升浪只買不空」——S1/S2/S3 喺舊版睇落一模一樣，交易員分唔到
  // 主升浪（上限 80%）同過渡警戒（上限 30%）。fallback 只係防禦（verdict 一定有 traderDirective）。
  const trendBannerLabel =
    verdict.traderDirective ??
    (isBullRegime
      ? '穩站月/季50之上・上升浪只買不空'
      : '跌穿月/季50之下・下跌浪禁買只空');

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
    GOLDEN_BUY: '🔥 上升浪升穿奇點高・80% 重倉買入坐貨（只買不空）',
    BULL_DIP_BUY: '📈 牛市回踩中線拐頭・補滿80%目標倉位（唔等深跌奇點底）',
    ADD_POSITION: '🟢 上升浪低位加倉坐貨',
    PARTIAL_PROFIT: '🟠 奇點沽跌穿奇點低・減倉45%（保留55%核心底倉）',
    FULL_CLEAR: '🚨 跌穿月/季50中間線・100%清倉多單並嚴禁做多',
    WEEKLY_BREAK_TRIM: '🚨 週線大陰突變・減倉40%（保留60%核心底倉吃主升浪）',
    HALT_REDUCE: '🛑 回撤熔斷控險・減半倉位',
    SHORT_ENTRY: '🟣 下跌浪奇點沽跌穿奇點低・開立35%輕倉空單',
    COVER_SHORT: '💎 奇點買升穿奇點高或收復50線・100%平空',
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
      `穩站月/季50之上，收市升穿奇點最高位 $${verdict.singularityHigh?.toFixed(2) ?? '—'}（奇點買預警後扣扳機）${
        verdict.isBuyback
          ? `，高拋補回：週線未穿 50 且低於上次沽價 $${verdict.lastSellPrice?.toFixed(2) ?? '—'} 的 96%`
          : ''
      }，重倉買入 80% 坐貨吃主升浪`
    );
  } else if (verdict.signal === 'PARTIAL_PROFIT') {
    reasons.push(
      `奇點沽預警（日TFDR ${dTfdr} ≥88）後收市跌穿奇點 K 線最低位 $${verdict.singularityLow?.toFixed(2) ?? '—'}，減倉 45% 鎖利、保留 55% 核心底倉`
    );
  } else if (verdict.signal === 'FULL_CLEAR') {
    reasons.push(`價格跌穿月50($${m50Line.toFixed(2)})與季50($${q50Line.toFixed(2)})雙分水嶺，立即 100% 清空多單並嚴禁抄底`);
  } else if (verdict.signal === 'SHORT_ENTRY') {
    reasons.push(
      `下跌浪反彈觸發奇點沽（日TFDR ${dTfdr} ≥80）後收市跌穿奇點 K 線最低位 $${verdict.singularityLow?.toFixed(2) ?? '—'}，開立 35% 輕倉空單`
    );
  } else if (verdict.signal === 'COVER_SHORT') {
    reasons.push(
      `下跌浪觸發奇點買後收市升穿奇點 K 線最高位 $${verdict.singularityHigh?.toFixed(2) ?? '—'}，空單 100% 平倉`
    );
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
