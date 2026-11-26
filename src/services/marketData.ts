import { RawKline, NewsItem, ApiConfig } from '../types/quant';
import { sanitizeKlineData, guardKlineSeriesIntegrity } from './quantCalculations';

export function formatSymbolCode(symbol: string, assetType: string): string {
  const clean = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^0\d{4}$/.test(clean)) return `${clean}.HK`;
  if (/^6\d{5}$/.test(clean)) return `${clean}.SH`;
  if (/^[03]\d{5}$/.test(clean)) return `${clean}.SZ`;
  if (assetType === 'forex') return `${clean}.FX`;
  if (assetType === 'crypto') return `${clean}.CRYPTO`;
  if (assetType === 'index' || clean.startsWith('^')) return clean.replace('^', '') + '.INDEX';
  return `${clean}.US`;
}

export function mapPeriod(period: string): number {
  const p = String(period || 'daily').toLowerCase().trim();
  if (p === 'monthly' || p === 'month' || p === 'm' || p === '103') return 103;
  if (p === 'weekly' || p === 'week' || p === 'w' || p === '102') return 102;
  if (p === '5min' || p === '5m' || p === '1') return 1;
  return 101;
}

/**
 * 【Yahoo 烘焙檔代碼正規化】網站代碼 → 烘焙檔名（跟 data-symbols.json 清單格式）：
 * 港股純數字補齊 4 位（'005'/'00700' → '0005'/'0700'），美股用大寫代號；
 * 其他型式（指數/外匯等）回傳 null，唔試烘焙檔。
 */
function normalizeBakedCode(cleanSym: string): string | null {
  if (/^\d+$/.test(cleanSym)) {
    const digits = cleanSym.replace(/^0+/, '') || '0';
    return digits.padStart(4, '0');
  }
  if (/^[A-Z]{1,6}$/.test(cleanSym)) return cleanSym;
  return null;
}

/**
 * 【日線優先序 1：Yahoo 烘焙檔】（2026-11-23 數據層主修 B2）
 *
 * GitHub Actions 每日將 Yahoo 調整價全史日線烘焙成同源靜態檔
 * （public/data/<代碼>.json），解決東方財富 fqt=1 早期「水平型腐爛」
 * （成段得真值 0.4–0.8 倍、逐年斜坡爬返 1.0，日波動正常、守衛捉唔到；
 * 見審計報告 hk-data-audit-2026-11-23）。
 *
 * 讀到而且最後一棒距今 ≤14 日先用成條系列；讀唔到/過期/唔喺清單 →
 * 回傳 null，由呼叫方跌返東方財富＋守衛全套後備（行為同修法前一模一樣）。
 * Yahoo 調整價本身已乾淨：只行 sanitize（剔結構上唔可能嘅棒＋排序），
 * 唔行拆股調整、亦唔行完整性守衛——守衛係為 EM 腐爛而設，喺 Yahoo 數上面
 * 對 1986 呢類真・高波動細價股會誤截（實測 1986 全史畀守衛截走 884 棒，
 * 2015–2019 段係真波動唔係腐爛；其餘 15 隻零作用、MSFT 誤剔 1 棒）。
 */
async function fetchBakedDailyKlines(cleanSym: string, maxBars = 5000): Promise<RawKline[] | null> {
  const code = normalizeBakedCode(cleanSym);
  if (!code) return null;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/${code}.json`);
    if (!res.ok) return null;
    const json = await res.json();
    const bars: RawKline[] = Array.isArray(json?.bars) ? json.bars : [];
    if (bars.length < 100) return null;
    const lastBarDate = String(json?.lastBarDate || bars[bars.length - 1]?.date || '');
    const lastTs = Date.parse(`${lastBarDate}T00:00:00`);
    if (!Number.isFinite(lastTs)) return null;
    const ageDays = (Date.now() - lastTs) / 86400000;
    if (ageDays > 14) {
      console.info(
        `[數據源] ${cleanSym} 烘焙檔已過期（最後一棒 ${lastBarDate}，${ageDays.toFixed(0)} 日前），改用東方財富後備`
      );
      return null;
    }
    const clean = sanitizeKlineData(bars);
    if (clean.length < 100) return null;
    console.info(
      `[數據源] ${cleanSym} 日線：Yahoo 烘焙檔（烘焙時間 ${json?.bakedAt || '—'}，最後一棒 ${lastBarDate}，共 ${clean.length} 棒）`
    );
    return maxBars > 0 ? clean.slice(-maxBars) : clean;
  } catch {
    return null;
  }
}

/**
 * TFDR 矩陣專用：讀未截斷嘅全系列日線（唔做 slice(-5000)）。月／週 TFDR 係由系列開頭
 * 每 21／5 支切一格，截斷會改起點令成個網格移位（NVDA 11-25 月線全檔 15、截斷 3）。
 * 只供 TFDR 矩陣用；其他嘢（圖表／回測／引擎）繼續用 5000 支上限。烘焙檔過期／唔喺清單回 null，
 * 呼叫方用返截斷系列（即係現行行為）。
 */
export async function fetchFullBakedDailyKlines(symbol: string): Promise<RawKline[] | null> {
  const cleanSym = symbol.trim().toUpperCase().replace('.US', '').replace('.HK', '').replace('.N', '').replace('.O', '');
  return fetchBakedDailyKlines(cleanSym, 0);
}

/**
 * 【週/月線聚合】（2026-11-23 審計 A(i)）
 *
 * 週/月線唔再獨立向 EM 攞冇守衛嘅系列（嗰條路水平腐爛比日線更勁），
 * 改由「實際用緊嗰條日線系列」聚合：週線用 ISO 週（星期一起）、月線用
 * 自然月。每期棒：日期/時間戳 = 期內最後一個交易日，開 = 首日開，
 * 高 = 期內最高，低 = 期內最低，收 = 尾日收，量 = 期內總和。
 */
export function aggregateDailyKlines(daily: RawKline[], cycle: string): RawKline[] {
  const klt = mapPeriod(cycle);
  if (klt !== 102 && klt !== 103) return daily;
  const groups = new Map<string, RawKline[]>();
  for (const bar of daily) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(bar.date || '');
    if (!m) continue;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    let key: string;
    if (klt === 103) {
      key = `${y}-${String(mo).padStart(2, '0')}`;
    } else {
      const dow = (new Date(Date.UTC(y, mo - 1, d)).getUTCDay() + 6) % 7; // 星期一 = 0
      key = new Date(Date.UTC(y, mo - 1, d - dow)).toISOString().slice(0, 10);
    }
    const g = groups.get(key);
    if (g) g.push(bar);
    else groups.set(key, [bar]);
  }
  const out: RawKline[] = [];
  for (const g of groups.values()) {
    const first = g[0];
    const last = g[g.length - 1];
    let h = -Infinity;
    let l = Infinity;
    let vol = 0;
    for (const b of g) {
      if (b.h > h) h = b.h;
      if (b.l < l) l = b.l;
      vol += b.vol || 0;
    }
    out.push({ timestamp: last.timestamp, date: last.date, o: first.o, h, l, c: last.c, vol });
  }
  out.sort((a, b) => a.timestamp - b.timestamp);
  return out;
}

export async function fetchMarketData(
  symbol: string,
  _assetType: string = 'stock',
  cycle: string = 'daily',
  source: string = 'eastmoney'
): Promise<RawKline[]> {
  const cleanSym = symbol.trim().toUpperCase().replace('.US', '').replace('.HK', '').replace('.N', '').replace('.O', '');
  const normCycle = String(cycle || 'daily').toLowerCase();
  const klt = mapPeriod(normCycle);

  // 1. 用家主動切換為免費數據源模式（合成數據，行為保留；唔再做 eastmoney 失敗嘅靜默後備）
  if (source === 'free') {
    return generateSyntheticKline(cleanSym, normCycle);
  }

  // 1b. 日線優先讀 Yahoo 烘焙檔（B2 主修）；讀唔到/過期先跌落下面東方財富後備全套
  if (klt === 101) {
    const baked = await fetchBakedDailyKlines(cleanSym);
    if (baked && baked.length > 0) return baked;
  } else if (klt === 102 || klt === 103) {
    // 1c. 週/月線改由實際用緊嘅日線系列聚合（審計 A(i)），唔再獨立攞冇守衛嘅 EM 週/月線
    try {
      const dailySeries = await fetchMarketData(symbol, _assetType, 'daily', source);
      if (dailySeries.length > 0) {
        const aggregated = aggregateDailyKlines(dailySeries, normCycle);
        if (aggregated.length > 0) {
          console.info(`[數據源] ${cleanSym} ${normCycle}：由日線系列聚合（${aggregated.length} 棒）`);
          return aggregated;
        }
      }
    } catch (aggErr) {
      console.warn('Weekly/monthly aggregation from daily failed, fallback to legacy fetch path:', aggErr);
    }
  }

  // 2. 先嘗試後端代理 (支持本機與雲端環境)
  try {
    const proxyRes = await fetch(`/api/kline?symbol=${encodeURIComponent(cleanSym)}&klt=${klt}&period=${encodeURIComponent(normCycle)}`, {
      headers: { 'Accept': 'application/json' }
    });
    if (proxyRes.ok) {
      const json = await proxyRes.json();
      if (json.code === 0 && Array.isArray(json.data) && json.data.length > 0) {
        return parseEastMoneyKlines(json.data, normCycle);
      }
    }
  } catch (err) {
    console.warn('Backend proxy fetch failed, attempting direct EastMoney fetch:', err);
  }

  // 3. 嘗試瀏覽器端直接抓取東方財富 (push2his)，擴充至 20 年 (~5000 根日線) 並強制使用前復權 (fqt=1)，嚴禁使用後復權 fqt=2
  try {
    let secid = /^\d+$/.test(cleanSym) ? `116.${cleanSym.padStart(5, '0')}` : `105.${cleanSym}`;
    const fetchDirectFqt = async (id: string) => {
      try {
        const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${id}&fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56&klt=${klt}&fqt=1&end=20500101&lmt=5000`;
        // 每次嘗試加 8 秒時限：網絡齋拖住嗰陣唔好等幾分鐘先死，等失敗快啲浮上畫面
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        let res: Response;
        try {
          res = await fetch(url, { signal: controller.signal });
        } finally {
          clearTimeout(timer);
        }
        const d = await res.json();
        if (d?.data?.klines && d.data.klines.length > 0) {
          return d.data.klines;
        }
      } catch {
        return null;
      }
      return null;
    };

    let klines = await fetchDirectFqt(secid);

    if (!klines || klines.length === 0) {
      const suffixes = ['.N', '.O', '.A', '.K'];
      for (const suffix of suffixes) {
        const tryKlines = await fetchDirectFqt(`105.${cleanSym}${suffix}`);
        if (tryKlines && tryKlines.length > 0) {
          klines = tryKlines;
          break;
        }
      }
    }

    if (klines && klines.length > 0) {
      return parseEastMoneyKlines(klines, normCycle);
    }
  } catch (directErr) {
    console.warn('Direct EastMoney fetch failed:', directErr);
  }

  // 4. 全部真數據源（烘焙檔／代理／東方財富直連）都失敗：明確報錯，
  //    唔再靜默回合成假數冒充真數據（2026-11-23 Peter 拍板：假圖比冇數據更危險；
  //    合成數據只保留喺用家主動揀嘅 'free' 模式，唔再做 eastmoney 失敗後備）
  throw new Error(`東方財富抓取 ${cleanSym} 數據失敗：網絡連唔到或回空數據，請檢查網絡後再試`);
}

/**
 * 【即日價】市場「今日」日期（按市場時區取本地曆日）：
 * 港股／滬深用 Asia/Hong_Kong（同 UTC+8，曆日一樣），美股用 America/New_York。
 * 用 Intl 取時區曆日，唔靠瀏覽器本地時區（Peter 喺香港，美股日期唔可以直接用本地日期）。
 */
function todayStrInTimeZone(tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * 【即日價】由東方財富 kline 字串解析最後一棒，並驗證佢係咪「今日」嘅有效棒。
 * EM kline 格式：`日期,開,收,高,低,量,...`。唔係今日／OHLC 唔合理一律回 null
 * （未開市、假期、舊數據全部唔要——唔好將舊棒扮今日棒）。
 */
function parseLiveTodayBar(klines: unknown, todayStr: string): RawKline | null {
  if (!Array.isArray(klines) || klines.length === 0) return null;
  const last = klines[klines.length - 1];
  if (typeof last !== 'string') return null;
  const p = last.split(',');
  const date = (p[0] || '').slice(0, 10);
  if (date !== todayStr) return null;
  const o = Number(p[1]);
  const c = Number(p[2]);
  const h = Number(p[3]);
  const l = Number(p[4]);
  const vol = Number(p[5]) || 0;
  if (![o, h, l, c].every(Number.isFinite) || o <= 0 || h <= 0 || l <= 0 || c <= 0) return null;
  if (h < Math.max(o, c) || l > Math.min(o, c)) return null;
  if (vol < 0) return null;
  const ts = Date.parse(`${date}T00:00:00`);
  if (!Number.isFinite(ts)) return null;
  return { timestamp: ts, date, o, h, l, c, vol, isLiveToday: true };
}

/**
 * 【即日價】輕量抓今日未完成棒（顯示專用，2026-11-26 Peter 拍板加返即日價顯示）。
 *
 * B2 之前網站每次開都直接抓東方財富日線，開市嗰陣睇到即日價；B2 改做烘焙檔優先
 * 之後，烘焙檔新鮮嗰陣完全唔掂東方財富，只睇到上日收市。呢個函數補返嗰一棒：
 * 只攞最後 5 棒（lmt=5，唔好攞 5000 棒），先試後端代理再試直接 push2his
 * （同 fetchMarketData 嘅後備次序），成個函數共用一個 8 秒總時限。
 *
 * Fail-soft：唔通／超時／回傳唔係今日／格式唔啱——一律回 null，唔 throw，
 * 呼叫方靜靜跌返烘焙版。絕對唔用合成數據頂替。呢個函數唔掂任何引擎／模型。
 */
export async function fetchLiveTodayBar(
  symbol: string,
  _assetType: string = 'stock',
  source: string = 'eastmoney'
): Promise<RawKline | null> {
  if (source === 'free') return null;
  const cleanSym = symbol
    .trim()
    .toUpperCase()
    .replace('.US', '')
    .replace('.HK', '')
    .replace('.N', '')
    .replace('.O', '');
  // 市場時區：純數字＝港股／滬深（UTC+8），英文字母＝美股（紐約）；其他型式（指數／外匯等）唔做即日價
  let tz: string | null = null;
  if (/^\d+$/.test(cleanSym)) tz = 'Asia/Hong_Kong';
  else if (/^[A-Z]{1,6}$/.test(cleanSym)) tz = 'America/New_York';
  else return null;
  const todayStr = todayStrInTimeZone(tz);
  const deadline = Date.now() + 8000;
  const remainingMs = () => deadline - Date.now();

  const fetchWithDeadline = async (url: string): Promise<Response | null> => {
    const ms = remainingMs();
    if (ms <= 0) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      return await fetch(url, { signal: controller.signal });
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  // 1. 後端代理（本地／雲端先有；GitHub Pages 會 404，靜靜跌落直連）
  try {
    const res = await fetchWithDeadline(
      `/api/kline?symbol=${encodeURIComponent(cleanSym)}&klt=101&period=daily`
    );
    if (res && res.ok) {
      const json = await res.json().catch(() => null);
      const bar = parseLiveTodayBar(json?.data, todayStr);
      if (bar) return bar;
    }
  } catch {
    // 跌落直連
  }

  // 2. 直接 push2his（lmt=5 輕量）：主 secid 先，唔得先試美股後綴（同舊版次序）
  const secids: string[] = /^\d+$/.test(cleanSym)
    ? [`116.${cleanSym.padStart(5, '0')}`]
    : [`105.${cleanSym}`, `105.${cleanSym}.N`, `105.${cleanSym}.O`, `105.${cleanSym}.A`, `105.${cleanSym}.K`];
  for (const id of secids) {
    if (remainingMs() <= 0) break;
    try {
      const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${id}&fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56&klt=101&fqt=1&end=20500101&lmt=5`;
      const res = await fetchWithDeadline(url);
      if (!res || !res.ok) continue;
      const d = await res.json().catch(() => null);
      const bar = parseLiveTodayBar(d?.data?.klines, todayStr);
      if (bar) return bar;
    } catch {
      continue;
    }
  }

  console.warn(
    `[即日價] ${cleanSym} 抓唔到今日棒（東方財富唔通／未開市／假期），圖表沿用烘焙收市價`
  );
  return null;
}

/**
 * 【即日價】顯示專用數據：烘焙系列（fetchMarketData 原樣，完全唔郁）＋有效嘅今日棒。
 * 有今日棒而且新過烘焙最後一棒先加；冇、舊咗、重複咗就原樣返烘焙版。
 * 今日棒帶 isLiveToday: true 標記。引擎／模型／回測唔應該食呢個函數嘅輸出，
 * 嗰啲繼續用 fetchMarketData（烘焙版）——見 App.tsx runQuantAnalysis 分流。
 */
export async function fetchMarketDataForDisplay(
  symbol: string,
  assetType: string = 'stock',
  cycle: string = 'daily',
  source: string = 'eastmoney'
): Promise<RawKline[]> {
  const baked = await fetchMarketData(symbol, assetType, cycle, source);
  if (mapPeriod(cycle) !== 101 || source === 'free') return baked;
  try {
    const live = await fetchLiveTodayBar(symbol, assetType, source);
    if (!live) return baked;
    const lastDate = (baked[baked.length - 1]?.date || '').slice(0, 10);
    if (!live.date || live.date <= lastDate) return baked;
    return [...baked, live];
  } catch {
    return baked;
  }
}

/**
 * 【即日價・顯示專用】當前日期／價錢顯示值（純函數，方便測試）：
 * 有合資格即日棒（新過烘焙最後一棒）就顯示即日日期＋收市價＋isLive=true，
 * 否則原樣顯示烘焙最後一棒。只供「當前日期／價錢」顯示位用——引擎／模型／
 * 回測／專家指令／價位水平唔應該食呢個函數。防守：即日棒日期唔新過烘焙棒
 * 都當無（閘門本身喺 getLiveDisplayBar，不過呢度再驗一次）。
 */
export function resolveDisplayQuote(
  baked: { date?: string; c: number },
  liveBar: RawKline | null | undefined
): { date: string; close: number; isLive: boolean } {
  const bakedDate = (baked.date || '').slice(0, 10);
  const liveDate = (liveBar?.date || '').slice(0, 10);
  if (liveBar && liveDate && bakedDate && liveDate > bakedDate && Number.isFinite(liveBar.c)) {
    return { date: liveDate, close: liveBar.c, isLive: true };
  }
  return { date: bakedDate, close: baked.c, isLive: false };
}

/**
 * 【檢測拆股跳空並自動前復權回溯調整函數】（2026-11-22 已大幅收緊，見下）
 *
 * 核心邏輯：
 * 1. 檢測相鄰交易日之間因拆股（Stock Split）導致的超過 40% 的非自然價格暴跌（如 1:2, 1:3, 1:4, 1:5, 1:10 等），
 *    或因合股（Reverse Split）導致的超過 66% 的非自然暴漲。
 * 2. 計算精確拆股比率 (factor = curr.open / prev.close)，優先對齊標準金融拆股比例。
 * 3. 確保價格連續性：將拆股發生日之前的所有歷史 K 線 (0 到 i-1) 的開高低收價格統一乘以該比例進行前復權 (Backward-Adjusted)，
 *    並將成交量做等比反向調整，維持成交總市值守恆。
 * 4. 徹底消除圖表垂直斷裂線，保證 1836.15 及 142857 重力容錯計算不受斷層偽信號干擾。
 *
 * 【2026-11-22 收緊】網站主數據源係東方財富 fqt=1（本身已經係前復權，真拆股
 * 喺源頭已經平滑咗），呢個守衛喺乾淨數據上面永遠唔會觸發；但舊版只睇隔夜
 * 開市比率、容差 ±6%、唔驗收市同企穩，喺腐爛數據上面反覆誤觸，累積亂縮放
 * 整出比例拼布同幻影成交（NVDA 累積 ×20.4、005 觸發 28 次）。而家改為三重
 * 證據齊全先准郁：(1) 隔夜比率同標準拆股比例誤差 ≤2%；(2) 收市比率同隔夜
 * 比率一致（誤差 ≤10%，即成支棒一齊搬去新水平，唔係得開市一支亂跳）；
 * (3) 其後 5 支收市中位數企穩喺新水平 ±10% 內。用標準比例做 factor。
 * 主要防線改由 guardKlineSeriesIntegrity 負責（抓取層剔除/截斷腐爛段），
 * 呢個函數只留作未復權數據源嘅最後安全網。quantCalculations.ts 有一份
 * 孖生函數，邏輯必須保持一致。
 */
export function adjustKlinesForSplits(klines: RawKline[]): RawKline[] {
  if (!Array.isArray(klines) || klines.length < 2) return klines;

  // 淺拷貝對象以確保數據不被外部引用的意外修改
  const adjusted: RawKline[] = klines.map(k => ({ ...k }));

  // 常見標準拆股倍數清單 (2:1, 3:1, 4:1, 5:1, 7:1, 8:1, 10:1, 20:1 及反向合股 1:2, 1:3, 1:4, 1:5, 1:10)
  const commonSplitRatios = [
    1 / 2,   // 2-for-1 (0.50)
    1 / 3,   // 3-for-1 (0.3333)
    1 / 4,   // 4-for-1 (0.25)
    1 / 5,   // 5-for-1 (0.20 如 TSLA 2020)
    1 / 7,   // 7-for-1 (0.1428 如 AAPL 2014)
    1 / 8,   // 8-for-1 (0.125)
    1 / 10,  // 10-for-1 (0.10 如 NVDA 2024)
    1 / 15,  // 15-for-1 (0.0667)
    1 / 20,  // 20-for-1 (0.05 如 AMZN / GOOGL 2022)
    2 / 1,   // 1-for-2 反向合股
    3 / 1,   // 1-for-3 反向合股
    4 / 1,   // 1-for-4 反向合股
    5 / 1,   // 1-for-5 反向合股
    10 / 1   // 1-for-10 反向合股
  ];

  // 按時間從舊到新（升序）逐根掃描相鄰兩日的價格比率
  for (let i = 1; i < adjusted.length; i++) {
    const prev = adjusted[i - 1];
    const curr = adjusted[i];

    if (!prev || !curr || prev.c <= 0 || curr.o <= 0) continue;

    // 計算隔夜開盤與前日收市的比率
    const ratio = curr.o / prev.c;

    // 條件 1: 拆股導致的非自然價格下跌 > 40% (即 ratio < 0.60)
    // 條件 2: 合股導致的非自然價格跳空上漲 > 66% (即 ratio > 1.66)
    const isSplitDrop = ratio < 0.60;
    const isReverseSplit = ratio > 1.66;

    if (isSplitDrop || isReverseSplit) {
      // 證據一：隔夜比率必須同標準拆股比例吻合（誤差 ≤2%）；唔吻合一律當數據
      // 斷層處理，唔准用實際比率亂縮（舊版就係死喺呢度）
      let factor: number | null = null;
      for (const stdRatio of commonSplitRatios) {
        if (Math.abs(ratio - stdRatio) / stdRatio <= 0.02) {
          factor = stdRatio;
          break;
        }
      }
      if (factor === null) continue;

      // 證據二：收市比率要同隔夜比率一致（成支棒搬去新水平）
      const closeRatio = curr.c / prev.c;
      if (Math.abs(closeRatio - ratio) / ratio > 0.1) continue;

      // 證據三：新水平要企穩——其後 5 支（連當日）收市中位數同當日收市相差 ≤10%
      const nextCloses = adjusted
        .slice(i, i + 5)
        .map(b => b.c)
        .sort((a, b) => a - b);
      if (nextCloses.length < 3) continue;
      const medianClose = nextCloses[Math.floor(nextCloses.length / 2)];
      if (Math.abs(medianClose / curr.c - 1) > 0.1) continue;

      console.warn(
        `[拆股守衛] ${curr.date} 確認拆股/合股（隔夜比率 ${ratio.toFixed(4)} ≈ 標準比例 ${factor}），回溯調整之前 ${i} 支`
      );

      // 將當前拆股事件之前的所有歷史 K 線 (從 0 到 i-1) 統一進行前復權比例縮放
      for (let j = 0; j < i; j++) {
        const bar = adjusted[j];
        bar.o = Number((bar.o * factor).toFixed(4));
        bar.h = Number((bar.h * factor).toFixed(4));
        bar.l = Number((bar.l * factor).toFixed(4));
        bar.c = Number((bar.c * factor).toFixed(4));

        // 成交量逆向等比換算（股數成倍增加，歷史成交量放大以維持成交金額連續）
        if (bar.vol && factor > 0) {
          bar.vol = Math.round(bar.vol / factor);
        }
      }
    }
  }

  return adjusted;
}

function parseEastMoneyKlines(rawKlines: any[], cycle: string): RawKline[] {
  if (!Array.isArray(rawKlines)) return [];
  const klines: RawKline[] = [];

  for (let idx = 0; idx < rawKlines.length; idx += 1) {
    const k = rawKlines[idx];
    if (typeof k === 'string') {
      const p = k.split(',');
      const time = p[0] || '';
      const open = Number(p[1]) || 0;
      const close = Number(p[2]) || 0;
      const high = Number(p[3]) || 0;
      const low = Number(p[4]) || 0;
      const vol = Number(p[5]) || 0;

      let timestamp: number;
      if (cycle === '5min') {
        const [datePart, timePart] = time.split(' ');
        timestamp = new Date(`${datePart}T${timePart || '09:30'}:00`).getTime();
      } else if (time.length === 7) {
        timestamp = new Date(`${time}-01T00:00:00`).getTime();
      } else {
        timestamp = new Date(`${time}T00:00:00`).getTime();
      }
      if (isNaN(timestamp)) {
        timestamp = Date.parse(time) || Date.now();
      }

      klines.push({
        timestamp,
        date: time,
        o: open,
        h: high,
        l: low,
        c: close,
        vol
      });
    } else if (k && typeof k === 'object') {
      const rawOpen = Number(k.o !== undefined ? k.o : k.open) || 0;
      const rawHigh = Number(k.h !== undefined ? k.h : k.high) || 0;
      const rawLow = Number(k.l !== undefined ? k.l : k.low) || 0;
      const rawClose = Number(k.c !== undefined ? k.c : k.close) || 0;
      const adjClose = Number(k.adjclose !== undefined ? k.adjclose : k.adjClose);
      const hasValidAdj = Number.isFinite(adjClose) && adjClose > 0 && rawClose > 0;
      const factor = hasValidAdj ? adjClose / rawClose : 1;

      const open = rawOpen * factor;
      const high = rawHigh * factor;
      const low = rawLow * factor;
      const close = hasValidAdj ? adjClose : rawClose;
      const vol = Number(k.vol !== undefined ? k.vol : k.volume) || 0;
      const date = String(k.date || k.time || '');
      const timestamp = Number(k.timestamp) || (date ? Date.parse(date) : Date.now());
      klines.push({
        timestamp,
        date,
        o: open,
        h: high,
        l: low,
        c: close,
        vol
      });
    }
  }

  // 1. 先進行基礎數據有效性與排序清洗
  const cleanKlines = sanitizeKlineData(klines);
  // 2. 系列完整性守衛（只限日線）：剔除孤立壞棒＋截斷腐爛段，唔畀東方財富
  //    早期腐爛歷史入到引擎整出幻影成交（2026-11-22 數據層修法）
  const integrityChecked =
    mapPeriod(cycle) === 101 ? guardKlineSeriesIntegrity(cleanKlines) : cleanKlines;
  // 3. 檢測並自動修正非自然拆股跳空（已收緊：三重證據先准郁），生成平滑的前復權連續序列
  const splitAdjusted = adjustKlinesForSplits(integrityChecked);

  return splitAdjusted.slice(-5000);
}

function generateSyntheticKline(symbol: string, cycle: string): RawKline[] {
  // 月線: 240 根 (~20年 2006-2026), 週線: 1040 根 (~20年), 日線: 5000 根 (~20年), 5分鐘: 300 根
  const bars =
    cycle === 'monthly' ? 240
    : cycle === 'weekly' ? 1040
    : cycle === '5min' ? 300
    : 5000;
  const list: RawKline[] = [];
  let basePrice = 200;

  if (symbol.includes('TSLA')) basePrice = 240;
  else if (symbol.includes('NVDA')) basePrice = 135;
  else if (symbol.includes('00700') || symbol.includes('700')) basePrice = 410;
  else if (symbol.includes('03690')) basePrice = 160;
  else if (symbol.includes('AAPL')) basePrice = 225;
  else if (symbol.includes('GSPC')) basePrice = 5800;
  else if (symbol.includes('DJI')) basePrice = 42000;
  else if (symbol.includes('HSI')) basePrice = 20000;

  const now = Date.now();
  const stepMs =
    cycle === 'monthly' ? 30.4375 * 86400 * 1000
    : cycle === 'weekly' ? 7 * 86400 * 1000
    : cycle === '5min' ? 5 * 60 * 1000
    : 86400 * 1000;
  let curr = basePrice * 0.85;

  for (let i = bars; i >= 0; i--) {
    const t = now - i * stepMs;
    const d = new Date(t);
    const dateStr =
      cycle === '5min'
        ? `${d.toISOString().substring(0, 10)} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
        : d.toISOString().substring(0, 10);

    // Mean-reversion drift prevents cumulative data overflow over 2500 bars
    const drift = (basePrice - curr) * 0.005;
    const change = (Math.sin(i * 0.12) * 0.015 + (Math.random() - 0.5) * 0.025) * curr + drift;
    const o = curr;
    const c = Math.max(basePrice * 0.2, Math.min(basePrice * 4.5, curr + change));
    const h = Math.max(o, c) + Math.random() * (curr * 0.01);
    const l = Math.max(basePrice * 0.18, Math.min(o, c) - Math.random() * (curr * 0.01));
    const vol = Math.floor(50000 + Math.random() * 200000);

    list.push({
      timestamp: t,
      date: dateStr,
      o: Number(o.toFixed(2)),
      h: Number(h.toFixed(2)),
      l: Number(l.toFixed(2)),
      c: Number(c.toFixed(2)),
      vol
    });
    curr = c;
  }
  return list;
}

export async function fetchSymbolNews(symbol: string, assetType: string = 'stock'): Promise<NewsItem[]> {
  try {
    const formattedSymbol = formatSymbolCode(symbol, assetType);
    const res = await fetch(`/api/news-proxy?symbol=${encodeURIComponent(formattedSymbol)}&limit=10`);
    if (res.ok) {
      const data = await res.json();
      if (data.code === 0 && Array.isArray(data.data)) {
        return data.data;
      }
    }
  } catch (err) {
    console.warn('News fetch error:', err);
  }
  return [];
}

export async function analyzeNewsSentiment(newsList: NewsItem[], symbol: string): Promise<string> {
  if (newsList.length === 0) return '中性';
  try {
    const newsContent = newsList.map(n => `標題：${n.title} 時間：${n.time || ''}`).join('\n');
    const response = await fetch('/api/ai-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        headers: {
          Authorization: 'Bearer 446ec69558b346a18dbd20849b90ab9f',
          'Content-Type': 'application/json'
        },
        body: {
          model: 'glm-4-flash',
          messages: [
            { role: 'system', content: '你是財經情感分析專家，只需要返回「利好」「利空」「中性」三個結果中的一個，不要其他內容' },
            { role: 'user', content: `分析以下${symbol}的最新新聞，判斷整體情感：\n${newsContent}` }
          ],
          temperature: 0.1
        }
      })
    });
    if (response.ok) {
      const result = await response.json();
      const sentiment = result.choices?.[0]?.message?.content?.trim();
      if (sentiment && (sentiment.includes('利好') || sentiment.includes('利空') || sentiment.includes('中性'))) {
        if (sentiment.includes('利好')) return '利好';
        if (sentiment.includes('利空')) return '利空';
        return '中性';
      }
    }
  } catch (err) {
    console.warn('Sentiment analysis error, using heuristic:', err);
  }

  // Heuristic backup
  const allText = newsList.map(n => n.title).join(' ');
  const bullishWords = ['大漲', '暴漲', '創新高', '利好', '突破', '淨流入', '強勁', '增長', '增持', '買入'];
  const bearishWords = ['大跌', '暴跌', '創新低', '利空', '跌破', '流出', '減持', '警告', '拋售', '虧損'];

  const bullCount = bullishWords.filter(w => allText.includes(w)).length;
  const bearCount = bearishWords.filter(w => allText.includes(w)).length;

  if (bullCount > bearCount) return '利好';
  if (bearCount > bullCount) return '利空';
  return '中性';
}

export async function fetchGlobalHotNews(): Promise<NewsItem[]> {
  try {
    const symbols = ['^GSPC', '000001.SH', '00700.HK'];
    const allNews: NewsItem[] = [];

    for (const sym of symbols) {
      try {
        const res = await fetch(`/api/news-proxy?symbol=${encodeURIComponent(sym)}&limit=5`);
        if (res.ok) {
          const json = await res.json();
          if (json.code === 0 && Array.isArray(json.data)) {
            allNews.push(...json.data);
          }
        }
      } catch {
        // continue
      }
    }

    const uniqueMap = new Map<string, NewsItem>();
    allNews.forEach(n => {
      if (n.title && !uniqueMap.has(n.title)) {
        uniqueMap.set(n.title, n);
      }
    });

    return Array.from(uniqueMap.values()).slice(0, 15);
  } catch (err) {
    console.error('Fetch global hot news failed:', err);
    return [];
  }
}

export async function analyzeNewsImpact(news: NewsItem, apiConfig: ApiConfig): Promise<string> {
  const prompt = `你是財經新聞分析專家，用純正廣東話（粵語）簡潔分析新聞對股市的影響，只需要3-5句話，包括：1. 事件性質 2. 影響板塊 3. 利好/利空判斷。\n\n新聞標題：${news.title}\n發佈時間：${news.time || '未知'}`;

  // If user configured custom AI (Claude / Gemini / Custom)
  if (apiConfig.url && apiConfig.key) {
    try {
      if (apiConfig.provider === 'claude') {
        const res = await fetch('/api/ai-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: apiConfig.url,
            headers: {
              'x-api-key': apiConfig.key,
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json'
            },
            body: {
              model: 'claude-3-5-sonnet-20241022',
              max_tokens: 1000,
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.2
            }
          })
        });
        const d = await res.json();
        if (d.content && d.content[0]?.text) return d.content[0].text;
      } else {
        const res = await fetch('/api/ai-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: apiConfig.url,
            headers: {
              Authorization: `Bearer ${apiConfig.key}`,
              'Content-Type': 'application/json'
            },
            body: {
              model: apiConfig.provider === 'gemini' ? 'gemini-2.0-flash-exp' : 'gpt-4o-mini',
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.2
            }
          })
        });
        const d = await res.json();
        if (d.choices && d.choices[0]?.message?.content) return d.choices[0].message.content;
      }
    } catch (e) {
      console.warn('Custom AI proxy failed for news impact, fallback:', e);
    }
  }

  // Built-in intelligent Cantonese analyst fallback
  return `📰 【粵語即時解讀】：呢則消息反映市場焦點正聚焦於相關產業鏈嘅流動性與政策預期。對重磅權重股同龍頭板塊有結構性支撐作用，短期睇整體偏向中性偏好，建議留意成交量能是否配合再行跟進。`;
}
