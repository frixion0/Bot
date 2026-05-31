/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { ZoomIn, ZoomOut, ArrowLeft, ArrowRight, Activity } from 'lucide-react';
import { Candle, IndicatorValues, Signal } from '../types';

interface ScreenerChartProps {
  candles: Candle[];
  indicators: IndicatorValues[];
  signals: Signal[];
  selectedCandleIndex: number | null;
  onHoverCandle: (index: number | null) => void;
}

export const ScreenerChart: React.FC<ScreenerChartProps> = ({
  candles,
  indicators,
  signals,
  selectedCandleIndex,
  onHoverCandle,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 480 });
  const [zoomLevel, setZoomLevel] = useState<number>(60); // Number of candles to show
  const [scrollOffset, setScrollOffset] = useState<number>(0); // 0 means show latest candles

  // Dynamic sizing based on container element
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      setDimensions({
        width: Math.max(width, 400),
        height: Math.max(height, 420),
      });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (candles.length === 0) {
    return (
      <div className="flex h-96 items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/60 text-slate-400">
        <div className="text-center">
          <Activity className="mx-auto h-8 w-8 animate-pulse text-slate-500 mb-2" />
          <p>Awaiting chart data...</p>
        </div>
      </div>
    );
  }

  // Constrain zoom level (min 15 candles, max all available candles up to 300)
  const maxZoom = Math.min(candles.length, 300);
  const minZoom = 15;
  const currentZoom = Math.max(minZoom, Math.min(zoomLevel, maxZoom));

  // Constrain scroll offset
  const maxOffset = Math.max(0, candles.length - currentZoom);
  const currentOffset = Math.max(0, Math.min(scrollOffset, maxOffset));

  // Determine slice of candles to show (chronological order)
  // If offset is 0, we take latest candles: slice from (length - currentZoom) to length
  const startIndex = Math.max(0, candles.length - currentZoom - currentOffset);
  const endIndex = Math.min(candles.length, startIndex + currentZoom);
  
  const visibleCandles = candles.slice(startIndex, endIndex);
  const visibleIndicators = indicators.slice(startIndex, endIndex);

  // SVG configuration
  const width = dimensions.width;
  const height = dimensions.height;
  
  const paddingRight = 65; // Side for Y-axis price/indicator values
  const paddingLeft = 15;
  const paddingTop = 25;
  const paddingBottom = 25;
  const gap = 30; // Gap between Price chart and RSI chart

  const chartWidth = width - paddingLeft - paddingRight;
  const totalChartHeight = height - paddingTop - paddingBottom;
  
  // Upper panel (Price) takes 68% height, Lower panel (RSI) takes 32% height
  const priceChartHeight = totalChartHeight * 0.65;
  const rsiChartHeight = totalChartHeight * 0.35 - gap;
  
  const priceYStart = paddingTop;
  const priceYEnd = priceYStart + priceChartHeight;
  const rsiYStart = priceYEnd + gap;
  const rsiYEnd = rsiYStart + rsiChartHeight;

  // Find min & max price for the visible window, adding some margin
  let minPrice = Infinity;
  let maxPrice = -Infinity;
  for (const c of visibleCandles) {
    if (c.low < minPrice) minPrice = c.low;
    if (c.high > maxPrice) maxPrice = c.high;
  }
  const priceRange = maxPrice - minPrice;
  const priceMargin = priceRange * 0.08 || 1; // 8% padding
  const activeMinPrice = minPrice - priceMargin;
  const activeMaxPrice = maxPrice + priceMargin;

  // Map Price to Y coordinate
  const priceToY = (price: number) => {
    return priceYEnd - ((price - activeMinPrice) / (activeMaxPrice - activeMinPrice)) * priceChartHeight;
  };

  const yToPrice = (y: number) => {
    const raw = activeMinPrice + ((priceYEnd - y) / priceChartHeight) * (activeMaxPrice - activeMinPrice);
    return raw;
  };

  // Map RSI / Indicator to Y coordinate (0 to 100 range)
  const rsiToY = (rsi: number) => {
    return rsiYEnd - (rsi / 100) * rsiChartHeight;
  };

  // Map Index to X coordinate
  const indexToX = (localIndex: number) => {
    if (visibleCandles.length <= 1) return paddingLeft + chartWidth / 2;
    return paddingLeft + (localIndex / (visibleCandles.length - 1)) * chartWidth;
  };

  // X-axis mapping to candle index
  const xToCandleIndex = (x: number) => {
    const relativeX = x - paddingLeft;
    if (relativeX < 0) return startIndex;
    if (relativeX > chartWidth) return endIndex - 1;
    const pct = relativeX / chartWidth;
    const localIdx = Math.round(pct * (visibleCandles.length - 1));
    return Math.max(startIndex, Math.min(endIndex - 1, startIndex + localIdx));
  };

  // Calculate Candle dimensions
  const candleCellWidth = chartWidth / visibleCandles.length;
  const candleWickWidth = 1.2;
  const candleRealWidth = Math.max(2, candleCellWidth * 0.72);

  // Grid line values
  const priceGridLines: number[] = [];
  const gridStep = (activeMaxPrice - activeMinPrice) / 5;
  for (let i = 1; i <= 4; i++) {
    priceGridLines.push(activeMinPrice + i * gridStep);
  }

  // Formatting helper
  const formatPrice = (val: number) => val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatTime = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  };
  const formatDate = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  // Handle Drag Scroll or Touch
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (!containerRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const globalIdx = xToCandleIndex(x);
    onHoverCandle(globalIdx);
  };

  const handleMouseLeave = () => {
    onHoverCandle(null);
  };

  // Navigation handlers
  const handleZoomIn = () => setZoomLevel((z) => Math.max(minZoom, z - 10));
  const handleZoomOut = () => setZoomLevel((z) => Math.min(maxZoom, z + 10));
  const handleScrollLeft = () => setScrollOffset((o) => Math.min(maxOffset, o + Math.round(currentZoom / 3)));
  const handleScrollRight = () => setScrollOffset((o) => Math.max(0, o - Math.round(currentZoom / 3)));
  const handleScrollReset = () => setScrollOffset(0);

  // Highlight hovering info
  const hoverGlobalIdx = selectedCandleIndex;
  const isHovered = hoverGlobalIdx !== null && hoverGlobalIdx >= startIndex && hoverGlobalIdx < endIndex;
  const hoverLocalIdx = isHovered && hoverGlobalIdx !== null ? hoverGlobalIdx - startIndex : null;

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
      {/* Chart Top Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 items-center justify-center">
            <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
          </span>
          <h3 className="text-sm font-semibold text-slate-100 font-sans tracking-tight">
            XAUUSDT Candlestick Chart (3m)
          </h3>
          <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700">
            Binance Futures API
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleScrollLeft}
            disabled={currentOffset >= maxOffset}
            className="p-1 px-1.5 bg-slate-800 hover:bg-slate-705 border border-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed rounded text-xs flex items-center gap-0.5 transition"
            title="Scroll Back in History"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>History</span>
          </button>
          
          <button
            onClick={handleScrollRight}
            disabled={currentOffset === 0}
            className="p-1 px-1.5 bg-slate-800 hover:bg-slate-705 border border-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed rounded text-xs flex items-center gap-0.5 transition"
            title="Scroll Forward"
          >
            <span>Forward</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>

          {currentOffset > 0 && (
            <button
              onClick={handleScrollReset}
              className="p-1 px-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs rounded transition"
            >
              Go Live
            </button>
          )}

          <div className="h-4 w-px bg-slate-800 mx-1" />

          <button
            onClick={handleZoomIn}
            disabled={currentZoom <= minZoom}
            className="p-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded disabled:opacity-40 disabled:cursor-not-allowed transition"
            title="Zoom In"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          
          <button
            onClick={handleZoomOut}
            disabled={currentZoom >= maxZoom}
            className="p-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded disabled:opacity-40 disabled:cursor-not-allowed transition"
            title="Zoom Out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div ref={containerRef} className="relative flex-grow min-h-[300px]">
        {/* Dynamic Details Floating Bubble on Hover */}
        {isHovered && hoverGlobalIdx !== null && (
          <div className="absolute top-2 left-4 z-10 flex gap-4 bg-slate-950/90 border border-slate-800 text-[11px] font-mono p-1.5 px-3 rounded shadow-lg text-slate-300 flex-wrap pointer-events-none">
            <span className="text-slate-400 font-sans font-medium">{formatDate(candles[hoverGlobalIdx].time)} {formatTime(candles[hoverGlobalIdx].time)}</span>
            <span><strong className="text-slate-400">O:</strong> <span className="text-slate-100">{formatPrice(candles[hoverGlobalIdx].open)}</span></span>
            <span><strong className="text-slate-400">H:</strong> <span className="text-slate-100">{formatPrice(candles[hoverGlobalIdx].high)}</span></span>
            <span><strong className="text-slate-400">L:</strong> <span className="text-slate-100">{formatPrice(candles[hoverGlobalIdx].low)}</span></span>
            <span><strong className="text-slate-400">C:</strong> <span className="text-slate-100">{formatPrice(candles[hoverGlobalIdx].close)}</span></span>
            <span><strong className="text-slate-400">Vol:</strong> <span className="text-slate-100">{formatPrice(candles[hoverGlobalIdx].volume)}</span></span>
            {indicators[hoverGlobalIdx] && (
              <>
                <span><strong className="text-pink-400">RSI(1):</strong> <span className="text-pink-300">{indicators[hoverGlobalIdx].rsi !== null ? (indicators[hoverGlobalIdx].rsi as number).toFixed(1) : 'N/A'}</span></span>
                <span><strong className="text-amber-400">RSI SMA(14):</strong> <span className="text-amber-300">{indicators[hoverGlobalIdx].sma !== null ? (indicators[hoverGlobalIdx].sma as number).toFixed(2) : 'N/A'}</span></span>
              </>
            )}
          </div>
        )}

        <svg
          width={width}
          height={height}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="cursor-crosshair select-none"
        >
          {/* DEFINITIONS AND CLIPPING */}
          <defs>
            <clipPath id="price-clip">
              <rect x={paddingLeft} y={priceYStart} width={chartWidth} height={priceChartHeight} />
            </clipPath>
            <clipPath id="rsi-clip">
              <rect x={paddingLeft} y={rsiYStart} width={chartWidth} height={rsiChartHeight} />
            </clipPath>
          </defs>

          {/* 1. PRICE CHART BACKGROUND GRID */}
          <g>
            {/* Horizontal Grid lines */}
            {priceGridLines.map((price, i) => (
              <line
                key={`price-grid-${i}`}
                x1={paddingLeft}
                y1={priceToY(price)}
                x2={width - paddingRight}
                y2={priceToY(price)}
                stroke="#1e293b"
                strokeWidth="1"
                strokeDasharray="2,3"
              />
            ))}
          </g>

          {/* 2. RSI CHART BACKGROUND & BOUNDS */}
          <g id="rsi-grid">
            {/* Shaded bounded area of 30-70 zone */}
            <rect
              x={paddingLeft}
              y={rsiToY(70)}
              width={chartWidth}
              height={rsiToY(30) - rsiToY(70)}
              fill="#ec4899"
              fillOpacity="0.04"
            />
            
            {/* 70 Threshold line */}
            <line
              x1={paddingLeft}
              y1={rsiToY(70)}
              x2={width - paddingRight}
              y2={rsiToY(70)}
              stroke="#f43f5e"
              strokeWidth="1"
              strokeDasharray="3,3"
              strokeOpacity="0.75"
            />
            {/* 30 Threshold line */}
            <line
              x1={paddingLeft}
              y1={rsiToY(30)}
              x2={width - paddingRight}
              y2={rsiToY(30)}
              stroke="#10b981"
              strokeWidth="1"
              strokeDasharray="3,3"
              strokeOpacity="0.75"
            />
          </g>

          {/* 3. CHART AXIS LABELS */}
          {/* Price Y Axis labels */}
          <g id="price-axis text" className="font-mono text-[10px] fill-slate-500">
            {priceGridLines.map((price, i) => (
              <text
                key={`p-label-${i}`}
                x={width - paddingRight + 6}
                y={priceToY(price) + 3}
                textAnchor="start"
              >
                {formatPrice(price)}
              </text>
            ))}
            {/* Max/Min price bounds labels */}
            <text x={width - paddingRight + 6} y={priceYStart + 10} textAnchor="start" className="fill-slate-400">
              {formatPrice(activeMaxPrice)}
            </text>
            <text x={width - paddingRight + 6} y={priceYEnd} textAnchor="start" className="fill-slate-400">
              {formatPrice(activeMinPrice)}
            </text>
          </g>

          {/* RSI Y Axis labels */}
          <g id="rsi-axis text" className="font-mono text-[9px] fill-slate-500">
            <text x={width - paddingRight + 6} y={rsiToY(70) + 3} className="fill-pink-500/80">70 (Sell)</text>
            <text x={width - paddingRight + 6} y={rsiToY(30) + 3} className="fill-emerald-500/80">30 (Buy)</text>
            <text x={width - paddingRight + 6} y={rsiYStart + 10}>100</text>
            <text x={width - paddingRight + 6} y={rsiYEnd}>0</text>
          </g>

          {/* TIME AXIS LABELS AND VERTICAL TIMELINES */}
          <g id="time-axis" className="font-mono text-[9px] fill-slate-500">
            {visibleCandles.map((candle, idx) => {
              // Generate time label spaced out evenly
              const intervalMod = Math.ceil(visibleCandles.length / 5);
              if (idx % intervalMod !== 0 && idx !== visibleCandles.length - 1) return null;

              const x = indexToX(idx);
              return (
                <g key={`time-${idx}`}>
                  <line
                    x1={x}
                    y1={priceYStart}
                    x2={x}
                    y2={rsiYEnd}
                    stroke="#0f172a"
                    strokeWidth="1"
                    strokeOpacity="0.4"
                  />
                  <text
                    x={x}
                    y={height - 2}
                    textAnchor="middle"
                  >
                    {formatTime(candle.time)}
                  </text>
                </g>
              );
            })}
          </g>

          {/* 4. RENDER CANDLESTICKS (CLIPPED) */}
          <g id="candlesticks" clipPath="url(#price-clip)">
            {visibleCandles.map((candle, idx) => {
              const x = indexToX(idx);
              const openY = priceToY(candle.open);
              const closeY = priceToY(candle.close);
              const highY = priceToY(candle.high);
              const lowY = priceToY(candle.low);
              
              const isUp = candle.close >= candle.open;
              const color = isUp ? '#10b981' : '#f43f5e'; // Green vs Red

              const candleTop = Math.min(openY, closeY);
              const candleHeight = Math.max(1.5, Math.abs(openY - closeY));

              return (
                <g key={`candle-${idx}`}>
                  {/* Wick (High to Low) */}
                  <line
                    x1={x}
                    y1={highY}
                    x2={x}
                    y2={lowY}
                    stroke={color}
                    strokeWidth={candleWickWidth}
                  />
                  {/* Real Body */}
                  <rect
                    x={x - candleRealWidth / 2}
                    y={candleTop}
                    width={candleRealWidth}
                    height={candleHeight}
                    fill={color}
                    stroke={color}
                    strokeWidth="0.5"
                    fillOpacity={isUp ? "0.85" : "0.95"}
                  />
                </g>
              );
            })}
          </g>

          {/* 5. RENDER SIGNAL SHAPES OVER CHART */}
          <g id="chart-signals" clipPath="url(#price-clip)">
            {signals.map((sig, sIdx) => {
              // Find index of this signal candle in overall array
              const globalCandleIdx = candles.findIndex(c => c.time === sig.klineTime);
              if (globalCandleIdx < startIndex || globalCandleIdx >= endIndex) return null;

              const localIdx = globalCandleIdx - startIndex;
              const x = indexToX(localIdx);
              const candle = candles[globalCandleIdx];
              
              if (sig.type === 'BUY') {
                const targetY = priceToY(candle.low) + 12; // place below the low wick
                return (
                  <g key={`char-sig-buy-${sIdx}`}>
                    {/* Pulsing signal background indicator */}
                    <circle cx={x} cy={targetY - 5} r="7" className="fill-emerald-500/10 stroke-emerald-500/30" strokeWidth="1" />
                    {/* Up facing Green Triangle */}
                    <polygon
                      points={`${x},${targetY - 10} ${x - 5},${targetY} ${x + 5},${targetY}`}
                      className="fill-emerald-400 stroke-emerald-600"
                      strokeWidth="1"
                    />
                    <text x={x} y={targetY + 11} textAnchor="middle" className="font-sans font-bold fill-emerald-400 text-[9px]">BUY</text>
                  </g>
                );
              } else {
                const targetY = priceToY(candle.high) - 12; // place above high wick
                return (
                  <g key={`char-sig-sell-${sIdx}`}>
                    <circle cx={x} cy={targetY + 5} r="7" className="fill-pink-500/10 stroke-pink-500/30" strokeWidth="1" />
                    {/* Down facing Red Triangle */}
                    <polygon
                      points={`${x},${targetY + 10} ${x - 5},${targetY} ${x + 5},${targetY}`}
                      className="fill-pink-400 stroke-pink-600"
                      strokeWidth="1"
                    />
                    <text x={x} y={targetY - 6} textAnchor="middle" className="font-sans font-bold fill-pink-400 text-[9px]">SELL</text>
                  </g>
                );
              }
            })}
          </g>

          {/* 6. INDICATOR PATHS (RSI & RSI SMA) */}
          <g id="indicator-paths" clipPath="url(#rsi-clip)">
            {/* Draw RSI Line (dashed connection or steps since length 1 is blocky) */}
            {(() => {
              let pathD = '';
              for (let idx = 0; idx < visibleIndicators.length; idx++) {
                const ind = visibleIndicators[idx];
                if (ind && ind.rsi !== null) {
                  const x = indexToX(idx);
                  const y = rsiToY(ind.rsi);
                  if (pathD === '') {
                    pathD = `M ${x} ${y}`;
                  } else {
                    pathD += ` L ${x} ${y}`;
                  }
                }
              }
              return pathD ? (
                <path
                  d={pathD}
                  fill="none"
                  stroke="#f472b6" // Pink-400 for RSI
                  strokeWidth="1.2"
                  strokeOpacity="0.45"
                />
              ) : null;
            })()}

            {/* Draw RSI SMA (Gold-Yellow wave, thicker because it's our core trigger) */}
            {(() => {
              let pathD = '';
              for (let idx = 0; idx < visibleIndicators.length; idx++) {
                const ind = visibleIndicators[idx];
                if (ind && ind.sma !== null) {
                  const x = indexToX(idx);
                  const y = rsiToY(ind.sma);
                  if (pathD === '') {
                    pathD = `M ${x} ${y}`;
                  } else {
                    pathD += ` L ${x} ${y}`;
                  }
                }
              }
              return pathD ? (
                <path
                  d={pathD}
                  fill="none"
                  stroke="#fbbf24" // Amber-400 for SMA of RSI
                  strokeWidth="2"
                />
              ) : null;
            })()}
          </g>

          {/* 7. CROSSHAIR AND HIGHLIGHT COLUMNS (ON HOVER) */}
          {isHovered && hoverLocalIdx !== null && (
            <g id="crosshairs">
              {/* Vertical line through charts */}
              <line
                x1={indexToX(hoverLocalIdx)}
                y1={priceYStart}
                x2={indexToX(hoverLocalIdx)}
                y2={rsiYEnd}
                stroke="#64748b"
                strokeWidth="1"
                strokeOpacity="0.5"
                strokeDasharray="3,3"
              />
              
              {/* Highlight active candle wick/body */}
              <rect
                x={indexToX(hoverLocalIdx) - candleCellWidth / 2}
                y={priceYStart}
                width={candleCellWidth}
                height={priceChartHeight}
                fill="#38bdf8"
                fillOpacity="0.04"
                pointerEvents="none"
              />
              
              {/* Highlight active indicator position */}
              <rect
                x={indexToX(hoverLocalIdx) - candleCellWidth / 2}
                y={rsiYStart}
                width={candleCellWidth}
                height={rsiChartHeight}
                fill="#38bdf8"
                fillOpacity="0.04"
                pointerEvents="none"
              />

              {/* Little circle indicators aligned with lines */}
              {visibleIndicators[hoverLocalIdx]?.sma !== null && (
                <circle
                  cx={indexToX(hoverLocalIdx)}
                  cy={rsiToY(visibleIndicators[hoverLocalIdx].sma as number)}
                  r="4"
                  fill="#fbbf24"
                  stroke="#0f172a"
                  strokeWidth="1"
                />
              )}
              {visibleIndicators[hoverLocalIdx]?.rsi !== null && (
                <circle
                  cx={indexToX(hoverLocalIdx)}
                  cy={rsiToY(visibleIndicators[hoverLocalIdx].rsi as number)}
                  r="3.5"
                  fill="#f472b6"
                  stroke="#0f172a"
                  strokeWidth="1"
                />
              )}
            </g>
          )}
        </svg>
      </div>

      {/* Legend Block */}
      <div className="flex flex-wrap gap-4 mt-2 justify-end text-[10px] font-mono text-slate-400 border-t border-slate-800/80 pt-2.5">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-1.5 bg-pink-500 rounded-full bg-opacity-40" />
          <span>RSI (Length: 1): <span className="text-slate-200">Pink Line</span></span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-1.5 bg-amber-400 rounded-full" />
          <span>RSI SMA (Length: 14): <span className="text-slate-200 font-semibold">Amber Line</span></span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 bg-emerald-400 rounded-sm" />
          <span>BUY Trigger (SMA &gt; 30)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 bg-pink-500 rounded-sm" />
          <span>SELL Trigger (SMA &lt; 70)</span>
        </div>
      </div>
    </div>
  );
};
