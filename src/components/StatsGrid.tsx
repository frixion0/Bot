/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { DollarSign, TrendingUp, TrendingDown, Percent, Award, RefreshCcw } from 'lucide-react';
import { BacktestResult, Signal } from '../types';

interface StatsGridProps {
  stats: BacktestResult;
  signals: Signal[];
  ticker: {
    price: number | null;
    changePercent: number;
    high: number;
    low: number;
  };
}

export const StatsGrid: React.FC<StatsGridProps> = ({ stats, signals, ticker }) => {
  const buyCount = signals.filter((s) => s.type === 'BUY').length;
  const sellCount = signals.filter((s) => s.type === 'SELL').length;

  const isProfitable = stats.totalReturnPercent >= 0;
  const formattedReturn = stats.totalReturnPercent.toFixed(2);
  const formattedWinRate = stats.winRate.toFixed(1);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* CARD 1: Current Gold Spot Price */}
      <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
        <div className="absolute right-0 bottom-0 opacity-5 pointer-events-none translate-x-3 translate-y-3">
          <DollarSign className="h-28 w-28 text-slate-100" />
        </div>
        <span className="text-xs font-semibold text-slate-400 font-sans uppercase tracking-wider">
          XAUUSDT Close / Price
        </span>
        <div className="flex items-baseline gap-2 mt-2">
          <span className="text-2xl font-bold font-mono tracking-tight text-white">
            {ticker.price ? `$${ticker.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Loading...'}
          </span>
          {ticker.price && (
            <span
              className={`text-xs font-bold font-sans px-1.5 py-0.5 rounded ${
                ticker.changePercent >= 0
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-rose-500/10 text-rose-400'
              }`}
            >
              {ticker.changePercent >= 0 ? '+' : ''}
              {ticker.changePercent.toFixed(2)}%
            </span>
          )}
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono mt-3 border-t border-slate-800/60 pt-2">
          <span>High: <span className="text-slate-300">${ticker.high.toFixed(1)}</span></span>
          <span>Low: <span className="text-slate-300">${ticker.low.toFixed(1)}</span></span>
        </div>
      </div>

      {/* CARD 2: Backtest Returns */}
      <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
        <div className="absolute right-0 bottom-0 opacity-5 pointer-events-none translate-x-3 translate-y-3">
          {isProfitable ? (
            <TrendingUp className="h-24 w-24 text-emerald-400" />
          ) : (
            <TrendingDown className="h-24 w-24 text-rose-400" />
          )}
        </div>
        <span className="text-xs font-semibold text-slate-400 font-sans uppercase tracking-wider">
          Simulated Strategy Return
        </span>
        <div className="flex items-baseline gap-2 mt-2">
          <span
            className={`text-2xl font-bold font-mono tracking-tight ${
              isProfitable ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {isProfitable ? '+' : ''}
            {formattedReturn}%
          </span>
          <span className="text-xs text-slate-500 font-sans">on $10k base</span>
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono mt-3 border-t border-slate-800/60 pt-2">
          <span>Final Balance:</span>
          <span className={`font-semibold ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
            ${stats.finalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* CARD 3: Win Rate Area */}
      <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
        <div className="absolute right-0 bottom-0 opacity-5 pointer-events-none translate-x-2 translate-y-2">
          <Percent className="h-24 w-24 text-indigo-400" />
        </div>
        <span className="text-xs font-semibold text-slate-400 font-sans uppercase tracking-wider">
          Backtest Win Rate
        </span>
        <div className="flex items-baseline gap-2 mt-2">
          <span className="text-2xl font-bold font-mono tracking-tight text-white">
            {formattedWinRate}%
          </span>
          <span className="text-xs text-slate-500 font-sans">
            {stats.winningTrades} / {stats.totalTrades} trades
          </span>
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono mt-3 border-t border-slate-800/60 pt-2">
          <span>Success metrics:</span>
          <span className="text-indigo-400">
            {stats.totalTrades > 0 ? (stats.winningTrades >= stats.losingTrades ? 'Outperforming' : 'Ranging') : 'No trades yet'}
          </span>
        </div>
      </div>

      {/* CARD 4: Signals Count Breakdown */}
      <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
        <div className="absolute right-0 bottom-0 opacity-5 pointer-events-none translate-x-3 translate-y-3">
          <Award className="h-24 w-24 text-amber-400" />
        </div>
        <span className="text-xs font-semibold text-slate-400 font-sans uppercase tracking-wider">
          Signal Frequencies
        </span>
        <div className="flex items-baseline gap-2 mt-2">
          <span className="text-2xl font-bold font-mono tracking-tight text-amber-400">
            {signals.length}
          </span>
          <span className="text-xs text-slate-500 font-sans">Triggers found</span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono mt-3 border-t border-slate-800/60 pt-2">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Buy: <strong className="text-emerald-400 font-mono">{buyCount}</strong>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-pink-500"></span>
            Sell: <strong className="text-pink-400 font-mono">{sellCount}</strong>
          </span>
        </div>
      </div>
    </div>
  );
};
