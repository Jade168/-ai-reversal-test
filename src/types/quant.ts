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
}

export interface TradeLog {
  type: 'buy' | 'sell';
  msg: string;
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
