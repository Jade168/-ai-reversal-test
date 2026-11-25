// QQP v1.2＋tfdr55 模型頂／底顯示層（2026-11-26，取代已死嘅 R7 版；純顯示——唔參與任何交易判定）
// （2026-11-26 第二輪：b10 升級做 tfdr55——反轉棒 TFDR proxy >55 跳過嗰次沽；買入唔郁。）
//
// 基底 v1.2（同 Python qqp-fit-v3 一字不差，TS 交叉檢查 508 個訊號 0 差異）：
//   hl3 日線（頂 ×0.98／底 ×1.02）＋週線 price-agree（±1 週、移咗價差 ≤5%）＋C3b 確認（+6 棒）
//   週線圖：hl3 週線（頂 ×0.98／底 ×1.02）＋月線 hl2 price-agree（月頂 ×1.01／月底 ×1.03，±1 月、≤5%）＋C3b
//   月線圖無模型，唔顯示。knownDate＝max（訊號棒+6 日，滿足一致嘅最遲高一級棒收市日）。
// 確認層 b10（同 qqp-why-loses-q3-test.ts 一字不差）：訊號只做武裝，武裝棒起計 10 支棒內
//   （含武裝棒）等第一支 HA 梯級反轉棒（買：haHigh 破上支高；沽：haLow 破上支低，引擎定義，
//   唔加陰陽條件）先確認；10 棒內無反轉就作廢，唔顯示。顯示出嚟嘅確認頂／底全部係 HA 確認過嘅，
//   唔會早沽早買。快訊號＝v1.2 武裝訊號（早期預警，未經 HA 確認）。
// 確認頂再加 tfdr55 過濾（同 qqp-b10-followup-test.ts 一字不差，OOS 最穩嗰個；唔用 45，
//   45 係 in-sample 掃描最高值）：反轉棒嗰陣 TFDR proxy >55 就跳過嗰次沽——價錢未跌返
//   20 日 HA 中線，唔好喺強勢腿入面沽局部頂。TFDR proxy＝raw 公式（中線＝20 日 HA 中線
//   ((haH+haL)/2) 均值；TFDR＝50+((收市−中線)/(ATR14×2.2))×22，夾 0–100；無引擎 pin
//   規則）；只濾沽出（確認頂），確認底唔郁。快頂／快底唔郁。
// 大周期層：25% zigzag 只做牛熊定性（上升腿／下跌腿），唔做任何過濾。
//
// 計算方法：瀏覽器即場計（路線 a）。網站係 GitHub Pages 純靜態，圖表手頭已有
// 成條日線／週線 K 線，唔使另外出訊號檔、唔使加烘焙步驟；非烘焙股（EM 直連）
// 一樣計到。數據唔夠（<70 棒）或者計唔到就回 null，呼叫方唔顯示、唔報錯。
//
// 硬邊界：b10 回報 $65,517,483 仲差引擎 $89,011,104 達 −26.4%，只入顯示層，絕對唔入引擎。
// tfdr55 單獨策略 $101,477,383（贏引擎 +$12.47M，OOS 贏引擎 +$1.73M）係研究數字——
// 顯示層濾走熱頂，唔等於引擎換咗呢條規則；引擎整合要另外設計＋A/B 驗。
// 呢個檔唔 import 任何引擎／回測／verdict 檔案，只讀 K 線計顯示標記。

export interface QqpBar {
  date: string;
  o: number;
  h: number;
  l: number;
  c: number;
  vol?: number;
}

export interface QqpSignalPoint {
  index: number;
  price: number;
  date: string;
}

export type QqpLeg = 'up' | 'down' | 'unknown';

export interface QqpModelLayer {
  period: 'D' | 'W';
  /** 快訊號（v1.2 武裝訊號）：早期預警，未經 HA 反轉確認 */
  fastHighs: QqpSignalPoint[];
  fastLows: QqpSignalPoint[];
  /** 確認訊號（v1.2＋b10＋tfdr55）：武裝後 10 棒內有 HA 梯級反轉先確認；確認頂反轉棒 TFDR>55 跳過 */
  confirmedHighs: QqpSignalPoint[];
  confirmedLows: QqpSignalPoint[];
  /** 25% zigzag 大周期腿向（最新已確認拐點）：上升腿／下跌腿／未明 */
  leg: QqpLeg;
  legPivotDate: string | null;
  legPivotPrice: number | null;
  nBars: number;
  asOfDate: string;
}

// ---------------------------------------------------------------- 工具
const isFin = (x: number): boolean => Number.isFinite(x);

// ---------------------------------------------------------------- 週線／月線聚合（同 Q3 weeklyBars；月線用曆月錨定）
export interface HigherBars {
  bars: QqpBar[];
  /** 每支高一級棒嘅收市日（最後一支日線／週線棒嘅日期），用嚟計 knownDate */
  closeDate: string[];
}

function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const wd = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  d.setUTCDate(d.getUTCDate() - wd);
  return d.toISOString().slice(0, 10);
}

function weeklyBars(daily: QqpBar[]): HigherBars {
  const map = new Map<string, QqpBar[]>();
  for (const b of daily) {
    const m = mondayOf(b.date);
    if (!map.has(m)) map.set(m, []);
    map.get(m)!.push(b);
  }
  const weeks = [...map.keys()].sort();
  const bars: QqpBar[] = [];
  const closeDate: string[] = [];
  for (const m of weeks) {
    const bs = map.get(m)!;
    bars.push({
      date: m,
      o: bs[0].o,
      h: Math.max(...bs.map(x => x.h)),
      l: Math.min(...bs.map(x => x.l)),
      c: bs[bs.length - 1].c,
      vol: bs.reduce((s, x) => s + (x.vol ?? 0), 0)
    });
    closeDate.push(bs[bs.length - 1].date);
  }
  return { bars, closeDate };
}

function monthlyBars(daily: QqpBar[]): HigherBars {
  const map = new Map<string, QqpBar[]>();
  for (const b of daily) {
    const m = (b.date || '').slice(0, 7) + '-01';
    if (!map.has(m)) map.set(m, []);
    map.get(m)!.push(b);
  }
  const months = [...map.keys()].sort();
  const bars: QqpBar[] = [];
  const closeDate: string[] = [];
  for (const m of months) {
    const bs = map.get(m)!;
    bars.push({
      date: m,
      o: bs[0].o,
      h: Math.max(...bs.map(x => x.h)),
      l: Math.min(...bs.map(x => x.l)),
      c: bs[bs.length - 1].c,
      vol: bs.reduce((s, x) => s + (x.vol ?? 0), 0)
    });
    closeDate.push(bs[bs.length - 1].date);
  }
  return { bars, closeDate };
}

/** 由日線聚合月線 K 線（曆月錨定，bar date＝每月 1 號），供週線圖模型層做高一級一致。 */
export function aggregateMonthly(dailyBars: QqpBar[]): QqpBar[] {
  const sorted = [...dailyBars].sort((a, b) => a.date.localeCompare(b.date));
  return monthlyBars(sorted).bars;
}

/** 由日線聚合月線（連收市日），供週線圖模型層傳入 computeQqpModelLayer 做高一級一致。 */
export function aggregateMonthlyBars(dailyBars: QqpBar[]): HigherBars {
  const sorted = [...dailyBars].sort((a, b) => a.date.localeCompare(b.date));
  return monthlyBars(sorted);
}

// ---------------------------------------------------------------- hl3（同 Q3：top＝h[i] 係過去 n 棒最高高；bot＝l[i] 係過去 n 棒最低低）
function hl3(bars: QqpBar[], n: number): { top: Map<number, number>; bot: Map<number, number> } {
  const top = new Map<number, number>();
  const bot = new Map<number, number>();
  for (let i = n - 1; i < bars.length; i++) {
    let mx = -Infinity;
    for (let k = i - n + 1; k <= i; k++) mx = Math.max(mx, bars[k].h);
    if (bars[i].h === mx) top.set(i, bars[i].h);
    let mn = Infinity;
    for (let k = i - n + 1; k <= i; k++) mn = Math.min(mn, bars[k].l);
    if (bars[i].l === mn) bot.set(i, bars[i].l);
  }
  return { top, bot };
}

// ---------------------------------------------------------------- v1.2 訊號（同 Q3 computeSignals 一字不差，通用化：base＋higher）
interface V12Sig {
  signalDate: string;
  signalIdx: number;
  side: 'high' | 'low';
  knownDate: string | null;
  /** 移咗價訊號價（頂 ×topMul／底 ×botMul） */
  price: number;
  /** b10Confirm 搵到嘅第一支 HA 梯級反轉棒 index（未確認嗰陣 undefined；供 tfdr55 過濾用） */
  revIdx?: number;
}

function computeV12Signals(
  base: QqpBar[],
  higher: HigherBars | null,
  baseWin: number,
  higherWin: number,
  baseTopMul: number,
  baseBotMul: number,
  higherTopMul: number,
  higherBotMul: number
): { sigs: V12Sig[]; diag: { rawD: number; afterAgree: number; confirmed: number } } {
  const n = base.length;
  const d = hl3(base, baseWin);
  const dTopS = new Map([...d.top].map(([i, p]) => [i, p * baseTopMul]));
  const dBotS = new Map([...d.bot].map(([i, p]) => [i, p * baseBotMul]));
  const hBars = higher ? higher.bars : [];
  const hClose = higher ? higher.closeDate : [];
  const h = higher ? hl3(hBars, higherWin) : { top: new Map<number, number>(), bot: new Map<number, number>() };
  const hTopS = new Map([...h.top].map(([i, p]) => [i, p * higherTopMul]));
  const hBotS = new Map([...h.bot].map(([i, p]) => [i, p * higherBotMul]));
  const hDates = hBars.map(b => b.date);
  const jOf = (dateStr: string): number => {
    let lo = 0, hi = hDates.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (hDates[mid] <= dateStr) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  };
  const rawD = dTopS.size + dBotS.size;
  let afterAgree = 0;
  const out: V12Sig[] = [];
  for (const [side, dMap, hMap] of [['high', dTopS, hTopS], ['low', dBotS, hBotS]] as const) {
    for (const [i, pr] of dMap) {
      const j = higher ? jOf(base[i].date) : -1;
      let sat: number[] = [];
      if (j >= 0) {
        for (const [jj, ppr] of hMap) {
          if (Math.abs(jj - j) <= 1 && Math.abs(ppr - pr) / Math.max(Math.abs(pr), 1e-12) <= 0.05) sat.push(jj);
        }
        if (sat.length === 0) continue; // price-agree 濾走
      }
      afterAgree++;
      // C3b k=6：其後 6 棒無新極值
      const j1 = i + 1, j2 = Math.min(i + 6, n - 1);
      let ok = true;
      if (j1 <= n - 1) {
        if (side === 'high') {
          let mx = -Infinity;
          for (let k = j1; k <= j2; k++) mx = Math.max(mx, base[k].h);
          ok = mx <= base[i].h + 1e-12;
        } else {
          let mn = Infinity;
          for (let k = j1; k <= j2; k++) mn = Math.min(mn, base[k].l);
          ok = mn >= base[i].l - 1e-12;
        }
      }
      if (!ok) continue;
      const confDate = i + 6 < n ? base[i + 6].date : null;
      const agreeDate = sat.length > 0 ? sat.map(jj => hClose[jj]).sort().pop()! : null;
      let knownDate: string | null = null;
      if (confDate !== null && agreeDate !== null) knownDate = confDate > agreeDate ? confDate : agreeDate;
      else if (confDate !== null) knownDate = confDate;
      out.push({ signalDate: base[i].date, signalIdx: i, side, knownDate, price: pr });
    }
  }
  out.sort((a, b) => a.signalDate.localeCompare(b.signalDate) || (a.side < b.side ? -1 : 1));
  return { sigs: out, diag: { rawD, afterAgree, confirmed: out.length } };
}

// ---------------------------------------------------------------- HA 高／低（同 Q3 haHighLow 一字不差）
// haC=(o+h+l+c)/4；haO=(上支haO+上支haC)/2；haH=max(h,haO,haC)；haL=min(l,haO,haC)。
function haHighLow(bars: QqpBar[]): { haH: number[]; haL: number[] } {
  const n = bars.length;
  const haH: number[] = new Array(n);
  const haL: number[] = new Array(n);
  let ho = (bars[0].o + bars[0].c) / 2;
  for (let i = 0; i < n; i++) {
    const hc = (bars[i].o + bars[i].h + bars[i].l + bars[i].c) / 4;
    haH[i] = Math.max(bars[i].h, ho, hc);
    haL[i] = Math.min(bars[i].l, ho, hc);
    ho = (ho + hc) / 2;
  }
  return { haH, haL };
}

// ---------------------------------------------------------------- b10 確認（同 Q3 武裝邏輯一字不差）
// 每個 v1.2 訊號獨立武裝：武裝棒＝knownDate 嗰支棒；武裝棒起計 N 支棒內（含武裝棒）
// 等第一支 HA 梯級反轉棒（買：haHigh 破上支高；沽：haLow 破上支低）先確認；
// N 棒內無反轉就作廢。knownDate 係 null 嗰啲確認唔到。
function b10Confirm(bars: QqpBar[], sigs: V12Sig[], haH: number[], haL: number[], n = 10): V12Sig[] {
  const idxByDate = new Map<string, number>();
  bars.forEach((b, i) => idxByDate.set((b.date || '').slice(0, 10), i));
  const out: V12Sig[] = [];
  for (const s of sigs) {
    if (!s.knownDate) continue;
    const t = idxByDate.get(s.knownDate);
    if (t == null) continue;
    const last = Math.min(t + n - 1, bars.length - 1);
    let ok = false;
    let revIdx = -1;
    for (let r = t; r <= last; r++) {
      if (r <= 0) continue;
      if (s.side === 'low' && haH[r] > haH[r - 1]) { ok = true; revIdx = r; break; }
      if (s.side === 'high' && haL[r] < haL[r - 1]) { ok = true; revIdx = r; break; }
    }
    if (ok) out.push({ ...s, revIdx });
  }
  return out;
}

// ---------------------------------------------------------------- TFDR proxy（同 qqp-b10-followup-test.ts 一字不差；raw 公式，無引擎 pin 規則）
// 中線＝20 日 HA 中線 ((haH+haL)/2) 均值；ATR＝14 日 TR 平均（raw 棒計）；
// TFDR＝50+((收市−中線)/(ATR×2.2))×22，夾 0–100。供 tfdr55 過濾確認頂用。
function tfdrProxy(bars: QqpBar[], haH: number[], haL: number[]): number[] {
  const n = bars.length;
  const tr: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    tr[i] = i === 0
      ? bars[i].h - bars[i].l
      : Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c));
  }
  const atr: number[] = new Array(n);
  let s = 0;
  for (let i = 0; i < n; i++) {
    s += tr[i];
    if (i >= 14) s -= tr[i - 14];
    atr[i] = Math.max(1e-9, s / Math.min(i + 1, 14));
  }
  const out: number[] = new Array(n);
  let m = 0;
  for (let i = 0; i < n; i++) {
    m += (haH[i] + haL[i]) / 2;
    if (i >= 20) m -= (haH[i - 20] + haL[i - 20]) / 2;
    const mid = m / Math.min(i + 1, 20);
    out[i] = Math.max(0, Math.min(100, 50 + ((bars[i].c - mid) / (atr[i] * 2.2)) * 22));
  }
  return out;
}

// ---------------------------------------------------------------- 25% zigzag（沿用 R7 版，同 zigzag_pivots）
interface ZigPivot {
  idx: number;
  side: 'high' | 'low';
  price: number;
  confirmIdx: number;
}

function zigzagPivots(bars: QqpBar[], pct = 0.25): ZigPivot[] {
  const n = bars.length;
  const h = bars.map(b => b.h);
  const l = bars.map(b => b.l);
  const c = bars.map(b => b.c);
  const pivots: ZigPivot[] = [];
  let lastIdx = -1;
  let lastSide: 'high' | 'low' | null = null;
  let runHigh: number | null = null;
  let runHighIdx: number | null = null;
  let runLow: number | null = null;
  let runLowIdx: number | null = null;
  for (let i = 0; i < n; i++) {
    if (i > lastIdx) {
      if (runHigh == null || h[i] > runHigh) {
        runHigh = h[i];
        runHighIdx = i;
      }
      if (runLow == null || l[i] < runLow) {
        runLow = l[i];
        runLowIdx = i;
      }
    }
    let confirmed: { idx: number; side: 'high' | 'low'; price: number } | null = null;
    if (lastSide == null) {
      if (runHigh != null && c[i] <= runHigh * (1 - pct)) {
        confirmed = { idx: runHighIdx as number, side: 'high', price: runHigh };
      } else if (runLow != null && c[i] >= runLow * (1 + pct)) {
        confirmed = { idx: runLowIdx as number, side: 'low', price: runLow };
      }
    } else if (lastSide === 'high') {
      if (runLow != null && c[i] >= runLow * (1 + pct)) {
        confirmed = { idx: runLowIdx as number, side: 'low', price: runLow };
      }
    } else {
      if (runHigh != null && c[i] <= runHigh * (1 - pct)) {
        confirmed = { idx: runHighIdx as number, side: 'high', price: runHigh };
      }
    }
    if (confirmed != null) {
      const q: number = confirmed.idx;
      pivots.push({ idx: q, side: confirmed.side, price: confirmed.price, confirmIdx: i });
      lastIdx = q;
      lastSide = confirmed.side;
      if (i > q) {
        let segH = -Infinity;
        let segHIdx: number = q + 1;
        let segL = Infinity;
        let segLIdx: number = q + 1;
        for (let j = q + 1; j <= i; j++) {
          if (h[j] > segH) {
            segH = h[j];
            segHIdx = j;
          }
          if (l[j] < segL) {
            segL = l[j];
            segLIdx = j;
          }
        }
        runHigh = segH;
        runHighIdx = segHIdx;
        runLow = segL;
        runLowIdx = segLIdx;
      } else {
        runHigh = null;
        runHighIdx = null;
        runLow = null;
        runLowIdx = null;
      }
    }
  }
  return pivots;
}

/** 確認制腿向：最後一個已確認拐點係底→上升腿，係頂→下跌腿，未有→unknown。 */
function legAt(idx: number, pivots: ZigPivot[]): { leg: QqpLeg; pivot: ZigPivot | null } {
  let last: ZigPivot | null = null;
  for (const p of pivots) {
    if (p.confirmIdx <= idx) last = p;
    else break;
  }
  if (!last) return { leg: 'unknown', pivot: null };
  return { leg: last.side === 'low' ? 'up' : 'down', pivot: last };
}

// ---------------------------------------------------------------- 週線聚合（W-MON，同 Python weekly_bars；只供驗證腳本用）
export function aggregateWeeklyMonday(dailyBars: QqpBar[]): QqpBar[] {
  const sorted = [...dailyBars].sort((a, b) => a.date.localeCompare(b.date));
  const groups = new Map<string, QqpBar[]>();
  for (const b of sorted) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(b.date || '');
    if (!m) continue;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const dow = (new Date(Date.UTC(y, mo - 1, d)).getUTCDay() + 6) % 7; // 星期一 = 0
    const key = new Date(Date.UTC(y, mo - 1, d - dow)).toISOString().slice(0, 10);
    const g = groups.get(key);
    if (g) g.push(b);
    else groups.set(key, [b]);
  }
  const out: QqpBar[] = [];
  for (const [key, g] of groups) {
    let hh = -Infinity;
    let ll = Infinity;
    let vv = 0;
    for (const b of g) {
      if (b.h > hh) hh = b.h;
      if (b.l < ll) ll = b.l;
      vv += b.vol || 0;
    }
    out.push({ date: key, o: g[0].o, h: hh, l: ll, c: g[g.length - 1].c, vol: vv });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

// ---------------------------------------------------------------- 主入口
const MIN_BARS = 70;

/**
 * v1.2＋b10 模型頂／底層（純顯示）。
 * period 'D'：base＝日線（入面聚合週線做一致）；period 'W'：base＝週線，
 * higherBars＝月線（呼叫方由日線聚合傳入；無就當無一致，訊號照過）。
 * 月線圖呼叫方唔應該傳 period 'M'（回 null）。
 */
export function computeQqpModelLayer(
  inputBars: QqpBar[],
  period: 'D' | 'W',
  higherBars?: HigherBars | null
): QqpModelLayer | null {
  if (!inputBars || inputBars.length < MIN_BARS) return null;
  try {
    const bars = [...inputBars]
      .filter(b => b && isFin(b.o) && isFin(b.h) && isFin(b.l) && isFin(b.c) && b.h > 0 && b.c > 0)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    if (bars.length < MIN_BARS) return null;
    const dateOf = (i: number): string => (bars[i].date || '').slice(0, 10);
    const toPoints = (list: V12Sig[]): QqpSignalPoint[] =>
      list.map(o => ({ index: o.signalIdx, price: o.price, date: dateOf(o.signalIdx) }));

    let sigs: V12Sig[];
    if (period === 'D') {
      const w = weeklyBars(bars);
      sigs = computeV12Signals(bars, w, 3, 3, 0.98, 1.02, 0.98, 1.02).sigs;
    } else {
      const h = higherBars && higherBars.bars.length > 0 ? higherBars : null;
      sigs = computeV12Signals(bars, h, 3, 2, 0.98, 1.02, 1.01, 1.03).sigs;
    }
    const { haH, haL } = haHighLow(bars);
    const conf = b10Confirm(bars, sigs, haH, haL, 10);
    // tfdr55：確認頂反轉棒嗰陣 TFDR proxy >55 就跳過嗰次沽（唔顯示）；確認底／快訊號唔郁。
    // revIdx 缺失嗰陣保守保留（唔濾）。週線層同日線層用同一條規則。
    const tfdr = tfdrProxy(bars, haH, haL);
    const confHighs = conf.filter(
      o => o.side === 'high' && (o.revIdx == null || o.revIdx < 0 || tfdr[o.revIdx] <= 55)
    );
    const confLows = conf.filter(o => o.side === 'low');

    const highs = sigs.filter(o => o.side === 'high');
    const lows = sigs.filter(o => o.side === 'low');

    const pivots = zigzagPivots(bars, 0.25);
    const { leg, pivot } = legAt(bars.length - 1, pivots);

    return {
      period,
      fastHighs: toPoints(highs),
      fastLows: toPoints(lows),
      confirmedHighs: toPoints(confHighs),
      confirmedLows: toPoints(confLows),
      leg,
      legPivotDate: pivot ? dateOf(pivot.idx) : null,
      legPivotPrice: pivot ? pivot.price : null,
      nBars: bars.length,
      asOfDate: dateOf(bars.length - 1)
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- (4) 引擎＋模型重疊標記（純文字，唔改任何決策）
function parseDay(s: string): number {
  const t = Date.parse((s || '').slice(0, 10));
  return Number.isFinite(t) ? t : NaN;
}

/** 喺一組模型訊號日期入面搵離目標日最近嗰個（±days 日曆日內），回最近日期＋相差日數。 */
function nearestWithin(dates: string[], target: string, days = 5): { date: string; diffDays: number } | null {
  const t = parseDay(target);
  if (!Number.isFinite(t)) return null;
  let best: { date: string; diffDays: number } | null = null;
  for (const d of dates) {
    const dt = parseDay(d);
    if (!Number.isFinite(dt)) continue;
    const diff = Math.round(Math.abs(dt - t) / 86400000);
    if (diff <= days && (best == null || diff < best.diffDays)) best = { date: d.slice(0, 10), diffDays: diff };
  }
  return best;
}

/**
 * 對最新一個引擎沽出日（PARTIAL_PROFIT）／買入日（GOLDEN_BUY），檢查 ±5 日內有冇
 * 模型頂／底，返要加落專家報告嘅行（有重疊先有行，冇就唔加）。確認頂／底做主標記，
 * 快頂／底做輔助。純顯示，唔改 signal／倉位／任何數字。
 * （2026-11-26 由 R7＋C3b 換成 v1.2＋b10：舊版「假穿率約 1%／漏 7 個底」數字係 R7
 * 專用，唔再適用，改用 v1.2 精確數字。）
 */
export function qqpModelOverlapLines(
  dailyBars: QqpBar[],
  sellDates: string[],
  buyDates: string[]
): string[] {
  const layer = computeQqpModelLayer(dailyBars, 'D');
  if (!layer) return [];
  const lines: string[] = [];
  const latest = (ds: string[]): string | null => {
    const clean = ds.filter(d => parseDay(d) > 0).map(d => d.slice(0, 10));
    if (clean.length === 0) return null;
    return clean.sort().pop() as string;
  };
  const sellDay = latest(sellDates);
  if (sellDay) {
    const conf = nearestWithin(layer.confirmedHighs.map(p => p.date), sellDay, 5);
    const fast = nearestWithin(layer.fastHighs.map(p => p.date), sellDay, 5);
    if (conf) {
      lines.push(
        `• 最新沽出日 ${sellDay} ±5日內有模型確認頂（${conf.date}，相差${conf.diffDays}日）｜v1.2＋HA 反轉確認＋TFDR>55 跳過沽（武裝後 10 棒內，訊號精確約 0.64）`
      );
    } else if (fast) {
      lines.push(
        `• 最新沽出日 ${sellDay} ±5日內有模型快頂（${fast.date}，相差${fast.diffDays}日），未經 HA 反轉確認——快訊號只做早期預警`
      );
    }
  }
  const buyDay = latest(buyDates);
  if (buyDay) {
    const conf = nearestWithin(layer.confirmedLows.map(p => p.date), buyDay, 5);
    const fast = nearestWithin(layer.fastLows.map(p => p.date), buyDay, 5);
    if (conf) {
      lines.push(
        `• 最新買入日 ${buyDay} ±5日內有模型確認底（${conf.date}，相差${conf.diffDays}日）｜v1.2＋HA 反轉確認（武裝後 10 棒內，訊號精確約 0.64）`
      );
    } else if (fast) {
      lines.push(
        `• 最新買入日 ${buyDay} ±5日內有模型快底（${fast.date}，相差${fast.diffDays}日），未經 HA 反轉確認——快訊號只做早期預警`
      );
    }
  }
  return lines;
}
