import { ModelBar, SymbolInfo, BacktestStats, BatchScanResult, NewsItem, RawKline } from '../types/quant';
import { MultiTimeframeTFDR, TFDRPoint } from './tfdrIndicator';
import { generatePuzzleExpertReport, DisplayQuote } from './localQuantAnalyst';

export interface QuantContext {
  symbolInfo: SymbolInfo | null;
  modelData: ModelBar[];
  dailyKlines?: RawKline[];
  stats: BacktestStats | null;
  batchScanResults: BatchScanResult[];
  newsList: NewsItem[];
  sentiment: string;
  globalHotNews: NewsItem[];
  tfdr?: MultiTimeframeTFDR | null;
  latestTfdrPoint?: TFDRPoint | null;
  /** 【即日價・顯示專用】合資格即日棒（App 已閘好：日線＋非回放＋新過烘焙棒）；淨係用嚟顯示零流量診斷報告 header 現價＋最新一日 OHLC */
  displayLiveBar?: RawKline | null;
}

export function generateZeroTokenDiagnosis(context: QuantContext): string | null {
  const { symbolInfo, modelData, dailyKlines } = context;
  if (!symbolInfo) return null;

  const sourceKlines: RawKline[] =
    dailyKlines && dailyKlines.length > 0 ? dailyKlines : modelData;
  if (!sourceKlines || sourceKlines.length === 0) return null;

  const dailyData = sourceKlines.map(bar => ({
    date: (bar.date || '').split(' ')[0],
    open: Number(bar.o),
    high: Number(bar.h),
    low: Number(bar.l),
    close: Number(bar.c)
  }));

  // 【即日價・顯示專用】即日棒日期新過烘焙最後一棒＋OHLC 合理先用嚟顯示報告 header／最新一日；
  // 唔合資格就當無，報告行烘焙價。dailyData 本身唔加即日棒（引擎／指令／水平繼續食烘焙版）。
  const live = context.displayLiveBar;
  const liveDate = (live?.date || '').slice(0, 10);
  const bakedDate = (sourceKlines[sourceKlines.length - 1]?.date || '').slice(0, 10);
  const displayQuote: DisplayQuote | undefined =
    live && liveDate && bakedDate && liveDate > bakedDate &&
    [live.o, live.h, live.l, live.c].every(v => Number.isFinite(v) && (v as number) > 0)
      ? { date: liveDate, o: live.o, h: live.h, l: live.l, c: live.c }
      : undefined;

  return generatePuzzleExpertReport(symbolInfo.symbol, dailyData, displayQuote) || null;
}

// ===================== 本地 AI 大腦 (秒級響應，純正粵語) =====================
export function generateLocalAiResponse(input: string, context: QuantContext): string {
  const lowerInput = input.toLowerCase();
  const { symbolInfo, modelData, stats, batchScanResults, sentiment, tfdr } = context;

  if (
    lowerInput.includes('診斷') ||
    lowerInput.includes('零流量') ||
    lowerInput.includes('考夫曼') ||
    lowerInput.includes('ker') ||
    lowerInput.includes('通道') ||
    lowerInput.includes('生命線') ||
    lowerInput.includes('本地報告')
  ) {
    const localReport = generateZeroTokenDiagnosis(context);
    if (!localReport) {
      return '你仲未分析股票或者未計算出 TFDR 三維數據㗎！請先喺上方輸入股票代碼並點擊「啟動分析」。';
    }
    return localReport;
  }

  if (
    lowerInput.includes('tfdr') ||
    lowerInput.includes('奇點') ||
    lowerInput.includes('減速') ||
    lowerInput.includes('共振矩陣') ||
    lowerInput.includes('分數')
  ) {
    const localReport = generateZeroTokenDiagnosis(context);
    if (!symbolInfo || !tfdr) {
      return '你仲未分析股票或者未計算出 TFDR 三維數據㗎！請先喺上方輸入股票代碼並點擊「啟動分析」。';
    }
    return localReport || `【${symbolInfo.symbol} TFDR 時空奇點共振矩陣（粵語解讀）】
📊 三維週期分數（>80 危險頂 / <30 黃金底）：
• 日線 TFDR：${tfdr.dailyScore} 分
• 週線 TFDR：${tfdr.weeklyScore} 分
• 月線 TFDR：${tfdr.monthlyScore} 分

🧭 當前奇點判定：${tfdr.regimeTitle}
💡 實戰操作建議：${tfdr.actionAdvice}`;
  }

  if (
    lowerInput.includes('批量') ||
    lowerInput.includes('幾隻') ||
    lowerInput.includes('邊隻') ||
    lowerInput.includes('布局') ||
    lowerInput.includes('優先') ||
    lowerInput.includes('買入信號')
  ) {
    if (!batchScanResults || batchScanResults.length === 0) {
      return '你仲未執行批量掃描㗎！請先喺下方輸入股票代碼（例如：TSLA,00700,NVDA,AAPL），點擊「批量掃描信號」，我先可以同你詳細分析邊隻值得布局。';
    }

    const buyList = batchScanResults.filter(item => item.signal.includes('買入') || item.signal.includes('BUY'));
    const watchList = batchScanResults.filter(item => item.signal.includes('觀望') || item.signal.includes('HOLD'));
    const sellList = batchScanResults.filter(item => item.signal.includes('賣出') || item.signal.includes('SELL'));

    let reply = `📊 今次批量掃描咗 ${batchScanResults.length} 隻股票，結果如下：\n`;

    if (buyList.length > 0) {
      reply += `\n✅ 發出買入信號嘅標的：\n`;
      buyList.forEach(item => {
        reply += `【${item.symbol}】價格：$${item.price} | 強支撐：$${item.support} | 阻力：$${item.resistance}\n`;
      });
      reply += `\n👉 優先布局建議：優先睇支撐最堅實、上升空間最大嘅 ${buyList[0].symbol}，入場位設喺強支撐上方，止損放支撐下方2%，倉位建議3-5成。`;
    } else {
      reply += `\n⚠️ 今次掃描嘅標的暫時無明確買入信號，市場多空博弈激烈，建議繼續保持觀望。`;
    }

    if (sellList.length > 0) {
      reply += `\n\n📉 發出賣出信號嘅標的：\n`;
      sellList.forEach(item => {
        reply += `【${item.symbol}】價格：$${item.price} | 阻力：$${item.resistance}\n`;
      });
      reply += `👉 建議：持有呢幾隻標的嘅話，可以逢高分批減倉止盈，未入場就千祈唔好追高。`;
    }

    if (watchList.length > 0) {
      reply += `\n\n👀 觀望清單（震盪區間，無明確突破）：\n`;
      watchList.forEach(item => {
        reply += `${item.symbol} | 價格$${item.price} | 支撐$${item.support}\n`;
      });
      reply += `👉 建議：呢幾隻可以加入自選觀察名單，等跌穿支撐確認企穩或者帶量升破阻力再決定操作。`;
    }

    return reply;
  }

  if (
    lowerInput.includes('買') ||
    lowerInput.includes('賣') ||
    lowerInput.includes('入場') ||
    lowerInput.includes('止盈') ||
    lowerInput.includes('止損') ||
    lowerInput.includes('持有')
  ) {
    if (!symbolInfo || modelData.length === 0) {
      return '你仲未分析單一股票㗎！請先輸入股票代碼並點擊「啟動分析」，我先可以為你量化計出具體入場位同止損位。';
    }

    const lastBar = modelData[modelData.length - 1];
    const isBuySignal = lastBar.buySignal || lastBar.reversalSignal === 'STRONG_BUY';
    const isSellSignal = lastBar.sellSignal || lastBar.reversalSignal === 'CRITICAL_SELL';
    const currency = symbolInfo.symbol.match(/^\d+$/) ? '港元' : '美元';

    let reply = `【${symbolInfo.symbol} 實戰操作建議】\n`;
    reply += `當前價格：${symbolInfo.latestPrice} ${currency}\n`;
    reply += `強支撐位：${symbolInfo.supportLine1.toFixed(2)} ${currency}\n`;
    reply += `阻力位：${symbolInfo.resistanceLine.toFixed(2)} ${currency}\n\n`;

    if (isBuySignal) {
      reply += `📈 當前發出數律模型買入信號，建議：\n`;
      reply += `✅ 入場位：$${symbolInfo.supportLine1.toFixed(2)} - $${symbolInfo.latestPrice} 區間分批吸納\n`;
      reply += `✅ 止盈位：第一目標 $${symbolInfo.resistanceLine.toFixed(2)} 附近減半，第二目標博新高\n`;
      reply += `✅ 止損位：$${(symbolInfo.supportLine1 * 0.98).toFixed(2)} ${currency}（強支撐下方2%），跌穿堅決止損\n`;
      reply += `✅ 倉位建議：建議3-5成倉，切忌滿倉單吊`;
    } else if (isSellSignal) {
      reply += `📉 當前發出數律模型賣出信號，建議：\n`;
      reply += `✅ 持有倉位：建議趁衝高分批減倉，鎖定利潤，防範回調風險\n`;
      reply += `✅ 未入場：暫時唔好盲目抄底，耐心等回調到強支撐位附近觀察信號\n`;
      reply += `✅ 風險提示：下方第一支撐在 $${symbolInfo.supportLine1.toFixed(2)} ${currency}，跌穿會有進一步下行風險`;
    } else {
      reply += `⚖️ 當前處於震盪中樞區間，無明確買賣信號，建議：\n`;
      reply += `✅ 持有倉位：繼續耐心持有，止盈設喺阻力位 $${symbolInfo.resistanceLine.toFixed(2)}，止損守強支撐\n`;
      reply += `✅ 未入場：等待明確共振信號，跌穿支撐唔好接飛刀，突破阻力再輕倉追入\n`;
      reply += `✅ 操作策略：區間高拋低吸，嚴格控制總倉位唔好超過5成`;
    }

    if (tfdr) {
      reply += `\n\n⚡ 【TFDR 三維奇點參考】日線 ${tfdr.dailyScore} / 週線 ${tfdr.weeklyScore} / 月線 ${tfdr.monthlyScore}\n狀態：${tfdr.regimeTitle}\n建議：${tfdr.actionAdvice}`;
    }

    reply += `\n\n⚠️ 風險提示：以上建議基於1836.15數律量化模型計算，市場有風險，入市需謹慎。`;
    return reply;
  }

  if (
    lowerInput.includes('支撐') ||
    lowerInput.includes('阻力') ||
    lowerInput.includes('核心線') ||
    lowerInput.includes('價格') ||
    lowerInput.includes('走勢') ||
    lowerInput.includes('高低點')
  ) {
    if (!symbolInfo || modelData.length === 0) {
      return '你仲未分析單一股票㗎！請先輸入股票代碼並點擊「啟動分析」，我先可以為你列出關鍵支撐阻力同歷史走勢。';
    }

    const lastBar = modelData[modelData.length - 1];
    const startPrice = modelData[0].c;
    const endPrice = lastBar.c;
    const trend = endPrice > startPrice * 1.03 ? '上升趨勢 ↗️' : endPrice < startPrice * 0.97 ? '下跌趨勢 ↘️' : '橫盤震盪 ➡️';
    const currency = symbolInfo.symbol.match(/^\d+$/) ? '港元' : '美元';
    const periodHigh = Math.max(...modelData.map(d => d.h));
    const periodLow = Math.min(...modelData.map(d => d.l));

    let reply = `【${symbolInfo.symbol} 行情與關鍵位解讀】\n`;
    reply += `📅 最新日期：${lastBar.date.split(' ')[0]}\n`;
    reply += `💵 最新收盤價：${symbolInfo.latestPrice} ${currency}\n`;
    reply += `📊 區間走勢：${trend}\n`;
    reply += `📈 區間最高點：$${periodHigh.toFixed(2)} ${currency}\n`;
    reply += `📉 區間最低點：$${periodLow.toFixed(2)} ${currency}\n\n`;
    reply += `📍 數律模型核心關鍵位：\n`;
    reply += `🟣 核心線（1836.15中樞）：$${lastBar.coreGravityLine.toFixed(2)} ${currency}（價格在線上偏強，線下偏弱）\n`;
    reply += `🟢 強支撐位：$${symbolInfo.supportLine1.toFixed(2)} ${currency}（關鍵防守底線）\n`;
    reply += `🟡 弱支撐位：$${symbolInfo.supportLine2.toFixed(2)} ${currency}\n`;
    reply += `🔴 動態阻力位：$${symbolInfo.resistanceLine.toFixed(2)} ${currency}（升破先有新一輪爆發空間）\n\n`;
    if (tfdr) {
      reply += `⚡ TFDR 三維奇點矩陣：日 ${tfdr.dailyScore} | 週 ${tfdr.weeklyScore} | 月 ${tfdr.monthlyScore}（${tfdr.regimeTitle}）\n`;
      reply += `📌 TFDR 策略：${tfdr.actionAdvice}\n\n`;
    }
    reply += `💡 操作心法：貼近強支撐分批低吸，逼近阻力位分批落袋，順勢而行。`;

    return reply;
  }

  if (
    lowerInput.includes('勝率') ||
    lowerInput.includes('回測') ||
    lowerInput.includes('盈虧比') ||
    lowerInput.includes('回撤') ||
    lowerInput.includes('交易次數')
  ) {
    if (!stats || !symbolInfo) {
      return '你仲未執行分析㗎！請先輸入股票代碼並點擊「啟動分析」，我先可以為你提供詳細回測數據。';
    }

    let reply = `【${symbolInfo.symbol} 數律模型歷史回測表現】\n`;
    reply += `📈 收益表現：\n`;
    reply += `總收益率：${stats.totalReturn}%\n`;
    reply += `年化收益率：${stats.annualReturn}%\n`;
    reply += `⚠️ 最大回撤：${stats.maxDrawdown}%\n\n`;
    reply += `🎯 策略健康度：\n`;
    reply += `歷史交易次數：${stats.tradeCount} 次\n`;
    reply += `歷史勝率：${stats.winRate}%\n`;
    reply += `盈虧比：${stats.profitLossRatio}\n\n`;

    const winRateNum = parseFloat(stats.winRate);
    const plrNum = parseFloat(stats.profitLossRatio);

    if (winRateNum >= 60 && plrNum >= 1.5) {
      reply += `💡 策略評級：優秀 (A級) ✅ 勝率與盈虧比俱佳，符合成熟量化交易系統標準，配合紀律執行勝算高。`;
    } else if (winRateNum >= 40) {
      reply += `💡 策略評級：合格 (B級) ⚠️ 有一定盈利能力，但必須配合嚴格止損與資金管理，避免回撤擴大。`;
    } else {
      reply += `💡 策略評級：謹慎 (C級) ❌ 歷史勝率偏低，建議以觀望為主，勿過度依賴單一信號操作。`;
    }

    reply += `\n\n⚠️ 溫馨提示：歷史回測不保證未來表現，請做好風險把控。`;
    return reply;
  }

  // 默認綜合分析
  if (symbolInfo && modelData.length > 0) {
    const lastBar = modelData[modelData.length - 1];
    let reply = `【${symbolInfo.symbol} 本地智能速覽】\n`;
    reply += `現價：$${symbolInfo.latestPrice}\n`;
    reply += `核心線：$${lastBar.coreGravityLine.toFixed(2)}\n`;
    reply += `強支撐：$${symbolInfo.supportLine1.toFixed(2)}\n`;
    reply += `阻力位：$${symbolInfo.resistanceLine.toFixed(2)}\n`;
    reply += `新聞情緒：${sentiment}\n`;
    reply += `當前信號：${lastBar.buySignal ? '🟢 買入' : lastBar.sellSignal ? '🔴 賣出' : '⚪ 觀望'}\n`;
    if (tfdr) {
      reply += `\n⚡ TFDR 時空奇點（日/週/月）：${tfdr.dailyScore} / ${tfdr.weeklyScore} / ${tfdr.monthlyScore}\n`;
      reply += `判定：${tfdr.regimeTitle}\n`;
      reply += `建議：${tfdr.actionAdvice}\n`;
    }
    reply += `\n你可以隨時問我：\n`;
    reply += `👉 「呢隻股入場位同止損位設喺邊？」\n`;
    reply += `👉 「批量掃描嘅股票邊隻值得買？」\n`;
    reply += `👉 「策略歷史勝率同回撤點樣？」\n`;
    reply += `👉 或者點擊「⚡ 零流量診斷」即刻生成本地專家完整操盤報告！`;
    return reply;
  }

  return '你好！我是 1836.15 數律量化 AI 助手。請先在上方輸入股票代碼（例如 TSLA / 00700 / NVDA）並點擊「啟動分析」，我會即時抓取東方財富真實數據，為你提供精準的支撐阻力、時空共振買賣點同回測分析！';
}
