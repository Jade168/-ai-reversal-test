import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { ModelBar } from '../types/quant';
import { calculateDynamicReversals } from '../services/quantCalculations';
import { calculateTFDRSeries } from '../services/tfdrIndicator';
import { PuzzleState } from '../services/puzzleDecisionEngine';
import { ZoomIn, ZoomOut, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';

interface HeaderChartProps {
  data: ModelBar[];
  isLoading: boolean;
  loadingMessage: string;
  isReplay: boolean;
  replayIndex: number;
  hologramLine?: number[];
  onBarClick?: (bar: ModelBar) => void;
  timeframe?: string;
  supportLevels?: number[];
  resistanceLevels?: number[];
  puzzleState?: PuzzleState | null;
}

export const HeaderChart: React.FC<HeaderChartProps> = ({
  data,
  isLoading,
  loadingMessage,
  isReplay,
  replayIndex,
  hologramLine = [],
  timeframe = '1d',
  supportLevels = [],
  resistanceLevels = [],
  puzzleState = null
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sliderTrackRef = useRef<HTMLDivElement>(null);

  // 1. 圖表顯示模式狀態：【傳統數律共振】⇄【TFDR 奇點通道】
  const [chartMode, setChartMode] = useState<'CLASSIC' | 'TFDR'>('CLASSIC');

  // 四維拼圖畫中畫（PiP）小窗：桌面預設展開、手機版預設收合
  const [pipExpanded, setPipExpanded] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );

  // Viewport / zoom / pan state
  const [viewRange, setViewRange] = useState<{ start: number; end: number } | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // 滑鼠 / 單指拖拽平移狀態
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; startIdx: number; endIdx: number }>({
    x: 0,
    startIdx: 0,
    endIdx: 0
  });

  // 底部時間軸滑塊拖拽狀態
  const isSliderDraggingRef = useRef(false);
  const sliderDragStartRef = useRef<{ x: number; startIdx: number; endIdx: number }>({
    x: 0,
    startIdx: 0,
    endIdx: 0
  });

  // 雙指縮放初始距離
  const pinchStartRef = useRef<{ dist: number; startIdx: number; endIdx: number } | null>(null);

  // 2. 簡化高低位標籤文字函數（解決文字過長重疊問題）
  const formatShortSignalLabel = useCallback(
    (type: 'HIGH' | 'LOW', isStrong: boolean) => {
      if (chartMode === 'TFDR') {
        return type === 'HIGH' ? '奇點沽' : '奇點買';
      }
      if (type === 'HIGH') {
        return isStrong ? '強阻' : '頂';
      }
      return isStrong ? '強支' : '底';
    },
    [chartMode]
  );

  // Slice data based on replay
  const activeData = useMemo(() => {
    if (data.length === 0) return [];
    if (isReplay) {
      return data.slice(0, Math.min(replayIndex + 1, data.length));
    }
    return data;
  }, [data, isReplay, replayIndex]);

  // Reset or adjust viewRange on data changes (預設顯示最近約 35%，保留過往歷史供向左平移查看)
  useEffect(() => {
    if (activeData.length > 0) {
      const defaultBars =
        activeData.length <= 80
          ? activeData.length
          : Math.max(80, Math.min(350, Math.round(activeData.length * 0.35)));
      setViewRange({
        start: Math.max(0, activeData.length - defaultBars),
        end: activeData.length - 1
      });
    } else {
      setViewRange(null);
    }
  }, [activeData.length]);

  // 計算傳統高低點框標記
  const boxMarkers = useMemo(() => {
    return calculateDynamicReversals(activeData, timeframe, supportLevels, resistanceLevels);
  }, [activeData, timeframe, supportLevels, resistanceLevels]);

  // 計算 TFDR 時空頻率減速共振序列
  const tfdrSeries = useMemo(() => {
    if (activeData.length === 0) return [];
    return calculateTFDRSeries(
      activeData.map(b => b.c),
      activeData.map(b => b.h),
      activeData.map(b => b.l)
    );
  }, [activeData]);

  // 計算 TFDR 歷史奇點轉折點（高位：score >= 90；低位：score <= 20 或最低價觸及/跌穿 band15 地板線）
  const tfdrTurningPoints = useMemo(() => {
    const highs: Array<{ index: number; price: number }> = [];
    const lows: Array<{ index: number; price: number }> = [];
    if (activeData.length === 0 || tfdrSeries.length === 0) {
      return { highs, lows };
    }

    const isBuySingularityAt = (idx: number) =>
      idx >= 14 && (tfdrSeries[idx].score <= 20 || activeData[idx].l <= tfdrSeries[idx].band15);

    let i = 0;
    while (i < tfdrSeries.length) {
      if (i >= 14 && tfdrSeries[i].score >= 90) {
        let bestIdx = i;
        let bestHigh = activeData[i].h;
        let j = i + 1;
        while (j < tfdrSeries.length && tfdrSeries[j].score >= 90) {
          if (activeData[j].h >= bestHigh) {
            bestHigh = activeData[j].h;
            bestIdx = j;
          }
          j++;
        }
        highs.push({ index: bestIdx, price: bestHigh });
        i = j;
      } else {
        i++;
      }
    }

    i = 0;
    while (i < tfdrSeries.length) {
      if (isBuySingularityAt(i)) {
        let bestIdx = i;
        let bestLow = activeData[i].l;
        let j = i + 1;
        while (j < tfdrSeries.length && isBuySingularityAt(j)) {
          if (activeData[j].l <= bestLow) {
            bestLow = activeData[j].l;
            bestIdx = j;
          }
          j++;
        }
        lows.push({ index: bestIdx, price: bestLow });
        i = j;
      } else {
        i++;
      }
    }

    return { highs, lows };
  }, [activeData, tfdrSeries]);

  // Redraw canvas
  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    // Dark Background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    if (activeData.length === 0) {
      ctx.restore();
      return;
    }

    const startIdx = Math.max(0, viewRange?.start ?? Math.max(0, activeData.length - 80));
    const endIdx = Math.min(activeData.length - 1, viewRange?.end ?? activeData.length - 1);
    const visibleBars = activeData.slice(startIdx, endIdx + 1);
    const visibleTfdr = tfdrSeries.slice(startIdx, endIdx + 1);

    if (visibleBars.length === 0) {
      ctx.restore();
      return;
    }

    // Chart margins
    const margin = { top: 20, right: 65, bottom: 25, left: 10 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    // Price Extents
    let minPrice = Math.min(...visibleBars.map(b => b.l));
    let maxPrice = Math.max(...visibleBars.map(b => b.h));

    const lastTfdr = tfdrSeries.length > 0 ? tfdrSeries[tfdrSeries.length - 1] : null;
    const isLatestInView = endIdx === activeData.length - 1;
    const showClassicTfdrTop = Boolean(chartMode === 'CLASSIC' && isLatestInView && lastTfdr && lastTfdr.score > 80);
    const showClassicTfdrBottom = Boolean(chartMode === 'CLASSIC' && isLatestInView && lastTfdr && lastTfdr.score < 30);

    if (chartMode === 'CLASSIC') {
      // CLASSIC 模式：納入核心線、支撐阻力與臨界單線
      visibleBars.forEach(b => {
        if (b.supportLine1 > 0) minPrice = Math.min(minPrice, b.supportLine1 * 0.99);
        if (b.resistanceLine > 0) maxPrice = Math.max(maxPrice, b.resistanceLine * 1.01);
        if (b.coreGravityLine > 0 && Math.abs(b.coreGravityLine - b.c) / b.c < 0.4) {
          minPrice = Math.min(minPrice, b.coreGravityLine * 0.99);
          maxPrice = Math.max(maxPrice, b.coreGravityLine * 1.01);
        }
      });

      if (showClassicTfdrTop && lastTfdr && lastTfdr.band90 > 0) {
        maxPrice = Math.max(maxPrice, lastTfdr.band90);
      }
      if (showClassicTfdrBottom && lastTfdr && lastTfdr.band15 > 0) {
        minPrice = Math.min(minPrice, lastTfdr.band15);
      }
    } else {
      // TFDR 模式：納入可視區 band95 / band10 上下 6 軌通道極值
      visibleTfdr.forEach((pt, idx) => {
        if (startIdx + idx >= 14 || visibleTfdr.length <= 14) {
          if (pt.band95 > 0) maxPrice = Math.max(maxPrice, pt.band95);
          if (pt.band10 > 0) minPrice = Math.min(minPrice, pt.band10);
        }
      });
    }

    // Add padding to price range
    const priceRange = maxPrice - minPrice || 1;
    minPrice -= priceRange * 0.06;
    maxPrice += priceRange * 0.06;

    const getY = (price: number) => {
      return margin.top + plotH - ((price - minPrice) / (maxPrice - minPrice)) * plotH;
    };

    const barWidth = Math.max(1.5, (plotW / visibleBars.length) * 0.7);
    const stepX = plotW / visibleBars.length;

    const getX = (idxInVisible: number) => {
      return margin.left + idxInVisible * stepX + stepX / 2;
    };

    // 1. Grid Lines
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    const gridRows = 6;
    for (let r = 0; r <= gridRows; r++) {
      const y = margin.top + (plotH / gridRows) * r;
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(margin.left + plotW, y);
      ctx.stroke();

      const priceVal = maxPrice - ((maxPrice - minPrice) / gridRows) * r;
      ctx.fillStyle = '#666666';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(priceVal.toFixed(2), width - margin.right + 6, y + 3);
    }

    // 2~4. 圖層切換：CLASSIC 渲染傳統均線/支撐阻力；TFDR 隱藏繁雜均線改畫雙軌通道
    if (chartMode === 'CLASSIC') {
      // 1836.15 Scaled Core Gravity Line
      ctx.beginPath();
      let hasCorePoint = false;
      visibleBars.forEach((bar, i) => {
        if (bar.coreGravityLine > 0) {
          const x = getX(i);
          const y = getY(bar.coreGravityLine);
          if (!hasCorePoint) {
            ctx.moveTo(x, y);
            hasCorePoint = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      ctx.strokeStyle = '#8b5cf6';
      ctx.lineWidth = 2.4;
      ctx.stroke();

      // Dynamic Strong Support (Green dashed)
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      visibleBars.forEach((bar, i) => {
        const x = getX(i);
        const y = getY(bar.supportLine1);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // Dynamic Resistance (Orange dashed)
      ctx.beginPath();
      visibleBars.forEach((bar, i) => {
        const x = getX(i);
        const y = getY(bar.resistanceLine);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (visibleTfdr.length > 0) {
      // TFDR 模式：(a) 隱藏繁雜均線 (b) 繪製上下各 3 條動態波動曲線 + 半透明帶狀陰影
      ctx.save();

      // 1. 紅色危險天花板帶半透明陰影 (band85 ~ band95)
      ctx.beginPath();
      visibleTfdr.forEach((pt, i) => {
        const x = getX(i);
        const y = getY(pt.band95);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      for (let i = visibleTfdr.length - 1; i >= 0; i--) {
        ctx.lineTo(getX(i), getY(visibleTfdr[i].band85));
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(239, 68, 68, 0.08)';
      ctx.fill();

      // 2. 綠色抄底地板帶半透明陰影 (band25 ~ band10)
      ctx.beginPath();
      visibleTfdr.forEach((pt, i) => {
        const x = getX(i);
        const y = getY(pt.band25);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      for (let i = visibleTfdr.length - 1; i >= 0; i--) {
        ctx.lineTo(getX(i), getY(visibleTfdr[i].band10));
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(34, 197, 94, 0.08)';
      ctx.fill();

      // 輔助繪製單條動態曲線
      const drawDynamicCurve = (
        extractor: (pt: (typeof visibleTfdr)[number]) => number,
        color: string,
        lineWidth: number,
        dash: number[]
      ) => {
        ctx.beginPath();
        ctx.setLineDash(dash);
        visibleTfdr.forEach((pt, i) => {
          const x = getX(i);
          const y = getY(extractor(pt));
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      };

      // 上方三條紅色動態曲線
      drawDynamicCurve(pt => pt.band95, '#ef4444', 1.5, []);      // 95 極度危險頂 (深紅實線)
      drawDynamicCurve(pt => pt.band90, '#f87171', 1.2, [5, 4]);  // 90 奇點逃頂線 (亮紅虛線)
      drawDynamicCurve(pt => pt.band85, '#fca5a5', 1.0, [2, 3]);  // 85 加速預警線 (淺紅點線)

      // 下方三條綠色動態曲線
      drawDynamicCurve(pt => pt.band25, '#86efac', 1.0, [2, 3]);  // 25 觀察支撐線 (淺綠點線)
      drawDynamicCurve(pt => pt.band15, '#4ade80', 1.2, [5, 4]);  // 15 奇點抄底線 (亮綠虛線)
      drawDynamicCurve(pt => pt.band10, '#22c55e', 1.5, []);      // 10 極度恐慌底 (深綠實線)
      ctx.setLineDash([]);

      // 右側末端 6 軌標註（自適應防重疊間距）
      const rightMostTfdr = visibleTfdr[visibleTfdr.length - 1];
      if (rightMostTfdr) {
        const drawEndTag = (yCenter: number, text: string, color: string, bg: string) => {
          ctx.font = 'bold 9.5px -apple-system, BlinkMacSystemFont, sans-serif';
          const tw = ctx.measureText(text).width;
          const bw = tw + 8;
          const bh = 13;
          const bx = margin.left + plotW - bw - 3;
          const by = Math.max(margin.top + 1, Math.min(margin.top + plotH - bh - 1, yCenter - bh / 2));

          ctx.fillStyle = bg;
          ctx.strokeStyle = color;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.roundRect(bx, by, bw, bh, 2.5);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = color;
          ctx.textAlign = 'center';
          ctx.fillText(text, bx + bw / 2, by + 9.5);
        };

        // 頂部 3 標籤從上往下防重疊排列
        const y95 = getY(rightMostTfdr.band95);
        const y90 = Math.max(y95 + 14, getY(rightMostTfdr.band90));
        const y85 = Math.max(y90 + 14, getY(rightMostTfdr.band85));

        drawEndTag(y95, '95 極頂', '#ef4444', 'rgba(69, 10, 10, 0.85)');
        drawEndTag(y90, '90 危險', '#f87171', 'rgba(69, 10, 10, 0.82)');
        drawEndTag(y85, '85 警戒', '#fca5a5', 'rgba(69, 10, 10, 0.78)');

        // 底部 3 標籤從下往上防重疊排列
        const y10 = getY(rightMostTfdr.band10);
        const y15 = Math.min(y10 - 14, getY(rightMostTfdr.band15));
        const y25 = Math.min(y15 - 14, getY(rightMostTfdr.band25));

        drawEndTag(y25, '25 觀察', '#86efac', 'rgba(5, 46, 22, 0.78)');
        drawEndTag(y15, '15 黃金底', '#4ade80', 'rgba(5, 46, 22, 0.82)');
        drawEndTag(y10, '10 極底', '#22c55e', 'rgba(5, 46, 22, 0.85)');
      }
      ctx.restore();
    }

    // 5. Candlestick Bars
    visibleBars.forEach((bar, i) => {
      const x = getX(i);
      const isUp = bar.c >= bar.o;
      const color = isUp ? '#10b981' : '#ef4444';

      const highY = getY(bar.h);
      const lowY = getY(bar.l);
      const openY = getY(bar.o);
      const closeY = getY(bar.c);

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      // Body
      const topY = Math.min(openY, closeY);
      const bodyH = Math.max(1.5, Math.abs(openY - closeY));
      ctx.fillStyle = color;
      ctx.fillRect(x - barWidth / 2, topY, barWidth, bodyH);

      // Date ticks across multi-year timeline
      if (i % Math.max(1, Math.floor(visibleBars.length / 8)) === 0) {
        ctx.fillStyle = '#888888';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        const rawDate = (bar.date || '').split(' ')[0];
        const dateLabel = rawDate.length >= 7 ? rawDate.slice(0, 7) : rawDate;
        ctx.fillText(dateLabel, x, height - 8);
      }
    });

    // 6 & 7. 信號與高低點標記（依 chartMode 分流，且加入水平防重疊間距）
    if (chartMode === 'CLASSIC') {
      let lastHighMarkerX = -999;
      boxMarkers.highs.forEach(marker => {
        if (marker.index >= startIdx && marker.index <= endIdx) {
          const i = marker.index - startIdx;
          const x = getX(i);
          if (x - lastHighMarkerX < 28) return;
          lastHighMarkerX = x;

          const y = getY(marker.price);
          const isStrong = Boolean(marker.isStrong);
          const labelText = formatShortSignalLabel('HIGH', isStrong);
          ctx.font = 'bold 9px sans-serif';
          const tw = ctx.measureText(labelText).width;
          const bw = Math.max(22, tw + 8);
          const bh = 14;
          const bx = Math.max(margin.left + 2, Math.min(margin.left + plotW - bw - 2, x - bw / 2));
          const by = Math.max(margin.top + 2, y - bh - 4);

          ctx.strokeStyle = isStrong ? '#f87171' : '#ef4444';
          ctx.lineWidth = isStrong ? 1.5 : 1.1;
          ctx.fillStyle = isStrong ? 'rgba(239, 68, 68, 0.35)' : 'rgba(239, 68, 68, 0.2)';
          ctx.beginPath();
          ctx.roundRect(bx, by, bw, bh, 3);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#fee2e2';
          ctx.textAlign = 'center';
          ctx.fillText(labelText, bx + bw / 2, by + 10.5);
        }
      });

      let lastLowMarkerX = -999;
      boxMarkers.lows.forEach(marker => {
        if (marker.index >= startIdx && marker.index <= endIdx) {
          const i = marker.index - startIdx;
          const x = getX(i);
          if (x - lastLowMarkerX < 28) return;
          lastLowMarkerX = x;

          const y = getY(marker.price);
          const isStrong = Boolean(marker.isStrong);
          const labelText = formatShortSignalLabel('LOW', isStrong);
          ctx.font = 'bold 9px sans-serif';
          const tw = ctx.measureText(labelText).width;
          const bw = Math.max(22, tw + 8);
          const bh = 14;
          const bx = Math.max(margin.left + 2, Math.min(margin.left + plotW - bw - 2, x - bw / 2));
          const by = Math.min(margin.top + plotH - bh - 2, y + 4);

          ctx.strokeStyle = isStrong ? '#34d399' : '#10b981';
          ctx.lineWidth = isStrong ? 1.5 : 1.1;
          ctx.fillStyle = isStrong ? 'rgba(16, 185, 129, 0.35)' : 'rgba(16, 185, 129, 0.2)';
          ctx.beginPath();
          ctx.roundRect(bx, by, bw, bh, 3);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#d1fae5';
          ctx.textAlign = 'center';
          ctx.fillText(labelText, bx + bw / 2, by + 10.5);
        }
      });

      // 極簡「強支」/「強阻」買賣信號箭頭 + 精簡短標籤
      let lastBuyBadgeX = -999;
      let lastSellBadgeX = -999;
      visibleBars.forEach((bar, i) => {
        const x = getX(i);
        const isStrongBuy = bar.buySignal || bar.reversalSignal === 'STRONG_BUY';
        const isCriticalSell = bar.sellSignal || bar.reversalSignal === 'CRITICAL_SELL';

        if (isStrongBuy && x - lastBuyBadgeX >= 32) {
          lastBuyBadgeX = x;
          const arrowTipY = getY(bar.l) + 4;
          ctx.beginPath();
          ctx.moveTo(x, arrowTipY);
          ctx.lineTo(x - 6, arrowTipY + 9);
          ctx.lineTo(x + 6, arrowTipY + 9);
          ctx.closePath();
          ctx.fillStyle = '#00ff7f';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 0.8;
          ctx.stroke();

          const text = formatShortSignalLabel('LOW', true);
          ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
          const textWidth = ctx.measureText(text).width;
          const badgeW = textWidth + 10;
          const badgeH = 17;
          const badgeX = Math.max(margin.left + 2, Math.min(margin.left + plotW - badgeW - 2, x - badgeW / 2));
          const badgeY = Math.min(margin.top + plotH - badgeH - 2, arrowTipY + 12);

          ctx.fillStyle = 'rgba(6, 78, 59, 0.92)';
          ctx.strokeStyle = '#00ff7f';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.fillText(text, badgeX + badgeW / 2, badgeY + 12);
        }

        if (isCriticalSell && x - lastSellBadgeX >= 32) {
          lastSellBadgeX = x;
          const arrowTipY = getY(bar.h) - 4;
          ctx.beginPath();
          ctx.moveTo(x, arrowTipY);
          ctx.lineTo(x - 6, arrowTipY - 9);
          ctx.lineTo(x + 6, arrowTipY - 9);
          ctx.closePath();
          ctx.fillStyle = '#ff4500';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 0.8;
          ctx.stroke();

          const text = formatShortSignalLabel('HIGH', true);
          ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
          const textWidth = ctx.measureText(text).width;
          const badgeW = textWidth + 10;
          const badgeH = 17;
          const badgeX = Math.max(margin.left + 2, Math.min(margin.left + plotW - badgeW - 2, x - badgeW / 2));
          const badgeY = Math.max(margin.top + 2, arrowTipY - 12 - badgeH);

          ctx.fillStyle = 'rgba(127, 29, 29, 0.92)';
          ctx.strokeStyle = '#ff4500';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.fillText(text, badgeX + badgeW / 2, badgeY + 12);
        }
      });

      // 8. Fourier Hologram Prediction Line (CLASSIC 模式保留全息線)
      if (hologramLine.length > 0 && endIdx === activeData.length - 1) {
        const lastX = getX(visibleBars.length - 1);
        ctx.beginPath();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = '#d8b4fe';
        ctx.lineWidth = 2;
        ctx.moveTo(lastX, getY(visibleBars[visibleBars.length - 1].c));

        hologramLine.forEach((val, fIdx) => {
          const fx = lastX + (fIdx + 1) * stepX;
          const fy = getY(val);
          ctx.lineTo(fx, fy);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 8.5 CLASSIC 模式極簡防眼花 TFDR 臨界單線（僅 score > 80 或 < 30 時於右側局部繪製）
      if (lastTfdr && (showClassicTfdrTop || showClassicTfdrBottom)) {
        const localStartX = margin.left + plotW * 0.7;
        const localEndX = margin.left + plotW;

        ctx.save();
        if (showClassicTfdrTop) {
          const yTop = getY(lastTfdr.band90);
          ctx.beginPath();
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.72)';
          ctx.lineWidth = 1.8;
          ctx.moveTo(localStartX, yTop);
          ctx.lineTo(localEndX, yTop);
          ctx.stroke();
          ctx.setLineDash([]);

          const labelText = `TFDR 90 危險頂 (${lastTfdr.band90})`;
          ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
          const textW = ctx.measureText(labelText).width;
          const boxW = textW + 10;
          const boxH = 16;
          const boxX = localEndX - boxW - 4;
          const boxY = Math.max(margin.top + 2, Math.min(margin.top + plotH - boxH - 2, yTop - boxH - 3));

          ctx.fillStyle = 'rgba(127, 29, 29, 0.78)';
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.75)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(boxX, boxY, boxW, boxH, 3);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#fecaca';
          ctx.textAlign = 'center';
          ctx.fillText(labelText, boxX + boxW / 2, boxY + 11.5);
        } else if (showClassicTfdrBottom) {
          const yBot = getY(lastTfdr.band15);
          ctx.beginPath();
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.72)';
          ctx.lineWidth = 1.8;
          ctx.moveTo(localStartX, yBot);
          ctx.lineTo(localEndX, yBot);
          ctx.stroke();
          ctx.setLineDash([]);

          const labelText = `TFDR 15 黃金底 (${lastTfdr.band15})`;
          ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
          const textW = ctx.measureText(labelText).width;
          const boxW = textW + 10;
          const boxH = 16;
          const boxX = localEndX - boxW - 4;
          const boxY = Math.max(margin.top + 2, Math.min(margin.top + plotH - boxH - 2, yBot + 3));

          ctx.fillStyle = 'rgba(6, 78, 59, 0.78)';
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.75)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(boxX, boxY, boxW, boxH, 3);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#a7f3d0';
          ctx.textAlign = 'center';
          ctx.fillText(labelText, boxX + boxW / 2, boxY + 11.5);
        }
        ctx.restore();
      }
    } else {
      // TFDR 模式：(c) 在高位(score >= 90)標出「奇點沽」，低位(score <= 20 或 low <= band15)對稱標出「奇點買」
      let lastHighSingularityX = -999;
      tfdrTurningPoints.highs.forEach(tp => {
        if (tp.index >= startIdx && tp.index <= endIdx) {
          const x = getX(tp.index - startIdx);
          if (x - lastHighSingularityX < 36) return;
          lastHighSingularityX = x;

          const arrowTipY = getY(tp.price) - 4;
          ctx.beginPath();
          ctx.moveTo(x, arrowTipY);
          ctx.lineTo(x - 6, arrowTipY - 9);
          ctx.lineTo(x + 6, arrowTipY - 9);
          ctx.closePath();
          ctx.fillStyle = '#ef4444';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 0.8;
          ctx.stroke();

          const label = formatShortSignalLabel('HIGH', true);
          ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
          const tw = ctx.measureText(label).width;
          const bw = tw + 10;
          const bh = 17;
          const bx = Math.max(margin.left + 2, Math.min(margin.left + plotW - bw - 2, x - bw / 2));
          const by = Math.max(margin.top + 2, arrowTipY - 12 - bh);

          ctx.fillStyle = 'rgba(127, 29, 29, 0.92)';
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(bx, by, bw, bh, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#fee2e2';
          ctx.textAlign = 'center';
          ctx.fillText(label, bx + bw / 2, by + 12);
        }
      });

      let lastLowSingularityX = -999;
      tfdrTurningPoints.lows.forEach(tp => {
        if (tp.index >= startIdx && tp.index <= endIdx) {
          const x = getX(tp.index - startIdx);
          if (x - lastLowSingularityX < 36) return;
          lastLowSingularityX = x;

          const arrowTipY = getY(tp.price) + 4;
          ctx.beginPath();
          ctx.moveTo(x, arrowTipY);
          ctx.lineTo(x - 6, arrowTipY + 9);
          ctx.lineTo(x + 6, arrowTipY + 9);
          ctx.closePath();
          ctx.fillStyle = '#10b981';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 0.8;
          ctx.stroke();

          const label = formatShortSignalLabel('LOW', true);
          ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
          const tw = ctx.measureText(label).width;
          const bw = tw + 10;
          const bh = 17;
          const bx = Math.max(margin.left + 2, Math.min(margin.left + plotW - bw - 2, x - bw / 2));
          const by = Math.min(margin.top + plotH - bh - 2, arrowTipY + 12);

          ctx.fillStyle = 'rgba(6, 78, 59, 0.92)';
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(bx, by, bw, bh, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#d1fae5';
          ctx.textAlign = 'center';
          ctx.fillText(label, bx + bw / 2, by + 12);
        }
      });
    }

    // 9. Interactive Crosshair & Tooltip
    if (mousePos && mousePos.x >= margin.left && mousePos.x <= margin.left + plotW) {
      const relX = mousePos.x - margin.left;
      const hoveredBarIdx = Math.min(visibleBars.length - 1, Math.max(0, Math.floor(relX / stepX)));
      const hoveredBar = visibleBars[hoveredBarIdx];
      const hoveredTfdr = visibleTfdr[hoveredBarIdx];
      const hX = getX(hoveredBarIdx);

      // Vertical line
      ctx.beginPath();
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = '#555555';
      ctx.lineWidth = 1;
      ctx.moveTo(hX, margin.top);
      ctx.lineTo(hX, margin.top + plotH);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(margin.left, mousePos.y);
      ctx.lineTo(margin.left + plotW, mousePos.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Floating Info Pill in top right (避免與左上角 PiP 拼圖小窗重疊)
      const tfdrInfo = hoveredTfdr ? ` | TFDR:${hoveredTfdr.score}` : '';
      const infoText = `${hoveredBar.date?.split(' ')[0]} | O:${hoveredBar.o} H:${hoveredBar.h} L:${hoveredBar.l} C:${hoveredBar.c}${tfdrInfo}`;
      ctx.font = '11px monospace';
      const boxW = Math.min(plotW - 16, Math.max(300, ctx.measureText(infoText).width + 20));
      const boxX = margin.left + plotW - boxW - 8;

      ctx.fillStyle = 'rgba(17, 24, 39, 0.92)';
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(boxX, margin.top + 6, boxW, 26, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.fillText(infoText, boxX + 8, margin.top + 23);

      // Price Tag on Right Axis
      const hoverPrice = maxPrice - ((mousePos.y - margin.top) / plotH) * (maxPrice - minPrice);
      ctx.fillStyle = '#6366f1';
      ctx.fillRect(width - margin.right + 2, mousePos.y - 8, margin.right - 4, 16);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(hoverPrice.toFixed(2), width - margin.right + 6, mousePos.y + 4);
    }

    ctx.restore();
  }, [
    activeData,
    viewRange,
    boxMarkers,
    hologramLine,
    mousePos,
    tfdrSeries,
    tfdrTurningPoints,
    chartMode,
    formatShortSignalLabel
  ]);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      drawChart();
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawChart]);

  // Re-render when data updates
  useEffect(() => {
    drawChart();
  }, [drawChart]);

  // 共用視口平移計算函數：保證可自由滑動回溯到第 0 根歷史 K 線
  const applyPanOffset = useCallback(
    (dx: number, startIdxBase: number, endIdxBase: number, containerWidth: number) => {
      if (activeData.length === 0) return;
      const plotWidth = Math.max(100, containerWidth - 75);
      const rangeLen = endIdxBase - startIdxBase + 1;
      const sensitivity = rangeLen / plotWidth;
      const deltaBars = Math.round(-dx * sensitivity);

      let newStart = startIdxBase + deltaBars;
      let newEnd = endIdxBase + deltaBars;

      if (newStart < 0) {
        newEnd -= newStart;
        newStart = 0;
      }
      if (newEnd >= activeData.length) {
        const overshoot = newEnd - (activeData.length - 1);
        newStart = Math.max(0, newStart - overshoot);
        newEnd = activeData.length - 1;
      }

      setViewRange({ start: newStart, end: newEnd });
    },
    [activeData.length]
  );

  // 全局 mouseup / touchend 監聽，防止滑鼠移出畫布外鬆開導致卡住
  useEffect(() => {
    const handleGlobalEnd = () => {
      isDraggingRef.current = false;
      isSliderDraggingRef.current = false;
      pinchStartRef.current = null;
    };
    window.addEventListener('mouseup', handleGlobalEnd);
    window.addEventListener('touchend', handleGlobalEnd);
    return () => {
      window.removeEventListener('mouseup', handleGlobalEnd);
      window.removeEventListener('touchend', handleGlobalEnd);
    };
  }, []);

  // Mouse wheel Zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!viewRange || activeData.length === 0) return;

    const zoomFactor = e.deltaY > 0 ? 1.15 : 0.85;
    const currentLen = viewRange.end - viewRange.start + 1;
    const newLen = Math.max(15, Math.min(activeData.length, Math.round(currentLen * zoomFactor)));

    const center = Math.round((viewRange.start + viewRange.end) / 2);
    let newStart = Math.max(0, center - Math.floor(newLen / 2));
    let newEnd = newStart + newLen - 1;

    if (newEnd >= activeData.length) {
      newEnd = activeData.length - 1;
      newStart = Math.max(0, newEnd - newLen + 1);
    }

    setViewRange({ start: newStart, end: newEnd });
  };

  // Mouse Drag / Pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!viewRange) return;
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      startIdx: viewRange.start,
      endIdx: viewRange.end
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y });

    if (isDraggingRef.current && viewRange) {
      const dx = e.clientX - dragStartRef.current.x;
      applyPanOffset(dx, dragStartRef.current.startIdx, dragStartRef.current.endIdx, rect.width);
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleMouseLeave = () => {
    setMousePos(null);
  };

  // Single-finger Touch Pan + Two-finger Pinch Zoom
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!viewRange || activeData.length === 0) return;

    if (e.touches.length === 1) {
      isDraggingRef.current = true;
      pinchStartRef.current = null;
      dragStartRef.current = {
        x: e.touches[0].clientX,
        startIdx: viewRange.start,
        endIdx: viewRange.end
      };

      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        setMousePos({
          x: e.touches[0].clientX - rect.left,
          y: e.touches[0].clientY - rect.top
        });
      }
    } else if (e.touches.length === 2) {
      isDraggingRef.current = false;
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchStartRef.current = {
        dist: Math.max(1, dist),
        startIdx: viewRange.start,
        endIdx: viewRange.end
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || activeData.length === 0) return;
    const rect = canvas.getBoundingClientRect();

    if (e.touches.length === 1 && isDraggingRef.current) {
      const touchX = e.touches[0].clientX;
      const dx = touchX - dragStartRef.current.x;
      applyPanOffset(dx, dragStartRef.current.startIdx, dragStartRef.current.endIdx, rect.width);
      setMousePos({
        x: touchX - rect.left,
        y: e.touches[0].clientY - rect.top
      });
    } else if (e.touches.length === 2 && pinchStartRef.current) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scale = pinchStartRef.current.dist / Math.max(1, dist);
      const origLen = pinchStartRef.current.endIdx - pinchStartRef.current.startIdx + 1;
      const newLen = Math.max(15, Math.min(activeData.length, Math.round(origLen * scale)));
      const center = Math.round((pinchStartRef.current.startIdx + pinchStartRef.current.endIdx) / 2);

      let newStart = Math.max(0, center - Math.floor(newLen / 2));
      let newEnd = newStart + newLen - 1;
      if (newEnd >= activeData.length) {
        newEnd = activeData.length - 1;
        newStart = Math.max(0, newEnd - newLen + 1);
      }
      setViewRange({ start: newStart, end: newEnd });
    }
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
    pinchStartRef.current = null;
  };

  // 底部歷史時間軸滑塊拖拽（快速跳轉過往所有年份）
  const updateRangeFromSliderClientX = useCallback(
    (clientX: number, isThumbDrag: boolean) => {
      const track = sliderTrackRef.current;
      if (!track || !viewRange || activeData.length === 0) return null;
      const rect = track.getBoundingClientRect();
      const rangeLen = viewRange.end - viewRange.start + 1;

      if (isThumbDrag) {
        const dx = clientX - sliderDragStartRef.current.x;
        const deltaBars = Math.round((dx / Math.max(1, rect.width)) * activeData.length);
        let newStart = sliderDragStartRef.current.startIdx + deltaBars;
        let newEnd = sliderDragStartRef.current.endIdx + deltaBars;
        if (newStart < 0) {
          newEnd -= newStart;
          newStart = 0;
        }
        if (newEnd >= activeData.length) {
          const overshoot = newEnd - (activeData.length - 1);
          newStart = Math.max(0, newStart - overshoot);
          newEnd = activeData.length - 1;
        }
        setViewRange({ start: newStart, end: newEnd });
        return { start: newStart, end: newEnd };
      } else {
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
        const targetCenter = Math.round(ratio * (activeData.length - 1));
        let newStart = Math.max(0, targetCenter - Math.floor(rangeLen / 2));
        let newEnd = newStart + rangeLen - 1;
        if (newEnd >= activeData.length) {
          newEnd = activeData.length - 1;
          newStart = Math.max(0, newEnd - rangeLen + 1);
        }
        setViewRange({ start: newStart, end: newEnd });
        return { start: newStart, end: newEnd };
      }
    },
    [viewRange, activeData.length]
  );

  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (isSliderDraggingRef.current) {
        updateRangeFromSliderClientX(e.clientX, true);
      } else if (isDraggingRef.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const dx = e.clientX - dragStartRef.current.x;
        applyPanOffset(dx, dragStartRef.current.startIdx, dragStartRef.current.endIdx, rect.width);
      }
    };
    const handleWindowTouchMove = (e: TouchEvent) => {
      if (isSliderDraggingRef.current && e.touches.length === 1) {
        updateRangeFromSliderClientX(e.touches[0].clientX, true);
      }
    };
    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('touchmove', handleWindowTouchMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('touchmove', handleWindowTouchMove);
    };
  }, [updateRangeFromSliderClientX, applyPanOffset]);

  // Zoom controls
  const zoomIn = () => {
    if (!viewRange) return;
    const currentLen = viewRange.end - viewRange.start + 1;
    const newLen = Math.max(15, Math.round(currentLen * 0.75));
    const newStart = Math.max(0, viewRange.end - newLen + 1);
    setViewRange({ start: newStart, end: viewRange.end });
  };

  const zoomOut = () => {
    if (!viewRange) return;
    const currentLen = viewRange.end - viewRange.start + 1;
    const newLen = Math.min(activeData.length, Math.round(currentLen * 1.35));
    const newStart = Math.max(0, viewRange.end - newLen + 1);
    setViewRange({ start: newStart, end: viewRange.end });
  };

  const resetZoom = () => {
    if (activeData.length === 0) return;
    const defaultBars =
      activeData.length <= 80
        ? activeData.length
        : Math.max(80, Math.min(350, Math.round(activeData.length * 0.35)));
    setViewRange({
      start: Math.max(0, activeData.length - defaultBars),
      end: activeData.length - 1
    });
  };

  const showAll = () => {
    if (activeData.length === 0) return;
    setViewRange({
      start: 0,
      end: activeData.length - 1
    });
  };

  // 滑塊可視區百分比與日期區間顯示
  const sliderMetrics = useMemo(() => {
    if (!viewRange || activeData.length === 0) {
      return { leftPct: 0, widthPct: 100, startDate: '--', endDate: '--' };
    }
    const total = activeData.length;
    const leftPct = (viewRange.start / total) * 100;
    const widthPct = Math.max(4, ((viewRange.end - viewRange.start + 1) / total) * 100);
    const startDate = activeData[viewRange.start]?.date?.split(' ')[0] || '--';
    const endDate = activeData[viewRange.end]?.date?.split(' ')[0] || '--';
    return { leftPct, widthPct, startDate, endDate };
  }, [viewRange, activeData]);

  return (
    <div className="w-full bg-[#111] rounded-lg mb-1 relative border border-[#333] overflow-hidden flex flex-col">
      {/* Top Mode Banner & Switch Toolbar */}
      <div className="px-3 py-1.5 bg-[#0d0d12] border-b border-[#222] flex items-center justify-between gap-2 flex-wrap select-none">
        <div className="text-xs text-gray-300 font-medium">
          {chartMode === 'CLASSIC'
            ? '目前顯示：1836.15 數律共振 + 強支強阻'
            : '目前顯示：TFDR 6 軌動態奇點通道 (95/90/85 頂帶 · 25/15/10 底帶)'}
        </div>
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={showAll}
              className="px-1.5 py-0.5 bg-[#222] hover:bg-[#333] rounded text-[10px] text-gray-200 transition"
              title="查看完整歷史全景"
            >
              全景
            </button>
            <button
              onClick={zoomIn}
              className="p-1 hover:bg-[#222] rounded text-gray-300 hover:text-white transition"
              title="放大"
            >
              <ZoomIn size={14} />
            </button>
            <button
              onClick={zoomOut}
              className="p-1 hover:bg-[#222] rounded text-gray-300 hover:text-white transition"
              title="縮小"
            >
              <ZoomOut size={14} />
            </button>
            <button
              onClick={resetZoom}
              className="p-1 hover:bg-[#222] rounded text-gray-300 hover:text-white transition"
              title="重置視角"
            >
              <RotateCcw size={14} />
            </button>
          </div>

          <button
            onClick={() => setChartMode(prev => (prev === 'CLASSIC' ? 'TFDR' : 'CLASSIC'))}
            className="px-3 py-1 text-xs font-bold rounded bg-indigo-600 hover:bg-indigo-500 text-white shadow transition-colors"
          >
            {chartMode === 'CLASSIC' ? '🔄 切換 TFDR 奇點通道' : '🔄 切回 傳統數律圖'}
          </button>
        </div>
      </div>

      {/* Legend Bar */}
      <div className="px-3 py-1 bg-[#0a0a0a] border-b border-[#1c1c1c] flex items-center justify-between text-[11px] text-gray-400 select-none flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1 font-bold text-white">
            <span className="w-2.5 h-2.5 inline-block bg-[#10b981] rounded-xs"></span> 陽線
          </span>
          <span className="flex items-center gap-1 font-bold text-white">
            <span className="w-2.5 h-2.5 inline-block bg-[#ef4444] rounded-xs"></span> 陰線
          </span>
          {chartMode === 'CLASSIC' ? (
            <>
              <span className="flex items-center gap-1 text-[#8b5cf6] font-bold">
                <span className="w-3 h-0.5 inline-block bg-[#8b5cf6]"></span> 核心線
              </span>
              <span className="flex items-center gap-1 text-[#10b981]">
                <span className="w-3 h-0.5 inline-block border-b border-dashed border-[#10b981]"></span> 強支
              </span>
              <span className="flex items-center gap-1 text-[#f59e0b]">
                <span className="w-3 h-0.5 inline-block border-b border-dashed border-[#f59e0b]"></span> 強阻
              </span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1 text-[#ef4444] font-bold">
                <span className="w-3 h-0.5 inline-block bg-[#ef4444]"></span> 95極頂
              </span>
              <span className="flex items-center gap-1 text-[#f87171]">
                <span className="w-3 h-0.5 inline-block border-b border-dashed border-[#f87171]"></span> 90危險
              </span>
              <span className="flex items-center gap-1 text-[#fca5a5]">
                <span className="w-3 h-0.5 inline-block border-b border-dotted border-[#fca5a5]"></span> 85警戒
              </span>
              <span className="flex items-center gap-1 text-[#86efac]">
                <span className="w-3 h-0.5 inline-block border-b border-dotted border-[#86efac]"></span> 25觀察
              </span>
              <span className="flex items-center gap-1 text-[#4ade80]">
                <span className="w-3 h-0.5 inline-block border-b border-dashed border-[#4ade80]"></span> 15黃金底
              </span>
              <span className="flex items-center gap-1 text-[#22c55e] font-bold">
                <span className="w-3 h-0.5 inline-block bg-[#22c55e]"></span> 10極底
              </span>
              <span className="text-[#10b981]">▲ 奇點買</span>
              <span className="text-[#ef4444]">▼ 奇點沽</span>
            </>
          )}
        </div>
        <div className="text-[10px] text-gray-500 font-mono">
          區間：{sliderMetrics.startDate} ~ {sliderMetrics.endDate}
        </div>
      </div>

      {/* Main Canvas Container (單指觸控/滑鼠按住左右拖動全歷史平移) */}
      <div
        ref={containerRef}
        className="relative w-full h-[320px] md:h-[350px] bg-black cursor-grab active:cursor-grabbing touch-none"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/* 左上角：四維拼圖畫中畫 (PiP) 半透明磨砂小窗（自帶收合/展開按鈕，手機版預設收合） */}
        {puzzleState && (
          <div
            className="absolute top-2 left-2 z-20 max-w-[92vw] sm:max-w-[360px] bg-slate-950/75 backdrop-blur-md border border-slate-700/75 rounded-lg shadow-xl text-[10px] text-slate-200 select-none"
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            <div className="px-2 py-1 flex items-center justify-between gap-2 border-b border-slate-800/80">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-bold text-amber-300 truncate">
                  🧩 {puzzleState.symbol} 四維拼圖
                </span>
                <span className="font-mono text-[9.5px] text-slate-400">
                  {puzzleState.signalDate}
                </span>
                {!pipExpanded && (
                  <div className="flex items-center gap-1 ml-0.5">
                    {(
                      [
                        ['Q', puzzleState.timeframes.Q],
                        ['M', puzzleState.timeframes.M],
                        ['W', puzzleState.timeframes.W],
                        ['D', puzzleState.timeframes.D]
                      ] as const
                    ).map(([label, tf]) => {
                      const dotColor = !tf.sampleOK
                        ? 'bg-amber-400'
                        : tf.haBull
                        ? 'bg-emerald-400'
                        : 'bg-red-400';
                      return (
                        <span
                          key={label}
                          className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded bg-slate-900/90 text-[9px] font-mono"
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                          {label}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPipExpanded(prev => !prev)}
                className="px-1.5 py-0.5 rounded bg-slate-800/90 hover:bg-slate-700 text-slate-200 flex items-center gap-0.5 text-[9.5px] font-semibold shrink-0 transition"
                title={pipExpanded ? '收合四維拼圖小窗' : '展開四維拼圖小窗'}
              >
                {pipExpanded ? (
                  <>
                    收合 <ChevronUp size={11} />
                  </>
                ) : (
                  <>
                    展開 <ChevronDown size={11} />
                  </>
                )}
              </button>
            </div>

            {pipExpanded && (
              <div className="p-2 space-y-1.5">
                <div className="grid grid-cols-4 gap-1">
                  {(
                    [
                      ['季Q', puzzleState.timeframes.Q],
                      ['月M', puzzleState.timeframes.M],
                      ['週W', puzzleState.timeframes.W],
                      ['日D', puzzleState.timeframes.D]
                    ] as const
                  ).map(([label, tf]) => {
                    const dotColor = !tf.sampleOK
                      ? 'bg-amber-400 shadow-[0_0_5px_rgba(251,191,36,0.8)]'
                      : tf.haBull
                      ? 'bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.8)]'
                      : 'bg-red-400 shadow-[0_0_5px_rgba(248,113,113,0.8)]';
                    const scoreColor =
                      tf.tfdr >= 82
                        ? 'text-red-400'
                        : tf.tfdr <= 22
                        ? 'text-emerald-400'
                        : 'text-slate-100';

                    return (
                      <div
                        key={label}
                        className="px-1.5 py-1 rounded bg-slate-900/85 border border-slate-800/90 text-center"
                      >
                        <div className="flex items-center justify-center gap-1 text-[9.5px] text-slate-300 font-semibold">
                          <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                          <span>{label}</span>
                        </div>
                        <div className={`font-mono font-bold text-[10.5px] ${scoreColor}`}>
                          {tf.tfdr}
                        </div>
                        <div className="font-mono text-[8.5px] text-slate-400">
                          ${tf.midline}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[9.5px] font-mono pt-1 border-t border-slate-800/80">
                  <span className="text-emerald-400">
                    🟢 買 ${puzzleState.levels.buyZone.low}–${puzzleState.levels.buyZone.high}
                  </span>
                  <span className="text-red-400">
                    🔴 拋 ${puzzleState.levels.takeProfitZone.low}–${puzzleState.levels.takeProfitZone.high}
                  </span>
                  <span className="text-amber-300">
                    🛑 失效 ${puzzleState.levels.invalidationPrice}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Loading Overlay */}
        {(isLoading || activeData.length === 0) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/75 pointer-events-none">
            <div className="text-[#ffd700] text-xs font-semibold px-4 py-2 rounded bg-black/90 border border-[#333] shadow-lg animate-pulse">
              {loadingMessage || '⚡ 系統就緒，請輸入代碼啟動分析'}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Interactive Historical Timeline Slider */}
      {activeData.length > 0 && (
        <div className="px-3 py-1.5 bg-[#09090d] border-t border-[#1e1e24] select-none">
          <div
            ref={sliderTrackRef}
            className="relative w-full h-4 bg-[#18181f] rounded border border-[#2a2a35] cursor-pointer touch-none"
            onMouseDown={(e) => {
              if (!viewRange) return;
              isSliderDraggingRef.current = true;
              const jumped = updateRangeFromSliderClientX(e.clientX, false);
              sliderDragStartRef.current = {
                x: e.clientX,
                startIdx: jumped ? jumped.start : viewRange.start,
                endIdx: jumped ? jumped.end : viewRange.end
              };
            }}
            onTouchStart={(e) => {
              if (!viewRange || e.touches.length !== 1) return;
              isSliderDraggingRef.current = true;
              const jumped = updateRangeFromSliderClientX(e.touches[0].clientX, false);
              sliderDragStartRef.current = {
                x: e.touches[0].clientX,
                startIdx: jumped ? jumped.start : viewRange.start,
                endIdx: jumped ? jumped.end : viewRange.end
              };
            }}
          >
            <div
              className="absolute top-0 bottom-0 bg-indigo-500/35 border border-indigo-400/70 rounded cursor-ew-resize"
              style={{
                left: `${sliderMetrics.leftPct}%`,
                width: `${sliderMetrics.widthPct}%`
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                if (!viewRange) return;
                isSliderDraggingRef.current = true;
                sliderDragStartRef.current = {
                  x: e.clientX,
                  startIdx: viewRange.start,
                  endIdx: viewRange.end
                };
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                if (!viewRange || e.touches.length !== 1) return;
                isSliderDraggingRef.current = true;
                sliderDragStartRef.current = {
                  x: e.touches[0].clientX,
                  startIdx: viewRange.start,
                  endIdx: viewRange.end
                };
              }}
            />
          </div>
        </div>
      )}

      {/* Bottom Zoom Tip */}
      <div className="py-1 text-center text-[#666] text-[10px] bg-[#0a0a0a] border-t border-[#1a1a1a]">
        滾輪/雙指縮放 | 單指或滑鼠按住左右拖動回溯歷史 | 可拖動下方時間軸跳轉年份
      </div>
    </div>
  );
};
