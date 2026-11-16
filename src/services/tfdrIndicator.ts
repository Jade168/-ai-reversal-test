import { RawKline } from '../types/quant';

export interface TFDRPoint {
  index: number;
  score: number;      // 0 - 100 分數 (>80 危險頂, <30 黃金底)
  // 上方紅色危險阻力帶 (3條動態曲線)
  band95: number;     // 95 極度危險頂
  band90: number;     // 90 奇點逃頂線
  band85: number;     // 85 加速預警線
  // 下方綠色黃金支撐帶 (3條動態曲線)
  band25: number;     // 25 觀察支撐線
  band15: number;     // 15 奇點抄底線
  band10: number;     // 10 極度恐慌底
}

export interface MultiTimeframeTFDR {
  dailyScore: number;
  weeklyScore: number;
  monthlyScore: number;
  regimeTitle: string;
  actionAdvice: string;
  riskLevel: 'EXTREME_TOP' | 'SHORT_OVERHEAT' | 'EXTREME_BOTTOM' | 'HEALTHY';
}

export function calculateTFDRSeries(
  closes: number[],
  highs: number[],
  lows: number[],
  period: number = 14
): TFDRPoint[] {
  const results: TFDRPoint[] = [];
  let lastHighIdx = 0;
  let lastLowIdx = 0;
  let prevHighInterval = period;
  let prevLowInterval = period;

  for (let i = 0; i < closes.length; i++) {
    if (i < period) {
      results.push({
        index: i,
        score: 50,
        band95: highs[i],
        band90: highs[i],
        band85: highs[i],
        band25: lows[i],
        band15: lows[i],
        band10: lows[i],
      });
      continue;
    }

    let sumClose = 0;
    let sumRange = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sumClose += closes[j];
      sumRange += highs[j] - lows[j];
    }
    const mid = sumClose / period;
    const atr = Math.max(0.0001, sumRange / period);

    const windowCloses = closes.slice(i - period, i);
    const maxVal = Math.max(...windowCloses);
    const minVal = Math.min(...windowCloses);
    const current = closes[i];

    // 計算一階速度與二階加速度 (雙曲轉邏輯減速核心)
    const v1 = closes[i] - closes[i - 1];
    const v0 = closes[i - 1] - closes[i - 2];
    const acceleration = v1 - v0;

    let score = 50 + ((current - mid) / (atr * 2)) * 20;

    // 頂部雙曲奇點檢測：創新高 + 時間間隔壓縮 + 加速度轉負(邏輯減速)
    if (current >= maxVal) {
      const interval = Math.max(1, i - lastHighIdx);
      const compression = Math.min(2.5, prevHighInterval / interval);
      score = Math.min(98, 72 + compression * 10);
      if (interval <= 4 && acceleration < 0 && v1 > 0) {
        score = Math.max(score, 92); // 觸發 90-95 奇點危險區
      }
      prevHighInterval = interval;
      lastHighIdx = i;
    }

    // 底部雙曲奇點檢測：創新低 + 時間間隔壓縮 + 下跌減速(加速度轉正)
    if (current <= minVal) {
      const interval = Math.max(1, i - lastLowIdx);
      const compression = Math.min(2.5, prevLowInterval / interval);
      score = Math.max(2, 28 - compression * 10);
      if (interval <= 4 && acceleration > 0 && v1 < 0) {
        score = Math.min(score, 12); // 觸發 10-15 奇點抄底區
      }
      prevLowInterval = interval;
      lastLowIdx = i;
    }

    // 映射主圖動態 6 軌臨界曲線價格
    const velocity = (closes[i] - closes[Math.max(0, i - 5)]) / 5;
    const prevVelocity = (closes[Math.max(0, i - 5)] - closes[Math.max(0, i - 10)]) / 5;
    const accelFactor = 1 + Math.min(0.6, Math.max(-0.4, (velocity - prevVelocity) / atr));
    const unit = atr * accelFactor;

    const band95 = Number((mid + unit * 3.8).toFixed(2)); // 最頂層 95
    const band90 = Number((mid + unit * 3.1).toFixed(2)); // 中間層 90
    const band85 = Number((mid + unit * 2.4).toFixed(2)); // 預警層 85
    const band25 = Number((mid - unit * 2.4).toFixed(2)); // 觀察層 25
    const band15 = Number((mid - unit * 3.1).toFixed(2)); // 中間層 15
    const band10 = Number((mid - unit * 3.8).toFixed(2)); // 最底層 10

    // 確保 K 線最低價觸及或跌穿綠色 15 地板線時對稱觸發奇點底評分 (<= 15)
    if (lows[i] <= band15) {
      score = Math.min(score, 15);
    }
    score = Math.max(0, Math.min(100, Math.round(score)));

    results.push({
      index: i,
      score,
      band95,
      band90,
      band85,
      band25,
      band15,
      band10,
    });
  }
  return results;
}

export function evaluateMultiTimeframeTFDR(
  dailyScore: number,
  weeklyScore: number,
  monthlyScore: number
): MultiTimeframeTFDR {
  if (dailyScore >= 88 && weeklyScore >= 85 && monthlyScore >= 85) {
    return {
      dailyScore,
      weeklyScore,
      monthlyScore,
      regimeTitle: '🚨 三軌齊爆・世紀大頂共振',
      actionAdvice: '日、週、月全週期進入雙曲泡沫奇點，建議果斷清倉鎖定利潤，嚴防系統性暴跌。',
      riskLevel: 'EXTREME_TOP'
    };
  }
  if (dailyScore >= 85 && monthlyScore < 75) {
    return {
      dailyScore,
      weeklyScore,
      monthlyScore,
      regimeTitle: '⚠️ 短熱長多・波段洗盤預警',
      actionAdvice: '日線動能已達極限(85+)，但月線大週期依然健康。屬於牛市途中的短線過熱，建議減持30%-50%短線倉位高拋低吸，保留底倉。',
      riskLevel: 'SHORT_OVERHEAT'
    };
  }
  if (dailyScore <= 18 && weeklyScore <= 25) {
    return {
      dailyScore,
      weeklyScore,
      monthlyScore,
      regimeTitle: '🔥 雙軌見底・歷史黃金抄底區',
      actionAdvice: '日線與週線恐慌加速度同時耗盡，進入10-15奇點地板區，V型反轉機率極高，建議分批重倉吸納。',
      riskLevel: 'EXTREME_BOTTOM'
    };
  }
  return {
    dailyScore,
    weeklyScore,
    monthlyScore,
    regimeTitle: '⚖️ 邏輯穩態・趨勢正常運行',
    actionAdvice: '各週期均處於常規運行區間，未觸發雙曲奇點相變，按原定支撐阻力位持倉觀望即可。',
    riskLevel: 'HEALTHY'
  };
}

function aggregateBarsByStep(
  dailyBars: RawKline[],
  step: number
): { closes: number[]; highs: number[]; lows: number[] } {
  const closes: number[] = [];
  const highs: number[] = [];
  const lows: number[] = [];

  for (let i = 0; i < dailyBars.length; i += step) {
    const chunk = dailyBars.slice(i, i + step);
    if (chunk.length === 0) continue;
    let hi = -Infinity;
    let lo = Infinity;
    for (const bar of chunk) {
      if (bar.h > hi) hi = bar.h;
      if (bar.l < lo) lo = bar.l;
    }
    closes.push(chunk[chunk.length - 1].c);
    highs.push(hi);
    lows.push(lo);
  }

  return { closes, highs, lows };
}

export interface AlignedTFDRPoint {
  timestamp: number;
  dailyScore: number;
  weeklyScore: number;
  monthlyScore: number;
}

export function computeMultiTimeframeTFDRFromDaily(dailyBars: RawKline[]): MultiTimeframeTFDR {
  if (!dailyBars || dailyBars.length === 0) {
    return evaluateMultiTimeframeTFDR(50, 50, 50);
  }

  const dailyCloses = dailyBars.map(b => b.c);
  const dailyHighs = dailyBars.map(b => b.h);
  const dailyLows = dailyBars.map(b => b.l);
  const dailySeries = calculateTFDRSeries(dailyCloses, dailyHighs, dailyLows);
  const dailyScore = dailySeries.length > 0 ? dailySeries[dailySeries.length - 1].score : 50;

  const weeklyAgg = aggregateBarsByStep(dailyBars, 5);
  const weeklySeries = calculateTFDRSeries(weeklyAgg.closes, weeklyAgg.highs, weeklyAgg.lows);
  const weeklyScore = weeklySeries.length > 0 ? weeklySeries[weeklySeries.length - 1].score : 50;

  const monthlyAgg = aggregateBarsByStep(dailyBars, 21);
  const monthlySeries = calculateTFDRSeries(monthlyAgg.closes, monthlyAgg.highs, monthlyAgg.lows);
  const monthlyScore = monthlySeries.length > 0 ? monthlySeries[monthlySeries.length - 1].score : 50;

  return evaluateMultiTimeframeTFDR(dailyScore, weeklyScore, monthlyScore);
}

export function computeAlignedMultiTimeframeTFDRSeries(dailyBars: RawKline[]): AlignedTFDRPoint[] {
  if (!dailyBars || dailyBars.length === 0) return [];

  const dailyCloses = dailyBars.map(b => Number(b.c));
  const dailyHighs = dailyBars.map(b => Number(b.h));
  const dailyLows = dailyBars.map(b => Number(b.l));
  const dailySeries = calculateTFDRSeries(dailyCloses, dailyHighs, dailyLows);

  const weeklyAgg = aggregateBarsByStep(dailyBars, 5);
  const weeklySeries = calculateTFDRSeries(weeklyAgg.closes, weeklyAgg.highs, weeklyAgg.lows);

  const monthlyAgg = aggregateBarsByStep(dailyBars, 21);
  const monthlySeries = calculateTFDRSeries(monthlyAgg.closes, monthlyAgg.highs, monthlyAgg.lows);

  return dailyBars.map((bar, i) => {
    const ts = Number.isFinite(Number(bar.timestamp))
      ? Number(bar.timestamp)
      : Date.parse(String(bar.date || ''));
    const wIdx = Math.min(Math.max(0, weeklySeries.length - 1), Math.floor(i / 5));
    const mIdx = Math.min(Math.max(0, monthlySeries.length - 1), Math.floor(i / 21));

    return {
      timestamp: Number.isFinite(ts) ? ts : i,
      dailyScore: dailySeries[i]?.score ?? 50,
      weeklyScore: weeklySeries[wIdx]?.score ?? 50,
      monthlyScore: monthlySeries[mIdx]?.score ?? 50,
    };
  });
}
