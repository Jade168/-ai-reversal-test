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

// ===================== 1836.15 數律樞軸模型計算 (支持低位地板與高位天花板對稱對齊) =====================
export function calculateModel(rawData: RawKline[], coreNum: number = QUANT_CONFIG.coreNumber, sentiment: string = '中性'): ModelBar[] {
  const clean = sanitizeKlineData(rawData);
  if (clean.length === 0) return [];

  const period = Math.min(50, clean.length);
  const recentData = clean.slice(-period);
  const recentHigh = Math.max(...recentData.map(d => d.h));
  const recentLow = Math.min(...recentData.map(d => d.l));
  const lastClose = clean[clean.length - 1].c;
  const pivot = (recentHigh + recentLow + lastClose) / 3;
  const exp = Math.floor(Math.log10(lastClose / coreNum));
  const coreGravityLine = coreNum * Math.pow(10, exp);
  const range = recentHigh - recentLow;
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
    // 【修正強支撐位計算】：修正原代碼 item.l - range * r 的數學偏差，對齊經典樞紐支撐網
    const support1 = (pivot - range * r) * (sentiment === '利好' ? 1.02 : sentimentAdjust);
    const support2 = (pivot - range * r * 1.5) * sentimentAdjust;
    const resistance = (pivot + range * r) * (sentiment === '利空' ? 0.98 : sentimentAdjust);

    const dateNum = parseInt((item.date || '').split(' ')[0].replace(/[^0-9]/g, ''), 10) || 0;
    const dateGuiYuan = getGuiYuan(dateNum);
    const priceGuiYuan = getGuiYuan(Math.floor(item.c * 100));
    const deviation = Math.abs(item.c - coreGravityLine) / coreGravityLine;
    const isResonance = deviation < 0.08;

    // 智能容差窗口 (±1.5%)：修復低位地板信號過小或未達建議位的痛點
    const tolerance = 0.015;
    const isAtSupport = Math.abs(item.l - support1) / support1 <= tolerance || item.l <= support1;
    const isAtResistance = Math.abs(item.h - resistance) / resistance <= tolerance || item.h >= resistance;

    const buySignal = (isAtSupport || item.c <= support1 * 1.015) && ([3, 6, 9].includes(priceGuiYuan) || item.c > item.o) && sentiment !== '利空';
    const sellSignal = (isAtResistance || item.c >= resistance * 0.985) && ([3, 6, 9].includes(priceGuiYuan) || item.c < item.o) && sentiment !== '利好';

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
  tolerance: number = 0.015
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
      Math.abs(currentLow - level) / level <= tolerance || currentLow <= level
    );

    // 【修正高位信號】：對齊阻力位
    const isAtResistance = resistanceLevels.some(level => 
      Math.abs(currentHigh - level) / level <= tolerance || currentHigh >= level
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
  const tolerance = 0.015; // 1.5% 智能支撐壓力對齊容差

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

    const gyHigh = getGuiYuan(Math.floor(currentHigh));
    const gyLow = getGuiYuan(Math.floor(currentLow));

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
      Math.abs(currentClose - level) / level <= tolerance ||
      currentLow <= level
    );

    // 【修正高位信號】對齊阻力位
    const isAtResistance = effectiveResistances.some(level =>
      Math.abs(currentHigh - level) / level <= tolerance ||
      Math.abs(currentClose - level) / level <= tolerance ||
      currentHigh >= level
    );

    // 天花板高位：局部波峰，且 (觸發阻力對齊 或 369歸元共振 或 賣出信號)
    if (isLocalHigh && (isAtResistance || [3, 6, 9].includes(gyHigh) || currentBar.sellSignal || currentBar.reversalSignal === 'CRITICAL_SELL')) {
      highs.push({
        index: i,
        price: currentHigh,
        label: isAtResistance ? '強阻力高位' : '天花板',
        isStrong: isAtResistance || Boolean(currentBar.sellSignal),
        date: currentBar.date
      });
    }

    // 地板價低位：局部波谷，且 (觸發強支撐對齊 或 369歸元共振 或 買入信號)
    // 徹底修復：條件對稱，不再苛刻過濾低位強支撐
    if (isLocalLow && (isAtSupport || [3, 6, 9].includes(gyLow) || currentBar.buySignal || currentBar.reversalSignal === 'STRONG_BUY')) {
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

function yearWindowStart(data: RawKline[], index: number, period: string): number {
  const now = data[index].timestamp;
  // 月線追溯15-20年宏觀極值，週線追溯8-10年，日線追溯3-5年
  const lookbackYears = period === 'monthly' ? 18 : (period === 'weekly' ? 8 : 3);
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
  return Math.max(0, index - barsPerYear * lookbackYears);
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

    const start = yearWindowStart(processedKlines, i, period);
    const highAnchor = findAnchor(processedKlines, start, i, 'h', true);
    const lowStart = asset.longTermLow ? 0 : start;
    const lowAnchor = findAnchor(processedKlines, lowStart, i, 'l', false);
    const previous = processedKlines[i - 1];
    const prior = i > 1 ? processedKlines[i - 2] : null;

    if (!highAnchor || !lowAnchor || highAnchor.price <= 0 || lowAnchor.price <= 0 || !previous || !prior) {
      results.push(hold);
      continue;
    }

    const barsFromHigh = i - highAnchor.index;
    const barsFromLow = i - lowAnchor.index;
    const buyTimeMatch = matchesTimeWindow(barsFromHigh);
    const sellTimeMatch = matchesTimeWindow(barsFromLow);

    const downtrend = previous.c < prior.c && previous.c < highAnchor.price;
    const uptrend = previous.c > prior.c && previous.c > lowAnchor.price;
    const bullishReversal = downtrend && bar.c > bar.o && bar.c > previous.c;
    const bearishReversal = uptrend && bar.c < bar.o && bar.c < previous.c;

    const support = highAnchor.price * (1 - asset.levels[0] / 100);
    const resistance = lowAnchor.price * (1 + asset.levels[0] / 100);

    let signal: 'STRONG_BUY' | 'CRITICAL_SELL' | 'HOLD' = 'HOLD';
    let matchedThreshold: number | null = null;
    let spaceResonance = false;

    // STRONG BUY：时间共振 + 空间引力容错 (±1.5%)
    if (buyTimeMatch && (bullishReversal || bar.c > bar.o)) {
      const drawdownLow = ((highAnchor.price - bar.l) / highAnchor.price) * 100;
      const drawdownClose = ((highAnchor.price - bar.c) / highAnchor.price) * 100;

      const matchedLevel = (asset.levels as readonly number[]).find((lvl: number) => {
        return Math.abs(drawdownLow - lvl) <= SPACE_TOLERANCE_PERCENT || Math.abs(drawdownClose - lvl) <= SPACE_TOLERANCE_PERCENT;
      });

      if (matchedLevel !== undefined) {
        const supportLevel = highAnchor.price * (1 - (matchedLevel + SPACE_TOLERANCE_PERCENT) / 100);
        if (bar.c >= supportLevel) {
          signal = 'STRONG_BUY';
          matchedThreshold = matchedLevel;
          spaceResonance = true;
        }
      }
    }

    // CRITICAL SELL：时间共振 + 空间引力容错 (±1.5%)
    if (sellTimeMatch && (bearishReversal || bar.c < bar.o)) {
      const reboundHigh = ((bar.h - lowAnchor.price) / lowAnchor.price) * 100;
      const reboundClose = ((bar.c - lowAnchor.price) / lowAnchor.price) * 100;

      const matchedLevel = (asset.levels as readonly number[]).find((lvl: number) => {
        return Math.abs(reboundHigh - lvl) <= SPACE_TOLERANCE_PERCENT || Math.abs(reboundClose - lvl) <= SPACE_TOLERANCE_PERCENT;
      });

      if (matchedLevel !== undefined) {
        const resistanceLevel = lowAnchor.price * (1 + (matchedLevel - SPACE_TOLERANCE_PERCENT) / 100);
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

  return results;
}

// ===================== 回測引擎 =====================
export function runBacktestEngine(modelData: ModelBar[], configuredFund: number = 100000, period: string = 'daily') {
  const initialFund = Number.isFinite(configuredFund) && configuredFund > 0 ? configuredFund : 100000;
  let cash = initialFund;
  let shares = 0;
  let entryCapital = 0;
  let entryPrice = 0;
  let peakEquity = initialFund;
  let maxDrawdown = 0;
  const trades: { profit: number }[] = [];
  const logs: TradeLog[] = [];

  for (let idx = 0; idx < modelData.length; idx += 1) {
    const item = modelData[idx];
    const close = Number(item.c);

    if (idx > 0) {
      const signalBar = modelData[idx - 1];
      const rawOpen = Number(item.o);
      const executionPrice = Number.isFinite(rawOpen) && rawOpen > 0 ? rawOpen : close;

      if (signalBar.buySignal && shares === 0 && cash > 0 && executionPrice > 0) {
        entryCapital = cash;
        entryPrice = executionPrice;
        shares = cash / executionPrice;
        cash = 0;
        logs.push({ type: 'buy', msg: `[${signalBar.date}] STRONG BUY; 下一棒開市價 @ ${executionPrice.toFixed(2)}` });
      } else if (signalBar.sellSignal && shares > 0 && executionPrice > 0) {
        cash = shares * executionPrice;
        const profit = cash - entryCapital;
        trades.push({ profit: entryCapital > 0 ? profit / entryCapital : 0 });
        logs.push({
          type: 'sell',
          msg: `[${signalBar.date}] CRITICAL SELL; 下一棒開市價 @ ${executionPrice.toFixed(2)} | 盈虧: ${profit >= 0 ? '+' : ''}${profit.toFixed(2)} (${((profit / entryCapital) * 100).toFixed(2)}%)`
        });
        shares = 0;
        entryCapital = 0;
        entryPrice = 0;
      }
    }

    const equity = cash + (shares > 0 && Number.isFinite(close) ? shares * close : 0);
    if (equity > peakEquity) peakEquity = equity;
    if (peakEquity > 0) maxDrawdown = Math.max(maxDrawdown, ((peakEquity - equity) / peakEquity) * 100);
  }

  if (shares > 0 && modelData.length > 0) {
    const last = modelData[modelData.length - 1];
    const exitPrice = Number(last.c);
    if (Number.isFinite(exitPrice) && exitPrice > 0) {
      cash = shares * exitPrice;
      const profit = cash - entryCapital;
      trades.push({ profit: entryCapital > 0 ? profit / entryCapital : 0 });
      logs.push({
        type: 'sell',
        msg: `[回測結束] 當前收盤強制平倉 @ ${exitPrice.toFixed(2)} | 盈虧: ${profit >= 0 ? '+' : ''}${profit.toFixed(2)}`
      });
    }
  }

  const totalReturn = initialFund > 0 ? ((cash - initialFund) / initialFund) * 100 : 0;
  const winningTrades = trades.filter(t => t.profit > 0);
  const losingTrades = trades.filter(t => t.profit <= 0);
  const totalWin = winningTrades.reduce((sum, t) => sum + t.profit, 0);
  const totalLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.profit, 0));
  const barsPerYear = period === 'monthly' ? 12 : (period === 'weekly' ? 52 : (period === '5min' ? 19656 : 252));
  const annualReturn =
    modelData.length > 0 && totalReturn > -100
      ? (Math.pow(1 + totalReturn / 100, barsPerYear / modelData.length) - 1) * 100
      : totalReturn <= -100
      ? -100
      : 0;

  const stats: BacktestStats = {
    totalReturn: totalReturn.toFixed(2),
    winRate: trades.length > 0 ? ((winningTrades.length / trades.length) * 100).toFixed(2) : '0.00',
    profitLossRatio: totalLoss > 0 ? (totalWin / totalLoss).toFixed(2) : (totalWin > 0 ? '無虧損交易' : '0.00'),
    maxDrawdown: maxDrawdown.toFixed(2),
    finalFund: cash.toFixed(2),
    tradeCount: trades.length,
    annualReturn: annualReturn.toFixed(2)
  };

  return { stats, logs };
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
