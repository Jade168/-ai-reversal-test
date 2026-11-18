import {
  RawKline,
  ModelBar,
  BacktestStats,
  TradeLog,
  ResonanceAnalysis,
  FourierState,
  FourierSpectrumItem,
  RibbonState,
  TechScore,
  MonthlyStrategyResult,
  ReversalAnchor
} from '../types/quant';
import { buildFullPuzzleTimeline, LAST_SELL_EXPIRY_BARS, OHLCBar } from './puzzleDecisionEngine';

export const QUANT_CONFIG = {
  coreNumber: 1836.15,
  ratio: 0.183615,
  systemPrompt: `你是頂級香港粵語財經分析專家，專注港股美股量化分析，精通1836.15數律模型。嚴格按照以下規則輸出：

1. 核心結論（必須明確）：
   - 明確標出「看多」「看空」「觀望」，絕對唔好模棱兩可
   - 給出目標價位同時間週期（例如：「睇3個月內升到XXX」）

2. 技術面深度分析：
   - 結合1836.15數律模型核心線、歷史高低位、動態支撐阻力位
   - 分析當前價格與歷史極值的關係（例如：「而家喺歷史高位下方5%，屬於高位震盪」）
   - 解讀歸元數字（3、6、9為共振點）同買賣信號的有效性
   - 結合K線形態同成交量變化

3. 基本面與新聞解讀：
   - 結合最新財經新聞，深入分析利好利空對股價的短期同長期影響
   - 評估市場情緒（恐慌/貪婪）同資金流向

4. 回測數據參考：
   - 結合歷史勝率、盈虧比、最大回撤數據，評估策略可信度
   - 如果勝率低於50%，要明確警告用戶謹慎參考

5. 具體操作建議（必須量化）：
   - 入場位：具體價格區間（例如：「180-185之間分批入場」）
   - 止盈位：多級止盈（例如：「第一目標200減倉一半，第二目標220全清」）
   - 止損位：硬止損價格（例如：「跌穿175堅決止損，唔好心存僥倖」）
   - 倉位建議：根據風險評估給出具體比例（例如：「建議3成倉試水，唔好超過5成」）

6. 風險提示（必須具體）：
   - 講清楚當前最大的潛在風險（例如：「美聯儲議息會議臨近，可能會有大波動」）
   - 評估風險等級（低/中/高）
   - 給出應對策略

7. 語言風格：
   - 全程用純粵語口語，唔好講官話、唔好太書面
   - 就好似同股民朋友傾計一樣，親切又專業
   - 絕對唔好用簡體字，所有內容都用繁體粵語
   - 可以用生動比喻，但唔好誇張失實

8. 禁止事項：
   - 唔好模棱兩可講「可能」「或者」呢啲廢話
   - 唔好只講「謹慎操作」而唔俾具體建議
   - 唔好迴避風險，有幾大講幾大`
};

export function getGuiYuan(num: number): number {
  if (num === 0) return 0;
  const mod = Math.abs(num) % 9;
  return mod === 0 ? 9 : mod;
}

export function sanitizeKlineData(data: RawKline[]): RawKline[] {
  if (!Array.isArray(data)) return [];
  const clean: RawKline[] = [];
  const numeric = (val: any) => {
    if (val === null || val === undefined || typeof val === 'boolean' || (typeof val === 'string' && val.trim() === '')) return NaN;
    return Number(val);
  };

  for (const bar of data) {
    if (!bar || typeof bar !== 'object') continue;
    const o = numeric(bar.o);
    const h = numeric(bar.h);
    const l = numeric(bar.l);
    const c = numeric(bar.c);
    if (![o, h, l, c].every(Number.isFinite) || o <= 0 || h <= 0 || l <= 0 || c <= 0 || h < l || h < Math.max(o, c) || l > Math.min(o, c)) continue;
    let timestamp = numeric(bar.timestamp);
    if (!Number.isFinite(timestamp)) timestamp = Date.parse(String(bar.date || ''));
    if (!Number.isFinite(timestamp)) continue;
    clean.push({ ...bar, timestamp, o, h, l, c });
  }
  clean.sort((a, b) => a.timestamp - b.timestamp);
  return clean;
}

/**
 * 【檢測拆股跳空並自動前復權回溯調整函數】
 * 
 * 核心邏輯：
 * 1. 檢測相鄰交易日之間因拆股（Stock Split）導致的超過 40% 的非自然價格暴跌（如 1:2, 1:3, 1:4, 1:5, 1:10 等），
 *    或因合股（Reverse Split）導致的超過 66% 的非自然暴漲。
 * 2. 計算精確拆股比率 (factor = curr.open / prev.close)，優先對齊標準金融拆股比例（容錯 ±6%）。
 * 3. 確保價格連續性：將拆股發生日之前的所有歷史 K 線 (0 到 i-1) 的開高低收價格統一乘以該比例進行前復權 (Backward-Adjusted)，
 *    並將成交量做等比反向調整，維持成交總市值守恆。
 * 4. 徹底消除圖表垂直斷裂線，保證 1836.15 及 142857 重力容錯計算不受斷層偽信號干擾。
 */
export function adjustKlinesForSplits(klines: RawKline[]): RawKline[] {
  if (!Array.isArray(klines) || klines.length < 2) return klines;

  // 淺拷貝對象以確保數據不被外部引用的意外修改
  const adjusted: RawKline[] = klines.map(k => ({ ...k }));

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

      // 若實際跳空比例接近標準拆股比例（誤差在 ±6% 以內），採用標準比率；否則採用實際隔夜比率保證絕對平滑閉合
      let factor = ratio;
      for (const stdRatio of commonSplitRatios) {
        if (Math.abs(ratio - stdRatio) / stdRatio <= 0.06) {
          factor = stdRatio;
          break;
        }
      }

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


// ===================== 週期自適應參數 =====================
// 日/週/月線的每根 K 線波動幅度差異極大（實測 TSLA：日 4.1%、週 10.6%、月 23.7%），
// 用同一組窗口與容差會令高週期完全失效，故按週期分別設定。
export function getTimeframeParams(period: string): { windowSize: number; tolerance: number } {
  const p = String(period || 'daily').toLowerCase();
  if (p === 'monthly' || p === 'month' || p === 'm' || p === '103') {
    return { windowSize: 20, tolerance: 0.030 };
  }
  if (p === 'weekly' || p === 'week' || p === 'w' || p === '102') {
    return { windowSize: 30, tolerance: 0.015 };
  }
  if (p === '5min' || p === '5m' || p === '1') {
    return { windowSize: 60, tolerance: 0.002 };
  }
  return { windowSize: 50, tolerance: 0.005 };
}

// ===================== 1836.15 數律樞軸模型計算 (支持低位地板與高位天花板對稱對齊) =====================
export function calculateModel(rawData: RawKline[], coreNum: number = QUANT_CONFIG.coreNumber, sentiment: string = '中性', period: string = 'daily'): ModelBar[] {
  const clean = sanitizeKlineData(rawData);
  if (clean.length === 0) return [];

  const { windowSize, tolerance } = getTimeframeParams(period);
  const period_bars = Math.min(windowSize, clean.length);
  const lastClose = clean[clean.length - 1].c;
  const exp = Math.floor(Math.log10(lastClose / coreNum));
  const coreGravityLine = coreNum * Math.pow(10, exp);
  const r = QUANT_CONFIG.ratio;
  const sentimentAdjust = sentiment === '利好' ? 0.98 : (sentiment === '利空' ? 1.02 : 1);

  // 預先計算全序列 14 週期 ATR 波動率供自適應標註使用
  const atrs: number[] = [];
  for (let idx = 0; idx < clean.length; idx++) {
    const lookback = Math.min(14, idx + 1);
    let trSum = 0;
    for (let k = Math.max(0, idx - lookback + 1); k <= idx; k++) {
      const prevC = k > 0 ? clean[k - 1].c : clean[k].o;
      const tr = Math.max(clean[k].h - clean[k].l, Math.abs(clean[k].h - prevC), Math.abs(clean[k].l - prevC));
      trSum += tr;
    }
    atrs.push(Number((trSum / lookback).toFixed(4)));
  }

  return clean.map((item, idx) => {
    // 【根治信號過密】支撐/阻力改為每根 K 線自己的滾動樞紐，避免用未來資料的靜態線
    const winStart = Math.max(0, idx - period_bars + 1);
    const win = clean.slice(winStart, idx + 1);
    const winHigh = Math.max(...win.map(d => d.h));
    const winLow = Math.min(...win.map(d => d.l));
    const winRange = winHigh - winLow || 1e-9;
    const pivot = (winHigh + winLow + item.c) / 3;
    const support1 = (pivot - winRange * r) * sentimentAdjust;
    const support2 = (pivot - winRange * r * 1.5) * sentimentAdjust;
    const resistance = (pivot + winRange * r) * sentimentAdjust;

    const dateNum = parseInt((item.date || '').split(' ')[0].replace(/[^0-9]/g, ''), 10) || 0;
    const dateGuiYuan = getGuiYuan(dateNum);
    const priceGuiYuan = getGuiYuan(Math.floor(item.c * 100));
    const deviation = Math.abs(item.c - coreGravityLine) / coreGravityLine;
    const isResonance = deviation < 0.08;

    // 【週期自適應容差】由 getTimeframeParams 提供，並改為對稱接近帶（移除無下限條件）
    const isAtSupport = Math.abs(item.l - support1) / support1 <= tolerance || Math.abs(item.c - support1) / support1 <= tolerance;
    const isAtResistance = Math.abs(item.h - resistance) / resistance <= tolerance || Math.abs(item.c - resistance) / resistance <= tolerance;

    const buySignal = isAtSupport && ([3, 6, 9].includes(priceGuiYuan) || item.c > item.o) && sentiment !== '利空';
    const sellSignal = isAtResistance && ([3, 6, 9].includes(priceGuiYuan) || item.c < item.o) && sentiment !== '利好';

    const currentAtr = atrs[idx] || (item.c * 0.02);

    return {
      ...item,
      coreGravityLine,
      supportLine1: support1,
      supportLine2: support2,
      resistanceLine: resistance,
      pivot,
      dateGuiYuan,
      priceGuiYuan,
      buySignal,
      sellSignal,
      isResonance,
      deviation,
      sentiment,
      atr: currentAtr,
      signalLabel: buySignal ? '🔥 強支撐低位' : (sellSignal ? '⚡ 阻力高位' : undefined),
      signalType: buySignal ? 'BUY_STRONG' : (sellSignal ? 'SELL_STRONG' : 'HOLD')
    };
  });
}

/**
 * 【修正後的 369 + 142857 複合共振信號生成核心】
 * 對標 1.5% 智能容差窗口與 ATR 波動率自適應，徹底解決低位買入信號過小或缺失問題
 */
export function calculateReversalSignals(
  data: RawKline[],
  supportLevels: number[],
  resistanceLevels: number[],
  tolerance: number = 0.005
) {
  const signals: Array<{
    index: number;
    type: 'BUY_STRONG' | 'SELL_STRONG';
    label: string;
    price: number;
    size: number;
    atr: number;
  }> = [];

  if (!Array.isArray(data) || data.length === 0) return signals;

  for (let i = 0; i < data.length; i++) {
    const currentLow = data[i].l;
    const currentHigh = data[i].h;
    const currentClose = data[i].c;

    const lookback = Math.min(14, i + 1);
    let trSum = 0;
    for (let k = Math.max(0, i - lookback + 1); k <= i; k++) {
      const prevC = k > 0 ? data[k - 1].c : data[k].o;
      const tr = Math.max(data[k].h - data[k].l, Math.abs(data[k].h - prevC), Math.abs(data[k].l - prevC));
      trSum += tr;
    }
    const currentAtr = trSum / lookback || (currentClose * 0.02);

    // 【修正低位信號】：對齊強支撐位，引入 1.5% 容差，保證低位不漏報
    const isAtSupport = supportLevels.some(level =>
      Math.abs(currentLow - level) / level <= tolerance || Math.abs(currentClose - level) / level <= tolerance
    );

    // 【修正高位信號】：對齊阻力位
    const isAtResistance = resistanceLevels.some(level =>
      Math.abs(currentHigh - level) / level <= tolerance || Math.abs(currentClose - level) / level <= tolerance
    );

    const gy = getGuiYuan(Math.floor(currentClose));
    const isGyResonance = [3, 6, 9].includes(gy);

    if (isAtSupport && (isGyResonance || data[i].c > data[i].o)) {
      signals.push({
        index: i,
        type: 'BUY_STRONG',
        label: '🔥 強支撐低位',
        price: currentClose,
        size: 14,
        atr: currentAtr
      });
    } else if (isAtResistance && (isGyResonance || data[i].c < data[i].o)) {
      signals.push({
        index: i,
        type: 'SELL_STRONG',
        label: '⚡ 阻力高位',
        price: currentClose,
        size: 14,
        atr: currentAtr
      });
    }
  }

  return signals;
}

/**
 * 【修正月線與長週期預測不準確的加權模組 (多時間框架 MTF 對齊)】
 * 動態權重分配：月線佔 50%，週線佔 30%，日線佔 20%
 * 避免單一月線指標因 K 線收盤滯後（整月延遲）產生的鈍化與假突破
 */
export function calculateMonthlyStrategy(
  monthlyData: RawKline[],
  weeklyData?: RawKline[],
  dailyData?: RawKline[]
): MonthlyStrategyResult {
  if (!Array.isArray(monthlyData) || monthlyData.length === 0) {
    return {
      status: 'STATUS: HOLD',
      reason: '數據不足以執行多時間框架對齊',
      blendedTrend: 0,
      monthlyTrend: 0,
      weeklyTrend: 0,
      dailyTrend: 0,
      lastClose: 0
    };
  }

  const mCloses = monthlyData.map(b => b.c);
  const mTrendArr = EMA(mCloses, Math.min(20, Math.max(3, mCloses.length)));
  const mTrend = mTrendArr[mTrendArr.length - 1] || mCloses[mCloses.length - 1];

  let wTrend = mTrend;
  if (weeklyData && weeklyData.length > 0) {
    const wCloses = weeklyData.map(b => b.c);
    const wTrendArr = EMA(wCloses, Math.min(20, Math.max(3, wCloses.length)));
    wTrend = wTrendArr[wTrendArr.length - 1] || wCloses[wCloses.length - 1];
  } else {
    // 若無獨立週線，自適應採用月線短期 EMA(6) 作為中週期代理
    const fastMTrendArr = EMA(mCloses, Math.min(6, Math.max(2, mCloses.length)));
    wTrend = fastMTrendArr[fastMTrendArr.length - 1] || mTrend;
  }

  let dTrend = wTrend;
  if (dailyData && dailyData.length > 0) {
    const dCloses = dailyData.map(b => b.c);
    const dTrendArr = EMA(dCloses, Math.min(20, Math.max(3, dCloses.length)));
    dTrend = dTrendArr[dTrendArr.length - 1] || dCloses[dCloses.length - 1];
  } else {
    // 自適應採用月線超短期 EMA(2) 作為短週期代理
    const ultraFastArr = EMA(mCloses, Math.min(2, mCloses.length));
    dTrend = ultraFastArr[ultraFastArr.length - 1] || wTrend;
  }

  // 動態權重分配：月線佔 50%，週線佔 30%，日線佔 20%
  const blendedTrend = (mTrend * 0.5) + (wTrend * 0.3) + (dTrend * 0.2);
  const lastClose = mCloses[mCloses.length - 1];

  let status: 'STRONG_BUY' | 'TAKE_PROFIT' | 'STATUS: HOLD' = 'STATUS: HOLD';
  let reason = '⚖️ 多空平衡區，維持量化觀望';

  if (lastClose < blendedTrend * 0.95) {
    status = 'STRONG_BUY';
    reason = '🔥 月/週/日三軌共振超跌，觸及大週期戰略地板價（強支撐）';
  } else if (lastClose > blendedTrend * 1.05) {
    status = 'TAKE_PROFIT';
    reason = '⚡ 已達月線級別高位阻力區，建議分批獲利減倉';
  }

  return {
    status,
    reason,
    blendedTrend: Number(blendedTrend.toFixed(2)),
    monthlyTrend: Number(mTrend.toFixed(2)),
    weeklyTrend: Number(wTrend.toFixed(2)),
    dailyTrend: Number(dTrend.toFixed(2)),
    lastClose: Number(lastClose.toFixed(2))
  };
}

// ===================== 369 + 142857 複合共振分析 =====================
export function calculate369And142857(lastPrice: number, buyPrice: number | null = null): ResonanceAnalysis {
  const price = buyPrice || lastPrice;

  const r142857 = {
    strongResist: price * 1.142857,
    midResist: price * 1.285714,
    strongSupport: price * 0.714285,
    midSupport: price * 0.857143,
    base: price
  };

  const currentGuiYuan = getGuiYuan(Math.floor(lastPrice));
  const buyGuiYuan = buyPrice ? getGuiYuan(Math.floor(buyPrice)) : null;
  const highGuiYuan = getGuiYuan(Math.floor(lastPrice * 1.2));
  const lowGuiYuan = getGuiYuan(Math.floor(lastPrice * 0.8));

  let signal = '⚖️ 觀望';
  let action = '價格處於中樞區間';

  if (lastPrice <= r142857.midSupport && (currentGuiYuan === 3 || currentGuiYuan === 6 || currentGuiYuan === 9)) {
    signal = '🟢 強烈買入';
    action = '價格接近142857支撐 + 369歸元共振';
  } else if (lastPrice <= r142857.midSupport) {
    signal = '🟢 買入';
    action = '價格接近142857支撐區';
  } else if (lastPrice >= r142857.strongResist && (currentGuiYuan === 3 || currentGuiYuan === 6 || currentGuiYuan === 9)) {
    signal = '🔴 強烈賣出';
    action = '價格接近142857阻力 + 369歸元共振';
  } else if (lastPrice >= r142857.strongResist) {
    signal = '🔴 賣出';
    action = '價格接近142857阻力區';
  }

  return {
    r142857,
    guiYuan: {
      current: currentGuiYuan,
      buy: buyGuiYuan,
      high: highGuiYuan,
      low: lowGuiYuan
    },
    signal,
    action,
    suggestions: {
      buyZone: r142857.midSupport.toFixed(2),
      strongBuy: r142857.strongSupport.toFixed(2),
      sellZone: r142857.strongResist.toFixed(2),
      target1: r142857.strongResist.toFixed(2),
      target2: r142857.midResist.toFixed(2),
      stopLoss: (r142857.strongSupport * 0.9).toFixed(2)
    }
  };
}

/**
 * 動態計算自適應滾動視窗大小
 * @param timeframe 當前圖表週期 (如 '5m', '1d', '1w', '1m', 'daily', 'weekly', 'monthly')
 */
export function getAdaptiveWindowSize(timeframe: string): number {
  const tf = String(timeframe || '').toLowerCase();
  switch (tf) {
    case '5m':
    case '5min':
      return 12; // 短週期需要更大的視窗過濾雜訊
    case '1d':
    case 'daily':
      return 5;  // 日線常用 5 日拐點
    case '1w':
    case 'weekly':
      return 4;  // 週線用 4 週
    case '1m':
    case 'monthly':
      return 3;  // 月線大週期視窗縮小，捕捉戰略轉折
    default:
      return 8;
  }
}

/**
 * 核心大改：全歷史數據動態滾動視窗高低點與強支撐對齊算法
 * 完全抽離 UI 層密集計算，以 1.5% 智能容差對齊強支撐與強阻力
 */
export function calculateDynamicReversals(
  activeData: any[],
  timeframe: string = '1d',
  supportLevels: number[] = [],
  resistanceLevels: number[] = []
): { highs: ReversalAnchor[]; lows: ReversalAnchor[] } {
  if (!activeData || activeData.length === 0) return { highs: [], lows: [] };

  const windowSize = getAdaptiveWindowSize(timeframe);
  const highs: ReversalAnchor[] = [];
  const lows: ReversalAnchor[] = [];
  const tolerance = getTimeframeParams(timeframe).tolerance; // 【週期自適應】容差隨日/週/月調整

  for (let i = 0; i < activeData.length; i++) {
    const start = Math.max(0, i - windowSize);
    const end = Math.min(activeData.length - 1, i + windowSize);

    const currentBar = activeData[i];
    const currentHigh = Number.isFinite(currentBar.h) ? currentBar.h : Number(currentBar.high || 0);
    const currentLow = Number.isFinite(currentBar.l) ? currentBar.l : Number(currentBar.low || 0);
    const currentClose = Number.isFinite(currentBar.c) ? currentBar.c : Number(currentBar.close || 0);

    let isLocalHigh = true;
    let isLocalLow = true;

    // 滾動視窗局部極值檢驗
    for (let j = start; j <= end; j++) {
      const b = activeData[j];
      const h = Number.isFinite(b.h) ? b.h : Number(b.high || 0);
      const l = Number.isFinite(b.l) ? b.l : Number(b.low || 0);
      if (h > currentHigh) isLocalHigh = false;
      if (l < currentLow) isLocalLow = false;
    }

    // 合併外部傳入支撐位與當前 Bar 自帶支撐
    const effectiveSupports: number[] = [...(supportLevels || [])];
    if (currentBar.supportLine1 && currentBar.supportLine1 > 0) effectiveSupports.push(currentBar.supportLine1);
    if (currentBar.supportLine2 && currentBar.supportLine2 > 0) effectiveSupports.push(currentBar.supportLine2);
    if (currentBar.reversalSupport && currentBar.reversalSupport > 0) effectiveSupports.push(currentBar.reversalSupport);

    const effectiveResistances: number[] = [...(resistanceLevels || [])];
    if (currentBar.resistanceLine && currentBar.resistanceLine > 0) effectiveResistances.push(currentBar.resistanceLine);
    if (currentBar.reversalResistance && currentBar.reversalResistance > 0) effectiveResistances.push(currentBar.reversalResistance);

    // 【修正低位信號】對齊強支撐位 (1.5% 智能容差或跌破支撐後企穩)
    const isAtSupport = effectiveSupports.some(level =>
      Math.abs(currentLow - level) / level <= tolerance ||
      Math.abs(currentClose - level) / level <= tolerance
    );

    // 【修正高位信號】對齊阻力位
    const isAtResistance = effectiveResistances.some(level =>
      Math.abs(currentHigh - level) / level <= tolerance ||
      Math.abs(currentClose - level) / level <= tolerance
    );

    // 天花板高位：局部波峰，且 (觸發阻力對齊 或 賣出信號)
    if (isLocalHigh && (isAtResistance || currentBar.sellSignal || currentBar.reversalSignal === 'CRITICAL_SELL')) {
      highs.push({
        index: i,
        price: currentHigh,
        label: isAtResistance ? '強阻力高位' : '天花板',
        isStrong: isAtResistance || Boolean(currentBar.sellSignal),
        date: currentBar.date
      });
    }

    // 地板價低位：局部波谷，且 (觸發強支撐對齊 或 買入信號)
    if (isLocalLow && (isAtSupport || currentBar.buySignal || currentBar.reversalSignal === 'STRONG_BUY')) {
      lows.push({
        index: i,
        price: currentLow,
        label: isAtSupport ? '強支撐地板' : '地板價',
        isStrong: isAtSupport || Boolean(currentBar.buySignal),
        date: currentBar.date
      });
    }
  }

  return { highs, lows };
}

const TIME_WINDOWS = [14, 28, 57, 142, 285, 571] as const;
const TIME_TOLERANCE_BARS = 1;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const INDEX_LEVELS = [1.836, 18.36, 36.72] as const;
const STOCK_LEVELS = [14.28, 18.36, 28.57, 36.72, 57.14] as const;
const SPACE_TOLERANCE_PERCENT = 1.5;

// 日/週/月各自獨立參數：不同週期的擺動尺度、共振窗口、空間階梯與趨勢均線完全不同，
// 用同一套數字（尤其把「月」當「日」用）會令高週期信號結構性失效。
const TIMEFRAME_PROFILES: Record<string, {
  anchorBars: number;
  timeWindows: readonly number[];
  spaceLevels: readonly number[];
  spaceTolerance: number;
  maPeriod: number;
  mode: 'resonance' | 'hybrid';
  useLegacy: boolean;
}> = {
  // 日線：短擺動 + 3/6/9 與 14/21/34 共振 + 斐波那契/142857 混合階梯
  daily: {
    anchorBars: 60,
    timeWindows: [3, 6, 9, 14, 21, 34],
    spaceLevels: [23.6, 38.2, 50, 61.8, 14.28, 28.57],
    spaceTolerance: 2,
    maPeriod: 20,
    mode: 'resonance',
    useLegacy: true
  },
  // 週線：中擺動
  weekly: {
    anchorBars: 52,
    timeWindows: [3, 6, 9, 14, 21, 34],
    spaceLevels: [23.6, 38.2, 50, 61.8, 14.28, 28.57],
    spaceTolerance: 2,
    maPeriod: 12,
    mode: 'resonance',
    useLegacy: true
  },
  // 月線：長擺動 + 趨勢確認（純均值回歸在月線會產生「只買不賣」的單邊偏誤）
  monthly: {
    anchorBars: 24,
    timeWindows: [3, 6, 9, 12, 18, 24],
    spaceLevels: [23.6, 38.2, 50, 61.8, 14.28, 28.57],
    spaceTolerance: 2.5,
    maPeriod: 6,
    mode: 'hybrid',
    useLegacy: false
  }
};

function getTimeframeProfile(period: string) {
  const p = String(period || 'daily').toLowerCase();
  if (p === 'monthly' || p === 'month' || p === 'm' || p === '103') return TIMEFRAME_PROFILES.monthly;
  if (p === 'weekly' || p === 'week' || p === 'w' || p === '102') return TIMEFRAME_PROFILES.weekly;
  return TIMEFRAME_PROFILES.daily;
}


const INDEX_SYMBOLS = new Set([
  'DJI', '^DJI', 'GSPC', '^GSPC', 'SPX', '^SPX', 'NDX', '^NDX',
  'IXIC', '^IXIC', 'HSI', '^HSI', 'N225', '^N225', '000001.SH', '399001.SZ'
]);

function isPlaceholderValue(val: any): boolean {
  if (val === null || val === undefined || val === '') return true;
  const num = Number(val);
  if (!Number.isFinite(num) || num <= 0) return true;
  if (Math.abs(num - 1836.15) < 0.0001 || Math.abs(num - 0.08) < 0.0001) return true;
  return false;
}

function matchesTimeWindow(distance: number): boolean {
  return TIME_WINDOWS.some(w => Math.abs(distance - w) <= TIME_TOLERANCE_BARS);
}

function assetProfile(ticker: string, assetType: string) {
  const sym = String(ticker || '').trim().toUpperCase();
  const type = String(assetType || '').trim().toLowerCase();
  const preciousMetal = /^(XAU|XAG|GOLD|SILVER|GLD|SLV|GC=F|SI=F)/.test(sym) || type === 'precious-metal';
  const isIndex = type === 'index' || INDEX_SYMBOLS.has(sym);
  const profile = isIndex ? 'index' : (preciousMetal ? 'precious-metal' : 'stock-or-commodity');
  return { profile, levels: isIndex || preciousMetal ? INDEX_LEVELS : STOCK_LEVELS, longTermLow: isIndex };
}

function yearWindowStart(data: RawKline[], index: number, period: string, forLow = false): number {
  const now = data[index].timestamp;
  // 高點錨：月線18年、週線8年、日線3年（找大頂，用於量度回落）
  // 低點錨：月線3年、週線1.5年、日線0.5年（找近期底，否則「反彈%」永遠超過 levels 上限，沽出信號歸零）
  const lookbackYears = forLow
    ? (period === 'monthly' ? 3 : (period === 'weekly' ? 1.5 : 0.5))
    : (period === 'monthly' ? 18 : (period === 'weekly' ? 8 : 3));
  if (Number.isFinite(now)) {
    const cutoff = now - lookbackYears * YEAR_MS;
    let start = index;
    while (start > 0) {
      const priorTime = data[start - 1].timestamp;
      if (priorTime < cutoff) break;
      start -= 1;
    }
    return start;
  }
  const barsPerYear = period === 'monthly' ? 12 : (period === 'weekly' ? 52 : (period === '5min' ? 19656 : 252));
  return Math.max(0, index - Math.round(barsPerYear * lookbackYears));
}

// 序列版 RSI（供逐根 K 線多指標確認使用）
function calcRSISeries(prices: number[], period: number = 14): (number | null)[] {
  const out: (number | null)[] = new Array(prices.length).fill(null);
  if (prices.length < period + 1) return out;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = prices[i] - prices[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  let avgG = gains / period;
  let avgL = losses / period;
  out[period] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = period + 1; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1];
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}

// 序列版 MACD 柱狀值（hist），供逐根 K 線多指標確認使用
function calcMACDHistSeries(prices: number[]): number[] {
  if (prices.length === 0) return [];
  const e12 = EMA(prices, 12);
  const e26 = EMA(prices, 26);
  const dif = e12.map((v, i) => v - e26[i]);
  const dea = EMA(dif, 9);
  return dif.map((v, i) => (v - dea[i]) * 2);
}


function avgPrice(bar: { o: number; h: number; l: number; c: number }): number {
  return (bar.h + bar.l + bar.c) / 3;
}

const REGIME_DEEP_DRAWDOWN = 55;   // 距錨點高點 >55% 視為長期低位
const REGIME_DOWN_LOW = 15;        // 下跌段下緣
const REGIME_DOWN_HIGH = 55;       // 下跌段上緣
const REGIME_DOWN_RATIO = 0.75;    // 平均價 / 錨點高點 低於此值才算「價格結構走弱」
const REGIME_HIGH_DRAWDOWN = 15;   // 距高 <15% 視為高位

interface MarketRegime {
  drawdown: number;      // 距錨點高點的回落百分比
  avgRatio: number;      // 本根平均價 / 錨點高點
  avgRising: boolean;    // 平均價線是否上揚（本根 > 前一根）
  isDeepZone: boolean;   // 長期低位
  isDownZone: boolean;   // 下跌延續結構
  isHighZone: boolean;   // 高位
}

function calcMarketRegime(
  klines: { o: number; h: number; l: number; c: number }[],
  i: number,
  anchorBars: number
): MarketRegime | null {
  if (i < 1 || i >= klines.length) return null;
  const start = Math.max(0, i - anchorBars);
  if (start >= i) return null;
  let anchorHigh = -Infinity;
  for (let j = start; j < i; j += 1) {
    if (klines[j].h > anchorHigh) anchorHigh = klines[j].h;
  }
  if (!Number.isFinite(anchorHigh) || anchorHigh <= 0) return null;

  const bar = klines[i];
  const avgNow = avgPrice(bar);
  const avgPrev = avgPrice(klines[i - 1]);
  const drawdown = ((anchorHigh - bar.c) / anchorHigh) * 100;
  const avgRatio = avgNow / anchorHigh;
  const avgRising = avgNow > avgPrev;
  const isDeepZone = drawdown > REGIME_DEEP_DRAWDOWN;
  const isDownZone =
    drawdown >= REGIME_DOWN_LOW &&
    drawdown <= REGIME_DOWN_HIGH &&
    avgRatio <= REGIME_DOWN_RATIO;
  const isHighZone = drawdown < REGIME_HIGH_DRAWDOWN;

  return { drawdown, avgRatio, avgRising, isDeepZone, isDownZone, isHighZone };
}

function calcZigZagDirections(prices: number[], thresholdPct: number): number[] {
  const n = prices.length;
  const dirs: number[] = new Array(n).fill(1);
  if (n === 0) return dirs;
  let dir = 1;
  let ext = prices[0];
  for (let k = 1; k < n; k++) {
    const c = prices[k];
    if (dir === 1) {
      if (c > ext) ext = c;
      else if (c < ext * (1 - thresholdPct / 100)) { dir = -1; ext = c; }
    } else {
      if (c < ext) ext = c;
      else if (c > ext * (1 + thresholdPct / 100)) { dir = 1; ext = c; }
    }
    dirs[k] = dir;
  }
  return dirs;
}

function findAnchor(data: RawKline[], start: number, end: number, field: 'h' | 'l', highest: boolean) {
  let anchor: { index: number; price: number; date: string } | null = null;
  for (let i = start; i < end; i += 1) {
    const val = data[i][field];
    if (!anchor || (highest ? val > anchor.price : val < anchor.price)) {
      anchor = { index: i, price: val, date: data[i].date };
    }
  }
  return anchor;
}

export function calculateCosmicReversalSignal(klineData: RawKline[], currentPeriod: string = 'daily', ticker: string = 'TSLA', assetType: string = 'stock') {
  if (!Array.isArray(klineData) || klineData.length === 0) return [];

  // 1. 【彻底过滤垂直断裂线】
  const cleanKlines: RawKline[] = [];
  for (let idx = 0; idx < klineData.length; idx += 1) {
    const bar = klineData[idx];
    if (bar && Number.isFinite(bar.c) && bar.c > 0 && !isPlaceholderValue(bar.c) && !isPlaceholderValue(bar.o)) {
      cleanKlines.push(bar);
    }
  }

  // 彻底剔除末端占位棒
  while (cleanKlines.length > 0) {
    const lastBar = cleanKlines[cleanKlines.length - 1];
    if (isPlaceholderValue(lastBar.c) || isPlaceholderValue(lastBar.o)) {
      cleanKlines.pop();
    } else {
      break;
    }
  }

  if (cleanKlines.length === 0) return [];

  // 2. 【前復權與拆股跳空回溯平滑】
  // 檢測相鄰超過 40% 的非自然價格斷崖並向前復權調整，確保時空共振計算不被拆股斷層干擾
  const processedKlines = adjustKlinesForSplits(cleanKlines);

  const period = String(currentPeriod || 'daily').toLowerCase();
  const asset = assetProfile(ticker, assetType);
  const results = [];

  // 多指標確認：RSI 與 MACD 序列（獨立於 3/6/9 歸元，提供交叉驗證）
  const _closes = processedKlines.map(b => b.c);
  const rsiSeries = calcRSISeries(_closes, 14);
  const macdHistSeries = calcMACDHistSeries(_closes);

  // 月線方向確認用的均線序列（依 profile.maPeriod 於迴圈內取值）
  const maCache: Record<number, (number | null)[]> = {};
  const maAt = (n: number) => {
    if (!maCache[n]) {
      const arr: (number | null)[] = new Array(_closes.length).fill(null);
      let sum = 0;
      for (let k = 0; k < _closes.length; k++) {
        sum += _closes[k];
        if (k >= n) sum -= _closes[k - n];
        if (k >= n - 1) arr[k] = sum / n;
      }
      maCache[n] = arr;
    }
    return maCache[n];
  };
  // 月線擺動方向（ZigZag 15%）序列
  const zigZagDirs = calcZigZagDirections(_closes, 15);



  for (let i = 0; i < processedKlines.length; i += 1) {
    const bar = processedKlines[i];
    const hold = {
      date: bar.date,
      close: bar.c,
      signal: 'HOLD' as const,
      support: null as number | null,
      resistance: null as number | null,
      timeResonance: false,
      spaceResonance: false,
      matchedThreshold: null as number | null,
      anchor: null as any,
      assetClass: asset.profile
    };

    if (i < 2) {
      results.push(hold);
      continue;
    }

    // 依週期選用獨立參數（擺動窗口 / 共振序列 / 空間階梯 / 趨勢均線）
    const profile = getTimeframeProfile(period);
    let highAnchor: any;
    let lowAnchor: any;
    if (profile.useLegacy) {
      const start = yearWindowStart(processedKlines, i, period);
      highAnchor = findAnchor(processedKlines, start, i, 'h', true);
      const lowStart = asset.longTermLow ? 0 : yearWindowStart(processedKlines, i, period, true);
      lowAnchor = findAnchor(processedKlines, lowStart, i, 'l', false);
    } else {
      const anchorWin = Math.min(profile.anchorBars, i);
      const anchorStart = Math.max(0, i - anchorWin);
      highAnchor = findAnchor(processedKlines, anchorStart, i, 'h', true);
      lowAnchor = findAnchor(processedKlines, anchorStart, i, 'l', false);
    }
    const previous = processedKlines[i - 1];
    const prior = i > 1 ? processedKlines[i - 2] : null;

    if (!highAnchor || !lowAnchor || highAnchor.price <= 0 || lowAnchor.price <= 0 || !previous || !prior) {
      results.push(hold);
      continue;
    }

    const barsFromHigh = i - highAnchor.index;
    const barsFromLow = i - lowAnchor.index;
    const buyTimeMatch = profile.useLegacy
      ? matchesTimeWindow(barsFromHigh)
      : profile.timeWindows.some(w => Math.abs(barsFromHigh - w) <= 1);
    const sellTimeMatch = profile.useLegacy
      ? matchesTimeWindow(barsFromLow)
      : profile.timeWindows.some(w => Math.abs(barsFromLow - w) <= 1);

    const downtrend = previous.c < prior.c && previous.c < highAnchor.price;
    const uptrend = previous.c > prior.c && previous.c > lowAnchor.price;
    // 陰陽燭判定改用「平均價」而非單看開／收：
    // 陽燭 = 本根平均價高於前一根平均價（均價線上揚），陰燭 = 均價線下彎。
    // 這樣可過濾開盤跳空／尾盤拉抬造成的假陽假陰，且天然對稱。
    const avgNow = avgPrice(bar);
    const avgPrev = avgPrice(previous);
    const yangCandle = avgNow > avgPrev;
    const yinCandle = avgNow < avgPrev;
    const bullishReversal = downtrend && yangCandle && bar.c > previous.c;
    const bearishReversal = uptrend && yinCandle && bar.c < previous.c;

    const support = highAnchor.price * (1 - asset.levels[0] / 100);
    const resistance = lowAnchor.price * (1 + asset.levels[0] / 100);

    let signal: 'STRONG_BUY' | 'CRITICAL_SELL' | 'HOLD' = 'HOLD';
    let matchedThreshold: number | null = null;
    let spaceResonance = false;

    // 多指標確認（軟否決）：只有 RSI 與 MACD 同時強烈反對方向時才否決，避免過度過濾
    const curRsi = rsiSeries[i];
    const macdRising = i > 0 && macdHistSeries[i] > macdHistSeries[i - 1];
    const macdFalling = i > 0 && macdHistSeries[i] < macdHistSeries[i - 1];
    const buyIndicatorOk = !((curRsi !== null && curRsi > 65) && macdFalling);
    const sellIndicatorOk = !((curRsi !== null && curRsi < 35) && macdRising);

    const maSeries = maAt(profile.maPeriod);
    const maNow = maSeries[i];
    const maPrev = i > 0 ? maSeries[i - 1] : maNow;
    const crossUp = maNow !== null && maPrev !== null && bar.c > maNow && previous.c <= maPrev;
    const crossDown = maNow !== null && maPrev !== null && bar.c < maNow && previous.c >= maPrev;

    const regime = calcMarketRegime(processedKlines, i, profile.anchorBars);
    const buyRegimeOk = !regime || regime.isDeepZone || !regime.isDownZone;
    const sellRegimeOk = !!regime && regime.isDownZone;

    if (profile.mode === 'hybrid') {
      const turnedUp = i > 0 && zigZagDirs[i] === 1 && zigZagDirs[i - 1] === -1 && yangCandle;
      const turnedDown = i > 0 && zigZagDirs[i] === -1 && zigZagDirs[i - 1] === 1 && yinCandle;
      if (turnedUp && buyIndicatorOk && buyRegimeOk) {
        signal = 'STRONG_BUY';
        spaceResonance = true;
      } else if (turnedDown && sellIndicatorOk && sellRegimeOk) {
        signal = 'CRITICAL_SELL';
        spaceResonance = false;
      }
    } else {
      const lvls = profile.useLegacy ? (asset.levels as readonly number[]) : profile.spaceLevels;
      const stol = profile.useLegacy ? SPACE_TOLERANCE_PERCENT : profile.spaceTolerance;

      // STRONG BUY：时间共振 + 空间引力容错
      if (buyTimeMatch && (bullishReversal || yangCandle)) {
        const drawdownLow = ((highAnchor.price - bar.l) / highAnchor.price) * 100;
        const drawdownClose = ((highAnchor.price - bar.c) / highAnchor.price) * 100;

        const matchedLevel = (lvls as readonly number[]).find((lvl: number) => {
          return Math.abs(drawdownLow - lvl) <= stol || Math.abs(drawdownClose - lvl) <= stol;
        });

        if (matchedLevel !== undefined && buyIndicatorOk) {
          const supportLevel = highAnchor.price * (1 - (matchedLevel + stol) / 100);
          if (bar.c >= supportLevel) {
            signal = 'STRONG_BUY';
            matchedThreshold = matchedLevel;
            spaceResonance = true;
          }
        }
      }

      // CRITICAL SELL：时间共振 + 空间引力容错
      if (sellTimeMatch && (bearishReversal || yinCandle)) {
        const reboundHigh = ((bar.h - lowAnchor.price) / lowAnchor.price) * 100;
        const reboundClose = ((bar.c - lowAnchor.price) / lowAnchor.price) * 100;

        const matchedLevel = (lvls as readonly number[]).find((lvl: number) => {
          return Math.abs(reboundHigh - lvl) <= stol || Math.abs(reboundClose - lvl) <= stol;
        });

        if (matchedLevel !== undefined && sellIndicatorOk) {
          const resistanceLevel = lowAnchor.price * (1 + (matchedLevel - stol) / 100);
          if (bar.c <= resistanceLevel || bar.h >= resistanceLevel) {
            if (signal === 'STRONG_BUY') {
              signal = 'HOLD';
              matchedThreshold = null;
            } else {
              signal = 'CRITICAL_SELL';
              matchedThreshold = matchedLevel;
            }
            spaceResonance = true;
          }
    }

    results.push({
      date: bar.date,
      close: bar.c,
      signal,
      support,
      resistance,
      timeResonance: buyTimeMatch || sellTimeMatch,
      spaceResonance,
      matchedThreshold,
      anchor: signal === 'STRONG_BUY' ? highAnchor : (signal === 'CRITICAL_SELL' ? lowAnchor : null),
      barsFromHigh,
      barsFromLow,
      assetClass: asset.profile
    });
  }

    }
  }

  return results;
}

/**
 * ⚡ 統一拼圖量化回測引擎（季/月/週 50% 平衡切線 ＋ 動態奇點 ＋ T+1 開盤驗假破）
 * 強制使用 T-1 日凍結決策 + 時空提示單，於第 T 日開盤價 dailyData[i].open 驗假破成交，並扣除單邊 0.25% 綜合成本。
 * 奇點扣扳機紀律（見 puzzleDecisionEngine.ts）：奇點信號只係預警，verdict 本身已經只會喺收市穿破奇點
 * K 線高／低位嗰日先發出 GOLDEN_BUY / PARTIAL_PROFIT / SHORT_ENTRY / COVER_SHORT；回測喺 T 開盤執行，
 * 補回單另須 T 開盤價低於實際上次高拋成交價 ×96%，未滿足就延期而非取消。
 */
export function runBacktestEngine(
  modelData: ModelBar[],
  configuredFund: number = 1000000,
  period: string = 'daily',
  dailyBars?: RawKline[],
  _symbol: string = 'STOCK'
): { stats: BacktestStats; logs: TradeLog[] } {
  const initialFund =
    Number.isFinite(configuredFund) && configuredFund > 0 ? configuredFund : 1000000;
  const FEE_RATE = 0.0025; // 單邊 0.25% 綜合交易成本

  const sourceBars: RawKline[] = dailyBars && dailyBars.length > 0 ? dailyBars : modelData;
  const ohlcDaily: OHLCBar[] = sourceBars
    .map(bar => ({
      date: (bar.date || '').split(' ')[0],
      open: Number(bar.o),
      high: Number(bar.h),
      low: Number(bar.l),
      close: Number(bar.c)
    }))
    .filter(
      b =>
        Boolean(b.date) &&
        Number.isFinite(b.open) &&
        b.open > 0 &&
        Number.isFinite(b.high) &&
        Number.isFinite(b.low) &&
        Number.isFinite(b.close) &&
        b.close > 0
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const usingDailyResolution = Boolean(dailyBars && dailyBars.length > 0) || period === 'daily';
  const barsPerYear = usingDailyResolution
    ? 252
    : period === 'monthly'
    ? 12
    : period === 'weekly'
    ? 52
    : period === '5min'
    ? 19656
    : 252;

  const emptyResult = {
    logs: [] as TradeLog[],
    stats: {
      totalReturn: '0.00',
      winRate: '0.00',
      profitLossRatio: '0.00',
      maxDrawdown: '0.00',
      finalFund: initialFund.toFixed(2),
      tradeCount: 0,
      annualReturn: '0.00'
    }
  };

  if (ohlcDaily.length <= 60) {
    return emptyResult;
  }

  // O(N) 無未來函數時間軸：嚴格計算每根日線截至當日之季/月/週 50% 平衡切線與奇點決策
  const timeline = buildFullPuzzleTimeline(ohlcDaily);
  const { sorted, overlays, verdicts, prior20Lows } = timeline;

  let cashPool = initialFund;
  let longShares = 0;
  let avgLongCost = 0; // 已含買入手續費之每股真實成本
  let shortShares = 0;
  let shortEntryGross = 0;
  let shortEntryNetProceeds = 0; // 已扣開空 0.25% 成本之每股淨收入
  let lastActionBarIndex = -999;

  let peakEquity = initialFund; // 真實全歷史淨值峰值（嚴格誠實計算 maxDrawdown；永不重置）
  let maxDrawdown = 0;
  let latestCloseDrawdown = 0;

  // 全局峰值開倉暫停鎖（取代舊 25% 熔斷 HALT_REDUCE）：總淨值對永不重置的全局歷史最高淨值
  // 回撤 > 25% 時，暫停一切新開倉（做多、補回、沽空）；回撤收窄回 < 15% 以內先解鎖。鎖定期間
  // 減倉（高拋／狀態③減半）、破線清倉、平空照常執行——唔再喺地板上強制砍倉割肉。
  let entryLocked = false;
  let partialTakenInLeg = false;
  // 回測實際高拋成交價（T 開盤價），供補回單 96% 折扣驗證——以實際成交為準，而非 verdict 的收市參考價
  let lastSellPriceExec: number | null = null;
  // 高拋成交當日的 K 線索引（供 30 個交易日過期判斷，與引擎端 lastSellIndex 一致，僅差 T 開盤一日）
  let lastSellIndexExec: number | null = null;
  // 高拋補回單延期狀態：T 開盤價未低過上次沽價 ×96% 而未成交時保留，之後交易日再驗（轉入下跌浪即取消）
  let pendingBuyback: { singularityHigh: number; lastSellPrice: number; date: string } | null = null;

  const trades: { profit: number }[] = [];
  const tradeLogs: TradeLog[] = [];
  const minOrderValue = initialFund * 0.05;

  for (let i = 0; i < sorted.length; i++) {
    const currBar = sorted[i];
    const todayOpen = currBar.open;

    // 使用 T-1 日時空提示單（嚴格無未來函數）於今日 T 開盤價驗假破執行
    if (i >= 2 && Number.isFinite(todayOpen) && todayOpen > 0) {
      const prevIdx = i - 1;
      const prevBar = sorted[prevIdx];
      const prevOverlay = overlays[prevIdx];
      const verdict = verdicts[prevIdx];
      const prior20Low = prior20Lows[prevIdx];

      const signalDate = prevOverlay.date;
      const execDate = currBar.date;
      const hintBase = verdict.compactHint;
      const m50 = prevOverlay.mMid ?? prevOverlay.mMid50 ?? prevBar.close;
      const q50 = prevOverlay.qMid ?? prevOverlay.qMid50 ?? prevBar.close;

      // 全局峰值開倉暫停鎖：以前一交易日收市回撤為準（與 T-1 決策時序一致）——回撤 > 25% 上鎖，
      // 收窄回 < 15% 先解鎖（滯後區間避免反覆開關）。
      if (!entryLocked && latestCloseDrawdown > 0.25) entryLocked = true;
      else if (entryLocked && latestCloseDrawdown < 0.15) entryLocked = false;
      // 死鎖防護：若系統已全數平倉（無多單、無空單），淨值凍結、回撤永遠唔會收窄，單靠
      // 「回撤 < 15%」永遠解唔到鎖（實測：NVDA 2022-05-10 清倉後鎖死 4 年半、零交易，錯失
      // 其後十倍升浪）。呢個狀態下鎖倉已無意義（無倉位可保護），直接解鎖，等下一個合規訊號
      // （牛市買入／熊市沽空）再入場。鎖倉的本意係「唔好喺深虧時加倉」，唔係「清倉後永久停擺」。
      if (entryLocked && longShares === 0 && shortShares === 0) entryLocked = false;
      const w50 = prevOverlay.wMid50 ?? prevBar.close;
      const isBullRegime = Boolean(verdict.reasons.isBullRegime ?? verdict.regime === 'BULL');
      const isBearRegime = !isBullRegime;
      const canAct = i - lastActionBarIndex >= 3;

      // C. 空單平倉 (收復月/季50上升浪大勢 OR 日線奇點買升穿平空 OR 收市重返週線／月線50結構止損平空)
      //     已取消舊 -8% 固定百分比硬止損（開盤價計，震盪市反覆掃損）：止損改由引擎端結構止損 verdict（COVER_SHORT + isStructuralStop）觸發，
      //     止損後 15 個交易日內嚴禁重複開空（引擎端 shortCooldownUntil）。
      if (
        shortShares > 0 &&
        (isBullRegime ||
          verdict.signal === 'COVER_SHORT' ||
          verdict.signal === 'GOLDEN_BUY')
      ) {
        const coverShares = shortShares;
        const grossCostPrice = todayOpen * (1 + FEE_RATE);
        const pnlRatio =
          shortEntryGross > 0 ? (shortEntryNetProceeds - grossCostPrice) / shortEntryGross : 0;
        cashPool -= coverShares * grossCostPrice;
        trades.push({ profit: pnlRatio });

        shortShares = 0;
        shortEntryGross = 0;
        shortEntryNetProceeds = 0;
        lastActionBarIndex = i;
        const profitPct = Number((pnlRatio * 100).toFixed(2));

        tradeLogs.unshift({
          date: execDate,
          signalDate,
          execDate,
          puzzleHint: hintBase,
          complianceTag: '✅ 精準執行',
          type: 'COVER_SHORT',
          action: isBullRegime
            ? '💎 順勢引擎・收復50線禁空平倉'
            : verdict.isStructuralStop
            ? '🛑 順勢引擎・重返週線／月線50結構止損平空'
            : '💎 順勢引擎・奇點買升穿高位平空',
          shares: coverShares,
          units: isBullRegime
            ? '升穿月/季50線禁空平倉100%'
            : verdict.isStructuralStop
            ? '重返週線／月線50止損平空100%'
            : '奇點買升穿奇點高平空100%',
          confidence: `月50:$${m50.toFixed(2)} / 季50:$${q50.toFixed(2)}｜日TFDR:${prevOverlay.dTfdr}`,
          price: todayOpen.toFixed(2),
          totalHolding: 0,
          holdingType: 'EMPTY',
          source: isBullRegime
            ? `收復月/季 50 中間線重返上升浪（只買不空），開盤立即 100% 平空`
            : verdict.isStructuralStop
            ? `收市重返週線／月線 50 中間線之上，下跌浪論述失效，開盤全數平空止損（其後 15 個交易日內嚴禁重複開空）`
            : `下跌浪觸發奇點買 (日TFDR ${prevOverlay.dTfdr}≤25) 後收市升穿奇點 K 線最高位 $${(verdict.singularityHigh ?? prevBar.high).toFixed(2)}，空單 100% 平倉`,
          profitPct,
          profit: profitPct,
          msg: `[${execDate}] ${isBullRegime ? '💎 順勢引擎・收復50線禁空平倉' : verdict.isStructuralStop ? '🛑 順勢引擎・結構止損平空' : '💎 順勢引擎・奇點買升穿高位平空'} ${coverShares.toLocaleString()}股 @ 開盤$${todayOpen.toFixed(2)} (含0.25%成本) | 淨盈虧: ${profitPct >= 0 ? '+' : ''}${profitPct}%`
        });
      }

      // D. 跌入下跌浪大勢 (isBearRegime: 同時跌穿月50與季50中間線) → 立即 100% 清倉多單並嚴禁抄底
      if (longShares > 0 && avgLongCost > 0 && verdict.signal === 'FULL_CLEAR') {
        const sellShares = longShares;
        const netExitPrice = todayOpen * (1 - FEE_RATE);
        const pnlRatio = (netExitPrice - avgLongCost) / avgLongCost;
        cashPool += sellShares * netExitPrice;
        trades.push({ profit: pnlRatio });

        longShares = 0;
        avgLongCost = 0;
        partialTakenInLeg = false;
        // 全數清倉後，高拋補回折扣不再適用（下一輪買入係全新入場，唔係補回單）
        lastSellPriceExec = null;
        lastSellIndexExec = null;
        pendingBuyback = null;
        lastActionBarIndex = i;
        const profitPct = Number((pnlRatio * 100).toFixed(2));

        tradeLogs.unshift({
          date: execDate,
          signalDate,
          execDate,
          puzzleHint: hintBase,
          complianceTag: '✅ 精準執行',
          type: 'CRITICAL SELL',
          action: '🚨 順勢引擎・破月季50線100%清倉',
          shares: sellShares,
          units: '跌穿月/季50線清倉100%',
          confidence: `收盤$${prevOverlay.close} < 月50($${m50.toFixed(2)}) & 季50($${q50.toFixed(2)})`,
          price: todayOpen.toFixed(2),
          totalHolding: 0,
          holdingType: 'EMPTY',
          source: `跌穿月50($${m50.toFixed(2)})與季50($${q50.toFixed(2)})雙中間線進入下跌浪，開盤 100% 清倉並禁買`,
          profitPct,
          profit: profitPct,
          msg: `[${execDate}] 🚨 順勢引擎・破月季50線100%清倉 ${sellShares.toLocaleString()}股 @ 開盤$${todayOpen.toFixed(2)} (含0.25%成本) | 淨盈虧: ${profitPct >= 0 ? '+' : ''}${profitPct}%`
        });
      }

      // E. 上升浪高位止盈 45% (PARTIAL_PROFIT：日線>=88 奇點沽預警後，收市跌穿奇點 K 線最低位，保留 55% 核心底倉)
      //     長牛護盾＋盈利鎖利：護盾開啟時（isLongBullShield：四態 S1 主升浪或 S2 牛市洗盤），
      //     必須浮盈 >= +8%（todayOpen >= avgCost * 1.08）先可以高拋鎖利；未達標跳過本次減倉（奇點武裝已由引擎
      //     喺 PARTIAL_PROFIT 觸發時清除，等下一個奇點頂再評估），徹底消滅慢牛股低賣高買內耗。
      //     護盾關閉時（狀態③過渡／震盪／熊市）保命優先，破位即減倉，唔等盈利。
      if (
        longShares > 0 &&
        avgLongCost > 0 &&
        isBullRegime &&
        verdict.signal === 'PARTIAL_PROFIT' &&
        !partialTakenInLeg &&
        canAct &&
        !(verdict.isLongBullShield === true && todayOpen < avgLongCost * 1.08)
      ) {
        const ratio = verdict.sizeRatio > 0 ? Math.min(0.6, verdict.sizeRatio) : 0.45;
        const sellShares = Math.floor(longShares * ratio);
        const orderValue = sellShares * todayOpen;

        if (sellShares > 0 && orderValue >= minOrderValue) {
          const netExitPrice = todayOpen * (1 - FEE_RATE);
          const pnlRatio = (netExitPrice - avgLongCost) / avgLongCost;
          cashPool += sellShares * netExitPrice;
          trades.push({ profit: pnlRatio });

          longShares -= sellShares;
          if (longShares === 0) avgLongCost = 0;
          lastActionBarIndex = i;
          partialTakenInLeg = true;
          // 記錄實際高拋成交價（T 開盤價）與成交日索引，供其後補回單 96% 折扣驗證與 30 日過期判斷
          lastSellPriceExec = todayOpen;
          lastSellIndexExec = i;
          const profitPct = Number((pnlRatio * 100).toFixed(2));
          const lockPct = Math.round(ratio * 100);
          const keepPct = 100 - lockPct;

          tradeLogs.unshift({
            date: execDate,
            signalDate,
            execDate,
            puzzleHint: hintBase,
            complianceTag: '✅ 精準執行',
            type: 'SELL',
            action: `🟠 順勢引擎・跌穿奇點低減倉${lockPct}%留${keepPct}%底倉`,
            shares: sellShares,
            units: `減倉${lockPct}%保留${keepPct}%核心底倉`,
            confidence: `跌穿奇點低 $${(verdict.singularityLow ?? prevBar.low).toFixed(2)}｜日TFDR ${prevOverlay.dTfdr}≥88 奇點沽預警後扣扳機`,
            price: todayOpen.toFixed(2),
            totalHolding: longShares,
            holdingType: longShares > 0 ? 'LONG' : 'EMPTY',
            source: `上升浪內日TFDR達到 ${prevOverlay.dTfdr} (≥88) 觸發奇點沽預警後，收市跌穿奇點 K 線最低位 $${(verdict.singularityLow ?? prevBar.low).toFixed(2)}，減倉 ${lockPct}% 鎖利並死抱 ${keepPct}% 核心底倉`,
            profitPct,
            profit: profitPct,
            msg: `[${execDate}] 🟠 順勢引擎・跌穿奇點低減倉${lockPct}%留${keepPct}%底倉 ${sellShares.toLocaleString()}股 @ 開盤$${todayOpen.toFixed(2)} (含0.25%成本) | 淨盈虧: ${profitPct >= 0 ? '+' : ''}${profitPct}%`
          });
        }
      }

      // E2. 狀態③過渡警戒減半倉（一次性穿越觸發）：四態 S3（季 TFDR 50–60）期間，收市首次由上往下
      //     跌穿月 50 線（crossedBelowM50：前日收市在線上、本日收市在線下），且當前多單倉位 > 40%
      //     淨值時，執行一次減倉至 40% 上限。穿越條件本身只在穿越瞬間成立一次，絕不每日重複觸發。
      //     與高拋鎖利（E）完全隔離：唔設 partialTakenInLeg、唔記錄 lastSellPrice（唔係高拋，補回
      //     折扣唔適用）；亦唔受 canAct 操作間距限制（破位防守，唔可以因為三日前買過就拖住唔減），
      //     同破線清倉（D）一樣係強制防守分支。減倉後若價錢再跌穿季 50 線，D 分支會清埋餘倉。
      if (
        longShares > 0 &&
        avgLongCost > 0 &&
        verdict.marketState === 'S3' &&
        verdict.crossedBelowM50 === true
      ) {
        const equityNow = cashPool + longShares * todayOpen - shortShares * todayOpen;
        const longValue = longShares * todayOpen;
        const positionRatio = equityNow > 0 ? longValue / equityNow : 0;
        if (positionRatio > 0.4) {
          const targetLongValue = 0.4 * equityNow;
          const sellShares = Math.max(0, Math.floor((longValue - targetLongValue) / todayOpen));
          const orderValue = sellShares * todayOpen;

          if (sellShares > 0 && orderValue >= minOrderValue) {
            const netExitPrice = todayOpen * (1 - FEE_RATE);
            const pnlRatio = (netExitPrice - avgLongCost) / avgLongCost;
            cashPool += sellShares * netExitPrice;
            trades.push({ profit: pnlRatio });

            longShares -= sellShares;
            if (longShares === 0) avgLongCost = 0;
            lastActionBarIndex = i;
            const profitPct = Number((pnlRatio * 100).toFixed(2));

            tradeLogs.unshift({
              date: execDate,
              signalDate,
              execDate,
              puzzleHint: hintBase,
              complianceTag: '✅ 精準執行',
              type: 'HALVE',
              action: '🛡️ 狀態③・跌破月50線減半倉至40%',
              shares: sellShares,
              units: `倉位 ${(positionRatio * 100).toFixed(0)}% → 40% 上限`,
              confidence: `狀態③過渡帶｜${prevOverlay.qTfdr != null ? `季TFDR ${prevOverlay.qTfdr} 在 50–60` : '季TFDR 未累積・價位退化判定'}｜收市首次跌穿月50 $${m50.toFixed(2)}`,
              price: todayOpen.toFixed(2),
              totalHolding: longShares,
              holdingType: longShares > 0 ? 'LONG' : 'EMPTY',
              source: `狀態③過渡警戒期，收市首次由上往下跌穿月 50 線 $${m50.toFixed(2)}，持倉由 ${(positionRatio * 100).toFixed(0)}% 減至 40% 上限防守`,
              profitPct,
              profit: profitPct,
              msg: `[${execDate}] 🛡️ 狀態③・跌破月50線減半倉至40% ${sellShares.toLocaleString()}股 @ 開盤$${todayOpen.toFixed(2)} (含0.25%成本) | 淨盈虧: ${profitPct >= 0 ? '+' : ''}${profitPct}%`
            });
          }
        }
      }

      // F0. 高拋補回單的 T 開盤折扣驗證：若今日本是補回單（GOLDEN_BUY 且有上次沽價），但 T 開盤價未低過
      //     上次沽價 ×96%，唔成交、留 pending 等下一個交易日（唔取消武裝）；轉入下跌浪即取消 pending。
      if (pendingBuyback != null && isBearRegime) pendingBuyback = null;
      // 補回折扣只可以用回測實際成交價（T 開盤價）做參考：verdict 的 lastSellPrice 只係收市參考價，
      // 而且當時可能根本無倉可沽（例如 PARTIAL_PROFIT 訊號出現時 longShares 已經係 0），用佢做折扣會錯誤地
      // 將全新買入當成補回單、無端端擋住入場。無實際高拋成交，就當全新買入。
      const buybackRefPrice = lastSellPriceExec;
      const isBuybackVerdict =
        verdict.signal === 'GOLDEN_BUY' && verdict.isBuyback === true && buybackRefPrice != null;
      // 高拋 30 個交易日過期：距離上次高拋成交已超過 30 日，96% 折扣錨點作廢，pending 補回單視為全新買入（與引擎端 lastSellPrice 過期規則一致）
      const buybackExpired =
        lastSellIndexExec != null && i - lastSellIndexExec > LAST_SELL_EXPIRY_BARS;
      const pendingBuybackReady =
        pendingBuyback != null &&
        shortShares === 0 &&
        isBullRegime &&
        !entryLocked &&
        canAct &&
        todayOpen > pendingBuyback.singularityHigh &&
        (buybackExpired || todayOpen < pendingBuyback.lastSellPrice * 0.96) &&
        (prevOverlay.wMid50 == null || todayOpen >= prevOverlay.wMid50);
      const suppressGoldenBuy =
        verdict.signal === 'GOLDEN_BUY' &&
        canAct &&
        isBuybackVerdict &&
        buybackRefPrice != null &&
        todayOpen >= buybackRefPrice * 0.96;
      if (suppressGoldenBuy && buybackRefPrice != null) {
        pendingBuyback = {
          singularityHigh: verdict.singularityHigh ?? prevBar.high,
          lastSellPrice: buybackRefPrice,
          date: signalDate
        };
      }
      const execSingularityHigh =
        pendingBuybackReady && pendingBuyback
          ? pendingBuyback.singularityHigh
          : verdict.singularityHigh ?? prevBar.high;
      // 已過期的 pending 補回單視為全新買入，唔再標示為補回單（否則 log 會錯誤寫成「開盤 < 沽價×96%」）
      const execBuybackRef =
        pendingBuybackReady && pendingBuyback && !buybackExpired
          ? pendingBuyback.lastSellPrice
          : isBuybackVerdict && !buybackExpired
          ? buybackRefPrice
          : null;

      // F. 上升浪低位買入 (GOLDEN_BUY：收市升穿奇點最高位；補回單另須週線未穿 50 且成交價 < 上次沽價 ×96%，未滿足則延期而非取消)
      //     買入倉位跟四態大勢上限（S1/S2 80%，S3 30%），並受全局峰值開倉暫停鎖約束（鎖定期間唔開新倉）。
      if (
        shortShares === 0 &&
        isBullRegime &&
        !entryLocked &&
        ((verdict.signal === 'GOLDEN_BUY' && !suppressGoldenBuy) || pendingBuybackReady) &&
        canAct
      ) {
        // 四態上限雙重保障：引擎已按 marketState 設 sizeRatio，回測再以 verdict.maxBuyRatio 設上限
        const stateCap = verdict.maxBuyRatio ?? 0.8;
        const ratio = Math.min(
          verdict.sizeRatio > 0 ? Math.min(1, verdict.sizeRatio) : 0.8,
          stateCap
        );
        const targetCash = cashPool * ratio;
        const shares = Math.floor(targetCash / (todayOpen * (1 + FEE_RATE)));
        const orderValue = shares * todayOpen;

        if (shares > 0 && orderValue >= minOrderValue) {
          const totalCost = orderValue * (1 + FEE_RATE);
          cashPool -= totalCost;
          avgLongCost = (longShares * avgLongCost + totalCost) / (longShares + shares);
          longShares += shares;
          lastActionBarIndex = i;
          partialTakenInLeg = false;
          // 買入已成交（無論係全新買入定補回單），清除補回延期狀態同上次沽價參考
          pendingBuyback = null;
          lastSellPriceExec = null;
          lastSellIndexExec = null;

          const pctLabel = Math.round(ratio * 100);
          const inBand = todayOpen <= Math.max(w50 * 1.15, prevBar.high * 1.05);
          const complianceTag = inBand ? '✅ 精準執行' : '⚠️ 偏離區間';

          tradeLogs.unshift({
            date: execDate,
            signalDate,
            execDate,
            puzzleHint: hintBase,
            complianceTag,
            type: 'STRONG BUY',
            action: execBuybackRef != null
              ? `🔥 順勢引擎・高拋後補回買入${pctLabel}%`
              : `🔥 順勢引擎・上升浪極底重倉買入${pctLabel}%`,
            shares,
            units: `現金池${pctLabel}%坐貨主升浪`,
            confidence: execBuybackRef != null
              ? `升穿奇點高 $${execSingularityHigh.toFixed(2)}｜補回單：開盤 $${todayOpen.toFixed(2)} < 上次沽價 $${execBuybackRef.toFixed(2)}×96% ($${(execBuybackRef * 0.96).toFixed(2)})｜週線未穿50`
              : `穩站月/季50之上｜收市升穿奇點高 $${execSingularityHigh.toFixed(2)}`,
            price: todayOpen.toFixed(2),
            totalHolding: longShares,
            holdingType: 'LONG',
            source: execBuybackRef != null
              ? `高拋後補回：收市升穿奇點高 $${execSingularityHigh.toFixed(2)}，週線未穿 50 且開盤 $${todayOpen.toFixed(2)} 低於上次沽價 $${execBuybackRef.toFixed(2)} 的 96%，${pctLabel}%補回坐貨`
              : `上升浪大勢內 (收盤$${prevOverlay.close} ≥ 月50 $${m50.toFixed(2)} 或 季50 $${q50.toFixed(2)})，收市升穿奇點高 $${execSingularityHigh.toFixed(2)}，${pctLabel}%重倉買入坐貨`,
            profitPct: null,
            msg: `[${execDate}] 🔥 順勢引擎・上升浪極底重倉買入${pctLabel}% ${shares.toLocaleString()}股 @ 開盤$${todayOpen.toFixed(2)} (現金池${pctLabel}%・含0.25%成本)`
          });
        }
      }

      // G. 下跌浪順勢開空 35% (SHORT_ENTRY：跌穿月/季50之下 ＋ 反彈觸發奇點沽後收市跌穿奇點 K 線最低位)
      //     受全局峰值開倉暫停鎖約束（鎖定期間唔開新空單）。
      if (
        longShares === 0 &&
        shortShares === 0 &&
        isBearRegime &&
        !entryLocked &&
        verdict.signal === 'SHORT_ENTRY' &&
        canAct
      ) {
        const shortRatio = verdict.sizeRatio > 0 ? Math.min(0.5, verdict.sizeRatio) : 0.35;
        const marginAlloc = cashPool * shortRatio;
        const shares = Math.floor(marginAlloc / todayOpen);
        const orderValue = shares * todayOpen;

        if (shares > 0 && orderValue >= minOrderValue) {
          const netSellPerShare = todayOpen * (1 - FEE_RATE);
          cashPool += shares * netSellPerShare;
          shortShares = shares;
          shortEntryGross = todayOpen;
          shortEntryNetProceeds = netSellPerShare;
          lastActionBarIndex = i;
          const shortPct = Math.round(shortRatio * 100);

          tradeLogs.unshift({
            date: execDate,
            signalDate,
            execDate,
            puzzleHint: hintBase,
            complianceTag: '✅ 精準執行',
            type: 'SHORT',
            action: `🟣 順勢引擎・下跌浪輕倉沽空${shortPct}%`,
            shares,
            units: `下跌浪奇點沽跌穿低位沽空${shortPct}%`,
            confidence: `破月50($${m50.toFixed(2)})/季50($${q50.toFixed(2)})｜奇點沽跌穿奇點低 $${(verdict.singularityLow ?? prevBar.low).toFixed(2)}｜日TFDR ${prevOverlay.dTfdr}≥80`,
            price: todayOpen.toFixed(2),
            totalHolding: shortShares,
            holdingType: 'SHORT',
            source: `跌穿月/季50中間線進入下跌浪，反彈觸發奇點沽 (日TFDR=${prevOverlay.dTfdr} ≥80) 後收市跌穿奇點 K 線最低位 $${(verdict.singularityLow ?? prevBar.low).toFixed(2)}，開立${shortPct}%輕倉順勢空單`,
            profitPct: null,
            msg: `[${execDate}] 🟣 順勢引擎・下跌浪輕倉沽空${shortPct}% ${shares.toLocaleString()}股 @ 開盤$${todayOpen.toFixed(2)} (含0.25%成本)`
          });
        }
      }
    }

    // 每日收盤更新歷史最高淨值與回撤（同步計入多單市值或空單負債）；peakEquity 永不重置，
    // 係全局峰值開倉暫停鎖的基準——總回撤以佢計，唔再有局部重置熔斷。
    const equity = cashPool + longShares * currBar.close - shortShares * currBar.close;
    if (equity > peakEquity) peakEquity = equity;

    if (peakEquity > 0) {
      latestCloseDrawdown = (peakEquity - equity) / peakEquity;
      maxDrawdown = Math.max(maxDrawdown, latestCloseDrawdown * 100);
    }
  }

  const lastClose = sorted[sorted.length - 1].close;
  const finalEquity =
    cashPool +
    (longShares > 0 && Number.isFinite(lastClose) && lastClose > 0 ? longShares * lastClose : 0) -
    (shortShares > 0 && Number.isFinite(lastClose) && lastClose > 0 ? shortShares * lastClose : 0);

  const statTrades = [...trades];
  if (
    statTrades.length === 0 &&
    longShares > 0 &&
    avgLongCost > 0 &&
    Number.isFinite(lastClose) &&
    lastClose > 0
  ) {
    statTrades.push({ profit: (lastClose * (1 - FEE_RATE) - avgLongCost) / avgLongCost });
  } else if (
    statTrades.length === 0 &&
    shortShares > 0 &&
    shortEntryGross > 0 &&
    Number.isFinite(lastClose) &&
    lastClose > 0
  ) {
    statTrades.push({
      profit: (shortEntryNetProceeds - lastClose * (1 + FEE_RATE)) / shortEntryGross
    });
  }

  const totalReturn = initialFund > 0 ? ((finalEquity - initialFund) / initialFund) * 100 : 0;
  const winningTrades = statTrades.filter(t => t.profit > 0);
  const losingTrades = statTrades.filter(t => t.profit <= 0);
  const totalWin = winningTrades.reduce((sum, t) => sum + t.profit, 0);
  const totalLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.profit, 0));
  const annualReturn =
    sorted.length > 0 && totalReturn > -100
      ? (Math.pow(1 + totalReturn / 100, barsPerYear / sorted.length) - 1) * 100
      : totalReturn <= -100
      ? -100
      : 0;

  const stats: BacktestStats = {
    totalReturn: totalReturn.toFixed(2),
    winRate:
      statTrades.length > 0
        ? ((winningTrades.length / statTrades.length) * 100).toFixed(2)
        : '0.00',
    profitLossRatio:
      totalLoss > 0 ? (totalWin / totalLoss).toFixed(2) : totalWin > 0 ? '無虧損交易' : '0.00',
    maxDrawdown: maxDrawdown.toFixed(2),
    finalFund: finalEquity.toFixed(2),
    tradeCount: tradeLogs.length,
    annualReturn: annualReturn.toFixed(2)
  };

  return { stats, logs: tradeLogs };
}

// ===================== 傅立葉 Z 軸及技術指標 (Fourier Z-Axis) =====================
function mean(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length <= 1) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) * (v - m), 0) / arr.length);
}

function EMA(data: number[], period: number): number[] {
  if (data.length === 0) return [];
  const alpha = 2 / (period + 1);
  const res = [data[0]];
  for (let i = 1; i < data.length; i++) {
    res.push(alpha * data[i] + (1 - alpha) * res[i - 1]);
  }
  return res;
}

function fft(r: number[], i: number[]) {
  const N = r.length;
  if (N <= 1) return;
  let j = 0;
  for (let x = 0; x < N - 1; x++) {
    if (x < j) {
      const tr = r[x]; r[x] = r[j]; r[j] = tr;
      const ti = i[x]; i[x] = i[j]; i[j] = ti;
    }
    let k = N >> 1;
    while (k <= j) {
      j -= k;
      k >>= 1;
    }
    j += k;
  }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wl_re = Math.cos(ang);
    const wl_im = Math.sin(ang);
    for (let x = 0; x < N; x += len) {
      let w_re = 1;
      let w_im = 0;
      for (let y = 0; y < len / 2; y++) {
        const u_re = r[x + y];
        const u_im = i[x + y];
        const v_re = r[x + y + len / 2] * w_re - i[x + y + len / 2] * w_im;
        const v_im = r[x + y + len / 2] * w_im + i[x + y + len / 2] * w_re;
        r[x + y] = u_re + v_re;
        i[x + y] = u_im + v_im;
        r[x + y + len / 2] = u_re - v_re;
        i[x + y + len / 2] = u_im - v_im;
        const nw_re = w_re * wl_re - w_im * wl_im;
        const nw_im = w_re * wl_im + w_im * wl_re;
        w_re = nw_re;
        w_im = nw_im;
      }
    }
  }
}

function calcRSI(p: number[], period: number = 14): number | null {
  if (p.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = p[i] - p[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  let avgG = gains / period;
  let avgL = losses / period;
  for (let i = period + 1; i < p.length; i++) {
    const d = p[i] - p[i - 1];
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgL === 0) return 100;
  return 100 - 100 / (1 + avgG / avgL);
}

function calcMACD(p: number[]) {
  if (p.length < 35) return null;
  const e12 = EMA(p, 12);
  const e26 = EMA(p, 26);
  const dif = [];
  for (let i = 0; i < e12.length; i++) dif.push(e12[i] - e26[i]);
  const dea = EMA(dif, 9);
  const last = dif.length - 1;
  return { macd: dif[last], signal: dea[last], hist: (dif[last] - dea[last]) * 2 };
}

function calcATR(p: number[], period: number = 14): number | null {
  if (p.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < p.length; i++) trs.push(Math.abs(p[i] - p[i - 1]));
  let atr = mean(trs.slice(0, period));
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return atr;
}

function calcBollingerPos(p: number[], period: number = 20, mult: number = 2): number | null {
  if (p.length < period) return null;
  const seg = p.slice(-period);
  const m = mean(seg);
  const sd = stdDev(seg);
  if (sd === 0) return 0.5;
  return (p[p.length - 1] - (m - mult * sd)) / (2 * mult * sd);
}

export function calcTechScore(p: number[]): TechScore {
  let score = 0;
  const parts: string[] = [];

  const rsi = calcRSI(p);
  if (rsi !== null) {
    const r = rsi < 30 ? 30 : rsi > 70 ? -30 : 50 - rsi;
    score += r;
    parts.push(`RSI:${rsi.toFixed(0)}`);
  }

  const macd = calcMACD(p);
  if (macd) {
    score += macd.hist > 0 ? 25 : -25;
    parts.push(`MACD:${macd.hist.toFixed(2)}`);
  }

  const bpos = calcBollingerPos(p);
  if (bpos !== null) {
    const bv = bpos > 1 ? -20 : bpos < 0 ? 20 : (0.5 - bpos) * 40;
    score += bv;
    parts.push(`%B:${bpos.toFixed(2)}`);
  }

  const atr = calcATR(p);
  if (atr !== null) parts.push(`ATR:${atr.toFixed(2)}`);

  return {
    score: Math.max(-100, Math.min(100, Math.round(score))),
    detail: parts.join(' | ')
  };
}

function getSpectrum(p: number[]): FourierSpectrumItem[] {
  if (p.length < 32) return [];
  const ret: number[] = [];
  for (let i = 1; i < p.length; i++) {
    if (p[i - 1] > 0) ret.push(Math.log(p[i] / p[i - 1]));
  }
  const n = ret.length;
  if (n < 32) return [];
  const m = mean(ret);
  const std = Math.max(stdDev(ret), 0.000001);

  let size = 1;
  while (size < n) size <<= 1;
  const re: number[] = new Array(size).fill(0);
  const im: number[] = new Array(size).fill(0);

  let winSumSq = 0;
  for (let i = 0; i < n; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    winSumSq += w * w;
    re[i] = (ret[i] - m) * w;
  }
  fft(re, im);

  const amps: FourierSpectrumItem[] = [];
  for (let i = 1; i < n / 2; i++) {
    const raw = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
    const rel = Math.min(raw / std / Math.sqrt(winSumSq || 1), 2.0);
    const period = n / i;
    if (period >= 3 && period <= 250) {
      amps.push({
        period: Math.round(period),
        amplitude: rel,
        phase: Math.atan2(im[i], re[i])
      });
    }
  }
  amps.sort((a, b) => b.amplitude - a.amplitude);
  return amps;
}

function calcRibbon(p: number[]): RibbonState {
  if (p.length < 50) return { color: 'gray', trend: 'flat', strength: 0 };
  const ema10 = EMA(p, 10);
  const ema20 = EMA(p, 20);
  const ema50 = EMA(p, 50);
  const cur10 = ema10[ema10.length - 1];
  const cur20 = ema20[ema20.length - 1];
  const cur50 = ema50[ema50.length - 1];
  const prev10 = ema10[ema10.length - 2];
  const vol = stdDev(p.slice(-20)) / (mean(p.slice(-20)) || 1);
  const thresh = Math.max(0.0005, vol * 0.5);

  let color: 'red' | 'green' | 'gray' = 'gray';
  if (cur10 > cur20 && cur20 > cur50) color = 'red';
  else if (cur10 < cur20 && cur20 < cur50) color = 'green';

  const slope = (cur10 - prev10) / (prev10 || 1);
  const trend: 'up' | 'down' | 'flat' = slope > thresh ? 'up' : slope < -thresh ? 'down' : 'flat';
  const strength = Math.min(100, (Math.abs(cur10 - cur50) / (cur50 || 1)) * 500);

  return { color, trend, strength };
}

function computeHologramLine(p: number[], periods: FourierSpectrumItem[], days: number = 20, totalEnergy: number): number[] {
  const last = p[p.length - 1];
  if (!periods.length || !last || !Number.isFinite(last)) {
    return new Array(days).fill(last || 0);
  }
  const n = p.length;
  const lookback = Math.min(20, n - 1);
  const basePrice = p[n - 1 - lookback] || last;
  let dailyRet = Math.log(last / basePrice) / lookback;
  if (!Number.isFinite(dailyRet)) dailyRet = 0;
  dailyRet = Math.max(-0.01, Math.min(0.01, dailyRet));

  const norm = periods.reduce((s, a) => s + a.amplitude, 0) || 1;
  const intensity = Math.min(0.4, totalEnergy / 2.0);
  let recentVol = stdDev(p.slice(-20)) / (mean(p.slice(-20)) || 1);
  if (!Number.isFinite(recentVol)) recentVol = 0.02;

  const pred: number[] = [];
  for (let d = 1; d <= days; d++) {
    let osc = 0;
    for (let i = 0; i < periods.length; i++) {
      const per = periods[i].period;
      const amp = periods[i].amplitude / norm;
      osc += amp * Math.cos((2 * Math.PI * (n - 1 + d)) / per + periods[i].phase);
    }
    const change = last * dailyRet * d + last * recentVol * osc * intensity * 0.5;
    const val = last + change;
    pred.push(Number(Number.isFinite(val) ? val.toFixed(2) : last.toFixed(2)));
  }
  return pred;
}

export function calculateFourierZAxis(prices: number[]): FourierState {
  if (prices.length < 35) {
    return {
      spectrum: [],
      prob: { up: 33, down: 33, flat: 34 },
      ribbon: { color: 'gray', trend: 'flat', strength: 0 },
      techInfo: { score: 0, detail: '數據量不足以計算Z軸' },
      forecastLine: []
    };
  }

  const p = prices.slice(-3000);
  const fullSpectrum = getSpectrum(p);
  const topSpectrum = fullSpectrum.slice(0, 5);
  const ribbon = calcRibbon(p);
  const techInfo = calcTechScore(p);

  const last20 = p.slice(-20);
  const slopeDir = Math.max(-1, Math.min(1, ((last20[last20.length - 1] - last20[0]) / last20[0]) * 10));
  const techDir = techInfo.score / 100;
  const totalE = topSpectrum.reduce((s, a) => s + a.amplitude, 0);
  const specBias = totalE > 0.8 ? 0 : totalE > 0.3 ? slopeDir * 0.5 : slopeDir;
  const dir = slopeDir * 0.4 + techDir * 0.4 + specBias * 0.2;

  let up = Math.min(85, Math.max(15, 50 + dir * 35));
  let flat = Math.min(50, Math.max(10, 20 + (1 - Math.abs(dir)) * 30));
  let down = Math.min(85, Math.max(5, 100 - up - flat));
  const tot = up + down + flat;
  const prob = {
    up: Math.round((up / tot) * 100),
    down: Math.round((down / tot) * 100),
    flat: Math.round((flat / tot) * 100)
  };

  const forecastLine = computeHologramLine(p, topSpectrum, 20, totalE);

  return {
    spectrum: topSpectrum,
    prob,
    ribbon,
    techInfo,
    forecastLine
  };
}
