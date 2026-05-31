/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Volume2, VolumeX, Download, BellRing, Eye, CheckCircle2 } from 'lucide-react';
import { Signal, Trade } from '../types';

interface SignalsTableProps {
  signals: Signal[];
  trades: Trade[];
  soundEnabled: boolean;
  onToggleSound: () => void;
  onSelectKlineTime: (klineTime: number) => void;
}

export const SignalsTable: React.FC<SignalsTableProps> = ({
  signals,
  trades,
  soundEnabled,
  onToggleSound,
  onSelectKlineTime,
}) => {
  const [activeTab, setActiveTab] = useState<'signals' | 'trades'>('signals');

  const formatPrice = (val: number) => val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  
  const formatDate = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + 
           date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  // Convert signals to CSV and download
  const handleDownloadSignalsCSV = () => {
    if (signals.length === 0) return;
    const headers = ['ID', 'Type', 'Time (UTC)', 'Price (USDT)', 'RSI Value', 'RSI SMA Line', 'Trigger Mode'];
    const rows = signals.map(s => [
      s.id,
      s.type,
      new Date(s.time).toISOString(),
      s.price,
      s.rsiVal.toFixed(1),
      s.smaVal.toFixed(2),
      s.isRealtime ? 'Real-Time Stream' : 'Historical Load'
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `XAUUSDT_RSI_Screener_Signals.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Convert trades to CSV and download
  const handleDownloadTradesCSV = () => {
    if (trades.length === 0) return;
    const headers = ['Trade ID', 'Type', 'Entry Time', 'Entry Price', 'Exit Time', 'Exit Price', 'PnL %'];
    const rows = trades.map(t => [
      t.id,
      t.type,
      new Date(t.entryTime).toISOString(),
      t.entryPrice,
      new Date(t.exitTime).toISOString(),
      t.exitPrice,
      t.pnlPercentage.toFixed(2)
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `XAUUSDT_RSI_Screener_Simulated_Trades.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl h-full">
      {/* Panel Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800">
        <div className="flex items-center gap-2">
          {/* Tabs */}
          <button
            onClick={() => setActiveTab('signals')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-md transition ${
              activeTab === 'signals'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            History Signals ({signals.length})
          </button>
          
          <button
            onClick={() => setActiveTab('trades')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-md transition ${
              activeTab === 'trades'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Simulated Trades ({trades.length})
          </button>
        </div>

        {/* Sound & Download Options */}
        <div className="flex items-center gap-1.5 animate-fade-in">
          {/* Sound Alert Toggle */}
          <button
            onClick={onToggleSound}
            className={`p-1.5 rounded transition border ${
              soundEnabled
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                : 'bg-slate-850 border-slate-700 text-slate-500 hover:bg-slate-800 hover:text-slate-300'
            }`}
            title={soundEnabled ? "Audio Signal Alarm: Enabled" : "Audio Alarm: Muted"}
          >
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>

          {/* Export Action */}
          <button
            onClick={activeTab === 'signals' ? handleDownloadSignalsCSV : handleDownloadTradesCSV}
            disabled={activeTab === 'signals' ? signals.length === 0 : trades.length === 0}
            className="p-1.5 bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded disabled:opacity-40 disabled:cursor-not-allowed transition"
            title="Download CSV Statement"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Table Content Block */}
      <div className="flex-grow overflow-y-auto max-h-[350px]">
        {activeTab === 'signals' ? (
          signals.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center h-48 text-slate-500">
              <BellRing className="h-8 w-8 text-slate-600 mb-1" />
              <p className="text-xs">No signals generated yet.</p>
              <p className="text-[10px] text-slate-600 mt-1">Waiting for RSI SMA calculation triggers.</p>
            </div>
          ) : (
            <table className="w-full border-collapse text-left text-xs text-slate-300">
              <thead>
                <tr className="bg-slate-950/60 text-slate-400 uppercase text-[10px] border-b border-slate-800/80 sticky top-0 font-semibold font-mono tracking-wider">
                  <th className="py-2.5 px-4">Time (UTC)</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Price</th>
                  <th className="py-2.5 px-3 text-right">RSI SMA</th>
                  <th className="py-2.5 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {signals.slice().reverse().map((sig) => (
                  <tr
                    key={sig.id}
                    className="hover:bg-slate-800/40 transition group"
                  >
                    <td className="py-3 px-4 font-mono font-medium text-[11px] text-slate-400">
                      {formatDate(sig.klineTime)}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold text-[10px] uppercase font-sans tracking-tight ${
                          sig.type === 'BUY'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-pink-500/10 text-pink-400'
                        }`}
                      >
                        {sig.type}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-slate-100">
                      ${formatPrice(sig.price)}
                    </td>
                    <td className="py-3 px-3 font-mono text-right text-amber-400 font-semibold">
                      {sig.smaVal.toFixed(2)}
                    </td>
                    <td className="py-2 px-4 text-center">
                      <button
                        onClick={() => onSelectKlineTime(sig.klineTime)}
                        className="p-1 px-2.5 bg-slate-800 group-hover:bg-amber-500/20 border border-slate-700 group-hover:border-amber-500/30 text-slate-400 group-hover:text-amber-300 rounded transition text-[10px] font-medium font-sans inline-flex items-center gap-1"
                        title="Locate Signal Candle on Map"
                      >
                        <Eye className="h-3 w-3" />
                        Locate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          trades.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center h-48 text-slate-500">
              <CheckCircle2 className="h-8 w-8 text-slate-600 mb-1" />
              <p className="text-xs">No completed trades found yet.</p>
              <p className="text-[10px] text-slate-600 mt-1">Requires a BUY signal followed by a SELL signal to settle a trade cycle.</p>
            </div>
          ) : (
            <table className="w-full border-collapse text-left text-xs text-slate-300">
              <thead>
                <tr className="bg-slate-950/60 text-slate-400 uppercase text-[10px] border-b border-slate-800/80 sticky top-0 font-semibold font-mono tracking-wider">
                  <th className="py-2.5 px-4">Cycle</th>
                  <th className="py-2.5 px-3">Entry Price</th>
                  <th className="py-2.5 px-3">Exit Price</th>
                  <th className="py-2.5 px-3 text-right">PnL %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {trades.slice().reverse().map((trade) => {
                  const gain = trade.pnlPercentage >= 0;
                  return (
                    <tr
                      key={trade.id}
                      className="hover:bg-slate-800/40 transition group"
                    >
                      <td className="py-2.5 px-4 text-slate-400 font-sans text-[11px]">
                        <div>
                          <strong className="text-emerald-400 font-mono text-[10px]">IN:</strong>{' '}
                          {formatDate(trade.entryTime)}
                        </div>
                        <div className="mt-0.5">
                          <strong className="text-pink-400 font-mono text-[10px]">OUT:</strong>{' '}
                          {formatDate(trade.exitTime)}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-300">
                        ${formatPrice(trade.entryPrice)}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-300">
                        ${formatPrice(trade.exitPrice)}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-right font-bold">
                        <span
                          className={`inline-block px-2 py-0.5 rounded ${
                            gain ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'
                          }`}
                        >
                          {gain ? '+' : ''}
                          {trade.pnlPercentage.toFixed(2)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        )}
      </div>

      {/* Info footer */}
      <div className="bg-slate-950 px-4 py-2 text-[10px] text-slate-500 text-center font-mono border-t border-slate-800/80">
        Virtual simulations do not include fees. Standard exchange slippage may apply.
      </div>
    </div>
  );
};
