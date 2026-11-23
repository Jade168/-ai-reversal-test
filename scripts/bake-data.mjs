#!/usr/bin/env node
/**
* （2026-11-23 數據層主修 B2）
*
* 背景：網站部署喺 GitHub Pages（純靜態），瀏覽器直連 Yahoo 會畀 CORS 擋，
* 東方財富 fqt=1 早期歷史又有「水平型腐爛」（成段得真值 0.4–0.8 倍，守衛
* 捉唔到）。修法：喺伺服器端（本地/GitHub Actions）定時攞 Yahoo 調整價全史
* 日線，烘焙成同源靜態 JSON（public/data/<代碼>.json），網站優先讀烘焙檔，
* 讀唔到/過期先跌返東方財富＋守衛後備。
*
* 鐵律（Peter 指示：Yahoo 唔穩定、東方每次都得）：
* - 逐隻驗證先准覆蓋：新系列棒數 ≥ 舊檔 95%（冇舊檔：一般股 ≥200 棒；
* 真・新上市股——首棒距今 1 年內——≥20 棒即接受並標 shortHistory）、最後一棒
* 日期唔早過舊檔、全部價 >0。任何一項唔過或者抓取失敗 → 舊檔原封不動，
* 只 log 警告，繼續下一隻。
* - 個別股失敗唔會 fail 成個 job；只有全部股都失敗先 exit 1。
* - 每隻最多重試 2 次，股票之間加延遲避免 Yahoo 限流。
*
* 用法：node scripts/bake-data.mjs（喺倉庫任何位置行都得，路徑以腳本位置為準）
*/
import { readFileSync, writeFileSync, existsSync, mkdirSync} from 'node:fs';
import { dirname, join, resolve} from 'node:path';
import { fileURLToPath} from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIST_FILE = join(ROOT, 'data-symbols.json');
const OUT_DIR = join(ROOT, 'public', 'data');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round6 = (x) => Math.round(x * 1e6) / 1e6;

function toYahooSymbol(code) {
if (/^\d+$/.test(code)) return `${code.padStart(4, '0')}.HK`;
return code.toUpperCase();
}

async function fetchYahooDaily(yahooSymbol) {
const period2 = Math.floor(Date.now() / 1000) + 86400;
const url =
`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}` +
`?period1=0&period2=${period2}&interval=1d&events=div,splits`;
let lastErr = null;
for (let attempt = 0; attempt <= 2; attempt++) {
try {
const resp = await fetch(url, {
headers: { 'User-Agent': 'Mozilla/5.0'},
signal: AbortSignal.timeout(30000),
});
if (!resp.ok) throw new Error(`Yahoo HTTP ${resp.status}`);
const json = await resp.json();
const res = json?.chart?.result?.[0];
if (!res) throw new Error(`Yahoo 回應冇 result：${JSON.stringify(json?.chart?.error || json).slice(0, 200)}`);
const ts = res.timestamp || [];
const quote = res.indicators?.quote?.[0] || {};
const adjArr = res.indicators?.adjclose?.[0]?.adjclose;
const bars = [];
for (let i = 0; i < ts.length; i++) {
const o = quote.open?.[i];
const h = quote.high?.[i];
const l = quote.low?.[i];
const c = quote.close?.[i];
const v = quote.volume?.[i]?? 0;
const adj = adjArr?.[i];
if (c == null || o == null || h == null || l == null ||!(c > 0) ||!(o > 0)) continue;
// 復權：adjclose 等比縮放 O/H/L（同 bt-helper / server.ts 一致）
const effClose = adj!= null && Number.isFinite(adj) && adj > 0? adj: c;
const ratio = effClose / c;
bars.push({
timestamp: ts[i] * 1000,
date: new Date(ts[i] * 1000).toISOString().slice(0, 10),
o: round6(o * ratio),
h: round6(h * ratio),
l: round6(l * ratio),
c: round6(effClose),
vol: v,
});
}
bars.sort((a, b) => a.date.localeCompare(b.date));
if (bars.length === 0) throw new Error('Yahoo 回應 0 支有效棒');
return bars;
} catch (err) {
lastErr = err;
if (attempt < 2) await sleep(2000 * (attempt + 1));
}
}
throw lastErr;
}

function readExisting(file) {
try {
if (!existsSync(file)) return null;
const parsed = JSON.parse(readFileSync(file, 'utf8'));
if (!Array.isArray(parsed?.bars) || parsed.bars.length === 0) return null;
return parsed;
} catch {
return null;
}
}

/** 首棒距今 1 年內 = 真・新上市股（短歷史） */
function isYoungSeries(bars) {
const firstMs = new Date(`${bars[0].date}T00:00:00Z`).getTime();
return Date.now() - firstMs <= 366 * 86400 * 1000;
}

/**
 * 驗證新系列先准覆蓋；回傳 { reject, shortHistory }：
 * reject = null 表示可以寫；shortHistory 表示短歷史（首棒 1 年內）。
 * 兩級制：一般股冇舊檔要 ≥200 棒；後生股（首棒 1 年內）≥20 棒即接受。
 */
function validateNewBars(bars, existing) {
const shortHistory = isYoungSeries(bars);
if (!bars.every((b) => b.o > 0 && b.h > 0 && b.l > 0 && b.c > 0 && Number.isFinite(b.c))) {
return { reject: '有非正數/無效價', shortHistory };
}
const lastBarDate = bars[bars.length - 1].date;
if (!existing) {
if (bars.length >= 200) return { reject: null, shortHistory };
if (shortHistory && bars.length >= 20) return { reject: null, shortHistory };
return {
reject: shortHistory
? `冇舊檔、後生股得 ${bars.length} 棒（<20 後生下限）`
: `冇舊檔但得 ${bars.length} 棒（<200）`,
shortHistory,
};
}
if (bars.length < existing.bars.length * 0.95) {
return { reject: `棒數 ${bars.length} < 舊檔 ${existing.bars.length} 嘅 95%`, shortHistory };
}
const oldLast = existing.lastBarDate || existing.bars[existing.bars.length - 1].date;
if (lastBarDate < oldLast) return { reject: `最後一棒 ${lastBarDate} 早過舊檔 ${oldLast}`, shortHistory };
return { reject: null, shortHistory };
}

async function main() {
const list = JSON.parse(readFileSync(LIST_FILE, 'utf8'));
const symbols = Array.isArray(list?.symbols)? list.symbols: [];
if (symbols.length === 0) {
console.error('[烘焙] data-symbols.json 清單係空，冇嘢好做');
process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true});

let okCount = 0;
let keptCount = 0;
let failCount = 0;

for (let idx = 0; idx < symbols.length; idx++) {
const entry = symbols[idx];
const code = String(typeof entry === 'string'? entry: entry?.code ?? '').trim().toUpperCase();
const yahooSymbol =
typeof entry === 'object' && entry?.yahoo? String(entry.yahoo).trim(): toYahooSymbol(code);
const file = join(OUT_DIR, `${code}.json`);
const existing = readExisting(file);
try {
const bars = await fetchYahooDaily(yahooSymbol);
const { reject, shortHistory } = validateNewBars(bars, existing);
if (reject) {
keptCount++;
console.warn(`[烘焙] ${code}（${yahooSymbol}）：新數據唔合格（${reject}）→ 保留舊檔不變`);
} else {
const payload = {
symbol: code,
yahooSymbol,
source: 'yahoo-baked',
bakedAt: new Date().toISOString(),
lastBarDate: bars[bars.length - 1].date,
...(shortHistory? { shortHistory: true }: {}),
bars,
};
writeFileSync(file, JSON.stringify(payload));
okCount++;
console.log(
`[烘焙] ${code}（${yahooSymbol}）：✅ ${bars.length} 棒（${bars[0].date} ~ ${bars[bars.length - 1].date}）${shortHistory? '［短歷史］': ''}`
);
}
} catch (err) {
keptCount++;
failCount++;
console.warn(
`[烘焙] ${code}（${yahooSymbol}）：抓取失敗（${err?.message || err}）→ ${existing? '保留舊檔不變': '冇舊檔，今次跳過'}`
);
}
if (idx < symbols.length - 1) await sleep(1200);
}

console.log(`[烘焙] 完成：更新 ${okCount} 隻／保留舊檔 ${keptCount} 隻（其中抓取失敗 ${failCount} 隻）／共 ${symbols.length} 隻`);
if (okCount === 0 && keptCount === symbols.length && failCount === symbols.length) {
console.error('[烘焙] 全部股票抓取失敗，exit 1');
process.exit(1);
}
if (okCount === 0 &&!symbols.some((s) => existsSync(join(OUT_DIR, `${String(typeof s === 'string'? s: s?.code ?? '').trim().toUpperCase()}.json`)))) {
console.error('[烘焙] 一隻成功都冇、又冇任何舊檔，exit 1');
process.exit(1);
}
}

main().catch((err) => {
console.error('[烘焙] 未預期錯誤：', err);
process.exit(1);
});
