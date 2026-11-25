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
