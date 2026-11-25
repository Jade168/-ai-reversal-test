// QQP R7 模型頂／底顯示層（v5 應用版，純顯示——唔參與任何交易判定）
//
// 來源：~/workspace/verify/qqp-newalgo-v5-2026-11-25.md
// 基底 R7（窗口 3＋高／低價分型，logistic，閾值 0.5；特徵 12 個：KDJ／RSI／MACD／
// MA10／30／成交量比／ret10／背離／波幅／間距），權重見 qqpModelWeights.ts
// （由 qqp-newalgo-v2-data.json final_models 自動生成，logreg only）。
// 快訊號＝R7 原版；確認訊號＝R7＋C3b（分型窗口外 i+4..i+6 無新極值先確認，
// 訊號滯後 6 棒；假穿率由約 14% 斬到約 1%，代價係漏 7 個底）。
// 大周期層：25% zigzag 只做牛熊定性（上升腿／下跌腿），唔做任何過濾。
//
// 計算方法：瀏覽器即場計（路線 a）。網站係 GitHub Pages 純靜態，圖表手頭已有
// 成條日線／週線 K 線，唔使另外出訊號檔、唔使加烘焙步驟；非烘焙股（EM 直連）
// 一樣計到。全部公式逐項對齊 Python 版（v2 extract_candidates／series_frames、
// v4 c3b_filter、zigzag zigzag_pivots），重現檢查見 scripts/verify-qqp-model-signals.ts。
// 數據唔夠（<70 棒）或者計唔到就回 null，呼叫方唔顯示、唔報錯。
//
// 唔改引擎：呢個檔唔 import 任何引擎／回測／verdict 檔案，只讀 K 線計顯示標記。

import { QQP_R7_LOGREG} from './qqpModelWeights';

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
/** 快訊號（R7 原版）：早期預警 */
fastHighs: QqpSignalPoint[];
fastLows: QqpSignalPoint[];
/** 確認訊號（R7＋C3b）：高質素訊號，滯後 6 棒 */
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
const nan = NaN;

/** pandas ewm(alpha, adjust=False)：NaN 跳過（未有有效值之前出 NaN，之後沿用上值）。 */
function ewm(values: number[], alpha: number): number[] {
const out: number[] = new Array(values.length).fill(nan);
let prev = nan;
let init = false;
for (let i = 0; i < values.length; i++) {
const x = values[i];
if (!isFin(x)) {
out[i] = prev;
continue;
}
if (!init) {
prev = x;
init = true;
} else {
prev = alpha * x + (1 - alpha) * prev;
}
out[i] = prev;
}
return out;
}

function rollingMean(values: number[], win: number): number[] {
const out: number[] = new Array(values.length).fill(nan);
let sum = 0;
for (let i = 0; i < values.length; i++) {
sum += values[i];
if (i >= win) sum -= values[i - win];
if (i >= win - 1) out[i] = sum / win;
}
return out;
}

function rollingMin(values: number[], win: number): number[] {
const out: number[] = new Array(values.length).fill(nan);
for (let i = win - 1; i < values.length; i++) {
let m = Infinity;
for (let j = i - win + 1; j <= i; j++) if (values[j] < m) m = values[j];
out[i] = m;
}
return out;
}

function rollingMax(values: number[], win: number): number[] {
const out: number[] = new Array(values.length).fill(nan);
for (let i = win - 1; i < values.length; i++) {
let m = -Infinity;
for (let j = i - win + 1; j <= i; j++) if (values[j] > m) m = values[j];
out[i] = m;
}
return out;
}

function sigmoid(z: number): number {
const c = Math.max(-30, Math.min(30, z));
return 1 / (1 + Math.exp(-c));
}

// ---------------------------------------------------------------- 指標（對齊 v1 add_indicators）
interface Indicators {
kdjK: number[];
kdjD: number[];
rsi: number[];
macdHist: number[];
atr: number[];
ma10: number[];
ma30: number[];
volMa20: number[];
}

function addIndicators(bars: QqpBar[]): Indicators {
const n = bars.length;
const c = bars.map(b => b.c);
const h = bars.map(b => b.h);
const l = bars.map(b => b.l);
const v = bars.map(b => (b.vol!= null && isFin(b.vol)? b.vol: nan));

const ma10 = rollingMean(c, 10);
const ma30 = rollingMean(c, 30);
const volMa20 = rollingMean(v, 20);

const ema12 = ewm(c, 2 / 13);
const ema26 = ewm(c, 2 / 27);
const dif = ema12.map((x, i) => (isFin(x) && isFin(ema26[i])? x - ema26[i]: nan));
const dea = ewm(dif, 2 / 10);
const macdHist = dif.map((x, i) => (isFin(x) && isFin(dea[i])? 2 * (x - dea[i]): nan));

// KDJ(9,3,3)：RSV 空值補 50（pandas fillna(50)）
const low9 = rollingMin(l, 9);
const high9 = rollingMax(h, 9);
const rsv = c.map((x, i) => {
if (!isFin(low9[i]) ||!isFin(high9[i])) return 50;
const den = high9[i] - low9[i];
if (den === 0) return 50;
return ((x - low9[i]) / den) * 100;
});
const kdjK = ewm(rsv, 1 / 3);
const kdjD = ewm(kdjK, 1 / 3);

// RSI(14) Wilder：delta[0] 空值；al==0 → RS 空值 → RSI 補 50
const delta: number[] = new Array(n).fill(nan);
for (let i = 1; i < n; i++) delta[i] = c[i] - c[i - 1];
const gain = delta.map(x => (isFin(x)? Math.max(x, 0): nan));
const loss = delta.map(x => (isFin(x)? Math.max(-x, 0): nan));
const ag = ewm(gain, 1 / 14);
const al = ewm(loss, 1 / 14);
const rsi = ag.map((a, i) => {
const b = al[i];
if (!isFin(a) ||!isFin(b) || b === 0) return 50;
const rs = a / b;
return 100 - 100 / (1 + rs);
});

// ATR(14)：TR[0] = h-l（上一收市空值，pandas max 會跳過）
const tr: number[] = new Array(n).fill(nan);
for (let i = 0; i < n; i++) {
if (i === 0) tr[i] = h[i] - l[i];
else tr[i] = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
}
const atr = ewm(tr, 1 / 14);

return { kdjK, kdjD, rsi, macdHist, atr, ma10, ma30, volMa20};
}

// ---------------------------------------------------------------- L1 分型＋L2 特徵（對齊 v2 extract_candidates，R7：window 3，hl）
const WIN = 3;
const FEATURES = [
'kdj_k', 'kdj_d', 'rsi', 'hist_atr', 'hist_chg_atr', 'px_ma10',
'px_ma30', 'vol_ratio', 'ret10', 'div_hist', 'swing_amp', 'days_prev'
] as const;

interface Candidate {
side: 'high' | 'low';
idx: number;
feats: number[];
}

function extractCandidates(bars: QqpBar[], ind: Indicators): Candidate[] {
const n = bars.length;
const c = bars.map(b => b.c);
const h = bars.map(b => b.h);
const l = bars.map(b => b.l);
const vol = bars.map(b => (b.vol!= null && isFin(b.vol)? b.vol: nan));
const { kdjK, kdjD, rsi, macdHist, atr, ma10, ma30, volMa20} = ind;

const atrSafe = atr.map(a => (isFin(a) && a > 0? a: nan));
const hiIdx: number[] = [];
const loIdx: number[] = [];
for (let i = WIN; i < n - WIN; i++) {
let isH = true;
let isL = true;
for (let j = i - WIN; j <= i + WIN; j++) {
if (h[j] > h[i]) isH = false;
if (l[j] < l[i]) isL = false;
}
if (isH) hiIdx.push(i);
if (isL) loIdx.push(i);
}

const out: Candidate[] = [];
(['high', 'low'] as const).forEach(side => {
const idxs = side === 'high'? hiIdx: loIdx;
let prevSame: number | null = null;
for (const i of idxs) {
const a = atrSafe[i];
const hist = macdHist[i];
const histPrev = i > 0? macdHist[i - 1]: nan;
let div = nan;
let daysPrev = nan;
if (prevSame!= null) {
const histJ = macdHist[prevSame];
if (isFin(a)) {
div = side === 'high'? (histJ - hist) / a: (hist - histJ) / a;
}
daysPrev = (i - prevSame) / 20;
}
const feats: number[] = [
kdjK[i] / 100,
kdjD[i] / 100,
rsi[i] / 100,
isFin(a)? hist / a: nan,
isFin(a)? (hist - histPrev) / a: nan,
isFin(ma10[i])? c[i] / ma10[i] - 1: nan,
isFin(ma30[i])? c[i] / ma30[i] - 1: nan,
isFin(volMa20[i]) && volMa20[i] > 0? vol[i] / volMa20[i]: nan,
i >= 10? c[i] / c[i - 10] - 1: nan,
div,
nan, // swing_amp：第二 pass 補
daysPrev
];
out.push({ side, idx: i, feats});
prevSame = i;
}
});
// swing_amp：對上一個反向分型
for (const o of out) {
const i = o.idx;
if (o.side === 'high') {
let k = -1;
for (let t = 0; t < loIdx.length; t++) {
if (loIdx[t] < i) k = t;
else break;
}
if (k >= 0) o.feats[10] = c[i] / c[loIdx[k]] - 1;
} else {
let k = -1;
for (let t = 0; t < hiIdx.length; t++) {
if (hiIdx[t] < i) k = t;
else break;
}
if (k >= 0) o.feats[10] = c[hiIdx[k]] / c[i] - 1;
}
}
return out;
}

function predictProbs(modelKey: 'D_high' | 'D_low' | 'W_high' | 'W_low', cands: Candidate[]): number[] {
const m = QQP_R7_LOGREG[modelKey];
return cands.map(o => {
let z = m.b;
for (let f = 0; f < FEATURES.length; f++) {
let x = o.feats[f];
if (!isFin(x)) x = m.fillMedian[f];
z += m.w[f] * ((x - m.mean[f]) / m.std[f]);
}
return sigmoid(z);
});
}

// ---------------------------------------------------------------- C3b 確認層（對齊 v5 c3b_filter）
function c3bConfirmed(bars: QqpBar[], pts: Candidate[]): Candidate[] {
const n = bars.length;
const h = bars.map(b => b.h);
const l = bars.map(b => b.l);
return pts.filter(o => {
const i = o.idx;
if (i + 6 >= n) return false; // 尾段 6 棒內確認唔到
if (o.side === 'high') {
let mx = -Infinity;
for (let j = i + 4; j <= i + 6; j++) if (h[j] > mx) mx = h[j];
return mx <= h[i];
}
let mn = Infinity;
for (let j = i + 4; j <= i + 6; j++) if (l[j] < mn) mn = l[j];
return mn >= l[i];
});
}

// ---------------------------------------------------------------- 25% zigzag（對齊 zigzag_pivots）
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
let confirmed: { idx: number; side: 'high' | 'low'; price: number} | null = null;
if (lastSide == null) {
if (runHigh!= null && c[i] <= runHigh * (1 - pct)) {
confirmed = { idx: runHighIdx as number, side: 'high', price: runHigh};
} else if (runLow!= null && c[i] >= runLow * (1 + pct)) {
confirmed = { idx: runLowIdx as number, side: 'low', price: runLow};
}
} else if (lastSide === 'high') {
if (runLow!= null && c[i] >= runLow * (1 + pct)) {
confirmed = { idx: runLowIdx as number, side: 'low', price: runLow};
}
} else {
if (runHigh!= null && c[i] <= runHigh * (1 - pct)) {
confirmed = { idx: runHighIdx as number, side: 'high', price: runHigh};
}
}
if (confirmed!= null) {
const q: number = confirmed.idx;
pivots.push({ idx: q, side: confirmed.side, price: confirmed.price, confirmIdx: i});
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
function legAt(idx: number, pivots: ZigPivot[]): { leg: QqpLeg; pivot: ZigPivot | null} {
let last: ZigPivot | null = null;
for (const p of pivots) {
if (p.confirmIdx <= idx) last = p;
else break;
}
if (!last) return { leg: 'unknown', pivot: null};
return { leg: last.side === 'low'? 'up': 'down', pivot: last};
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
out.push({ date: key, o: g[0].o, h: hh, l: ll, c: g[g.length - 1].c, vol: vv});
}
out.sort((a, b) => a.date.localeCompare(b.date));
return out;
}

// ---------------------------------------------------------------- 主入口
const MIN_BARS = 70;

export function computeQqpModelLayer(inputBars: QqpBar[], period: 'D' | 'W'): QqpModelLayer | null {
if (!inputBars || inputBars.length < MIN_BARS) return null;
try {
const bars = [...inputBars]
.filter(b => b && isFin(b.o) && isFin(b.h) && isFin(b.l) && isFin(b.c) && b.h > 0 && b.c > 0)
.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
if (bars.length < MIN_BARS) return null;
const ind = addIndicators(bars);
const cands = extractCandidates(bars, ind);
const dateOf = (i: number): string => (bars[i].date || '').slice(0, 10);
const toPoints = (list: Candidate[], priceOf: (b: QqpBar) => number): QqpSignalPoint[] =>
list.map(o => ({ index: o.idx, price: priceOf(bars[o.idx]), date: dateOf(o.idx)}));

const highs = cands.filter(o => o.side === 'high');
const lows = cands.filter(o => o.side === 'low');
const hiKey = period === 'D'? 'D_high': 'W_high';
const loKey = period === 'D'? 'D_low': 'W_low';
const pHi = predictProbs(hiKey, highs);
const pLo = predictProbs(loKey, lows);
const thr = QQP_R7_LOGREG[hiKey].threshold;
const fastHighCands = highs.filter((_o, k) => pHi[k] > thr);
const fastLowCands = lows.filter((_o, k) => pLo[k] > thr);
const confHighCands = c3bConfirmed(bars, fastHighCands);
const confLowCands = c3bConfirmed(bars, fastLowCands);

const pivots = zigzagPivots(bars, 0.25);
const { leg, pivot} = legAt(bars.length - 1, pivots);

return {
period,
fastHighs: toPoints(fastHighCands, b => b.h),
fastLows: toPoints(fastLowCands, b => b.l),
confirmedHighs: toPoints(confHighCands, b => b.h),
confirmedLows: toPoints(confLowCands, b => b.l),
leg,
legPivotDate: pivot? dateOf(pivot.idx): null,
legPivotPrice: pivot? pivot.price: null,
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
return Number.isFinite(t)? t: NaN;
}

/** 喺一組模型訊號日期入面搵離目標日最近嗰個（±days 日曆日內），回最近日期＋相差日數。 */
function nearestWithin(dates: string[], target: string, days = 5): { date: string; diffDays: number} | null {
const t = parseDay(target);
if (!Number.isFinite(t)) return null;
let best: { date: string; diffDays: number} | null = null;
for (const d of dates) {
const dt = parseDay(d);
if (!Number.isFinite(dt)) continue;
const diff = Math.round(Math.abs(dt - t) / 86400000);
if (diff <= days && (best == null || diff < best.diffDays)) best = { date: d.slice(0, 10), diffDays: diff};
}
return best;
}

/**
* 對最新一個引擎沽出日（PARTIAL_PROFIT）／買入日（GOLDEN_BUY），檢查 ±5 日內有冇
* 模型頂／底，返要加落專家報告嘅行（有重疊先有行，冇就唔加）。確認頂／底做主標記，
* 快頂／底做輔助。純顯示，唔改 signal／倉位／任何數字。
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
`• 最新沽出日 ${sellDay} ±5日內有模型確認頂（${conf.date}，相差${conf.diffDays}日）｜確認頂假穿率約1%（快頂近沽出日假穿率 0/12，底數細，僅供參考）`
);
} else if (fast) {
lines.push(
`• 最新沽出日 ${sellDay} ±5日內有模型快頂（${fast.date}，相差${fast.diffDays}日），未有確認頂——快訊號假穿率約14%，只做早期預警`
);
}
}
const buyDay = latest(buyDates);
if (buyDay) {
const conf = nearestWithin(layer.confirmedLows.map(p => p.date), buyDay, 5);
const fast = nearestWithin(layer.fastLows.map(p => p.date), buyDay, 5);
if (conf) {
lines.push(
`• 最新買入日 ${buyDay} ±5日內有模型確認底（${conf.date}，相差${conf.diffDays}日）｜確認底假穿率約1%`
);
} else if (fast) {
lines.push(
`• 最新買入日 ${buyDay} ±5日內有模型快底（${fast.date}，相差${fast.diffDays}日），未有確認底——快訊號假穿率約14%，只做早期預警`
);
}
}
return lines;
}
