import React from 'react';
import { NewsItem, TradeLog } from '../types/quant';
import { RefreshCw } from 'lucide-react';

interface HotNewsAndTickersProps {
  newsList: NewsItem[];
  isFetchingNews: boolean;
  onRefreshNews: () => void;
  onAnalyzeNews: (news: NewsItem) => void;
  onQuickLook: (symbol: string) => void;
  tradeLogs: TradeLog[];
}

export const HotNewsAndTickers: React.FC<HotNewsAndTickersProps> = ({
  newsList,
  isFetchingNews,
  onRefreshNews,
  onAnalyzeNews,
  onQuickLook,
  tradeLogs
}) => {
  const hkList = [
    { sym: '00700', name: '騰訊控股' },
    { sym: '03690', name: '美團' },
    { sym: '09988', name: '阿里巴巴' }
  ];

  const usList = [
    { sym: 'TSLA', name: 'Tesla' },
    { sym: 'NVDA', name: 'NVIDIA' },
    { sym: 'AAPL', name: 'Apple' },
    { sym: 'DIS', name: 'Disney' }
  ];

  return (
    <div className="space-y-1">
      {/* Global Hot News Card */}
      <div className="bg-[#0a0a0a] p-2 rounded-md border border-[#1f2937]">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold text-[#ffd700]">
            🔥 全球市場熱點新聞（AI自動抓取）
          </span>
          <span className="text-[9px] text-gray-500">點擊標題解讀</span>
        </div>

        <div className="max-h-[140px] overflow-y-auto my-1 text-xs text-gray-300 divide-y divide-[#222]">
          {isFetchingNews ? (
            <div className="text-[#ffd700] text-center p-3 animate-pulse text-[11px]">
              🔄 正在從全球財經終端實時拉取熱點新聞...
            </div>
          ) : newsList.length > 0 ? (
            newsList.map((news, idx) => (
              <div
                key={idx}
                onClick={() => onAnalyzeNews(news)}
                className="p-1.5 hover:bg-[#1a1a1a] cursor-pointer transition rounded-sm group"
              >
                <div className="text-[#ffd700] group-hover:text-amber-300 font-medium text-[11px] leading-snug">
                  {news.title}
                </div>
                <div className="text-[9px] text-[#777] mt-0.5 flex items-center justify-between">
                  <span>{news.source || '全球財經快訊'}</span>
                  <span>{news.time || '剛剛'}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="text-[#666] text-center p-3 text-[11px]">
              點擊「刷新全球熱點新聞」抓取最新財經資訊...
            </div>
          )}
        </div>

        <button
          onClick={onRefreshNews}
          disabled={isFetchingNews}
          className="w-full h-7 text-xs font-bold rounded bg-linear-to-br from-[#6366f1] to-[#a855f7] text-white hover:opacity-90 transition active:scale-98 flex items-center justify-center gap-1.5"
        >
          <RefreshCw size={12} className={isFetchingNews ? 'animate-spin' : ''} />
          <span>🔄 刷新全球熱點新聞</span>
        </button>
      </div>

      {/* HK Hot List Panel */}
      <div className="bg-[#0a0a0a] p-2 rounded-md border border-[#333]">
        <div className="text-[11px] font-semibold text-[#6366f1] mb-1">
          📈 HK 熱門量化
        </div>
        <div className="grid grid-cols-3 gap-1">
          {hkList.map((item) => (
            <div
              key={item.sym}
              onClick={() => onQuickLook(item.sym)}
              className="bg-white/5 p-1 rounded-sm text-center cursor-pointer hover:bg-white/10 transition border-t-2 border-[#6366f1]"
            >
              <div className="font-bold text-xs text-white">{item.sym}</div>
              <div className="text-[9px] text-gray-400 truncate">{item.name}</div>
            </div>
          ))}
        </div>
      </div>

      {/* US Hot List Panel */}
      <div className="bg-[#0a0a0a] p-2 rounded-md border border-[#f59e0b]">
        <div className="text-[11px] font-semibold text-[#f59e0b] mb-1">
          🔥 US 熱門監控
        </div>
        <div className="grid grid-cols-4 gap-1">
          {usList.map((item) => (
            <div
              key={item.sym}
              onClick={() => onQuickLook(item.sym)}
              className="bg-white/5 p-1 rounded-sm text-center cursor-pointer hover:bg-white/10 transition border-t-2 border-[#f59e0b]"
            >
              <div className="font-bold text-xs text-white">{item.sym}</div>
              <div className="text-[9px] text-gray-400">🔥 Hot</div>
            </div>
          ))}
        </div>
      </div>

      {/* Trade Logs Card */}
      <div className="bg-[#0a0a0a] p-2 rounded-md border border-[#1f2937]">
        <div className="text-[11px] font-semibold text-[#ffd700] mb-1 flex items-center justify-between">
          <span>📜 交易記錄（自動生成）</span>
          <span className="text-[9px] text-gray-500">{tradeLogs.length} 條策略明細</span>
        </div>
        <div className="max-h-[110px] overflow-y-auto text-[10px] space-y-1 font-mono">
          {tradeLogs.length > 0 ? (
            tradeLogs.map((log, idx) => (
              <div
                key={idx}
                className={log.type === 'buy' ? 'text-[#10b981]' : 'text-[#ef4444]'}
              >
                {log.msg}
              </div>
            ))
          ) : (
            <div className="text-[#888] text-center p-2">點擊「啟動分析」生成策略記錄...</div>
          )}
        </div>
      </div>
    </div>
  );
};
