export interface RawKline {
  timestamp: number;
  date: string;
  o: number;
  h: number;
  l: number;
  c: number;
  vol?: number;
}

export interface ModelBar extends RawKline {
  coreGravityLine: number;
  supportLine1: number;
  supportLine2: number;
  resistanceLine: number;
  pivot: number;
  dateGuiYuan: number;
  priceGuiYuan: number;
  buySignal: boolean;
  sellSignal: boolean;
  isResonance: boolean;
  deviation: number;
  sentiment: string;
  reversalSignal?: 'STRONG_BUY' | 'CRITICAL_SELL' | 'HOLD';
  reversalSupport?: number | null;
  reversalResistance?: number | null;
  reversalAnchor?: { index: number; price: number; date: any } | null;
  atr?: number;
  signalLabel?: string;
  signalType?: 'BUY_STRONG' | 'SELL_STRONG' | 'HOLD';
}

export interface ReversalAnchor {
  index: number;
  price: number;
  label: string;
  isStrong?: boolean;
  date?: string;
}

export interface MonthlyStrategyResult {
  status: 'STRONG_BUY' | 'TAKE_PROFIT' | 'STATUS: HOLD';
  reason: string;
  blendedTrend: number;
  monthlyTrend: number;
  weeklyTrend: number;
  dailyTrend: number;
  lastClose: number;
}

export interface BacktestStats {
  totalReturn: string;
  winRate: string;
  profitLossRatio: string;
  maxDrawdown: string;
  finalFund: string;
  tradeCount: number;
  annualReturn: string;
  // 週線突變診斷埋點（文心 AI 診斷）：用數據驗證回補率，唔再靠猜
  trimmedCashRedeployedRatio?: string; // trim 現金回補率（TRIM 釋放嘅現金有幾多買返入市；0% 即現金凍結）
  falseFullClearCount?: number; // 假 FULL_CLEAR 次數（非 S4 週線突變誤清倉；應為 0）
  avgBullRetentionRatio?: string; // 大升浪（S1/S2）平均底倉保留率（目標 >= 60%）
  cashIdleDays?: number; // 現金凍結日數（週線鎖生效且現金閒置 >20% 總值嘅日數）
}

export interface TradeLog {
  type: string;
  msg: string;
  date: string;
  signalDate?: string;
  execDate?: string;
  puzzleHint?: string;
  complianceTag?: string;
  action: string;
  shares: number;
  units: string;
  confidence: string;
  price: string;
  totalHolding: number;
  holdingType: 'LONG' | 'SHORT' | 'EMPTY';
  source: string;
  profitPct: number | null;
  profit?: number;
}

export interface ResonanceAnalysis {
  r142857: {
    strongResist: number;
    midResist: number;
    strongSupport: number;
    midSupport: number;
    base: number;
  };
  guiYuan: {
    current: number;
    buy: number | null;
    high: number;
    low: number;
  };
  signal: string;
  action: string;
  suggestions: {
    buyZone: string;
    strongBuy: string;
    sellZone: string;
    target1: string;
    target2: string;
    stopLoss: string;
  };
}

export interface SymbolInfo {
  symbol: string;
  latestPrice: string;
  coreGravityLine: number;
  supportLine1: number;
  supportLine2: number;
  resistanceLine: number;
}

export interface NewsItem {
  title: string;
  time?: string;
  source?: string;
  url?: string;
}

export interface BatchScanResult {
  symbol: string;
  price: string;
  signal: string;
  support: string;
  resistance: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai' | 'expert' | 'system' | 'error';
  text: string;
  timestamp: number;
}

export interface ApiConfig {
  provider: 'claude' | 'gemini' | 'custom';
  url: string;
  key: string;
}

export interface FourierSpectrumItem {
  period: number;
  amplitude: number;
  phase: number;
}

export interface RibbonState {
  color: 'red' | 'green' | 'gray';
  trend: 'up' | 'down' | 'flat';
  strength: number;
}

export interface TechScore {
  score: number;
  detail: string;
}

export interface FourierState {
  spectrum: FourierSpectrumItem[];
  prob: { up: number; down: number; flat: number };
  ribbon: RibbonState;
  techInfo: TechScore;
  forecastLine: number[];
}
