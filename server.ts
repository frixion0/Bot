/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

interface BotLog {
  id: string;
  timestamp: number;
  type: 'INFO' | 'BUY' | 'SELL' | 'SUCCESS' | 'ERROR';
  message: string;
}

interface MudrexBotConfig {
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

interface PaperPosition {
  id: string;
  symbol: string;
  entryPrice: number;
  quantity: number;
  leverage: number;
  orderType: 'LONG';
  status: 'OPEN' | 'CLOSED';
  pnl: number;
  stoplossPrice?: number;
  takeprofitPrice?: number;
  createdAt: number;
  updatedAt: number;
}

// In-Memory state for the automated server-side bot
let botConfig: MudrexBotConfig = {
  isEnabled: false,
  apiKey: "", // runs mock paper trading by default
  leverage: 10,
  quantity: 0.05, // e.g. 0.05 ounces
  rsiLength: 1,
  rsiSmaLength: 14,
  buyThreshold: 30,
  sellThreshold: 70,
  isSlTpEnabled: true,
  stopLossPercent: 1.5,
  takeProfitPercent: 3.5
};

let botLogs: BotLog[] = [
  {
    id: "init_1",
    timestamp: Date.now(),
    type: "INFO",
    message: "XAUUSDT RSI Screener Trading Server successfully initialized."
  },
  {
    id: "init_2",
    timestamp: Date.now(),
    type: "INFO",
    message: "Running in Paper Trading mode. Enter custom Mudrex API Key in settings for live execution."
  }
];

let paperBalance = 10000; // virtual capital base in USDT
let paperPositions: PaperPosition[] = [];
let lastCheckedKlineTime: number | null = null;
let lastTickTime = Date.now();
let lastAction = "Monitoring feed...";
const MUDREX_BASE = "https://trade.mudrex.com/fapi/v1";

// Helper to push a server log
function addLog(type: BotLog['type'], message: string) {
  const log: BotLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    timestamp: Date.now(),
    type,
    message
  };
  botLogs.unshift(log); // newest first
  if (botLogs.length > 200) botLogs.pop(); // clamp log capacity
  console.log(`[Bot Log] [${type}] ${message}`);
}

// Simple Wilder's RSI calculation (Length 1 with SMA 14)
function processIndicators(klines: any[]) {
  // Convert Binance kline values
  const closes = klines.map(k => parseFloat(k[4]));
  const times = klines.map(k => parseInt(k[0]));
  
  if (closes.length < 15) return { rsiVal: 50, smaVal: 50, lastTime: Date.now() };

  // Calculate binary RSI inputs (rsi length = 1)
  const rsiValues: number[] = [50];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    const curr = closes[i];
    if (curr > prev) {
      rsiValues.push(100);
    } else if (curr < prev) {
      rsiValues.push(0);
    } else {
      rsiValues.push(50);
    }
  }

  // Calculate SMA of RSI values (sma length = 14)
  const rsiSmaValues: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < 13) {
      rsiSmaValues.push(50); // padding
      continue;
    }
    let sum = 0;
    for (let j = 0; j < 14; j++) {
      sum += rsiValues[i - j];
    }
    rsiSmaValues.push(sum / 14);
  }

  return {
    rsiVal: rsiValues[rsiValues.length - 1],
    smaVal: rsiSmaValues[rsiSmaValues.length - 1],
    prevSmaVal: rsiSmaValues[rsiSmaValues.length - 2],
    lastTime: times[times.length - 1],
    lastClose: closes[closes.length - 1]
  };
}

// Active Bot Tick Routine - Calculates metrics and places trades on server
async function executeBotTick() {
  lastTickTime = Date.now();
  if (!botConfig.isEnabled) {
    return "Bot is currently suspended. Enable in rules config panel.";
  }

  try {
    const response = await fetch("https://fapi.binance.com/fapi/v1/klines?symbol=XAUUSDT&interval=3m&limit=100");
    if (!response.ok) {
      throw new Error(`Binance Futures fetch failed with status ${response.status}`);
    }
    const klines = await response.json();
    if (!Array.isArray(klines) || klines.length === 0) {
      throw new Error("Invalid candlestick list returned from feed.");
    }

    const { rsiVal, smaVal, prevSmaVal, lastTime, lastClose } = processIndicators(klines);
    
    // Check if candle recently settled (to avoid entry flickering inside unclosed candle)
    if (lastCheckedKlineTime !== null && lastTime <= lastCheckedKlineTime) {
      // Dynamic stop loss and take profit monitor for open paper positions (checked tick-by-tick)
      if (!botConfig.apiKey) {
        monitorStopLossTakeProfit(lastClose);
      }
      return `Waiting for new 3m bar. Last bar time: ${new Date(lastTime).toLocaleTimeString()}. Latest Close: $${lastClose}`;
    }

    // A new candle closed! Analyze the crossover that occurred on that closed bar
    console.log(`[Bot Core] Analyzing newly closed 3-minute bar. RSI SMA(14): ${smaVal.toFixed(2)} (prev: ${prevSmaVal.toFixed(2)}) Close: $${lastClose}`);
    lastCheckedKlineTime = lastTime;

    // BUY Signal: RSI SMA crossed above buyThreshold (default 30)
    const isBuyTrigger = smaVal > botConfig.buyThreshold && prevSmaVal <= botConfig.buyThreshold;
    // SELL Signal: RSI SMA crossed below sellThreshold (default 70)
    const isSellTrigger = smaVal < botConfig.sellThreshold && prevSmaVal >= botConfig.sellThreshold;

    if (isBuyTrigger) {
      addLog("BUY", `BUY signal triggered! Crossover detected on 3m bar: SMA reached ${smaVal.toFixed(1)}`);
      
      // Let's execute trade!
      if (botConfig.apiKey) {
        // PRODUCTION LIVE API TRIGGER (Mudrex API)
        await placeMudrexOrder("LONG", lastClose);
      } else {
        // PAPER TRADING MODE
        executePaperBuy(lastClose);
      }
    } else if (isSellTrigger) {
      addLog("SELL", `SELL signal triggered! Crossover detected on 3m bar: SMA dropped to ${smaVal.toFixed(1)}`);
      
      if (botConfig.apiKey) {
        await closeMudrexPositions();
      } else {
        executePaperSell(lastClose);
      }
    }

    return `Bot tick process completed. Active Position: ${botConfig.apiKey ? 'Linked Live Mudrex' : paperPositions.filter(p => p.status === 'OPEN').length + ' paper positions'}`;
  } catch (err: any) {
    addLog("ERROR", `Failed executing trading tick: ${err.message}`);
    return `Error: ${err.message}`;
  }
}

// Virtual Paper Position SL/TP check
function monitorStopLossTakeProfit(currentPrice: number) {
  const openPosList = paperPositions.filter(p => p.status === 'OPEN');
  for (const pos of openPosList) {
    if (pos.stoplossPrice && currentPrice <= pos.stoplossPrice) {
      // SL hit
      pos.status = 'CLOSED';
      pos.updatedAt = Date.now();
      const rawLoss = (pos.stoplossPrice - pos.entryPrice) / pos.entryPrice;
      const finalLossFactor = rawLoss * pos.leverage;
      const profitValue = pos.quantity * pos.entryPrice * finalLossFactor;
      
      paperBalance += (pos.quantity * pos.entryPrice) + profitValue;
      pos.pnl = finalLossFactor * 100;
      
      addLog("ERROR", `🔴 PAPERTRAID LIMIT HIT: Stop-loss executed at $${pos.stoplossPrice}. Trade PnL: ${pos.pnl.toFixed(2)}%`);
    } else if (pos.takeprofitPrice && currentPrice >= pos.takeprofitPrice) {
      // TP hit
      pos.status = 'CLOSED';
      pos.updatedAt = Date.now();
      const rawGain = (pos.takeprofitPrice - pos.entryPrice) / pos.entryPrice;
      const finalGainFactor = rawGain * pos.leverage;
      const profitValue = pos.quantity * pos.entryPrice * finalGainFactor;
      
      paperBalance += (pos.quantity * pos.entryPrice) + profitValue;
      pos.pnl = finalGainFactor * 100;
      
      addLog("SUCCESS", `🟢 PAPERTRAID LIMIT HIT: Take-profit executed at $${pos.takeprofitPrice}. Trade PnL: ${pos.pnl.toFixed(2)}%`);
    }
  }
}

// Simulation logic for Paper trades
function executePaperBuy(price: number) {
  const active = paperPositions.find(p => p.status === 'OPEN');
  if (active) {
    addLog("INFO", `Skipping transaction: An active paper position already exists at entry $${active.entryPrice}.`);
    return;
  }

  const cost = botConfig.quantity * price;
  const marginRequired = cost / botConfig.leverage;

  if (paperBalance < marginRequired) {
    addLog("ERROR", `Virtual trade failed: Insufficient paper balance ($${paperBalance.toFixed(2)}) for quantity ${botConfig.quantity}.`);
    return;
  }

  // Deduct margin
  paperBalance -= marginRequired;

  const slPrice = botConfig.isSlTpEnabled ? price * (1 - botConfig.stopLossPercent / 100) : undefined;
  const tpPrice = botConfig.isSlTpEnabled ? price * (1 + botConfig.takeProfitPercent / 100) : undefined;

  const newPos: PaperPosition = {
    id: `paper_pos_${Date.now()}`,
    symbol: "XAUUSDT",
    entryPrice: price,
    quantity: botConfig.quantity,
    leverage: botConfig.leverage,
    orderType: "LONG",
    status: "OPEN",
    pnl: 0,
    stoplossPrice: slPrice,
    takeprofitPrice: tpPrice,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  paperPositions.push(newPos);
  lastAction = `BUY executed. Entered LONG at $${price}.`;
  addLog("SUCCESS", `🟢 Virtual LONG entered. Price: $${price} | Size: ${botConfig.quantity} | Lev: ${botConfig.leverage}x`);
}

function executePaperSell(price: number) {
  const active = paperPositions.find(p => p.status === 'OPEN');
  if (!active) {
    addLog("INFO", "Skipping transaction: No active open paper position found to close.");
    return;
  }

  active.status = 'CLOSED';
  active.updatedAt = Date.now();
  
  const priceDiffFactor = (price - active.entryPrice) / active.entryPrice;
  const rawPnlPercent = priceDiffFactor * 100 * active.leverage;
  const returnMargin = (active.quantity * active.entryPrice) / active.leverage;
  const finalPnLUSDT = (active.quantity * active.entryPrice) * (priceDiffFactor * active.leverage);

  paperBalance += returnMargin + finalPnLUSDT;
  active.pnl = rawPnlPercent;

  lastAction = `Exit signal met. Closed position at $${price}.`;
  addLog("SUCCESS", `🔴 Closed Virtual LONG position at $${price}. trade performance PnL: ${rawPnlPercent.toFixed(2)}% | Net: $${finalPnLUSDT.toFixed(2)}`);
}

// PLACE REAL MUDREX ORDER Proxy logic
async function placeMudrexOrder(side: 'LONG' | 'SHORT', price: number) {
  try {
    const orderBody = {
      leverage: String(botConfig.leverage),
      quantity: String(botConfig.quantity),
      order_price: String(price),
      order_type: side,
      trigger_type: "MARKET",
      is_takeprofit: botConfig.isSlTpEnabled,
      is_stoploss: botConfig.isSlTpEnabled,
      stoploss_price: botConfig.isSlTpEnabled ? String(price * (1 - botConfig.stopLossPercent / 100)) : undefined,
      takeprofit_price: botConfig.isSlTpEnabled ? String(price * (1 + botConfig.takeProfitPercent / 100)) : undefined,
      reduce_only: false
    };

    addLog("INFO", `Sending Live Order to Mudrex API: ${side} ${botConfig.quantity} XAUUSDT perpetual...`);
    
    const response = await fetch(`${MUDREX_BASE}/futures/XAUUSDT/order?is_symbol`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Authentication': botConfig.apiKey
      },
      body: JSON.stringify(orderBody)
    });

    const resData = await response.json();
    if (resData.success) {
      addLog("SUCCESS", `🚀 MUDREX ORDER CREATED SUCCESSFULLY! Order ID: ${resData.data.order_id}`);
    } else {
      const errMsg = resData.message || (resData.errors && resData.errors[0]?.text) || "Mudrex internal error";
      addLog("ERROR", `Failed Mudrex live transaction: ${errMsg}`);
    }
  } catch (err: any) {
    addLog("ERROR", `Error dispatching live order to Mudrex endpoint: ${err.message}`);
  }
}

// CLOSE ALL LIVE POSITIONS ON MUDREX Proxy logic
async function closeMudrexPositions() {
  try {
    addLog("INFO", "Scanning active open positions on Mudrex to square-off...");
    const resPositions = await fetch(`${MUDREX_BASE}/futures/positions`, {
      method: 'GET',
      headers: { 'X-Authentication': botConfig.apiKey }
    });
    
    const posData = await resPositions.json();
    if (!posData.success || !Array.isArray(posData.data)) {
      addLog("ERROR", "Could not synchronize active Live Positions for closing.");
      return;
    }

    const goldPositions = posData.data.filter((p: any) => p.symbol === 'XAUUSDT' && p.status === 'OPEN');
    if (goldPositions.length === 0) {
      addLog("INFO", "No active open positions detected on Mudrex.");
      return;
    }

    for (const pos of goldPositions) {
      addLog("INFO", `Squaring off live position ID ${pos.id} on Mudrex...`);
      const closeRes = await fetch(`${MUDREX_BASE}/futures/positions/${pos.id}/close`, {
        method: 'POST',
        headers: { 'X-Authentication': botConfig.apiKey }
      });
      const closeData = await closeRes.json();
      if (closeData.success) {
        addLog("SUCCESS", `Position successfully closed! Mudrex msg: ${closeData.data.message || 'OK'}`);
      } else {
        addLog("ERROR", `Error closing position ${pos.id}: ${closeData.message || 'Server rejected close action'}`);
      }
    }
  } catch (err: any) {
    addLog("ERROR", `Mudrex Position square off proxy route exception: ${err.message}`);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Proxy Endpoint for Binance Futures or Spot Klines
  app.get("/api/klines", async (req, res) => {
    try {
      const { symbol = "XAUUSDT", interval = "3m", limit = "200" } = req.query;
      const futuresUrl = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
      const response = await fetch(futuresUrl);
      if (response.ok) {
        const data = await response.json();
        return res.json(data);
      }
      res.status(502).json({ error: "Could not fetch Binance charts." });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // BOT STATUS
  app.get("/api/bot/status", (req, res) => {
    const openPaperPositions = paperPositions.filter(p => p.status === 'OPEN');
    res.json({
      config: botConfig,
      logs: botLogs,
      lastTickTime,
      lastCheckedKlineTime,
      lastAction,
      paperWallet: {
        balance: paperBalance,
        positions: paperPositions,
        openCount: openPaperPositions.length
      }
    });
  });

  // BOT CONFIGURE
  app.post("/api/bot/configure", (req, res) => {
    try {
      const settings = req.body;
      botConfig = {
        ...botConfig,
        ...settings,
        // Enforce RSI length standard
        rsiLength: 1
      };
      addLog("INFO", `Screener Bot guidelines updated. Trading Bot: ${botConfig.isEnabled ? 'ACTIVE' : 'IDLE'}, Mode: ${botConfig.apiKey ? 'Live Mudrex Production' : 'Mock Paper Trading'}`);
      res.json({ success: true, config: botConfig });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // BOT RE-TICK TRIGGER (Called by Uptime monitor or Manual click)
  app.post("/api/bot/tick", async (req, res) => {
    try {
      const statusMessage = await executeBotTick();
      res.json({ success: true, message: statusMessage, botLogs });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // CLEAR LOGS
  app.post("/api/bot/clear-logs", (req, res) => {
    botLogs = [{
      id: "clear",
      timestamp: Date.now(),
      type: "INFO",
      message: "Console history wiped clean by trader request."
    }];
    res.json({ success: true });
  });

  // MUDREX PROXY - Wallet balances
  app.get("/api/mudrex/wallet", async (req, res) => {
    const apiKey = req.headers['authorization'] || botConfig.apiKey;
    if (!apiKey) {
      return res.status(401).json({ error: "X-Authentication API Key is missing. Please enter Mudrex Secret Key in configure drawer." });
    }

    try {
      // Fetch Spot
      const spotRes = await fetch(`${MUDREX_BASE}/wallet/funds`, {
        method: 'POST',
        headers: { 'X-Authentication': apiKey as string }
      });
      const spotData = await spotRes.json();

      // Fetch Futures Margin
      const futRes = await fetch(`${MUDREX_BASE}/futures/funds`, {
        method: 'GET',
        headers: { 'X-Authentication': apiKey as string }
      });
      const futData = await futRes.json();

      res.json({
        spot: spotData,
        futures: futData
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // MUDREX PROXY - Positions
  app.get("/api/mudrex/positions", async (req, res) => {
    const apiKey = req.headers['authorization'] || botConfig.apiKey;
    if (!apiKey) {
      return res.status(401).json({ error: "X-Authentication Key required." });
    }

    try {
      const response = await fetch(`${MUDREX_BASE}/futures/positions`, {
        method: 'GET',
        headers: { 'X-Authentication': apiKey as string }
      });
      const data = await response.json();
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // MUDREX PROXY - Change leverage on Asset
  app.post("/api/mudrex/leverage", async (req, res) => {
    const apiKey = req.headers['authorization'] || botConfig.apiKey;
    const { leverage = 10, marginType = "ISOLATED" } = req.body;
    if (!apiKey) {
      return res.status(401).json({ error: "X-Authentication API key required." });
    }

    try {
      const response = await fetch(`${MUDREX_BASE}/futures/XAUUSDT/leverage?is_symbol`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Authentication': apiKey as string
        },
        body: JSON.stringify({ margin_type: marginType, leverage })
      });
      const data = await response.json();
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // MUDREX PROXY - Manual Order Dispatch from Panel
  app.post("/api/mudrex/manual-order", async (req, res) => {
    const apiKey = req.headers['authorization'] || botConfig.apiKey;
    const { side = "LONG", quantity = 0.05, price } = req.body;
    
    // Fallback to manual paper trade if no api keys entered
    if (!apiKey) {
      if (side === "LONG") {
        executePaperBuy(price);
      } else {
        executePaperSell(price);
      }
      return res.json({ success: true, message: `Successfully executed manual paper trade at $${price}` });
    }

    try {
      const response = await fetch(`${MUDREX_BASE}/futures/XAUUSDT/order?is_symbol`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Authentication': apiKey as string
        },
        body: JSON.stringify({
          leverage: String(botConfig.leverage),
          quantity: String(quantity),
          order_price: String(price),
          order_type: side,
          trigger_type: "MARKET",
          is_takeprofit: false,
          is_stoploss: false,
          reduce_only: false
        })
      });
      const data = await response.json();
      if (data.success) {
        addLog("SUCCESS", `Manual Position created on Mudrex! Side: ${side}`);
      }
      res.json(data);
    } catch (e: any) {
      res.status(550).json({ error: e.message });
    }
  });

  // API health checks and watchdog pinger
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "online", 
      botActive: botConfig.isEnabled, 
      mode: botConfig.apiKey ? "PRODUCTION" : "PAPER_TRADING",
      serverTime: Date.now() 
    });
  });

  // Background loop - executes strategy ticks every 30 seconds to keep the bot actively calculating on Node thread
  setInterval(async () => {
    if (botConfig.isEnabled) {
      console.log("[Background Loop] Triggering scheduled strategy tick...");
      await executeBotTick();
    }
  }, 30000);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Live Bot running on port ${PORT} with NODE_ENV=${process.env.NODE_ENV || 'development'}`);
  });
}

startServer().catch((err) => {
  console.error("[Server] Boot exception:", err);
  process.exit(1);
});
