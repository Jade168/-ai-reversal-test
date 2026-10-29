import { ModelBar, SymbolInfo, BacktestStats, BatchScanResult, ApiConfig, NewsItem } from '../types/quant';
import { QUANT_CONFIG } from './quantCalculations';

export interface QuantContext {
  symbolInfo: SymbolInfo | null;
  modelData: ModelBar[];
  stats: BacktestStats | null;
  batchScanResults: BatchScanResult[];
  newsList: NewsItem[];
  sentiment: string;
  globalHotNews: NewsItem[];
}

// ===================== 本地 AI 大腦 (秒級響應，純正粵語) =====================
export function generateLocalAiResponse(input: string, context: QuantContext): string {
  const lowerInput = input.toLowerCase();
  const { symbolInfo, modelData, stats, batchScanResults, sentiment } = context;

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
    reply += `當前信號：${lastBar.buySignal ? '🟢 買入' : lastBar.sellSignal ? '🔴 賣出' : '⚪ 觀望'}\n\n`;
    reply += `你可以隨時問我：\n`;
    reply += `👉 「呢隻股入場位同止損位設喺邊？」\n`;
    reply += `👉 「批量掃描嘅股票邊隻值得買？」\n`;
    reply += `👉 「策略歷史勝率同回撤點樣？」\n`;
    reply += `👉 或者點擊「🌐 專家分析」調用頂級AI作多維度深度推演！`;
    return reply;
  }

  return '你好！我是 1836.15 數律量化 AI 助手。請先在上方輸入股票代碼（例如 TSLA / 00700 / NVDA）並點擊「啟動分析」，我會即時抓取東方財富真實數據，為你提供精準的支撐阻力、時空共振買賣點同回測分析！';
}

// ===================== 專家深度分析 (Claude / Gemini / 自定義 AI) =====================
export async function callExpertAi(input: string, context: QuantContext, apiConfig: ApiConfig): Promise<string> {
  const { symbolInfo, modelData, stats, batchScanResults, newsList, sentiment, globalHotNews } = context;

  // 建立 15 維度數據上下文
  let marketContext = '暫無股票數據，請先執行分析獲取真實市場數據';
  if (symbolInfo && modelData.length > 0 && stats) {
    const lastBar = modelData[modelData.length - 1];
    const allHighs = modelData.map(d => d.h);
    const allLows = modelData.map(d => d.l);
    const absoluteHigh = Math.max(...allHighs);
    const absoluteLow = Math.min(...allLows);
    const currentPrice = lastBar.c;
    const distanceFromHigh = (((absoluteHigh - currentPrice) / absoluteHigh) * 100).toFixed(2);
    const distanceFromLow = (((currentPrice - absoluteLow) / absoluteLow) * 100).toFixed(2);

    const recentData = modelData.slice(-20);
    const avgVolatility = (
      (recentData.reduce((sum, d) => sum + (d.h - d.l) / d.c, 0) / recentData.length) *
      100
    ).toFixed(2);

    const ma5 = modelData.slice(-5).reduce((sum, d) => sum + d.c, 0) / 5;
    const ma20 = modelData.slice(-20).reduce((sum, d) => sum + d.c, 0) / 20;
    const trend = ma5 > ma20 ? '短期向上 ↗' : '短期向下 ↘';

    marketContext = `
【當前分析標的】${symbolInfo.symbol}

【價格位置分析】
最新價格：${symbolInfo.latestPrice}
歷史最高：${absoluteHigh.toFixed(2)} (距離當前 -${distanceFromHigh}%)
歷史最低：${absoluteLow.toFixed(2)} (距離當前 +${distanceFromLow}%)
相對位置：${parseFloat(distanceFromHigh) < 10 ? '高位區域' : parseFloat(distanceFromLow) < 10 ? '低位區域' : '中部震盪'}

【1836.15數律模型關鍵位】
核心線（數律中樞）：${lastBar.coreGravityLine.toFixed(2)}
強支撐位：${symbolInfo.supportLine1.toFixed(2)}
弱支撐位：${symbolInfo.supportLine2.toFixed(2)}
阻力位：${symbolInfo.resistanceLine.toFixed(2)}
價格歸元數：${lastBar.priceGuiYuan} ${[3, 6, 9].includes(lastBar.priceGuiYuan) ? '(共振點✅)' : '(非共振點)'}
當前信號：${lastBar.buySignal ? '🟢 買入信號' : lastBar.sellSignal ? '🔴 賣出信號' : '⚪ 觀望'}

【技術指標】
短期趨勢：${trend}
MA5：${ma5.toFixed(2)}
MA20：${ma20.toFixed(2)}
近20日平均波動率：${avgVolatility}%

【歷史回測數據】
總收益率：${stats.totalReturn}%
年化收益率：${stats.annualReturn}%
歷史勝率：${stats.winRate}%
盈虧比：${stats.profitLossRatio}
最大回撤：${stats.maxDrawdown}%
交易次數：${stats.tradeCount} 次
策略評級：${parseFloat(stats.winRate) >= 60 ? '優秀✅' : parseFloat(stats.winRate) >= 40 ? '合格⚠️' : '謹慎❌'}

【市場情緒與新聞】
新聞情感：${sentiment}
最新財經新聞TOP5：
${newsList.slice(0, 5).map((n, i) => `${i + 1}. [${n.time || ''}] ${n.title}`).join('\n')}

【批量掃描結果】
${batchScanResults.length > 0 ? batchScanResults.map(r => `${r.symbol}: ${r.signal} | 價格$${r.price}`).join('\n') : '未執行批量掃描'}

【全球市場熱點】
${globalHotNews.length > 0 ? globalHotNews.slice(0, 3).map((n, i) => `${i + 1}. ${n.title}`).join('\n') : '未抓取全球熱點'}
    `.trim();
  }

  // 檢查是否配置了用戶自有 API
  if (apiConfig.url && apiConfig.key) {
    if (apiConfig.provider === 'claude') {
      const proxyBody = {
        url: apiConfig.url,
        headers: {
          'x-api-key': apiConfig.key,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: {
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 4096,
          system: QUANT_CONFIG.systemPrompt,
          messages: [{ role: 'user', content: `${input}\n\n【真實市場數據上下文】：\n${marketContext}` }],
          temperature: 0.3
        }
      };

      const resp = await fetch('/api/ai-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proxyBody)
      });
      const data = await resp.json();
      if (!data.content || !data.content[0]?.text) {
        throw new Error(data.error?.message || 'Claude API 返回格式異常');
      }
      return data.content[0].text;
    } else {
      // Gemini 或 OpenAI 格式
      const proxyBody = {
        url: apiConfig.url,
        headers: {
          Authorization: `Bearer ${apiConfig.key}`,
          'Content-Type': 'application/json'
        },
        body: {
          model: apiConfig.provider === 'gemini' ? 'gemini-2.0-flash-exp' : 'gpt-4o',
          messages: [
            { role: 'system', content: QUANT_CONFIG.systemPrompt },
            { role: 'user', content: `${input}\n\n【真實市場數據上下文】：\n${marketContext}` }
          ],
          temperature: 0.3,
          stream: false
        }
      };

      const resp = await fetch('/api/ai-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proxyBody)
      });
      const data = await resp.json();
      if (!data.choices || !data.choices[0]?.message?.content) {
        throw new Error(data.error?.message || 'AI API 返回格式異常');
      }
      return data.choices[0].message.content;
    }
  }

  // 若未配置外部 API，提供內建高階專家分析
  return generateBuiltinExpertAnalysis(symbolInfo, modelData, stats, sentiment);
}

function generateBuiltinExpertAnalysis(
  symbolInfo: SymbolInfo | null,
  modelData: ModelBar[],
  stats: BacktestStats | null,
  sentiment: string
): string {
  if (!symbolInfo || modelData.length === 0 || !stats) {
    return '【專家分析提點】：請先輸入股票代碼並點擊「啟動分析」，或於上方配置專屬 Claude / Gemini API 密鑰以開啟雲端超大模型即時推理。';
  }

  const lastBar = modelData[modelData.length - 1];
  const isBuy = lastBar.buySignal || lastBar.reversalSignal === 'STRONG_BUY';
  const isSell = lastBar.sellSignal || lastBar.reversalSignal === 'CRITICAL_SELL';
  const actionVerdict = isBuy ? '看多 🟢' : isSell ? '看空 🔴' : '觀望 ⚖️';
  const targetPrice = isBuy
    ? (lastBar.c * 1.142857).toFixed(2)
    : (lastBar.c * 0.857143).toFixed(2);
  const stopLoss = (symbolInfo.supportLine1 * 0.98).toFixed(2);

  return `📊 【1836.15 數律專家深度解讀】

1. 核心結論：
   - 走勢判斷：【${actionVerdict}】
   - 目標價位：預計1至3個月內測試 $${targetPrice} 水平。

2. 技術面深度剖析：
   - 現價 $${symbolInfo.latestPrice}，1836.15數律中樞核心線位於 $${lastBar.coreGravityLine.toFixed(2)}。
   - 動態強支撐位築於 $${symbolInfo.supportLine1.toFixed(2)}，阻力位在 $${symbolInfo.resistanceLine.toFixed(2)}。
   - 價格歸元數為【${lastBar.priceGuiYuan}】，${[3, 6, 9].includes(lastBar.priceGuiYuan) ? '正處於時空共振窗，信號動能顯著增強' : '未達極值共振點，屬於常規震盪整理'}。

3. 基本面與情緒評估：
   - 當前市場整體情緒評定為【${sentiment}】，資金在關鍵技術防守位表現出較強韌性。

4. 歷史回測參考：
   - 歷史勝率 ${stats.winRate}%，盈虧比 ${stats.profitLossRatio}，最大回撤 ${stats.maxDrawdown}%。
   - 策略評級：${parseFloat(stats.winRate) >= 50 ? '合格可信，具備正期望值收益' : '勝率偏低，切勿追漲殺跌'}。

5. 具體操作建議（嚴格量化）：
   - 入場位：可在 $${symbolInfo.supportLine1.toFixed(2)} 至 $${symbolInfo.latestPrice} 分批逢低低吸。
   - 止盈位：第一目標 $${symbolInfo.resistanceLine.toFixed(2)} 減持一半，第二目標 $${targetPrice} 全部落袋。
   - 硬止損位：嚴格設在 $${stopLoss}（跌穿強支撐2%堅決離場，切忌心存僥倖）。
   - 倉位指引：建議維持3成倉位試水，總倉位切勿超過5成。

6. 風險警示：
   - 留意宏觀利率及突發消息衝擊，風險等級評估為【中等】。如需進一步自定義參數，可隨時於頂部輸入配置。`;
}
