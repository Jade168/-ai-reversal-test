import { buildFullPuzzleTimeline, OHLCBar } from './puzzleDecisionEngine';

export interface SingularityLabelPoint {
  index: number;
  price: number;
}

export interface EnginePeriodSingularityLabels {
  highs: SingularityLabelPoint[];
  lows: SingularityLabelPoint[];
}

// 週/月線圖奇點標籤改用引擎週/月 TFDR（丙方案＋85/15，Peter 2026-11-23 拍板）：
// 極值區統一 ≥85（沽）／≤15（買），唔再用展示公式 tfdrIndicator 嘅 turning points。
//
// 每支期燭用嗰個週期「最後一個交易日」嘅引擎 overlay 值（wTfdr／mTfdr）——overlay 嘅
// 週/月 TFDR 係 live 值：用已封口週期嘅中線/ATR 加當期截至當日嘅收市計出嚟，只用當日
// 或之前嘅數據（零未來函數）。所以攞期燭最後一日嗰個值，就係嗰支期燭收口嗰刻引擎已知
// 嗰個 TFDR；進行中嗰支期燭自然攞到最新一日嘅值。唔會用封口之後先計出嘅修訂數。
//
// 貼法沿用舊 turning points 語義：一段連續入區嘅期燭為一簇，沽標籤貼簇內最高 high 嗰支、
// 買標籤貼簇內最低 low 嗰支（同分並列時取後一支，同舊邏輯一致）。
// 引擎數據唔可用（日線太短、計唔到、或者期燭同日線完全對唔上）就回 null，等呼叫方退回舊標籤。
export function computeEnginePeriodSingularityLabels(
  dailyBars: OHLCBar[],
  periodBars: Array<{ date: string; h: number; l: number }>,
  cycle: 'weekly' | 'monthly'
): EnginePeriodSingularityLabels | null {
  if (!dailyBars || dailyBars.length < 70 || !periodBars || periodBars.length === 0) {
    return null;
  }

  let overlays: ReturnType<typeof buildFullPuzzleTimeline>['overlays'];
  try {
    overlays = buildFullPuzzleTimeline(dailyBars).overlays;
  } catch {
    return null;
  }
  if (!overlays || overlays.length === 0) return null;

  // 週期 key：同 marketData.aggregateDailyKlines 一致（週＝ISO 週一日期；月＝YYYY-MM）
  const periodKeyOf = (dateStr: string): string | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr || '');
    if (!m) return null;
    if (cycle === 'monthly') return `${m[1]}-${m[2]}`;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const dow = (new Date(Date.UTC(y, mo - 1, d)).getUTCDay() + 6) % 7; // 星期一 = 0
    return new Date(Date.UTC(y, mo - 1, d - dow)).toISOString().slice(0, 10);
  };

  // 每個週期留低最後一個交易日嘅引擎 TFDR（overlays 按日期正序，逐個覆寫）
  const tfdrByPeriod = new Map<string, number | null>();
  for (const op of overlays) {
    const key = periodKeyOf(op.date);
    if (!key) continue;
    tfdrByPeriod.set(key, cycle === 'weekly' ? op.wTfdr : op.mTfdr);
  }

  // 期燭逐支對返引擎 TFDR（undefined＝嗰期對唔上日線；null＝對得上但引擎未有值）；
  // 一支都對唔上＝數據唔夾，回 null 退回舊標籤
  const periodTfdr: Array<number | null | undefined> = periodBars.map(b => {
    const key = periodKeyOf((b.date || '').slice(0, 10));
    if (!key || !tfdrByPeriod.has(key)) return undefined;
    return tfdrByPeriod.get(key) ?? null;
  });
  if (!periodTfdr.some(t => t !== undefined)) return null;

  const highs: SingularityLabelPoint[] = [];
  const lows: SingularityLabelPoint[] = [];

  let i = 0;
  while (i < periodBars.length) {
    const t = periodTfdr[i];
    if (t != null && t >= 85) {
      let bestIdx = i;
      let bestHigh = periodBars[i].h;
      let j = i + 1;
      while (j < periodBars.length) {
        const tj = periodTfdr[j];
        if (tj == null || tj < 85) break;
        if (periodBars[j].h >= bestHigh) {
          bestHigh = periodBars[j].h;
          bestIdx = j;
        }
        j++;
      }
      highs.push({ index: bestIdx, price: bestHigh });
      i = j;
    } else {
      i++;
    }
  }

  i = 0;
  while (i < periodBars.length) {
    const t = periodTfdr[i];
    if (t != null && t <= 15) {
      let bestIdx = i;
      let bestLow = periodBars[i].l;
      let j = i + 1;
      while (j < periodBars.length) {
        const tj = periodTfdr[j];
        if (tj == null || tj > 15) break;
        if (periodBars[j].l <= bestLow) {
          bestLow = periodBars[j].l;
          bestIdx = j;
        }
        j++;
      }
      lows.push({ index: bestIdx, price: bestLow });
      i = j;
    } else {
      i++;
    }
  }

  return { highs, lows };
}
