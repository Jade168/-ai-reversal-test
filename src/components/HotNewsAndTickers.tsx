import React, { useState } from 'react';
import { NewsItem, TradeLog } from '../types/quant';
import { RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

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
  const [newsExpanded, setNewsExpanded] = useState(false);

  const hkList = [
    { sym: '00700', name: '騰訊' },
    { sym: '03690', name: '美團' },
    { sym: '09988', name: '阿里' }
  ];

  const usList = [
    { sym: 'TSLA', name: 'Tesla' },
    { sym: 'NVDA', name: 'NVDA' },
    { sym: 'AAPL', name: 'Apple' },
    { sym: 'DIS', name: 'DIS' }
  ];

  return (
    <div className="space-y-1.5">
      {/* 合併單行橫向可滑動：HK + US 熱門監控 */}
      <div className="bg-[#0a0a0a] p-2 rounded-md border border-[#262626]">
        <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap pb-0.5">
          <span className="text-[10px] font-bold text-[#818cf8] shrink-0">HK</span>
          {hkList.map((item) => (
            <button
              key={item.sym}
              onClick={() => onQuickLook(item.sym)}
              className="px-2 py-1 rounded bg-white/5 hover:bg-indigo-500/20 border-t border-[#6366f1] text-[11px] font-semibold text-white transition shrink-0 flex items-center gap-1"
            >
              <span>{item.sym}</span>
              <span className="text-[9px] text-gray-400">{item.name}</span>
            </button>
          ))}

          <span className="text-slate-700 px-0.5 shrink-0">|</span>

          <span className="text-[10px] font-bold text-[#f59e0b] shrink-0">US</span>
          {usList.map((item) => (
            <button
              key={item.sym}
              onClick={() => onQuickLook(item.sym)}
              className="px-2 py-1 rounded bg-white/5 hover:bg-amber-500/20 border-t border-[#f59e0b] text-[11px] font-semibold text-white transition shrink-0 flex items-center gap-1"
            >
              <span>{item.sym}</span>
              <span className="text-[9px] text-amber-400/80">🔥</span>
            </button>
          ))}
        </div>
      </div>

      {/* 緊湊精簡模式：全球市場熱點新聞 */}
      <div className="bg-[#0a0a0a] p-2 rounded-md border border-[#1f2937]">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-xs font-semibold text-[#ffd700] truncate">
            🔥 全球市場熱點新聞
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setNewsExpanded(prev => !prev)}
              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-gray-300 flex items-center gap-0.5 transition"
            >
              <span>{newsExpanded ? '精簡' : '展開'}</span>
              {newsExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>
            <button
              onClick={onRefreshNews}
              disabled={isFetchingNews}
              className="px-2 py-0.5 text-[10px] font-bold rounded bg-linear-to-r from-[#6366f1] to-[#a855f7] text-white hover:opacity-90 transition flex items-center gap-1"
            >
              <RefreshCw size={10} className={isFetchingNews ? 'animate-spin' : ''} />
              <span>刷新</span>
            </button>
          </div>
        </div>

        <div
          className={`${
            newsExpanded ? 'max-h-[160px]' : 'max-h-[84px]'
          } overflow-y-auto overscroll-contain text-xs text-gray-300 divide-y divide-[#1f2937]`}
        >
          {isFetchingNews ? (
            <div className="text-[#ffd700] text-center py-2 animate-pulse text-[11px]">
              🔄 正在拉取熱點新聞...
            </div>
          ) : newsList.length > 0 ? (
            newsList.map((news, idx) => (
              <div
                key={idx}
                onClick={() => onAnalyzeNews(news)}
                className="py-1 px-1 hover:bg-[#1a1a1a] cursor-pointer transition rounded-xs group flex items-center justify-between gap-2"
              >
                <span className="text-[#ffd700] group-hover:text-amber-300 font-medium text-[11px] truncate">
                  {news.title}
                </span>
                <span className="text-[9px] text-[#777] shrink-0">
                  {news.time || '剛剛'}
                </span>
              </div>
            ))
          ) : (
            <div className="text-[#666] text-center py-2 text-[11px]">
              點擊「刷新」抓取最新財經資訊...
            </div>
          )}
        </div>
      </div>

      {/* 雙核回測交易紀錄（融入 TFDR 奇點訊號 + 獨立上下滑動視窗） */}
      <div className="bg-slate-900/90 border border-slate-700/80 rounded-lg p-2.5 mt-1">
        <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-slate-800">
          <span className="text-xs font-bold text-amber-400">
            📜 雙核回測交易紀錄（上下滑動檢視全部）
          </span>
          <span className="text-[11px] text-slate-400">
            共 {tradeLogs.length} 筆歷史訊號
          </span>
        </div>
        <div className="max-h-64 overflow-y-auto pr-1 space-y-1.5 overscroll-contain">
          {tradeLogs.length > 0 ? (
            tradeLogs.map((log, idx) => (
              <div
                key={idx}
                className="text-xs p-1.5 rounded bg-slate-800/70 border border-slate-700/50 flex items-center justify-between gap-2"
              >
                <div className="min-w-0 flex items-center flex-wrap gap-1">
                  <span className="text-slate-400 font-mono text-[11px]">
                    [{log.date || '--'}]
                  </span>
                  <span
                    className={`font-bold ${
                      log.type.toUpperCase().includes('BUY')
                        ? 'text-emerald-400'
                        : 'text-red-400'
                    }`}
                  >
                    {log.type}
                  </span>
                  <span className="px-1 py-0.2 text-[10px] rounded bg-indigo-950 text-indigo-300 border border-indigo-700/50">
                    {log.source || '數律+TFDR共振'}
                  </span>
                </div>
                <div className="text-right font-mono text-[11px] shrink-0">
                  <span className="text-slate-200">${log.price || '--'}</span>
                  {log.profit !== undefined && (
                    <span
                      className={`ml-1.5 font-bold ${
                        log.profit >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {log.profit >= 0 ? `+${log.profit}%` : `${log.profit}%`}
                    </span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-slate-500 text-center py-4 text-xs">
              點擊「啟動分析」生成數律＋TFDR 雙核回測紀錄...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
