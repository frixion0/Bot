/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Candle, IndicatorValues } from '../types';

/**
 * Calculates the RSI values and Simple Moving Average (SMA) of the RSI.
 * 
 * For RSI length = 1:
 * - If current candle close > previous candle close: RSI = 100
 * - If current candle close < previous candle close: RSI = 0
 * - If current candle close == previous candle close: RSI = 50
 * 
 * Once RSI is computed, the SMA is Calculated by averaging the RSI values
 * over the specified rsiSmaLength.
 */
export function calculateIndicators(
  candles: Candle[],
  rsiLength: number = 1,
  rsiSmaLength: number = 14
): IndicatorValues[] {
  const result: IndicatorValues[] = [];
  if (candles.length === 0) return result;

  const rsiValues: (number | null)[] = new Array(candles.length).fill(null);

  // 1. Calculate RSI
  if (rsiLength === 1) {
    // Explicit 1-period RSI calculations
    for (let i = 1; i < candles.length; i++) {
      const prevClose = candles[i - 1].close;
      const currClose = candles[i].close;
      if (currClose > prevClose) {
        rsiValues[i] = 100;
      } else if (currClose < prevClose) {
        rsiValues[i] = 0;
      } else {
        rsiValues[i] = 50;
      }
    }
    // First index doesn't have a previous close, standardise as 50
    if (candles.length > 0) {
      rsiValues[0] = 50;
    }
  } else {
    // Standard Wilder's RSI for general fallback
    if (candles.length > rsiLength) {
      let avgGain = 0;
      let avgLoss = 0;

      // First RSI calculation base
      let firstGainSum = 0;
      let firstLossSum = 0;
      for (let i = 1; i <= rsiLength; i++) {
        const diff = candles[i].close - candles[i - 1].close;
        if (diff > 0) {
          firstGainSum += diff;
        } else {
          firstLossSum -= diff;
        }
      }

      avgGain = firstGainSum / rsiLength;
      avgLoss = firstLossSum / rsiLength;

      rsiValues[rsiLength] = avgLoss === 0 ? 100 : 100 - 100 / (1 + (avgGain / avgLoss));

      // Subsequent wilder values
      for (let i = rsiLength + 1; i < candles.length; i++) {
        const diff = candles[i].close - candles[i - 1].close;
        const gain = diff > 0 ? diff : 0;
        const loss = diff < 0 ? -diff : 0;

        avgGain = (avgGain * (rsiLength - 1) + gain) / rsiLength;
        avgLoss = (avgLoss * (rsiLength - 1) + loss) / rsiLength;

        rsiValues[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + (avgGain / avgLoss));
      }
    }
  }

  // 2. Calculate SMA of the RSI values
  const rsiSmaValues: (number | null)[] = new Array(candles.length).fill(null);

  for (let i = 0; i < candles.length; i++) {
    if (i < rsiSmaLength - 1) {
      continue;
    }

    let sum = 0;
    let validCount = 0;
    for (let j = 0; j < rsiSmaLength; j++) {
      const val = rsiValues[i - j];
      if (val !== null) {
        sum += val;
        validCount++;
      }
    }

    if (validCount === rsiSmaLength) {
      rsiSmaValues[i] = sum / rsiSmaLength;
    }
  }

  // 3. Assemble results
  for (let i = 0; i < candles.length; i++) {
    result.push({
      time: candles[i].time,
      rsi: rsiValues[i],
      sma: rsiSmaValues[i],
    });
  }

  return result;
}

/**
 * Scan candle history to detect signals based on crosses of the RSI SMA.
 * 
 * - BUY Signal: When current SMA crosses above buyThreshold (default 30)
 *               (i.e. SMA[t] > threshold AND SMA[t-1] <= threshold)
 * - SELL Signal: When current SMA crosses below sellThreshold (default 70)
 *                (i.e. SMA[t] < threshold AND SMA[t-1] >= threshold)
 */
export function detectSignals(
  candles: Candle[],
  indicators: IndicatorValues[],
  buyThreshold: number = 30,
  sellThreshold: number = 70
) {
  const list: {
    type: 'BUY' | 'SELL';
    candleIndex: number;
    price: number;
    rsiVal: number;
    smaVal: number;
  }[] = [];

  if (candles.length < 2 || indicators.length < 2) return list;

  for (let i = 1; i < candles.length; i++) {
    const prevInd = indicators[i - 1];
    const currInd = indicators[i];

    if (!prevInd || !currInd || prevInd.sma === null || currInd.sma === null) {
      continue;
    }

    const prevSma = prevInd.sma;
    const currSma = currInd.sma;
    const currRsi = currInd.rsi ?? 50;

    // Buy: crosses above buyThreshold
    if (currSma > buyThreshold && prevSma <= buyThreshold) {
      list.push({
        type: 'BUY',
        candleIndex: i,
        price: candles[i].close,
        rsiVal: currRsi,
        smaVal: currSma,
      });
    }
    // Sell: crosses below sellThreshold
    else if (currSma < sellThreshold && prevSma >= sellThreshold) {
      list.push({
        type: 'SELL',
        candleIndex: i,
        price: candles[i].close,
        rsiVal: currRsi,
        smaVal: currSma,
      });
    }
  }

  return list;
}
