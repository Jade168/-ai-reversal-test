// 圖表純數學工具（顯示專用——唔參與任何引擎／模型／TFDR／回測計算）

/**
 * 簡單移動平均（SMA）。窗口未滿 period 嗰陣回 NaN（唔補數、唔向前填），
 * 窗口入面有非有限值嗰陣嗰格都係 NaN。
 */
export function movingAverage(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (period <= 0) return out;
  let sum = 0;
  let valid = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (Number.isFinite(v)) {
      sum += v;
      valid++;
    }
    if (i >= period) {
      const old = values[i - period];
      if (Number.isFinite(old)) {
        sum -= old;
        valid--;
      }
    }
    if (valid === period) out[i] = sum / period;
  }
  return out;
}

/**
 * 前 N 期平均（唔包而家呢格）：out[i] ＝ values[i-period..i-1] 嘅平均，
 * i < period 嗰陣回 NaN。月線 M10 專用——同決策面板「月均線」一致：
 * 之前 10 個已完結月份嘅月尾收市平均，唔包而家呢個月（未收市）。
 * 例如 2026-11 嗰格＝2026-01..10 月尾收市平均＝$200.52。
 */
export function priorMovingAverage(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (period <= 0) return out;
  let sum = 0;
  let valid = 0;
  for (let i = 0; i < values.length; i++) {
    // 滑入 values[i-1]（上一格），滑出 values[i-period-1]（窗口之外）
    if (i - 1 >= 0) {
      const v = values[i - 1];
      if (Number.isFinite(v)) {
        sum += v;
        valid++;
      }
    }
    if (i - period - 1 >= 0) {
      const old = values[i - period - 1];
      if (Number.isFinite(old)) {
        sum -= old;
        valid--;
      }
    }
    if (valid === period) out[i] = sum / period;
  }
  return out;
}

// ── 即日棒・顯示專用：畫圖／撳格／滑桿共用同一條「顯示長度」（烘焙棒＋即日棒）──
// 之前畫圖用 displayBars 長度計 endIdx，撳格用 viewRange（烘焙）長度計，
// 滑桿尾日期又用烘焙棒——三者唔一致，先至撳即日棒嗰格會選中最後一支烘焙棒、
// 條軸停喺烘焙日期（問題 3 根因）。

/** 顯示 endIdx：睇緊尾段（viewRange 尾＝最後一支烘焙棒）嗰陣伸多一格包埋即日棒；已向左平移就唔伸。 */
export function displayEndIdx(baseEnd: number, hasLiveBar: boolean, activeLen: number, displayLen: number): number {
  const ext = hasLiveBar && baseEnd >= activeLen - 1 ? 1 : 0;
  return Math.min(displayLen - 1, baseEnd + ext);
}

/** 撳／hover 格位 → 絕對棒 index（用顯示長度計，同畫圖一致；唔再用 viewRange 長度）。 */
export function clickBarIndex(viewRangeStart: number, relX: number, plotW: number, visibleCount: number): number {
  if (visibleCount <= 0 || plotW <= 0) return viewRangeStart;
  const stepX = plotW / visibleCount;
  const localIdx = Math.min(visibleCount - 1, Math.max(0, Math.floor(relX / stepX)));
  return viewRangeStart + localIdx;
}

/** 滑桿「區間」尾日期：即日棒喺視野尾嗰陣顯示即日日期，否則烘焙尾日期。 */
export function sliderRangeEndDate(
  viewRangeEnd: number,
  activeLen: number,
  lastBakedDate: string,
  liveDate: string | null
): string {
  if (liveDate && viewRangeEnd >= activeLen - 1) return liveDate;
  return lastBakedDate;
}
