import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { ModelBar } from '../types/quant';
import { getGuiYuan, calculateDynamicReversals } from '../services/quantCalculations';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

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
}

export const HeaderChart: React.FC<HeaderChartProps> = ({
  data,
  isLoading,
  loadingMessage,
  isReplay,
  replayIndex,
  hologramLine = [],
  onBarClick,
  timeframe = '1d',
  supportLevels = [],
  resistanceLevels = []
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const miniCanvasRef = useRef<HTMLCanvasElement>(null);

  // Viewport / zoom / pan state
  const [viewRange, setViewRange] = useState<{ start: number; end: number } | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; startIdx: number; endIdx: number }>({ x: 0, startIdx: 0, endIdx: 0 });

  // Slice data based on replay
  const activeData = useMemo(() => {
    if (data.length === 0) return [];
    if (isReplay) {
      return data.slice(0, Math.min(replayIndex + 1, data.length));
    }
    return data;
  }, [data, isReplay, replayIndex]);

  // Reset or adjust viewRange on data changes
  useEffect(() => {
    if (activeData.length > 0) {
      const defaultBars = Math.min(250, activeData.length);
      setViewRange({
        start: Math.max(0, activeData.length - defaultBars),
        end: activeData.length - 1
      });
    } else {
      setViewRange(null);
    }
  }, [activeData.length]);

  // 核心大改：完全抽離 UI 密集計算，以 useMemo 調用量化服務層 calculateDynamicReversals
  // 依據 activeData、timeframe、支撐阻力線緩存，解決圖表拖拽卡頓並自適應各週期視窗
  const boxMarkers = useMemo(() => {
    return calculateDynamicReversals(activeData, timeframe, supportLevels, resistanceLevels);
  }, [activeData, timeframe, supportLevels, resistanceLevels]);

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
    const endIdx = Math.min(activeData.length - 1, viewRange?.end ?? (activeData.length - 1));
    const visibleBars = activeData.slice(startIdx, endIdx + 1);

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

    // Also consider core line, support & resistance within visible range
    visibleBars.forEach(b => {
      if (b.supportLine1 > 0) minPrice = Math.min(minPrice, b.supportLine1 * 0.99);
      if (b.resistanceLine > 0) maxPrice = Math.max(maxPrice, b.resistanceLine * 1.01);
      if (b.coreGravityLine > 0 && Math.abs(b.coreGravityLine - b.c) / b.c < 0.4) {
        minPrice = Math.min(minPrice, b.coreGravityLine * 0.99);
        maxPrice = Math.max(maxPrice, b.coreGravityLine * 1.01);
      }
    });

    // Add padding to price range
    const priceRange = maxPrice - minPrice || 1;
    minPrice -= priceRange * 0.05;
    maxPrice += priceRange * 0.05;

    const getY = (price: number) => {
      return margin.top + plotH - ((price - minPrice) / (maxPrice - minPrice)) * plotH;
    };

    const barWidth = Math.max(2, (plotW / visibleBars.length) * 0.7);
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

    // 2. 1836.15 Scaled Core Gravity Line
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
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 3. Dynamic Strong Support (Green dashed)
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    visibleBars.forEach((bar, i) => {
      const x = getX(i);
      const y = getY(bar.supportLine1);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 4. Dynamic Resistance (Orange dashed)
    ctx.beginPath();
    visibleBars.forEach((bar, i) => {
      const x = getX(i);
      const y = getY(bar.resistanceLine);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]); // Reset line dash

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

      // Date ticks across multi-year timeline (2024, 2025, 2026)
      if (i % Math.max(1, Math.floor(visibleBars.length / 8)) === 0) {
        ctx.fillStyle = '#888888';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        const rawDate = (bar.date || '').split(' ')[0];
        // Display format like "2024-05" or "2025-10" or "2026-03"
        const dateLabel = rawDate.length >= 7 ? rawDate.slice(0, 7) : rawDate;
        ctx.fillText(dateLabel, x, height - 8);
      }
    });

    // 6. 神奇九轉 High / Low Box Markers (天花板與地板價對稱標註)
    boxMarkers.highs.forEach(marker => {
      if (marker.index >= startIdx && marker.index <= endIdx) {
        const i = marker.index - startIdx;
        const x = getX(i);
        const y = getY(marker.price);
        const isStrong = marker.isStrong;
        const labelText = marker.label || '天花板';
        ctx.font = 'bold 8.5px sans-serif';
        const tw = ctx.measureText(labelText).width;
        const bw = Math.max(28, tw + 8);
        const bh = 14;
        ctx.strokeStyle = isStrong ? '#f87171' : '#ef4444';
        ctx.lineWidth = isStrong ? 1.6 : 1.2;
        ctx.fillStyle = isStrong ? 'rgba(239, 68, 68, 0.35)' : 'rgba(239, 68, 68, 0.2)';
        ctx.beginPath();
        ctx.roundRect(x - bw / 2, y - bh - 3, bw, bh, 3);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fee2e2';
        ctx.textAlign = 'center';
        ctx.fillText(labelText, x, y - 6);
      }
    });

    boxMarkers.lows.forEach(marker => {
      if (marker.index >= startIdx && marker.index <= endIdx) {
        const i = marker.index - startIdx;
        const x = getX(i);
        const y = getY(marker.price);
        const isStrong = marker.isStrong;
        const labelText = marker.label || '地板價';
        ctx.font = 'bold 8.5px sans-serif';
        const tw = ctx.measureText(labelText).width;
        const bw = Math.max(28, tw + 8);
        const bh = 14;
        ctx.strokeStyle = isStrong ? '#34d399' : '#10b981';
        ctx.lineWidth = isStrong ? 1.6 : 1.2;
        ctx.fillStyle = isStrong ? 'rgba(16, 185, 129, 0.35)' : 'rgba(16, 185, 129, 0.2)';
        ctx.beginPath();
        ctx.roundRect(x - bw / 2, y + 3, bw, bh, 3);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#d1fae5';
        ctx.textAlign = 'center';
        ctx.fillText(labelText, x, y + 13);
      }
    });

    // 7. Buy & Sell Enhanced Signals (對標主流股票 App: 14px 方向大箭頭 + ATR 波動率自適應偏離度 + 醒目標籤)
    visibleBars.forEach((bar, i) => {
      const x = getX(i);
      const isStrongBuy = bar.buySignal || bar.reversalSignal === 'STRONG_BUY';
      const isCriticalSell = bar.sellSignal || bar.reversalSignal === 'CRITICAL_SELL';

      // 依據 ATR 波動率計算自適應垂直偏離度，防止標註遮擋 K 線燭身
      const atrValue = bar.atr || (bar.c * 0.02);
      const atrPixelHeight = (atrValue / priceRange) * plotH;
      const safeOffset = Math.max(22, Math.min(50, atrPixelHeight * 1.2));

      // 【地板強支撐低位標籤】🔥 強支撐低位
      if (isStrongBuy) {
        const arrowTipY = getY(bar.l) + 4;
        const badgeCenterY = getY(bar.l) + safeOffset + 6;

        // 向上綠色箭頭 (14px)
        ctx.beginPath();
        ctx.moveTo(x, arrowTipY);
        ctx.lineTo(x - 7, arrowTipY + 10);
        ctx.lineTo(x + 7, arrowTipY + 10);
        ctx.closePath();
        ctx.fillStyle = '#00ff7f';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();

        // 放大低位醒目標籤 (解決低位信號過小問題)
        const text = `🔥 強支撐低位 $${bar.c.toFixed(1)}`;
        ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
        const textWidth = ctx.measureText(text).width;
        const badgeW = textWidth + 12;
        const badgeH = 19;
        const badgeX = Math.max(margin.left + 2, Math.min(width - margin.right - badgeW - 2, x - badgeW / 2));
        const badgeY = badgeCenterY - 9;

        ctx.fillStyle = 'rgba(6, 78, 59, 0.95)';
        ctx.strokeStyle = '#00ff7f';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(text, badgeX + badgeW / 2, badgeY + 13);
      }

      // 【天花板阻力高位標籤】⚡ 阻力高位
      if (isCriticalSell) {
        const arrowTipY = getY(bar.h) - 4;
        const badgeCenterY = getY(bar.h) - safeOffset - 6;

        // 向下紅色箭頭 (14px)
        ctx.beginPath();
        ctx.moveTo(x, arrowTipY);
        ctx.lineTo(x - 7, arrowTipY - 10);
        ctx.lineTo(x + 7, arrowTipY - 10);
        ctx.closePath();
        ctx.fillStyle = '#ff4500';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();

        // 阻力高位醒目標籤
        const text = `⚡ 阻力高位 $${bar.c.toFixed(1)}`;
        ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
        const textWidth = ctx.measureText(text).width;
        const badgeW = textWidth + 12;
        const badgeH = 19;
        const badgeX = Math.max(margin.left + 2, Math.min(width - margin.right - badgeW - 2, x - badgeW / 2));
        const badgeY = badgeCenterY - 9;

        ctx.fillStyle = 'rgba(127, 29, 29, 0.95)';
        ctx.strokeStyle = '#ff4500';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(text, badgeX + badgeW / 2, badgeY + 13);
      }
    });

    // 8. Fourier Hologram Prediction Line
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

    // 9. Interactive Crosshair & Tooltip
    if (mousePos && mousePos.x >= margin.left && mousePos.x <= margin.left + plotW) {
      const relX = mousePos.x - margin.left;
      const hoveredBarIdx = Math.min(visibleBars.length - 1, Math.max(0, Math.floor(relX / stepX)));
      const hoveredBar = visibleBars[hoveredBarIdx];
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

      // Floating Info Pill in top left
      ctx.fillStyle = 'rgba(17, 24, 39, 0.9)';
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(margin.left + 8, margin.top + 6, 320, 26, 4);
      ctx.fill();
      ctx.stroke();

      ctx.font = '11px monospace';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      const change = hoveredBar.c - hoveredBar.o;
      const changePct = ((change / hoveredBar.o) * 100).toFixed(2);
      const changeColor = change >= 0 ? '#10b981' : '#ef4444';

      ctx.fillText(
        `${hoveredBar.date?.split(' ')[0]} | O:${hoveredBar.o} H:${hoveredBar.h} L:${hoveredBar.l} C:${hoveredBar.c}`,
        margin.left + 14,
        margin.top + 23
      );

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
  }, [activeData, viewRange, boxMarkers, hologramLine, mousePos]);

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
      const rangeLen = viewRange.end - viewRange.start + 1;
      const sensitivity = rangeLen / rect.width;
      const deltaBars = Math.round(-dx * sensitivity);

      let newStart = dragStartRef.current.startIdx + deltaBars;
      let newEnd = dragStartRef.current.endIdx + deltaBars;

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
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleMouseLeave = () => {
    isDraggingRef.current = false;
    setMousePos(null);
  };

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
    const defaultBars = Math.min(350, activeData.length);
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

  return (
    <div className="w-full bg-[#111] rounded-lg mb-1 relative border border-[#333] overflow-hidden flex flex-col">
      {/* Top Legend Bar */}
      <div className="px-3 py-1.5 bg-[#0a0a0a] border-b border-[#222] flex items-center justify-between text-[11px] text-gray-400 select-none">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1 font-bold text-white">
            <span className="w-2.5 h-2.5 inline-block bg-[#10b981] rounded-xs"></span> 陽線
          </span>
          <span className="flex items-center gap-1 font-bold text-white">
            <span className="w-2.5 h-2.5 inline-block bg-[#ef4444] rounded-xs"></span> 陰線
          </span>
          <span className="flex items-center gap-1 text-[#8b5cf6] font-bold">
            <span className="w-3 h-0.5 inline-block bg-[#8b5cf6]"></span> 1836.15核心線
          </span>
          <span className="flex items-center gap-1 text-[#10b981]">
            <span className="w-3 h-0.5 inline-block border-b border-dashed border-[#10b981]"></span> 強支撐
          </span>
          <span className="flex items-center gap-1 text-[#f59e0b]">
            <span className="w-3 h-0.5 inline-block border-b border-dashed border-[#f59e0b]"></span> 動態阻力
          </span>
          <span className="flex items-center gap-1 text-[#00ff00]">▲ 買入</span>
          <span className="flex items-center gap-1 text-[#ef4444]">▼ 賣出</span>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1 z-10">
          <button
            onClick={showAll}
            className="px-1.5 py-0.5 bg-[#222] hover:bg-[#333] rounded text-[10px] text-gray-200 transition"
            title="查看完整10-20年歷史全景"
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
      </div>

      {/* Main Canvas Container */}
      <div
        ref={containerRef}
        className="relative w-full h-[320px] md:h-[350px] bg-black cursor-crosshair"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/* Loading Overlay */}
        {(isLoading || activeData.length === 0) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/75 pointer-events-none">
            <div className="text-[#ffd700] text-xs font-semibold px-4 py-2 rounded bg-black/90 border border-[#333] shadow-lg animate-pulse">
              {loadingMessage || '⚡ 系統就緒，請輸入代碼啟動分析'}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Zoom Tip */}
      <div className="py-1 text-center text-[#666] text-[10px] bg-[#0a0a0a] border-t border-[#1a1a1a]">
        滾輪縮放 | 按住拖拽平移 | 點擊「回放回測」觀看信號生成過程
      </div>
    </div>
  );
};
