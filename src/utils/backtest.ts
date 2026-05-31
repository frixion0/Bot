/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Signal, Trade, BacktestResult } from '../types';

/**
 * Simulates trading on detected signals.
 */
export function runBacktest(signals: Signal[], initialBalance: number = 10000): BacktestResult {
  const result: BacktestResult = {
    initialBalance,
    finalBalance: initialBalance,
    totalReturnPercent: 0,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    winRate: 0,
    trades: []
  };

  if (signals.length < 2) return result;

  let balance = initialBalance;
  let activePosition: { entryPrice: number; entryTime: number; type: 'LONG' } | null = null;

  for (let i = 0; i < signals.length; i++) {
    const signal = signals[i];

    if (signal.type === 'BUY' && !activePosition) {
      // Enter Long Position
      activePosition = {
        entryPrice: signal.price,
        entryTime: signal.klineTime,
        type: 'LONG'
      };
    } else if (signal.type === 'SELL' && activePosition) {
      // Exit Long Position
      const exitPrice = signal.price;
      const entryPrice = activePosition.entryPrice;
      const pnlFactor = (exitPrice - entryPrice) / entryPrice;
      const pnlPercentage = pnlFactor * 100;

      balance = balance * (1 + pnlFactor);

      result.trades.push({
        id: `trade_${i}`,
        type: 'LONG',
        entryPrice,
        entryTime: activePosition.entryTime,
        exitPrice,
        exitTime: signal.klineTime,
        pnlPercentage
      });

      if (pnlPercentage > 0) {
        result.winningTrades++;
      } else {
        result.losingTrades++;
      }

      activePosition = null;
    }
  }

  // Calculate stats
  result.finalBalance = balance;
  result.totalTrades = result.trades.length;
  result.totalReturnPercent = ((balance - initialBalance) / initialBalance) * 100;
  result.winRate = result.totalTrades > 0 ? (result.winningTrades / result.totalTrades) * 100 : 0;

  return result;
}
