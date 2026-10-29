import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  RawKline,
  ModelBar,
  SymbolInfo,
  BacktestStats,
  ResonanceAnalysis,
  ChatMessage,
  ApiConfig,
  BatchScanResult,
  NewsItem,
  TradeLog,
  FourierState
} from './types/quant';
import {
  QUANT_CONFIG,
  calculateModel,
  calculate369And142857,
  calculateCosmicReversalSignal,
  runBacktestEngine,
  calculateFourierZAxis
} from './services/quantCalculations';
import {
  fetchMarketData,
  fetchSymbolNews,
  analyzeNewsSentiment,
  fetchGlobalHotNews,
  analyzeNewsImpact
} from './services/marketData';
import { generateLocalAiResponse, callExpertAi, QuantContext } from './services/aiChat';

import { HeaderChart } from './components/HeaderChart';
import { ApiConfigCard } from './components/ApiConfigCard';
import { AiChatColumn } from './components/AiChatColumn';
import { QuantControlPanel } from './components/QuantControlPanel';
import { SignalAndStatsArea } from './components/SignalAndStatsArea';
import { FourierPanel } from './components/FourierPanel';
import { HotNewsAndTickers } from './components/HotNewsAndTickers';

export const App: React.FC = () => {
  // Input parameters
  const [symbol, setSymbol] = useState('TSLA');
  const [period, setPeriod] = useState('daily');
  const [assetType, setAssetType] = useState('stock');
  const [fund, setFund] = useState(100000);
  const [buyPrice, setBuyPrice] = useState('');
  const [coreInt, setCoreInt] = useState(1836.15);
  const [coreDec, setCoreDec] = useState(0.08);
  const [dataSource, setDataSource] = useState('eastmoney');

  // Market & Quant Data
  const [rawData, setRawData] = useState<RawKline[]>([]);
  const [modelData, setModelData] = useState<ModelBar[]>([]);
  const [symbolInfo, setSymbolInfo] = useState<SymbolInfo | null>(null);
  const [stats, setStats] = useState<BacktestStats | null>(null);
  const [resonance, setResonance] = useState<ResonanceAnalysis | null>(null);
  const [tradeLogs, setTradeLogs] = useState<TradeLog[]>([]);
  const [sentiment, setSentiment] = useState('中性');
  const [newsList, setNewsList] = useState<NewsItem[]>([]);
  const [fourier, setFourier] = useState<FourierState>({
    spectrum: [],
    prob: { up: 33, down: 33, flat: 34 },
    ribbon: { color: 'gray', trend: 'flat', strength: 0 },
    techInfo: { score: 0, detail: '' },
    forecastLine: []
  });

  // UI Status
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('⚡ 系統就緒，請輸入代碼啟動分析');
  const [aiModelReady, setAiModelReady] = useState(false);
  const [isSendingExpert, setIsSendingExpert] = useState(false);
  const [isScanningBatch, setIsScanningBatch] = useState(false);
  const [isFetchingNews, setIsFetchingNews] = useState(false);
  const [globalHotNews, setGlobalHotNews] = useState<NewsItem[]>([]);
  const [batchScanResults, setBatchScanResults] = useState<BatchScanResult[]>([]);

  // Replay State
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const replayIntervalRef = useRef<any>(null);

  // API Config
  const [apiConfig, setApiConfig] = useState<ApiConfig>({
    provider: 'claude',
    url: '',
    key: ''
  });

  // Chat Messages
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      role: 'system',
      text: '🚀 終極系統已加載 | 雙核驅動：\n🔘 AI對話（本地大腦，秒回應）\n🔘 專家對話（自建Gemini / Claude AI，深度分析）\n✅ 已接入東方財富真實即日/歷史數據接口',
      timestamp: Date.now()
    }
  ]);

  const addChatMessage = useCallback((role: ChatMessage['role'], text: string) => {
    setChatMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        role,
        text,
        timestamp: Date.now()
      }
    ]);
  }, []);

  // Load API config from localStorage on mount and auto-load 2-3 years historical analysis
  useEffect(() => {
    const savedProvider = (localStorage.getItem('ai_provider') as any) || 'claude';
    const savedUrl = localStorage.getItem('gcli2api_url') || '';
    const savedKey = localStorage.getItem('gcli2api_key') || '';
    if (savedUrl) {
      setApiConfig({ provider: savedProvider, url: savedUrl, key: savedKey });
    }
    // Fetch initial global news
    handleFetchGlobalNews();
    // Auto load multi-year data depth for TSLA
    runQuantAnalysis('TSLA');
  }, []);

  const handleSaveApiConfig = (cfg: ApiConfig) => {
    localStorage.setItem('ai_provider', cfg.provider);
    localStorage.setItem('gcli2api_url', cfg.url);
    localStorage.setItem('gcli2api_key', cfg.key);
    setApiConfig(cfg);
    addChatMessage('system', `✅ ${cfg.provider.toUpperCase()} API 配置已保存，可使用專家深度推演`);
  };

  const handleInitAi = () => {
    addChatMessage('system', '正在連接數律 AI 大腦神經網絡...');
    setTimeout(() => {
      setAiModelReady(true);
      addChatMessage('system', '✅ AI大腦已初始化！現在可以進行對話或輸入股票代碼分析。');
    }, 600);
  };

  // Run Quant Analysis
  const runQuantAnalysis = async (targetSymbol?: string) => {
    const sym = (targetSymbol || symbol).trim().toUpperCase();
    if (!sym) {
      addChatMessage('error', '請輸入代碼！');
      return;
    }

    if (isReplaying) {
      clearInterval(replayIntervalRef.current);
      setIsReplaying(false);
    }

    setIsLoading(true);
    setLoadingMessage(`🔄 正在從東方財富抓取 ${sym} 真實行情數據...`);
    addChatMessage('system', `📊 開始量化掃描 ${sym}...`);

    try {
      const klines = await fetchMarketData(sym, assetType, period, dataSource);
      if (klines.length === 0) {
        addChatMessage('error', `❌ 抓取 ${sym} 失敗，請檢查代碼或更換數據源`);
        setIsLoading(false);
        return;
      }
      setRawData(klines);

      setLoadingMessage(`📰 抓取相關財經新聞並分析情緒...`);
      const news = await fetchSymbolNews(sym, assetType);
      setNewsList(news);
      const newsSent = await analyzeNewsSentiment(news, sym);
      setSentiment(newsSent);

      setLoadingMessage(`🧮 計算 1836.15 數律中樞與時空共振...`);
      let computedModel = calculateModel(klines, coreInt, newsSent);

      // Cosmic Reversal signals calculation
      const cosmicSignals = calculateCosmicReversalSignal(klines, period, sym, assetType);
      computedModel = computedModel.map((bar, idx) => {
        const cSig = cosmicSignals[idx] || { signal: 'HOLD' };
        return {
          ...bar,
          reversalSignal: cSig.signal,
          reversalSupport: cSig.support,
          reversalResistance: cSig.resistance,
          reversalAnchor: cSig.anchor,
          buySignal: cSig.signal === 'STRONG_BUY' || bar.buySignal,
          sellSignal: cSig.signal === 'CRITICAL_SELL' || bar.sellSignal
        };
      });

      setModelData(computedModel);

      // Backtest Engine
      const { stats: bStats, logs } = runBacktestEngine(computedModel, fund, period);
      setStats(bStats);
      setTradeLogs(logs);

      // Last bar info
      const lastBar = computedModel[computedModel.length - 1];
      const symInfo: SymbolInfo = {
        symbol: sym,
        latestPrice: lastBar.c.toFixed(2),
        coreGravityLine: lastBar.coreGravityLine,
        supportLine1: lastBar.supportLine1,
        supportLine2: lastBar.supportLine2,
        resistanceLine: lastBar.resistanceLine
      };
      setSymbolInfo(symInfo);

      // 369 + 142857 Resonance
      const parsedBuy = buyPrice ? parseFloat(buyPrice) : null;
      const resAnalysis = calculate369And142857(lastBar.c, parsedBuy);
      setResonance(resAnalysis);

      // Fourier Z-Axis
      const closePrices = klines.map((k) => k.c);
      const zAxisResult = calculateFourierZAxis(closePrices);
      setFourier(zAxisResult);

      addChatMessage(
        'ai',
        `📊 【${sym} 369+142857 複合共振分析速覽】\n\n【現價位置】現價: $${lastBar.c.toFixed(2)} | 歸元數: ${resAnalysis.guiYuan.current}\n\n【142857 循環位】\n🟢 溝貨區: $${resAnalysis.suggestions.strongBuy} - $${resAnalysis.suggestions.buyZone}\n🔴 賣出區: $${resAnalysis.suggestions.sellZone} - $${resAnalysis.suggestions.target2}\n\n【信號判斷】${resAnalysis.signal} - ${resAnalysis.action}\n\n【回測數據】總收益率: ${bStats.totalReturn}% | 勝率: ${bStats.winRate}%`
      );
    } catch (err: any) {
      console.error(err);
      addChatMessage('error', `❌ 量化分析出錯: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Replay feature
  const handleStartReplay = () => {
    if (modelData.length === 0) {
      addChatMessage('system', '請先執行「啟動分析」，獲取行情數據後再進行回放。');
      return;
    }
    if (isReplaying) return;

    setIsReplaying(true);
    const startIdx = Math.min(30, Math.floor(modelData.length * 0.3));
    setReplayIndex(startIdx);

    const allHighs = modelData.map((d) => d.h);
    const allLows = modelData.map((d) => d.l);
    addChatMessage(
      'system',
      `▶️ 開始歷史回放回測！歷史區間：最高 $${Math.max(...allHighs).toFixed(2)} | 最低 $${Math.min(...allLows).toFixed(2)}`
    );

    let cur = startIdx;
    replayIntervalRef.current = setInterval(() => {
      cur += 2;
      if (cur >= modelData.length) {
        clearInterval(replayIntervalRef.current);
        setIsReplaying(false);
        setReplayIndex(modelData.length - 1);
        addChatMessage('system', '✅ 歷史回放結束！所有高低位與信號已完整呈現。');
        return;
      }
      setReplayIndex(cur);

      const bar = modelData[cur];
      if (bar.buySignal || bar.reversalSignal === 'STRONG_BUY') {
        addChatMessage(
          'ai',
          `🟢 [${bar.date}] 買入信號觸發！\n價格: $${bar.c.toFixed(2)} | 強支撐: $${bar.supportLine1.toFixed(2)} | 歸元: ${bar.priceGuiYuan}`
        );
      } else if (bar.sellSignal || bar.reversalSignal === 'CRITICAL_SELL') {
        addChatMessage(
          'ai',
          `🔴 [${bar.date}] 賣出信號觸發！\n價格: $${bar.c.toFixed(2)} | 動態阻力: $${bar.resistanceLine.toFixed(2)} | 歸元: ${bar.priceGuiYuan}`
        );
      }
    }, 180);
  };

  // Batch Scan
  const handleRunBatchScan = async (symbolsInput: string) => {
    const list = symbolsInput
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0);
    if (list.length === 0) {
      addChatMessage('error', '請輸入至少一個股票代碼（用逗號分隔）');
      return;
    }

    setIsScanningBatch(true);
    addChatMessage('system', `🚀 開始批量掃描，共 ${list.length} 隻標的...`);

    const results: BatchScanResult[] = [];
    for (const sym of list) {
      try {
        const klines = await fetchMarketData(sym, 'stock', 'daily', dataSource);
        if (klines.length === 0) continue;
        const computed = calculateModel(klines, coreInt);
        const last = computed[computed.length - 1];
        const cosmicSignals = calculateCosmicReversalSignal(klines, 'daily', sym, 'stock');
        const lastCosmic = cosmicSignals[cosmicSignals.length - 1] || { signal: 'HOLD' };

        let signalText = '🟡 STATUS: HOLD';
        if (lastCosmic.signal === 'STRONG_BUY' || last.buySignal) signalText = '🟢 STRONG BUY';
        else if (lastCosmic.signal === 'CRITICAL_SELL' || last.sellSignal) signalText = '🔴 CRITICAL SELL';

        results.push({
          symbol: sym,
          price: last.c.toFixed(2),
          signal: signalText,
          support: last.supportLine1.toFixed(2),
          resistance: last.resistanceLine.toFixed(2)
        });
      } catch (e) {
        console.warn(`Scan ${sym} error:`, e);
      }
    }

    setBatchScanResults(results);
    setIsScanningBatch(false);

    let resultMsg = `✅ 批量掃描完成，結果如下：\n`;
    results.forEach((r) => {
      resultMsg += `【${r.symbol}】價格: $${r.price} | ${r.signal} | 強支撐: $${r.support} | 阻力: $${r.resistance}\n`;
    });
    resultMsg += `\n💡 提示：你可以直接問我「邊隻值得買？」或「優先布局邊隻？」，我會即刻同你對比分析！`;
    addChatMessage('ai', resultMsg);
  };

  // Export Backtest Report
  const handleExportReport = () => {
    if (modelData.length === 0 || !symbolInfo || !stats) {
      addChatMessage('error', '請先執行「啟動分析」以生成回測數據！');
      return;
    }

    const lastBar = modelData[modelData.length - 1];
    const report = `📊 ${symbolInfo.symbol} 數律量化終極回測報告
=================================
📈 收益表現
總收益率：${stats.totalReturn}%
年化收益率：${stats.annualReturn}%
最大回撤：${stats.maxDrawdown}%
最終資金：$${stats.finalFund}
=================================
🎯 策略表現
交易次數：${stats.tradeCount} 次
勝率：${stats.winRate}%
盈虧比：${stats.profitLossRatio}
=================================
💡 當前位置
最新價格：$${symbolInfo.latestPrice}
1836.15核心線：$${lastBar.coreGravityLine.toFixed(2)}
強支撐：$${symbolInfo.supportLine1.toFixed(2)}
阻力位：$${symbolInfo.resistanceLine.toFixed(2)}
當前信號：${lastBar.buySignal ? '買入' : lastBar.sellSignal ? '賣出' : '觀望'}
=================================
⚠️ 風險提示：歷史回測不代表未來收益，投資有風險，入市需謹慎。`;

    addChatMessage('ai', report);
  };

  // Local AI Chat
  const handleSendLocal = (text: string) => {
    if (!aiModelReady) {
      addChatMessage('error', '請先點擊上方「初始化AI」連接大腦！');
      return;
    }
    addChatMessage('user', text);

    const context: QuantContext = {
      symbolInfo,
      modelData,
      stats,
      batchScanResults,
      newsList,
      sentiment,
      globalHotNews
    };

    setTimeout(() => {
      const reply = generateLocalAiResponse(text, context);
      addChatMessage('ai', reply);
    }, 250);
  };

  // Expert AI Chat
  const handleSendExpert = async (text: string) => {
    if (!aiModelReady) {
      addChatMessage('error', '請先點擊上方「初始化AI」連接大腦！');
      return;
    }
    addChatMessage('user', text);
    setIsSendingExpert(true);

    const context: QuantContext = {
      symbolInfo,
      modelData,
      stats,
      batchScanResults,
      newsList,
      sentiment,
      globalHotNews
    };

    try {
      const reply = await callExpertAi(text, context, apiConfig);
      addChatMessage('expert', reply);
    } catch (err: any) {
      addChatMessage('error', `❌ 專家分析調用失敗: ${err.message}`);
    } finally {
      setIsSendingExpert(false);
    }
  };

  // Global News
  const handleFetchGlobalNews = async () => {
    setIsFetchingNews(true);
    try {
      const news = await fetchGlobalHotNews();
      setGlobalHotNews(news);
      if (news.length > 0) {
        addChatMessage('system', `✅ 已成功抓取 ${news.length} 條全球財經熱點新聞`);
      }
    } catch (e) {
      console.warn('Fetch global news error:', e);
    } finally {
      setIsFetchingNews(false);
    }
  };

  const handleAnalyzeNews = async (news: NewsItem) => {
    addChatMessage('system', `📰 正在深度分析新聞影響：${news.title}`);
    try {
      const impact = await analyzeNewsImpact(news, apiConfig);
      addChatMessage('ai', `📰 新聞市場影響解讀：\n${news.title}\n\n${impact}`);
    } catch (e) {
      addChatMessage('error', '❌ 新聞分析出錯');
    }
  };

  const handleQuickLook = (ticker: string) => {
    setSymbol(ticker);
    runQuantAnalysis(ticker);
  };

  return (
    <div className="min-h-screen bg-black text-white p-1 md:p-2 max-w-[1920px] mx-auto select-none">
      {/* 1. Header Interactive Candlestick Chart */}
      <HeaderChart
        data={modelData}
        isLoading={isLoading}
        loadingMessage={loadingMessage}
        isReplay={isReplaying}
        replayIndex={replayIndex}
        hologramLine={fourier.forecastLine}
        timeframe={period}
        supportLevels={resonance?.r142857 ? [resonance.r142857.strongSupport, resonance.r142857.midSupport] : []}
        resistanceLevels={resonance?.r142857 ? [resonance.r142857.strongResist, resonance.r142857.midResist] : []}
      />

      {/* 2. API Config & Data Switcher Card */}
      <ApiConfigCard
        config={apiConfig}
        onSaveConfig={handleSaveApiConfig}
        dataSource={dataSource}
        onSwitchDataSource={setDataSource}
      />

      {/* 3. Main Split Container (AI Column 40%, Data Column 60%) */}
      <div className="flex flex-col md:flex-row gap-1.5 w-full">
        {/* Left: AI Column (40% desktop) */}
        <div className="w-full md:w-[40%] flex-shrink-0 flex flex-col order-2 md:order-1">
          <AiChatColumn
            messages={chatMessages}
            aiReady={aiModelReady}
            onInitAi={handleInitAi}
            onSendLocal={handleSendLocal}
            onSendExpert={handleSendExpert}
            isSendingExpert={isSendingExpert}
          />
        </div>

        {/* Right: Quant Data Column (60% desktop) */}
        <div className="w-full md:w-[60%] flex flex-col order-1 md:order-2 space-y-1">
          {/* Controls */}
          <QuantControlPanel
            symbol={symbol}
            setSymbol={setSymbol}
            period={period}
            setPeriod={setPeriod}
            assetType={assetType}
            setAssetType={setAssetType}
            fund={fund}
            setFund={setFund}
            buyPrice={buyPrice}
            setBuyPrice={setBuyPrice}
            coreInt={coreInt}
            setCoreInt={setCoreInt}
            coreDec={coreDec}
            setCoreDec={setCoreDec}
            onRunAnalysis={() => runQuantAnalysis()}
            onStartReplay={handleStartReplay}
            isReplaying={isReplaying}
            onRunBatchScan={handleRunBatchScan}
            onExportReport={handleExportReport}
            isScanningBatch={isScanningBatch}
          />

          {/* Signals and Statistics */}
          <SignalAndStatsArea
            lastBar={modelData.length > 0 ? modelData[modelData.length - 1] : null}
            symbolInfo={symbolInfo}
            stats={stats}
            resonance={resonance}
            sentiment={sentiment}
            userBuyPrice={buyPrice}
          />

          {/* Fourier Z-Axis Component */}
          {modelData.length > 0 && (
            <FourierPanel
              symbol={symbol}
              fourier={fourier}
              onRefresh={() => {
                const closePrices = rawData.map((k) => k.c);
                setFourier(calculateFourierZAxis(closePrices));
              }}
            />
          )}

          {/* Hot News, Watchlists & Trade Logs */}
          <HotNewsAndTickers
            newsList={globalHotNews}
            isFetchingNews={isFetchingNews}
            onRefreshNews={handleFetchGlobalNews}
            onAnalyzeNews={handleAnalyzeNews}
            onQuickLook={handleQuickLook}
            tradeLogs={tradeLogs}
          />
        </div>
      </div>
    </div>
  );
};

export default App;
