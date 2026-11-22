// 雙袖回測模式（2026-11-22 最終方案，Peter 拍板沽出位＋授權提煉組裝）：
// 核心袖 90% 跟 V2 大方向（奇點狀態 OR 月線 10 個月均線＋兩日確認）全入/全出；
// 沽出層留底（頂確認＋PARTIAL_PROFIT 觸發＋趨勢閘 A）強制全出，定時 15 個交易日買回；
// 做 T 袖 10% 按核心狀態切做 T／反彈模式。機械邏輯同 ~/workspace/verify/sell-gate-test.ts
// 嘅 S1 版本逐件對版（十組數據總計 $89,011,109 對照研究基準），唔經現行引擎回測路徑，
// 現行版計算完全唔受影響。執行：次日開市、單邊費用 0.25%、整數股、兩袖各自複利。
import { buildFullPuzzleTimeline, OverlayPoint, PuzzleVerdict } from './puzzleDecisionEngine';
import { RawKline } from '../types/quant';

const FEE = 0.0025;

// ── 對外型別 ────────────────────────────────────────────────────────────────
export interface SleeveTradeLog {
  date: string; // 成交日（T+1 開盤執行）
  signalDate: string; // 決策日（T 日收市後）
  sleeve: 'CORE' | 'T';
  sleeveLabel: string; // 核心袖／做 T 袖／反彈袖
  side: 'BUY' | 'SELL';
  actionLabel: string; // 買入／沽出
  price: number;
  shares: number;
  reason: string; // 機器代碼（V2_IN／OVERRIDE_SELL／BUYBACK_T15／GOLDEN_BUY…）
  reasonLabel: string; // 中文白話
  holdingAfter: number; // 該袖成交後持股
}

export interface SleeveBacktestStats {
  finalFund: number;
  totalReturn: number; // %
  maxDrawdown: number; // %
  coreTradeCount: number;
  tTradeCount: number;
  overrideSellCount: number; // 已執行強制沽出次數
  buybackCount: number; // 規則買回（定時 15 日）次數
  coreHeldRatio: number; // 核心在場日數比例 %
  coreFinalEquity: number;
  tFinalEquity: number;
  tradingDays: number;
  startDate: string;
  endDate: string;
}

export interface SleeveReadout {
  date: string;
  // 四合一面板（只做顯示，唔揸核心開關）：1=向上、-1=向下、0=中性
  pillars: {
    ma: number; // 柱1 長期均線（M10＋兩日確認）
    singularity: number; // 柱2 奇點狀態
    mq50: number; // 柱3 月季 50 線
    mHa: number; // 柱4 月線 HA
    upCount: number;
    downCount: number;
  };
  directionUp: boolean; // V2 合併方向（奇點 OR 均線）
  maUp: boolean;
  singularityUp: boolean;
  coreInMarket: boolean; // 最新一日收市後核心目標狀態
  coreHoldingShares: number; // 核心實際持股（截至最新一日）
  tMode: 'T' | 'REB'; // 10% 袖現行模式（按最新核心狀態）
  tHoldingShares: number;
  sellLayer: {
    confirmActive: boolean; // 頂確認窗（背馳路或 MACD 路）生效中
    viaDiv: boolean;
    viaMacd: boolean;
    gateAPass: boolean; // 趨勢閘 A（斜率向上＋延伸 ≥10%）過唔過
    status: 'IDLE' | 'CONFIRMED_GATED' | 'CONFIRMED_READY' | 'FLAT';
  };
  maValue: number | null; // 月線 10 個月均線值
  closeVsMaPct: number | null; // 現價對均線距離 %
  close: number;
}

export interface SleeveBacktestResult {
  stats: SleeveBacktestStats;
  logs: SleeveTradeLog[];
  readout: SleeveReadout | null;
}

// ── 內部型別 ────────────────────────────────────────────────────────────────
interface SleeveBar {
  date: string;
  o: number;
  h: number;
  l: number;
  c: number;
}
interface Exec {
  idx: number;
  date: string;
  side: 'BUY' | 'SELL';
  price: number;
  shares: number;
  signal: string | null;
  mode: 'CORE' | 'T' | 'REB';
}
interface Pair {
  buyIdx: number;
  buyDate: string;
  buyPrice: number;
  sellIdx: number;
  sellDate: string;
  sellPrice: number;
  shares: number;
  exitSignal: string | null;
  mode: 'T' | 'REB';
  pnl: number;
}
interface SleeveSimResult {
  equity: number[];
  trades: Exec[];
  pairs: Pair[];
  finalEquity: number;
  openAtEnd: boolean;
  openMode: 'T' | 'REB' | null;
  finalShares: number;
}
interface CoreFracResult {
  equity: number[];
  trades: Exec[];
  finalEquity: number;
  heldDays: number;
  finalShares: number;
}

// ── 核心袖（分數目標版，照 sell-gate-test S1）─────────────────────────────────
function simCoreFrac(
  bars: SleeveBar[],
  fracTargets: number[],
  reasons: (string | null)[],
  initial: number
): CoreFracResult {
  const n = bars.length;
  let cash = initial;
  let shares = 0;
  let pendingFrac: number | null = null;
  let pendingReason: string | null = null;
  let lastTarget = 0;
  const equity: number[] = new Array(n);
  const trades: Exec[] = [];
  let heldDays = 0;
  for (let i = 0; i < n; i++) {
    const o = bars[i].o;
    if (pendingFrac !== null) {
      const eqOpen = cash + shares * o;
      const desired = Math.floor((pendingFrac * eqOpen) / o);
      if (desired > shares) {
        let qty = desired - shares;
        if (qty * o * (1 + FEE) > cash) qty = Math.floor(cash / (o * (1 + FEE)));
        if (qty > 0) {
          cash -= qty * o * (1 + FEE);
          shares += qty;
          trades.push({ idx: i, date: bars[i].date, side: 'BUY', price: o, shares: qty, signal: pendingReason, mode: 'CORE' });
        }
      } else if (desired < shares) {
        const qty = shares - desired;
        cash += qty * o * (1 - FEE);
        shares -= qty;
        trades.push({ idx: i, date: bars[i].date, side: 'SELL', price: o, shares: qty, signal: pendingReason, mode: 'CORE' });
      }
      pendingFrac = null;
      pendingReason = null;
    }
    if (shares > 0) heldDays++;
    equity[i] = cash + shares * bars[i].c;
    if (fracTargets[i] !== lastTarget) {
      pendingFrac = fracTargets[i];
      pendingReason = reasons[i];
      lastTarget = fracTargets[i];
    }
  }
  return { equity, trades, finalEquity: equity[n - 1], heldDays, finalShares: shares };
}

// ── 做 T／反彈袖（照 sell-gate-test S1）───────────────────────────────────────
function simTSleeveMA(
  bars: SleeveBar[],
  verdictsByIdx: (PuzzleVerdict | null)[],
  up: boolean[],
  initial: number,
  reboundEnabled: boolean
): SleeveSimResult {
  const n = bars.length;
  let cash = initial;
  let shares = 0;
  let posMode: 'T' | 'REB' | null = null;
  let pending: { side: 'BUY' | 'SELL'; signal: string; mode: 'T' | 'REB' } | null = null;
  let openBuy: Exec | null = null;
  const equity: number[] = new Array(n);
  const trades: Exec[] = [];
  const pairs: Pair[] = [];
  const BUY_SIGNALS = new Set(['GOLDEN_BUY', 'BULL_DIP_BUY']);
  const SELL_SIGNALS_T = new Set(['PARTIAL_PROFIT', 'FULL_CLEAR', 'WEEKLY_BREAK_TRIM']);
  const SELL_SIGNALS_REB = new Set(['PARTIAL_PROFIT', 'FULL_CLEAR']);
  for (let i = 0; i < n; i++) {
    const o = bars[i].o;
    if (pending !== null) {
      if (pending.side === 'BUY' && shares === 0) {
        const sh = Math.floor(cash / (o * (1 + FEE)));
        if (sh > 0) {
          cash -= sh * o * (1 + FEE);
          shares = sh;
          posMode = pending.mode;
          openBuy = { idx: i, date: bars[i].date, side: 'BUY', price: o, shares: sh, signal: pending.signal, mode: pending.mode };
          trades.push(openBuy);
        }
      } else if (pending.side === 'SELL' && shares > 0) {
        cash += shares * o * (1 - FEE);
        const sell: Exec = { idx: i, date: bars[i].date, side: 'SELL', price: o, shares, signal: pending.signal, mode: posMode ?? 'T' };
        trades.push(sell);
        if (openBuy) {
          pairs.push({
            buyIdx: openBuy.idx, buyDate: openBuy.date, buyPrice: openBuy.price,
            sellIdx: i, sellDate: bars[i].date, sellPrice: o, shares,
            exitSignal: pending.signal, mode: openBuy.mode as 'T' | 'REB',
            pnl: shares * (o * (1 - FEE) - openBuy.price * (1 + FEE))
          });
        }
        shares = 0;
        posMode = null;
        openBuy = null;
      }
      pending = null;
    }
    equity[i] = cash + shares * bars[i].c;
    const v = verdictsByIdx[i];
    if (shares > 0 && posMode) {
      if (posMode === 'REB') {
        if (up[i]) pending = { side: 'SELL', signal: 'DIR_FLIP_UP', mode: 'REB' };
        else if (v && SELL_SIGNALS_REB.has(v.signal)) pending = { side: 'SELL', signal: v.signal, mode: 'REB' };
      } else {
        if (!up[i]) pending = { side: 'SELL', signal: 'DIR_FLIP_DOWN', mode: 'T' };
        else if (v && SELL_SIGNALS_T.has(v.signal)) pending = { side: 'SELL', signal: v.signal, mode: 'T' };
      }
    } else if (shares === 0) {
      if (up[i]) {
        if (v && BUY_SIGNALS.has(v.signal) && v.marketState !== 'S4') {
          pending = { side: 'BUY', signal: v.signal, mode: 'T' };
        }
      } else if (reboundEnabled) {
        if (v && v.signal === 'GOLDEN_BUY') {
          pending = { side: 'BUY', signal: v.signal, mode: 'REB' };
        }
      }
    }
  }
  return { equity, trades, pairs, finalEquity: equity[n - 1], openAtEnd: shares > 0, openMode: posMode, finalShares: shares };
}

// ── 月線 10 個月均線＋兩日確認 ──────────────────────────────────────────────
function monthlyMAValues(bars: SleeveBar[], months: number): (number | null)[] {
  const n = bars.length;
  const monthKeys: string[] = [];
  const monthClose = new Map<string, number>();
  for (const k of bars) {
    const mk = k.date.slice(0, 7);
    if (!monthClose.has(mk)) monthKeys.push(mk);
    monthClose.set(mk, k.c);
  }
  const monthIdx = new Map(monthKeys.map((mk, i) => [mk, i]));
  const closesArr = monthKeys.map(mk => monthClose.get(mk)!);
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const p = monthIdx.get(bars[i].date.slice(0, 7))!;
    if (p >= months) {
      let s = 0;
      for (let j = p - months; j <= p - 1; j++) s += closesArr[j];
      out[i] = s / months;
    }
  }
  return out;
}
function confirm2Up(raw: boolean[]): boolean[] {
  const out: boolean[] = new Array(raw.length).fill(false);
  let state = false;
  let streak = 0;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === state) {
      streak = 0;
    } else {
      streak++;
      if (streak >= 2) {
        state = raw[i];
        streak = 0;
      }
    }
    out[i] = state;
  }
  return out;
}

// ── 奇點狀態 ────────────────────────────────────────────────────────────────
function singularityState(verdictsByIdx: (PuzzleVerdict | null)[]): { up: boolean[]; reason: (string | null)[] } {
  const n = verdictsByIdx.length;
  const up: boolean[] = new Array(n).fill(false);
  const reason: (string | null)[] = new Array(n).fill(null);
  let state = false;
  for (let i = 0; i < n; i++) {
    const v = verdictsByIdx[i];
    if (v) {
      if (v.signal === 'GOLDEN_BUY' && !state) {
        state = true;
        reason[i] = 'GOLDEN_BUY';
      } else if ((v.signal === 'PARTIAL_PROFIT' || v.signal === 'FULL_CLEAR') && state) {
        state = false;
        reason[i] = v.signal;
      }
    }
    up[i] = state;
  }
  return { up, reason };
}

// ── 四柱（背馳票數＋顯示面板共用）─────────────────────────────────────────────
type PillarVal = 1 | 0 | -1;
interface PillarDay {
  p: [PillarVal, PillarVal, PillarVal, PillarVal];
  upCount: number;
  downCount: number;
}
function computePillars(
  overlaysByIdx: (OverlayPoint | null)[],
  maUp2: boolean[],
  singUp: boolean[]
): PillarDay[] {
  const n = overlaysByIdx.length;
  const out: PillarDay[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const p1: PillarVal = maUp2[i] ? 1 : -1;
    const p2: PillarVal = singUp[i] ? 1 : -1;
    const ov = overlaysByIdx[i];
    let p3: PillarVal = 0;
    if (ov) {
      const c = ov.close as number;
      const m = ov.mMid50 as number | null;
      const q = ov.qMid50 as number | null;
      const rel = (line: number): PillarVal => (c > line ? 1 : c < line ? -1 : 0);
      if (m != null && q != null) {
        const rm = rel(m);
        const rq = rel(q);
        p3 = rm === 1 && rq === 1 ? 1 : rm === -1 && rq === -1 ? -1 : 0;
      } else if (m != null) p3 = rel(m);
      else if (q != null) p3 = rel(q);
    }
    let p4: PillarVal = 0;
    if (ov && ov.mHaBull === true) p4 = 1;
    else if (ov && ov.mHaBull === false) p4 = -1;
    const p: [PillarVal, PillarVal, PillarVal, PillarVal] = [p1, p2, p3, p4];
    out[i] = {
      p,
      upCount: p.filter(x => x === 1).length,
      downCount: p.filter(x => x === -1).length
    };
  }
  return out;
}

// ── RSI(14) Wilder 平滑 ─────────────────────────────────────────────────────
function rsiWilder(closes: number[], period = 14): (number | null)[] {
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < n; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

// ── 背馳偵測 ────────────────────────────────────────────────────────────────
interface DivEvent {
  idx: number;
  date: string;
  kind: 'TOP' | 'BOT';
  viaRsi: boolean;
  viaPillars: boolean;
  fullConfirm: boolean;
  refIdx: number;
  rsiNow: number | null;
  rsiRef: number | null;
  ucNow: number;
  ucRef: number;
}
function detectDivergence(
  bars: SleeveBar[],
  rsi: (number | null)[],
  pillars: PillarDay[]
): DivEvent[] {
  const n = bars.length;
  const closes = bars.map(k => k.c);
  const events: DivEvent[] = [];
  let refHigh: number | null = null;
  let refLow: number | null = null;
  for (let i = 60; i < n; i++) {
    let maxPrev = -Infinity;
    let minPrev = Infinity;
    for (let j = i - 60; j < i; j++) {
      if (closes[j] > maxPrev) maxPrev = closes[j];
      if (closes[j] < minPrev) minPrev = closes[j];
    }
    const isNewHigh = closes[i] > maxPrev;
    const isNewLow = closes[i] < minPrev;
    if (isNewHigh) {
      if (refHigh == null) {
        refHigh = i;
      } else if (i - refHigh >= 10) {
        const viaRsi = rsi[i] != null && rsi[refHigh] != null && rsi[i]! < rsi[refHigh]!;
        const viaPillars = pillars[i].upCount < pillars[refHigh].upCount;
        if (viaRsi || viaPillars) {
          let rsiExtreme = false;
          for (let j = refHigh; j <= i; j++) if (rsi[j] != null && rsi[j]! >= 70) rsiExtreme = true;
          events.push({
            idx: i, date: bars[i].date, kind: 'TOP', viaRsi, viaPillars,
            fullConfirm: rsiExtreme, refIdx: refHigh,
            rsiNow: rsi[i], rsiRef: rsi[refHigh],
            ucNow: pillars[i].upCount, ucRef: pillars[refHigh].upCount
          });
        }
        refHigh = i;
      } else if (closes[i] > closes[refHigh]) {
        refHigh = i;
      }
    }
    if (isNewLow) {
      if (refLow == null) {
        refLow = i;
      } else if (i - refLow >= 10) {
        const viaRsi = rsi[i] != null && rsi[refLow] != null && rsi[i]! > rsi[refLow]!;
        const viaPillars = pillars[i].upCount > pillars[refLow].upCount;
        if (viaRsi || viaPillars) {
          let rsiExtreme = false;
          for (let j = refLow; j <= i; j++) if (rsi[j] != null && rsi[j]! <= 30) rsiExtreme = true;
          events.push({
            idx: i, date: bars[i].date, kind: 'BOT', viaRsi, viaPillars,
            fullConfirm: rsiExtreme, refIdx: refLow,
            rsiNow: rsi[i], rsiRef: rsi[refLow],
            ucNow: pillars[i].upCount, ucRef: pillars[refLow].upCount
          });
        }
        refLow = i;
      } else if (closes[i] < closes[refLow]) {
        refLow = i;
      }
    }
  }
  return events;
}

function confirmWindows(n: number, events: DivEvent[], kind: 'TOP' | 'BOT') {
  const active: boolean[] = new Array(n).fill(false);
  const idxAt: number[] = new Array(n).fill(-1);
  const confirmDays = new Set(events.filter(e => e.kind === kind && e.fullConfirm).map(e => e.idx));
  let last = -1;
  for (let i = 0; i < n; i++) {
    if (confirmDays.has(i)) last = i;
    if (last >= 0 && i - last <= 20) {
      active[i] = true;
      idxAt[i] = last;
    }
  }
  return { active, idxAt };
}

function windowFromDays(n: number, dayIdxs: number[]) {
  const active: boolean[] = new Array(n).fill(false);
  const idxAt: number[] = new Array(n).fill(-1);
  const set = new Set(dayIdxs);
  let last = -1;
  for (let i = 0; i < n; i++) {
    if (set.has(i)) last = i;
    if (last >= 0 && i - last <= 20) {
      active[i] = true;
      idxAt[i] = last;
    }
  }
  return { active, idxAt };
}

// ── 月線 MACD 柱 (6,13,5) 富途口徑 ───────────────────────────────────────────
interface MonthlySeries {
  keys: string[];
  closes: number[];
  firstIdx: number[];
  lastIdx: number[];
  monthOfDay: number[];
  hist: number[];
}
function emaSeries(xs: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out = new Array(xs.length);
  let prev = xs[0];
  out[0] = prev;
  for (let i = 1; i < xs.length; i++) {
    prev = xs[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}
function monthlyMacd(bars: SleeveBar[]): MonthlySeries {
  const keys: string[] = [];
  const closes: number[] = [];
  const firstIdx: number[] = [];
  const lastIdx: number[] = [];
  const monthOfDay: number[] = new Array(bars.length);
  bars.forEach((k, i) => {
    const mk = k.date.slice(0, 7);
    if (keys.length === 0 || keys[keys.length - 1] !== mk) {
      keys.push(mk);
      closes.push(k.c);
      firstIdx.push(i);
      lastIdx.push(i);
    } else {
      closes[closes.length - 1] = k.c;
      lastIdx[lastIdx.length - 1] = i;
    }
    monthOfDay[i] = keys.length - 1;
  });
  const e6 = emaSeries(closes, 6);
  const e13 = emaSeries(closes, 13);
  const dif = closes.map((_, i) => e6[i] - e13[i]);
  const dea = emaSeries(dif, 5);
  const hist = dif.map((d, i) => 2 * (d - dea[i]));
  return { keys, closes, firstIdx, lastIdx, monthOfDay, hist };
}
interface MacdSignal {
  kind: 'WEAK' | 'STRONG';
  monthIdx: number;
  monthKey: string;
  signalDate: string;
  availIdx: number;
  availDate: string;
  anchorHist: number;
}
function macdSignals(bars: SleeveBar[], ms: MonthlySeries): MacdSignal[] {
  const out: MacdSignal[] = [];
  const h = ms.hist;
  for (let m = 7; m < h.length - 1; m++) {
    const availIdx = ms.firstIdx[m + 1];
    if (h[m] > 0 && h[m - 1] > 0 && h[m - 2] > 0 && h[m] < h[m - 1] && h[m - 1] < h[m - 2]) {
      let peak = -Infinity;
      for (let j = m - 7; j <= m - 2; j++) peak = Math.max(peak, h[j]);
      if (h[m - 2] >= peak) {
        out.push({
          kind: 'WEAK', monthIdx: m, monthKey: ms.keys[m],
          signalDate: bars[ms.lastIdx[m]].date,
          availIdx, availDate: bars[availIdx].date, anchorHist: h[m - 2]
        });
      }
    }
    if (h[m] < 0 && h[m - 1] < 0 && h[m - 2] < 0 && h[m] > h[m - 1] && h[m - 1] > h[m - 2]) {
      let trough = Infinity;
      for (let j = m - 7; j <= m - 2; j++) trough = Math.min(trough, h[j]);
      if (h[m - 2] <= trough) {
        out.push({
          kind: 'STRONG', monthIdx: m, monthKey: ms.keys[m],
          signalDate: bars[ms.lastIdx[m]].date,
          availIdx, availDate: bars[availIdx].date, anchorHist: h[m - 2]
        });
      }
    }
  }
  return out;
}

// ── 合併確認窗（背馳路 OR MACD 路）────────────────────────────────────────────
interface CombinedConfirm {
  active: boolean[];
  idxAt: number[];
  viaDivAt: boolean[];
  viaMacdAt: boolean[];
}
function combineConfirm(
  n: number,
  divWin: { active: boolean[]; idxAt: number[] },
  macdWin: { active: boolean[]; idxAt: number[] } | null
): CombinedConfirm {
  const active: boolean[] = new Array(n).fill(false);
  const idxAt: number[] = new Array(n).fill(-1);
  const viaDivAt: boolean[] = new Array(n).fill(false);
  const viaMacdAt: boolean[] = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    const vd = divWin.active[i];
    const vm = macdWin ? macdWin.active[i] : false;
    viaDivAt[i] = vd;
    viaMacdAt[i] = vm;
    active[i] = vd || vm;
    if (active[i]) {
      const cand: number[] = [];
      if (vd) cand.push(divWin.idxAt[i]);
      if (vm && macdWin) cand.push(macdWin.idxAt[i]);
      idxAt[i] = Math.max(...cand);
    }
  }
  return { active, idxAt, viaDivAt, viaMacdAt };
}

// ── 趨勢閘 A・趨勢斜率＋延伸 ──────────────────────────────────────────────────
// 月線 M10（已完結月份計）比 3 個月前高（斜率向上），而且當日收市 ≥ 均線 ×1.10。
// 均線未暖機（<13 個月）當唔過閘。
function gateAArray(bars: SleeveBar[], closes: number[], maVals: (number | null)[]): boolean[] {
  const n = bars.length;
  const monthOfDay: number[] = new Array(n);
  const monthFirstIdx: number[] = [];
  let curKey = '';
  bars.forEach((k, i) => {
    const mk = k.date.slice(0, 7);
    if (mk !== curKey) {
      curKey = mk;
      monthFirstIdx.push(i);
    }
    monthOfDay[i] = monthFirstIdx.length - 1;
  });
  const maByMonth: (number | null)[] = monthFirstIdx.map(fi => maVals[fi]);
  return bars.map((k, i) => {
    const m = monthOfDay[i];
    const ma = maByMonth[m];
    if (ma == null) return false;
    const ma3 = m >= 3 ? maByMonth[m - 3] : null;
    if (ma3 == null) return false;
    return ma > ma3 && closes[i] >= ma * 1.1;
  });
}

// ── 通用狀態機：底盤方向＋沽出層＋定時買回（照 sell-gate-test S1）───────────────
// mode N（正常）：目標跟底盤；喺倉＋PARTIAL_PROFIT＋確認窗 active＋嗰日底盤仍向上＋過閘 A → 強制沽出，入 mode L。
// mode L（鎖定）：底盤方向一轉落 → 鎖定結束、跟返方向；鎖定期間再撞強制沽出條件 → 再沽過（新回合）；
//   否則沽出成交後第 15 個交易日買回（決策日 = 成交日 +14，次日開市執行）。
interface MachineInputs {
  n: number;
  baseKey: string;
  baseTarget: boolean[];
  holdCond: boolean[];
  verdicts: (PuzzleVerdict | null)[];
  confirm: CombinedConfirm | null;
  closes: number[];
  dates: string[];
}
function buildMachine(
  inp: MachineInputs,
  buybackDays: number,
  gatePass: boolean[] | null
): { frac: number[]; reasons: (string | null)[]; triggers: number[] } {
  const n = inp.n;
  const frac: number[] = new Array(n).fill(0);
  const reasons: (string | null)[] = new Array(n).fill(null);
  const triggers: number[] = [];
  let cur = 0;
  let mode: 'N' | 'L' = 'N';
  let sellExecIdx = -1;
  const setFrac = (i: number, nf: number, reason: string) => {
    if (nf !== cur) {
      reasons[i] = reason;
      cur = nf;
    }
  };
  const fireOverride = (i: number) => {
    triggers.push(i);
    sellExecIdx = i + 1;
    setFrac(i, 0, 'OVERRIDE_SELL');
    mode = 'L';
  };
  for (let i = 0; i < n; i++) {
    const v = inp.verdicts[i];
    const rawCond =
      inp.confirm != null && cur > 0 && v != null && v.signal === 'PARTIAL_PROFIT' && inp.confirm.active[i] && inp.holdCond[i];
    const overrideCond = rawCond && (gatePass == null || gatePass[i]);
    if (mode === 'N') {
      if (overrideCond) {
        fireOverride(i);
      } else {
        const nf = inp.baseTarget[i] ? 1 : 0;
        setFrac(i, nf, nf === 1 ? `${inp.baseKey}_IN` : `${inp.baseKey}_OUT`);
      }
    } else {
      if (!inp.baseTarget[i]) {
        mode = 'N';
        setFrac(i, 0, `${inp.baseKey}_OUT_LOCKOUT_END`);
      } else if (overrideCond) {
        fireOverride(i);
      } else if (i - sellExecIdx >= buybackDays - 1) {
        setFrac(i, 1, `BUYBACK_T${buybackDays}`);
        mode = 'N';
      }
    }
    frac[i] = cur;
  }
  return { frac, reasons, triggers };
}

// ── 原因白話 ────────────────────────────────────────────────────────────────
const REASON_LABELS: Record<string, string> = {
  V2_IN: '核心入場（V2 方向向上：奇點狀態或月均線）',
  V2_OUT: '核心出場（V2 方向向下）',
  V2_OUT_LOCKOUT_END: '核心出場（鎖定期間方向轉下）',
  OVERRIDE_SELL: '強制沽出（頂確認＋奇點沽出＋趨勢閘 A 通過）',
  BUYBACK_T15: '定時買回（強制沽出後 15 個交易日）',
  GOLDEN_BUY: '奇點買入扣扳機',
  BULL_DIP_BUY: '牛市回踩中線買入',
  PARTIAL_PROFIT: '奇點高拋',
  FULL_CLEAR: '全清出場',
  WEEKLY_BREAK_TRIM: '週線突變減倉',
  DIR_FLIP_UP: '反彈出場（方向翻上）',
  DIR_FLIP_DOWN: '出場（方向翻下）'
};
function reasonLabel(code: string | null): string {
  if (!code) return '—';
  return REASON_LABELS[code] ?? code;
}

function maxDrawdownPct(eq: number[]): number {
  let peak = -Infinity;
  let mdd = 0;
  for (const v of eq) {
    if (v > peak) peak = v;
    if (peak > 0) mdd = Math.max(mdd, ((peak - v) / peak) * 100);
  }
  return mdd;
}

// ── 主函數 ──────────────────────────────────────────────────────────────────
export function runSleeveBacktest(klines: RawKline[], initialCapital = 1_000_000): SleeveBacktestResult {
  // 正規化：日期截到 YYYY-MM-DD、剔走無效棒、按日期升序（同研究管線輸入一致）
  const bars: SleeveBar[] = (klines ?? [])
    .map(k => ({
      date: typeof k.date === 'string' ? k.date.slice(0, 10) : '',
      o: Number(k.o),
      h: Number(k.h),
      l: Number(k.l),
      c: Number(k.c)
    }))
    .filter(
      b =>
        /^\d{4}-\d{2}-\d{2}$/.test(b.date) &&
        Number.isFinite(b.o) && b.o > 0 &&
        Number.isFinite(b.h) && b.h > 0 &&
        Number.isFinite(b.l) && b.l > 0 &&
        Number.isFinite(b.c) && b.c > 0
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const emptyStats: SleeveBacktestStats = {
    finalFund: initialCapital,
    totalReturn: 0,
    maxDrawdown: 0,
    coreTradeCount: 0,
    tTradeCount: 0,
    overrideSellCount: 0,
    buybackCount: 0,
    coreHeldRatio: 0,
    coreFinalEquity: initialCapital * 0.9,
    tFinalEquity: initialCapital * 0.1,
    tradingDays: bars.length,
    startDate: bars.length ? bars[0].date : '',
    endDate: bars.length ? bars[bars.length - 1].date : ''
  };
  if (bars.length === 0) return { stats: emptyStats, logs: [], readout: null };

  const n = bars.length;
  const closes = bars.map(k => k.c);
  const coreInit = initialCapital * 0.9;
  const tInit = initialCapital * 0.1;

  // 引擎時間線（重用訊號層裁決，唔改引擎任何邏輯）
  const idxByDate = new Map(bars.map((k, i) => [k.date, i]));
  const ohlc = bars.map(k => ({ date: k.date, open: k.o, high: k.h, low: k.l, close: k.c }));
  const timeline = buildFullPuzzleTimeline(ohlc);
  const verdictsByIdx: (PuzzleVerdict | null)[] = new Array(n).fill(null);
  const overlaysByIdx: (OverlayPoint | null)[] = new Array(n).fill(null);
  timeline.sorted.forEach((bar, t) => {
    const i = idxByDate.get(bar.date);
    if (i != null) {
      verdictsByIdx[i] = timeline.verdicts[t];
      overlaysByIdx[i] = timeline.overlays[t];
    }
  });

  // 方向部件
  const maVals = monthlyMAValues(bars, 10);
  const maRaw = closes.map((c, i) => maVals[i] != null && c > maVals[i]!);
  const maUp = confirm2Up(maRaw);
  const sing = singularityState(verdictsByIdx);
  const v2Target = maUp.map((m, i) => m || sing.up[i]);

  // 頂確認（背馳路 OR 月線 MACD 路）
  const pillars = computePillars(overlaysByIdx, maUp, sing.up);
  const rsi = rsiWilder(closes, 14);
  const divEvents = detectDivergence(bars, rsi, pillars);
  const topWin = confirmWindows(n, divEvents, 'TOP');
  const ms = monthlyMacd(bars);
  const signals = macdSignals(bars, ms);
  const weakAvail = signals.filter(s => s.kind === 'WEAK').map(s => s.availIdx);
  const macdWin = windowFromDays(n, weakAvail);
  const extConfirm = combineConfirm(n, topWin, macdWin);

  // 狀態機（V2 底＋沽出層＋閘 A＋T15 買回）
  const gateA = gateAArray(bars, closes, maVals);
  const machine = buildMachine(
    {
      n,
      baseKey: 'V2',
      baseTarget: v2Target,
      holdCond: v2Target,
      verdicts: verdictsByIdx,
      confirm: extConfirm,
      closes,
      dates: bars.map(k => k.date)
    },
    15,
    gateA
  );

  // 雙袖模擬
  const core = simCoreFrac(bars, machine.frac, machine.reasons, coreInit);
  const upArr = machine.frac.map(f => f > 0);
  const tSleeve = simTSleeveMA(bars, verdictsByIdx, upArr, tInit, true);
  const comb = bars.map((_, i) => core.equity[i] + tSleeve.equity[i]);

  const finalFund = comb[n - 1];
  const stats: SleeveBacktestStats = {
    finalFund,
    totalReturn: (finalFund / initialCapital - 1) * 100,
    maxDrawdown: maxDrawdownPct(comb),
    coreTradeCount: core.trades.length,
    tTradeCount: tSleeve.trades.length,
    overrideSellCount: core.trades.filter(t => t.signal === 'OVERRIDE_SELL').length,
    buybackCount: core.trades.filter(t => typeof t.signal === 'string' && t.signal.startsWith('BUYBACK')).length,
    coreHeldRatio: (core.heldDays / n) * 100,
    coreFinalEquity: core.finalEquity,
    tFinalEquity: tSleeve.finalEquity,
    tradingDays: n,
    startDate: bars[0].date,
    endDate: bars[n - 1].date
  };

  // 逐筆 logs（兩袖合併、按成交日排序；holdingAfter 按袖各自累計）
  const merged: { exec: Exec; sleeveOrder: number }[] = [
    ...core.trades.map(exec => ({ exec, sleeveOrder: 0 })),
    ...tSleeve.trades.map(exec => ({ exec, sleeveOrder: 1 }))
  ].sort((a, b) => a.exec.idx - b.exec.idx || a.sleeveOrder - b.sleeveOrder);
  let coreHolding = 0;
  let tHolding = 0;
  const logs: SleeveTradeLog[] = merged.map(({ exec }) => {
    const isCore = exec.mode === 'CORE';
    if (isCore) coreHolding += exec.side === 'BUY' ? exec.shares : -exec.shares;
    else tHolding += exec.side === 'BUY' ? exec.shares : -exec.shares;
    return {
      date: exec.date,
      signalDate: bars[Math.max(0, exec.idx - 1)].date,
      sleeve: isCore ? 'CORE' : 'T',
      sleeveLabel: isCore ? '核心袖' : exec.mode === 'REB' ? '反彈袖' : '做 T 袖',
      side: exec.side,
      actionLabel: exec.side === 'BUY' ? '買入' : '沽出',
      price: exec.price,
      shares: exec.shares,
      reason: exec.signal ?? '',
      reasonLabel: reasonLabel(exec.signal),
      holdingAfter: isCore ? coreHolding : tHolding
    };
  });

  // 最新一日讀數（四合一面板＋核心狀態＋沽出層狀態）
  const li = n - 1;
  const lp = pillars[li];
  const confirmActive = extConfirm.active[li];
  const gatePass = gateA[li];
  const coreIn = machine.frac[li] > 0;
  const readout: SleeveReadout = {
    date: bars[li].date,
    pillars: {
      ma: lp.p[0],
      singularity: lp.p[1],
      mq50: lp.p[2],
      mHa: lp.p[3],
      upCount: lp.upCount,
      downCount: lp.downCount
    },
    directionUp: v2Target[li],
    maUp: maUp[li],
    singularityUp: sing.up[li],
    coreInMarket: coreIn,
    coreHoldingShares: core.finalShares,
    tMode: upArr[li] ? 'T' : 'REB',
    tHoldingShares: tSleeve.finalShares,
    sellLayer: {
      confirmActive,
      viaDiv: extConfirm.viaDivAt[li],
      viaMacd: extConfirm.viaMacdAt[li],
      gateAPass: gatePass,
      status: !coreIn ? 'FLAT' : confirmActive ? (gatePass ? 'CONFIRMED_READY' : 'CONFIRMED_GATED') : 'IDLE'
    },
    maValue: maVals[li],
    closeVsMaPct: maVals[li] != null ? (closes[li] / maVals[li]! - 1) * 100 : null,
    close: closes[li]
  };

  return { stats, logs, readout };
}
