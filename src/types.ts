/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Candle {
  time: number; // starts at (timestamp)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed: boolean;
}

export interface Signal {
  id: string;
  time: number; // wall-clock time when signal detected
  type: 'BUY' | 'SELL';
  price: number;
  rsiVal: number;
  smaVal: number;
  klineTime: number; // the start time of the 3m candle
  isRealtime: boolean;
}

export interface StrategyParams {
  rsiLength: number;
  rsiSmaLength: number;
  buyThreshold: number;  // Default 30 (crosses above)
  sellThreshold: number; // Default 70 (crosses below)
}

export interface IndicatorValues {
  time: number;
  rsi: number | null;
  sma: number | null;
}

export interface Trade {
  id: string;
  type: 'LONG' | 'SHORT';
  entryPrice: number;
  entryTime: number;
  exitPrice: number;
  exitTime: number;
  pnlPercentage: number;
}

export interface BacktestResult {
  initialBalance: number;
  finalBalance: number;
  totalReturnPercent: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  trades: Trade[];
}

export interface MudrexBotConfig {
  isEnabled: boolean;
  apiKey: string;
  leverage: number;
  quantity: number;
  rsiLength: number;
  rsiSmaLength: number;
  buyThreshold: number;
  sellThreshold: number;
  isSlTpEnabled: boolean;
  stopLossPercent: number;
  takeProfitPercent: number;
}

export interface MudrexBotStatus {
  config: MudrexBotConfig;
  lastTickTime: number;
  lastCheckedKlineTime: number | null;
  activePositionId: string | null;
  lastAction: string;
}

export interface BotLog {
  id: string;
  timestamp: number;
  type: 'INFO' | 'BUY' | 'SELL' | 'SUCCESS' | 'ERROR';
  message: string;
}

