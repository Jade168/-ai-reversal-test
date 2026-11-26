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
  calculateModel,
  calculate369And142857,
  calculateCosmicReversalSignal,
  runBacktestEngine,
  calculateFourierZAxis
} from './services/quantCalculations';
import {
  fetchMarketData,
  fetchFullBakedDailyKlines,
  fetchLiveTodayBar,
  fetchSymbolNews,
  analyzeNewsSentiment,
  fetchGlobalHotNews,
  analyzeNewsImpact
} from './services/marketData';
import {
  generateLocalAiResponse,
  generateZeroTokenDiagnosis,
  QuantContext
} from './services/aiChat';
import {
  MultiTimeframeTFDR,
  TFDRPoint,
  calculateTFDRSeries,
  computeMultiTimeframeTFDRFromDaily
} from './services/tfdrIndicator';
import {
  LocalExpertSummary,
  buildLocalAnalysisInput,
  evaluateLocalExpertSummary
} from './services/localQuantAnalyst';
import { runSleeveBacktest, SleeveBacktestResult } from './services/sleeveBacktest';
import { appendChatMessage } from './services/chatLog';

import { HeaderChart, getLiveDisplayBar } from './components/HeaderChart';
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
  const [fund, setFund] = useState(1000000);
  const [buyPrice, setBuyPrice] = useState('');
  const [coreInt, setCoreInt] = useState(1836.15);
  const [coreDec, setCoreDec] = useState(0.08);
  const [dataSource, setDataSource] = useState('eastmoney');

  // Market & Quant Data
  const [rawData, setRawData] = useState<RawKline[]>([]);
  const [dailyKlines, setDailyKlines] = useState<RawKline[]>([]);
  const [modelData, setModelData] = useState<ModelBar[]>([]);
  // 即日未完成棒（顯示專用）：只畫上日線圖做多一支蠟燭，永不入引擎／模型／回測
  const [liveTodayBar, setLiveTodayBar] = useState<RawKline | null>(null);
  // 即日價請求序號：轉股／再分析嗰陣舊請求返嚟唔好寫入新股嘅圖
  const liveTodayReqRef = useRef(0);
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
  const [tfdr, setTfdr] = useState<MultiTimeframeTFDR | null>(null);
  const [latestTfdrPoint, setLatestTfdrPoint] = useState<TFDRPoint | null>(null);
  const [expertSummary, setExpertSummary] = useState<LocalExpertSummary | null>(null);
  const [sleeveResult, setSleeveResult] = useState<SleeveBacktestResult | null>(null);

  // UI Status
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('⚡ 系統就緒，請輸入代碼啟動分析');
  const [aiModelReady, setAiModelReady] = useState(false);
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
      text: '🚀 終極系統已加載 | 本地雙核驅動：\n🔘 AI對話（本地大腦，秒回應）\n🔘 零流量診斷（本地專家，完整操盤報告）\n✅ 已接入東方財富真實即日/歷史數據接口',
      timestamp: Date.now()
    }
  ]);

  const didInitRef = useRef(false);

  const addChatMessage = useCallback((role: ChatMessage['role'], text: string) => {
    // 去重邏輯喺 services/chatLog.ts（純函數，可 mock 測試）：最新一條相同就地覆蓋；
    // 提示單報告覆蓋最近一筆同類提示單（即日版取代烘焙版）。
    setChatMessages((prev) => appendChatMessage(prev, role, text));
  }, []);

  // Load API config from localStorage on mount and auto-load 2-3 years historical analysis
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
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

  // 【即日價・顯示專用】當前日期／最新價嗰幾格用嘅即日棒：只限日線＋非回放＋新過
  // 烘焙最後一棒先有；其餘情況（週／月線、回放、無即日棒、舊棒）一律 null，
  // 顯示同而家一字不變。引擎／模型／回測／專家指令唔食呢個值。
  const displayLiveBar = getLiveDisplayBar(modelData, liveTodayBar, period, isReplaying);

  // 【即日價・顯示專用】symbolInfo.latestPrice 跟即日價行：有即日棒嗰陣顯示即日收市價，
  // 無嗰陣跌返烘焙最後一棒收市價。只改 latestPrice 呢格——核心線／支撐／阻力位、
  // 專家指令、TFDR、回測全部繼續食烘焙版，一字不變。
  useEffect(() => {
    setSymbolInfo(prev => {
      if (!prev) return prev;
      const bakedLast = modelData[modelData.length - 1];
      const price = displayLiveBar
        ? displayLiveBar.c.toFixed(2)
        : bakedLast
          ? bakedLast.c.toFixed(2)
          : prev.latestPrice;
      return prev.latestPrice === price ? prev : { ...prev, latestPrice: price };
    });
  }, [displayLiveBar, modelData]);

  // 【即日價・顯示專用】即日棒返到嗰陣，如果 log 入面已經有份烘焙版提示單報告
  // （撳診斷嗰陣即日棒未返——runQuantAnalysis 係 fire-and-forget，8 秒內撳掣
  // 都只會出烘焙版），重新產生即日版取代佢。未撳過診斷就唔彈報告；
  // 每（股票｜即日日期）最多刷新一次。指令／水平／TFDR／回測繼續食烘焙版。
  const diagLiveRefreshedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!displayLiveBar) {
      diagLiveRefreshedKeyRef.current = null;
      return;
    }
    const liveDate = (displayLiveBar.date || '').slice(0, 10);
    if (!liveDate) return;
    const key = `${symbol}|${liveDate}`;
    if (diagLiveRefreshedKeyRef.current === key) return;
    const hasBakedCard = chatMessages.some(
      (m) => m.role === 'ai' && m.text.trim().startsWith('📊 【') && m.text.includes('最新時空提示單')
    );
    if (!hasBakedCard) return;
    const context: QuantContext = {
      symbolInfo,
      modelData,
      dailyKlines,
      stats,
      batchScanResults,
      newsList,
      sentiment,
      globalHotNews,
      tfdr,
      latestTfdrPoint,
      displayLiveBar
    };
    const report = generateZeroTokenDiagnosis(context);
    if (!report) return;
    diagLiveRefreshedKeyRef.current = key;
    addChatMessage('ai', report);
  }, [displayLiveBar, chatMessages, symbol, symbolInfo, modelData, dailyKlines, stats, batchScanResults, newsList, sentiment, globalHotNews, tfdr, latestTfdrPoint, addChatMessage]);

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

    try {
      const klines = await fetchMarketData(sym, assetType, period, dataSource);
      if (klines.length === 0) {
        addChatMessage('error', `❌ 抓取 ${sym} 失敗，請檢查代碼或更換數據源`);
        setIsLoading(false);
        return;
      }
      setRawData(klines);

      // 【即日價・顯示專用分流】烘焙 klines 上面已經餵晒 calculateModel／回測引擎／
      // TFDR／專家報告（以下全部繼續用烘焙版，一字不變）；呢度另外 fire-and-forget
      // 攞今日未完成棒，只畀 HeaderChart 畫多一支蠟燭。唔 await（唔阻載入，東方財富
      // 唔通／未開市就靜靜冇咗支棒）；只限日線圖＋非 free 模式；批量掃描唔攞。
      const liveReqId = ++liveTodayReqRef.current;
      setLiveTodayBar(null);
      if (period === 'daily' && dataSource !== 'free') {
        fetchLiveTodayBar(sym, assetType, dataSource)
          .then(bar => {
            if (liveReqId === liveTodayReqRef.current) setLiveTodayBar(bar);
          })
          .catch(() => {
            /* fetchLiveTodayBar 本身唔 throw，呢度只係防萬一 */
          });
      }

      setLoadingMessage(`📰 抓取相關財經新聞並分析情緒...`);
      const news = await fetchSymbolNews(sym, assetType);
      setNewsList(news);
      const newsSent = await analyzeNewsSentiment(news, sym);
      setSentiment(newsSent);

      setLoadingMessage(`🧮 計算 1836.15 數律中樞與時空共振...`);
      let computedModel = calculateModel(klines, coreInt, newsSent, period);

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

      // Fetch daily series first when viewing weekly/monthly/5min so backtest & TFDR matrix both align across daily/weekly/monthly
      let dailyKlinesForTfdr = klines;
      if (period !== 'daily') {
        try {
          const fetchedDaily = await fetchMarketData(sym, assetType, 'daily', dataSource);
          if (fetchedDaily.length > 0) {
            dailyKlinesForTfdr = fetchedDaily;
          }
        } catch {
          dailyKlinesForTfdr = klines;
        }
      }

      setDailyKlines(dailyKlinesForTfdr);

      // Backtest Engine (puzzle/v2-strict 嚴格時點凍結 + 開盤成交 + 單邊 0.25% 成本)
      const { stats: bStats, logs } = runBacktestEngine(
        computedModel,
        fund,
        period,
        dailyKlinesForTfdr,
        sym
      );
      setStats(bStats);
      setTradeLogs(logs);

      // 雙袖版回測（2026-11-22 最終方案）：同現行版並存、獨立計算；出錯只會冇咗雙袖版，唔影響現行版
      try {
        setSleeveResult(runSleeveBacktest(dailyKlinesForTfdr, fund));
      } catch (sleeveErr) {
        console.warn('Sleeve backtest error:', sleeveErr);
        setSleeveResult(null);
      }

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

      // TFDR 3-Timeframe Singularity Resonance Matrix (from daily data aggregated to 5-bar weekly & 21-bar monthly)
      // 改用未截斷全系列計（選項 a）：切分錨定系列開頭，全系列先唔會因截斷移位（NVDA 月線 3→15 穩定值）；其他嘢繼續用 5000 支上限。顯示專用，唔入引擎／回測。
      let tfdrDailyBars = dailyKlinesForTfdr;
      try {
        const fullDaily = await fetchFullBakedDailyKlines(sym);
        if (fullDaily && fullDaily.length > 0) tfdrDailyBars = fullDaily;
      } catch {
        tfdrDailyBars = dailyKlinesForTfdr;
      }
      const tfdrMatrix = computeMultiTimeframeTFDRFromDaily(tfdrDailyBars);
      setTfdr(tfdrMatrix);

      const chartTfdrSeries = calculateTFDRSeries(
        klines.map(k => k.c),
        klines.map(k => k.h),
        klines.map(k => k.l)
      );
      const latestPt = chartTfdrSeries.length > 0 ? chartTfdrSeries[chartTfdrSeries.length - 1] : null;
      setLatestTfdrPoint(latestPt);

      const localInput = buildLocalAnalysisInput({
        symbol: sym,
        currentPrice: lastBar.c,
        dailyKlines: dailyKlinesForTfdr,
        tfdr: tfdrMatrix,
        latestTfdrPoint: latestPt
      });
      const localSummary = localInput ? evaluateLocalExpertSummary(localInput) : null;
      setExpertSummary(localSummary);
    } catch (err: any) {
      console.error(err);
      addChatMessage('error', `❌ 量化分析出錯: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 【顯示修復 2026-11-27】切換週／月線自動重新載入數據：之前 period 掣只改
  // state，modelData 仲係上一個周期嘅，週／月平均線會用日線收市計錯位（約 $153
  // 而唔係 $200.52）。依家撳周期即刻跑返同一套分析（同手動撳「重新分析」一樣），
  // 平均線永遠跟正確周期。開頁嗰次由 init effect 跑，呢度跳過第一次，唔會重複
  // 跑兩次。runQuantAnalysis 本身唔改 period，所以唔會自循環。
  const periodAutoReloadSkippedRef = useRef(false);
  useEffect(() => {
    if (!periodAutoReloadSkippedRef.current) {
      periodAutoReloadSkippedRef.current = true;
      return;
    }
    runQuantAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

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
        const computed = calculateModel(klines, coreInt, '中性', 'daily');
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
      dailyKlines,
      stats,
      batchScanResults,
      newsList,
      sentiment,
      globalHotNews,
      tfdr,
      latestTfdrPoint,
      displayLiveBar
    };

    setTimeout(() => {
      const reply = generateLocalAiResponse(text, context);
      addChatMessage('ai', reply);
    }, 250);
  };

  // Zero-Token Local Expert Diagnosis
  const handleRunZeroTokenDiagnosis = () => {
    const context: QuantContext = {
      symbolInfo,
      modelData,
      dailyKlines,
      stats,
      batchScanResults,
      newsList,
      sentiment,
      globalHotNews,
      tfdr,
      latestTfdrPoint,
      displayLiveBar
    };
    const report = generateZeroTokenDiagnosis(context);
    if (!report) {
      addChatMessage('error', '請先點擊「啟動分析」取得日線與 TFDR 數據後再執行零流量診斷！');
      return;
    }
    addChatMessage('ai', report);
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
        dailyKlines={dailyKlines}
        liveTodayBar={liveTodayBar}
        isLoading={isLoading}
        loadingMessage={loadingMessage}
        isReplay={isReplaying}
        replayIndex={replayIndex}
        hologramLine={fourier.forecastLine}
        timeframe={period}
        supportLevels={resonance?.r142857 ? [resonance.r142857.strongSupport, resonance.r142857.midSupport] : []}
        resistanceLevels={resonance?.r142857 ? [resonance.r142857.strongResist, resonance.r142857.midResist] : []}
        puzzleState={expertSummary?.puzzle ?? null}
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
        <div className="w-full md:w-[40%] flex-shrink-0 flex flex-col order-2 md:order-1 md:relative">
          <div className="w-full md:absolute md:inset-0 flex flex-col">
            <AiChatColumn
              messages={chatMessages}
              aiReady={aiModelReady}
              onInitAi={handleInitAi}
              onSendLocal={handleSendLocal}
              onRunZeroTokenDiagnosis={handleRunZeroTokenDiagnosis}
              latestPuzzle={expertSummary?.puzzle ?? null}
              displayLiveBar={displayLiveBar}
            />
          </div>
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

          {/* Signals, Statistics & Integrated Trade Logs */}
          <SignalAndStatsArea
            lastBar={modelData.length > 0 ? modelData[modelData.length - 1] : null}
            displayLiveBar={displayLiveBar}
            symbolInfo={symbolInfo}
            stats={stats}
            resonance={resonance}
            sentiment={sentiment}
            userBuyPrice={buyPrice}
            tfdr={tfdr}
            latestTfdrPoint={latestTfdrPoint}
            expertSummary={expertSummary}
            tradeLogs={tradeLogs}
            sleeveResult={sleeveResult}
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

          {/* Hot News & Watchlists */}
          <HotNewsAndTickers
            newsList={globalHotNews}
            isFetchingNews={isFetchingNews}
            onRefreshNews={handleFetchGlobalNews}
            onAnalyzeNews={handleAnalyzeNews}
            onQuickLook={handleQuickLook}
          />
        </div>
      </div>
    </div>
  );
};

export default App;
