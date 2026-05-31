/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  BellRing, 
  HelpCircle, 
  Sliders, 
  Volume2, 
  VolumeX, 
  RefreshCw, 
  ChevronRight, 
  CheckCircle,
  TrendingUp,
  LineChart,
  Info,
  Zap,
  Play,
  Square,
  Settings,
  Terminal,
  ShieldAlert,
  DollarSign,
  Award,
  AlertCircle,
  Trash2,
  Copy,
  Check,
  Lock,
  Unlock,
  SlidersHorizontal,
  Globe,
  Cpu,
  Coins
} from 'lucide-react';
import { calculateIndicators, detectSignals } from './utils/indicators';
import { runBacktest } from './utils/backtest';
import { ScreenerChart } from './components/ScreenerChart';
import { StatsGrid } from './components/StatsGrid';
import { SignalsTable } from './components/SignalsTable';
import { Candle, StrategyParams } from './types';

export default function App() {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [chartOffset, setChartOffset] = useState<number | null>(null);
  const [isFetching, setIsFetching] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [countdownString, setCountdownString] = useState<string>('03:00');
  
  // Strictly defined default parameters according to user specifications
  const [strategyParams, setStrategyParams] = useState<StrategyParams>({
    rsiLength: 1,       // "rsi length is 1"
    rsiSmaLength: 14,   // "rsi sma length is 14"
    buyThreshold: 30,   // "sma crosses above 30 buy"
    sellThreshold: 70   // "crosses below 70 then sell"
  });

  const [showConfigDrawer, setShowConfigDrawer] = useState<boolean>(false);
  
  // Tabs and Mudrex Live Bot configurations state
  const [activeTab, setActiveTab] = useState<'screener' | 'bot'>('screener');
  const [botStatus, setBotStatus] = useState<any>(null);
  const [botConfig, setBotConfig] = useState<any>({
    isEnabled: false,
    apiKey: "",
    leverage: 10,
    quantity: 0.05,
    rsiLength: 1,
    rsiSmaLength: 14,
    buyThreshold: 30,
    sellThreshold: 70,
    isSlTpEnabled: true,
    stopLossPercent: 1.5,
    takeProfitPercent: 3.5
  });
  
  const [isSavingConfig, setIsSavingConfig] = useState<boolean>(false);
  const [mudrexLiveWallet, setMudrexLiveWallet] = useState<any>(null);
  const [isUpdatingWallet, setIsUpdatingWallet] = useState<boolean>(false);
  const [copiedPingUrl, setCopiedPingUrl] = useState<boolean>(false);
  const [manualOrderQty, setManualOrderQty] = useState<number>(0.05);
  const [manualSubmitting, setManualSubmitting] = useState<boolean>(false);
  const [manualError, setManualError] = useState<string | null>(null);
  
  const fetchBotStatus = async (forceUpdate = false) => {
    try {
      const response = await fetch('/api/bot/status');
      if (response.ok) {
        const data = await response.json();
        setBotStatus(data);
        if (data.config) {
          const focusedElement = document.activeElement;
          const isUserEditing = !forceUpdate && focusedElement && (
            focusedElement.tagName === 'INPUT' || 
            focusedElement.tagName === 'SELECT' || 
            focusedElement.tagName === 'TEXTAREA'
          );

          if (!isUserEditing) {
            setBotConfig(data.config);
            setStrategyParams(prev => ({
              ...prev,
              buyThreshold: data.config.buyThreshold,
              sellThreshold: data.config.sellThreshold,
              rsiSmaLength: data.config.rsiSmaLength
            }));
          }
        }
      }
    } catch (e) {
      console.error('[Bot status fetch failed]:', e);
    }
  };

  const handleSaveConfig = async (updatedSettings?: any) => {
    setIsSavingConfig(true);
    // Prevent serializing React/DOM event objects
    const isSyntheticEvent = updatedSettings && (typeof updatedSettings.preventDefault === 'function' || updatedSettings.nativeEvent);
    const postBody = (updatedSettings && !isSyntheticEvent) ? updatedSettings : botConfig;
    try {
      const response = await fetch('/api/bot/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postBody)
      });
      if (response.ok) {
        await fetchBotStatus(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleForceTick = async () => {
    try {
      await fetch('/api/bot/tick', { method: 'POST' });
      await fetchBotStatus();
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearLogs = async () => {
    try {
      await fetch('/api/bot/clear-logs', { method: 'POST' });
      await fetchBotStatus();
    } catch (err) {
      console.error(err);
    }
  };

  const handleManualOrder = async (side: 'BUY' | 'SELL') => {
    setManualSubmitting(true);
    setManualError(null);
    const price = tickerStats.price || 2400; // default indicator price
    try {
      const response = await fetch('/api/mudrex/manual-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          side: side === 'BUY' ? 'LONG' : 'SHORT',
          quantity: manualOrderQty,
          price
        })
      });
      const data = await response.json();
      if (!data.success) {
        setManualError(data.message || (data.errors && data.errors[0]?.text) || "Order was rejected by API.");
      } else {
        await fetchBotStatus();
      }
    } catch (err: any) {
      setManualError(err.message || 'Network proxy error occurred.');
    } finally {
      setManualSubmitting(false);
    }
  };

  const handleSquareOffPaperPosition = async () => {
    const price = tickerStats.price || 2400;
    setManualSubmitting(true);
    try {
      await fetch('/api/mudrex/manual-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          side: 'SHORT',
          quantity: manualOrderQty,
          price
        })
      });
      await fetchBotStatus();
    } catch (err) {
      console.error(err);
    } finally {
      setManualSubmitting(false);
    }
  };

  const fetchMudrexLiveWallet = async (custKey?: string) => {
    const activeKey = custKey || botConfig.apiKey;
    if (!activeKey) return;
    setIsUpdatingWallet(true);
    try {
      const response = await fetch('/api/mudrex/wallet', {
        headers: { 'Authorization': activeKey }
      });
      if (response.ok) {
        const data = await response.json();
        setMudrexLiveWallet(data);
      }
    } catch (e) {
      console.error('[Live Wallet Sync failed]:', e);
    } finally {
      setIsUpdatingWallet(false);
    }
  };

  const handleCopyUptimeWidget = () => {
    const url = `${window.location.origin}/api/bot/tick`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedPingUrl(true);
      setTimeout(() => setCopiedPingUrl(false), 2500);
    });
  };

  // Poll server Bot status on mount
  useEffect(() => {
    fetchBotStatus();
    const interval = setInterval(fetchBotStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch Mudrex live wallet if API Key is present and changes
  useEffect(() => {
    if (botConfig.apiKey) {
      fetchMudrexLiveWallet();
    } else {
      setMudrexLiveWallet(null);
    }
  }, [botConfig.apiKey]);
  const lastChimedKlineTimeRef = useRef<number | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Audio synthesizer chime using native Web Audio API for maximum browser compatibility
  const playSignalChime = (type: 'BUY' | 'SELL') => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      
      if (type === 'BUY') {
        const notes = [261.63, 329.63, 392.00, 523.25]; // Uplifting arpeggio C-E-G-C
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.connect(gain);
          gain.connect(ctx.destination);
          
          osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.1);
          gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.1);
          gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + idx * 0.1 + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.1 + 0.35);
          
          osc.start(ctx.currentTime + idx * 0.1);
          osc.stop(ctx.currentTime + idx * 0.1 + 0.4);
        });
      } else {
        const notes = [392.00, 311.13, 261.63, 196.00]; // Warning arpeggio G-Eb-C-G
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.connect(gain);
          gain.connect(ctx.destination);
          
          osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.1);
          gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.1);
          gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + idx * 0.1 + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.1 + 0.35);
          
          osc.start(ctx.currentTime + idx * 0.1);
          osc.stop(ctx.currentTime + idx * 0.1 + 0.4);
        });
      }
    } catch (e) {
      console.warn('[Audio] Chime skipped (user interaction required first)', e);
    }
  };

  // Fetch initial klines from Express proxy
  const fetchHistoricalKlines = async () => {
    setIsFetching(true);
    setFetchError(null);
    try {
      const response = await fetch('/api/klines?symbol=XAUUSDT&interval=3m&limit=300');
      if (!response.ok) {
        throw new Error(`Failed to load historical charts. Status code: ${response.status}`);
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        const mapped: Candle[] = data.map((item: any) => ({
          time: Number(item[0]),
          open: Number(item[1]),
          high: Number(item[2]),
          low: Number(item[3]),
          close: Number(item[4]),
          volume: Number(item[5]),
          isClosed: true
        }));
        setCandles(mapped);
      } else {
        throw new Error("Invalid chart data structure. Expected an array of klines.");
      }
    } catch (err: any) {
      setFetchError(err.message || 'Unknown network error loading klines');
    } finally {
      setIsFetching(false);
    }
  };

  // Memoized indicators calculation (RSI & RSI SMA)
  const indicators = useMemo(() => {
    return calculateIndicators(
      candles,
      strategyParams.rsiLength,
      strategyParams.rsiSmaLength
    );
  }, [candles, strategyParams.rsiLength, strategyParams.rsiSmaLength]);

  // Memoized detected signals
  const signalsList = useMemo(() => {
    const raw = detectSignals(
      candles,
      indicators,
      strategyParams.buyThreshold,
      strategyParams.sellThreshold
    );
    return raw.map((sig, idx) => ({
      id: `sig_${idx}_${sig.candleIndex}`,
      time: candles[sig.candleIndex].time,
      klineTime: candles[sig.candleIndex].time,
      type: sig.type,
      price: sig.price,
      rsiVal: sig.rsiVal,
      smaVal: sig.smaVal,
      isRealtime: sig.candleIndex === candles.length - 1
    }));
  }, [candles, indicators, strategyParams.buyThreshold, strategyParams.sellThreshold]);

  // Memoized backtest stats
  const backtestStats = useMemo(() => {
    return runBacktest(signalsList);
  }, [signalsList]);

  // Derived real-time indicators for current unclosed candle
  const latestCandle = candles[candles.length - 1] || null;
  const latestInd = indicators[indicators.length - 1] || null;

  const currentSignalState = useMemo(() => {
    if (!latestInd || latestInd.sma === null) return 'NEUTRAL';
    const smaVal = latestInd.sma;
    
    // Check if current is actively triggering on unclosed candle or latest closed candle (crossings)
    if (signalsList.length > 0) {
      const lastSig = signalsList[signalsList.length - 1];
      if (lastSig.klineTime === latestCandle?.time) {
        return lastSig.type; // BUY or SELL
      }
    }
    return 'NEUTRAL';
  }, [latestInd, signalsList, latestCandle]);

  // Real-time metrics
  const tickerStats = useMemo(() => {
    if (candles.length === 0) {
      return { price: null, changePercent: 0, high: 0, low: Infinity };
    }
    const latest = candles[candles.length - 1];
    const initialPrice = candles[0].open;
    const changePercent = ((latest.close - initialPrice) / initialPrice) * 100;
    
    let high = -Infinity;
    let low = Infinity;
    for (const c of candles) {
      if (c.high > high) high = c.high;
      if (c.low < low) low = c.low;
    }

    return {
      price: latest.close,
      changePercent,
      high,
      low: low === Infinity ? 0 : low
    };
  }, [candles]);

  // Sync Audio alerts with latest signals
  useEffect(() => {
    if (signalsList.length === 0 || !soundEnabled) return;
    const latestSig = signalsList[signalsList.length - 1];
    
    // Only play if it correlates with the newest candles and hasn't been played for this block yet
    if (latestSig.klineTime !== lastChimedKlineTimeRef.current) {
      // Small delay to let rendering complete
      const timer = setTimeout(() => {
        playSignalChime(latestSig.type);
      }, 200);
      lastChimedKlineTimeRef.current = latestSig.klineTime;
      return () => clearTimeout(timer);
    }
  }, [signalsList, soundEnabled]);

  // Setup WebSocket connection to Binance Futures real-time stream
  const connectToStream = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    setWsStatus('connecting');
    console.log('[WebSocket] Connecting to wss://fstream.binance.com/ws/xauusdt@kline_3m');
    
    const ws = new WebSocket('wss://fstream.binance.com/ws/xauusdt@kline_3m');
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus('connected');
      console.log('[WebSocket] Connected successfully to XAUUSDT kline 3m stream.');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.e === 'kline') {
          const k = message.k;
          const klineTime = Number(k.t);
          const open = parseFloat(k.o);
          const high = parseFloat(k.h);
          const low = parseFloat(k.l);
          const close = parseFloat(k.c);
          const volume = parseFloat(k.v);
          const isClosed = k.x;

          setCandles((prevCandles) => {
            if (prevCandles.length === 0) return prevCandles;
            const last = prevCandles[prevCandles.length - 1];

            if (last.time === klineTime) {
              // Same candle update
              const copy = [...prevCandles];
              copy[copy.length - 1] = {
                time: klineTime,
                open,
                high,
                low,
                close,
                volume,
                isClosed
              };
              return copy;
            } else if (klineTime > last.time) {
              // New candle block emerged
              return [
                ...prevCandles,
                {
                  time: klineTime,
                  open,
                  high,
                  low,
                  close,
                  volume,
                  isClosed
                }
              ];
            }
            return prevCandles;
          });
        }
      } catch (err) {
        console.error('[WebSocket] Processing message failed', err);
      }
    };

    ws.onclose = () => {
      setWsStatus('disconnected');
      console.warn('[WebSocket] Closed. Attempting reconnect in 5 seconds...');
      reconnectTimeoutRef.current = setTimeout(() => {
        connectToStream();
      }, 5000);
    };

    ws.onerror = (e) => {
      console.error('[WebSocket] Error encountered', e);
      setWsStatus('disconnected');
    };
  };

  // Countdown timer calculation for the 3-minute boundaries
  useEffect(() => {
    const updateCountdown = () => {
      if (candles.length === 0) return;
      const latestTime = candles[candles.length - 1].time;
      const now = Date.now();
      const expiry = latestTime + 3 * 60 * 1000; // 3 minutes length
      const differenceMs = expiry - now;

      if (differenceMs <= 0) {
        setCountdownString('00:00');
        return;
      }

      const totalSecs = Math.floor(differenceMs / 1000);
      const minutes = Math.floor(totalSecs / 60);
      const seconds = totalSecs % 60;
      
      const pad = (num: number) => num.toString().padStart(2, '0');
      setCountdownString(`${pad(minutes)}:${pad(seconds)}`);
    };

    // Calculate immediately
    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [candles]);

  // Mount logic: fetch history first, then kick off stream
  useEffect(() => {
    fetchHistoricalKlines().then(() => {
      connectToStream();
    });

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, []);

  // Jump/Focus chart timeline onto a specific historical candle index
  const handleSelectKlineTime = (klineTime: number) => {
    const index = candles.findIndex((c) => c.time === klineTime);
    if (index !== -1) {
      setHoveredIndex(index);
      
      // Auto blink the hovered candle with a subtle border in UI
      const timer = setTimeout(() => {
        setHoveredIndex(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500/30 selection:text-amber-200">
      
      {/* 1. MAIN APP HEADER */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-20 px-4 py-3 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          
          {/* Logo & Symbol Status */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold font-sans tracking-tight text-white leading-none">
                  XAUUSDT RSI Screener
                </h1>
                <span className="text-[10px] bg-slate-900 border border-slate-800 text-slate-400 font-mono px-1.5 py-0.5 rounded uppercase leading-none">
                  3m Interval
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 font-sans flex items-center gap-1">
                <Info className="h-2.5 w-2.5 text-slate-500" />
                Wilder's RSI Length 1 + RSI SMA Signal 14 Crossovers
              </p>
            </div>
          </div>

          {/* Connected WebSocket Status Label */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800/80 rounded-lg p-1.5 px-3">
              <span className="text-[10px] text-slate-500 font-mono">CANDLE ENDS:</span>
              <span className="font-mono font-bold text-amber-400">{countdownString}</span>
            </div>

            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800/80 rounded-lg p-1.5 px-3">
              <span className="relative flex h-2 w-2">
                {wsStatus === 'connected' && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${
                  wsStatus === 'connected' 
                    ? 'bg-emerald-500' 
                    : wsStatus === 'connecting' 
                    ? 'bg-amber-400 animate-pulse' 
                    : 'bg-rose-500'
                }`} />
              </span>
              <span className="font-mono text-[10px] uppercase font-semibold text-slate-300">
                {wsStatus === 'connected' 
                  ? 'Live Stream' 
                  : wsStatus === 'connecting' 
                  ? 'Connecting...' 
                  : 'Disconnected'}
              </span>
            </div>

            {/* Quick Refresh Connection */}
            <button
              onClick={() => {
                fetchHistoricalKlines().then(() => connectToStream());
              }}
              className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white rounded-lg transition"
              title="Manually reconnect and sync historical data"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* View Switcher Tabs */}
      <div className="bg-slate-950 px-4 sm:px-6 border-b border-slate-900/60 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 p-1 bg-slate-900/60 rounded-xl border border-slate-800/85 self-start">
            <button
              onClick={() => setActiveTab('screener')}
              className={`flex items-center gap-2 px-4 py-2 font-medium tracking-tight text-xs sm:text-sm rounded-lg transition-all duration-200 cursor-pointer ${
                activeTab === 'screener'
                  ? 'bg-amber-500/15 border border-amber-500/35 text-amber-300 shadow-sm'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 border border-transparent'
              }`}
            >
              <LineChart className="h-4 w-4 text-amber-500" />
              <span>Screener & Charts</span>
            </button>
            <button
              onClick={() => setActiveTab('bot')}
              className={`flex items-center gap-2 px-4 py-2 font-medium tracking-tight text-xs sm:text-sm rounded-lg transition-all duration-200 cursor-pointer relative ${
                activeTab === 'bot'
                  ? 'bg-amber-500/15 border border-amber-500/35 text-amber-300 shadow-sm'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 border border-transparent'
              }`}
            >
              <Cpu className="h-4 w-4 text-cyan-400" />
              <span>Mudrex Bot Terminal</span>
              {botConfig.isEnabled && (
                <span className="absolute top-1 right-1 h-1.5 w-1.5 bg-emerald-500 rounded-full animate-ping" />
              )}
            </button>
          </div>
          
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-[10px] font-mono text-slate-500 uppercase">Automated Daemon:</span>
            <div className={`p-1 px-3 rounded-full border text-[10px] font-mono font-medium flex items-center gap-1.5 ${
              botConfig.isEnabled
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${botConfig.isEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-650'}`} />
              <span>{botConfig.isEnabled ? 'BOT ACTIVE' : 'BOT DISARMED'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Body */}
      <main className="flex-grow max-w-7xl mx-auto w-full p-4 sm:p-6 flex flex-col gap-6">

        {isFetching ? (
          <div className="flex flex-col items-center justify-center h-48 rounded-xl border border-dashed border-slate-800 bg-slate-900/40 p-6 text-center animate-pulse">
            <LineChart className="h-8 w-8 text-slate-500 animate-spin mb-2" />
            <span className="text-sm font-semibold text-slate-400">Loading historical XAUUSDT perpetual bars...</span>
            <span className="text-xs text-slate-600 mt-1 font-mono">Resolving from Binance API proxy</span>
          </div>
        ) : fetchError ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-left">
            <h4 className="font-semibold text-red-400 text-sm">Failed to sync candlestick histories</h4>
            <p className="text-xs text-slate-400 mt-1">{fetchError}</p>
            <button
              onClick={fetchHistoricalKlines}
              className="mt-3 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs rounded font-medium border border-red-550/30 transition shadow-sm"
            >
              Retry Connection
            </button>
          </div>
        ) : (
          <>
            {/* SCREENER TAB CONTENT */}
            {activeTab === 'screener' && (
              <div className="flex flex-col gap-6 animate-fade-in">
                {/* Dynamic Real-time Signal Header banner */}
                <div className={`p-4.5 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-md transition-all duration-300 ${
                  currentSignalState === 'BUY'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                    : currentSignalState === 'SELL'
                    ? 'bg-pink-500/10 border-pink-500/30 text-pink-200'
                    : 'bg-slate-900/60 border-slate-800 text-slate-350'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`h-11 w-11 rounded-full flex items-center justify-center ${
                      currentSignalState === 'BUY'
                        ? 'bg-emerald-500/20 text-emerald-400 ring-2 ring-emerald-500/25 ring-offset-2 ring-offset-slate-950'
                        : currentSignalState === 'SELL'
                        ? 'bg-pink-500/20 text-pink-400 ring-2 ring-pink-500/25 ring-offset-2 ring-offset-slate-950'
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      <BellRing className={`h-5 w-5 ${currentSignalState !== 'NEUTRAL' ? 'animate-bounce' : ''}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-widest text-slate-440">Strategy Pulse</span>
                        {latestCandle?.isClosed ? (
                          <span className="text-[9px] bg-slate-850 border border-slate-700 text-slate-400 px-1 rounded font-mono">Candle Settled</span>
                        ) : (
                          <span className="text-[9px] bg-sky-500/15 border border-sky-500/20 text-sky-450 px-1 rounded font-mono animate-pulse">Intraday Active</span>
                        )}
                      </div>
                      
                      <h2 className="text-base font-bold font-sans mt-0.5 tracking-tight text-white">
                        {currentSignalState === 'BUY' && (
                          <span>🟢 ACTIVE BUY SIGNAL DETECTED — SMA crossed above 30!</span>
                        )}
                        {currentSignalState === 'SELL' && (
                          <span>🔴 ACTIVE SELL SIGNAL DETECTED — SMA crossed below 70!</span>
                        )}
                        {currentSignalState === 'NEUTRAL' && (
                          <span>⚪ MONITORING SCREENER — Waiting for SMA RSI signal cross...</span>
                        )}
                      </h2>
                    </div>
                  </div>

                  {/* Real-time Indicator Stats */}
                  <div className="flex items-center gap-4 text-xs font-mono self-stretch sm:self-auto justify-between border-t sm:border-t-0 border-slate-800/60 pt-3 sm:pt-0">
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400">RSI(1)</div>
                      <div className="text-sm font-bold text-slate-200">
                        {latestInd && latestInd.rsi !== null ? (latestInd.rsi as number).toFixed(0) : '—'}
                      </div>
                    </div>
                    <div className="h-6 w-px bg-slate-800" />
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400">RSI SMA(14)</div>
                      <div className={`text-sm font-bold ${
                        latestInd && latestInd.sma !== null && latestInd.sma > 70 
                          ? 'text-pink-400' 
                          : latestInd && latestInd.sma !== null && latestInd.sma < 30 
                          ? 'text-emerald-400' 
                          : 'text-amber-400'
                      }`}>
                        {latestInd && latestInd.sma !== null ? (latestInd.sma as number).toFixed(2) : '—'}
                      </div>
                    </div>
                    <div className="h-6 w-px bg-slate-800" />
                    <button
                      onClick={() => setShowConfigDrawer(!showConfigDrawer)}
                      className="flex items-center gap-1.5 p-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-350 hover:text-slate-100 rounded-lg Transition font-sans text-xs border border-slate-700/80 cursor-pointer"
                    >
                      <Sliders className="h-3.5 w-3.5" />
                      <span>Rules</span>
                    </button>
                  </div>
                </div>

                {/* Adjustable Parameters Mini-Panel */}
                {showConfigDrawer && (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4.5 animate-fade-in text-xs shadow-inner">
                    <h3 className="font-semibold text-slate-200 flex items-center gap-2 mb-3 text-sm">
                      <Sliders className="h-4 w-4 text-amber-400" />
                      <span>Screener Strategy Constraints (User Requested)</span>
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      {/* RSI Length */}
                      <div>
                        <label className="block text-slate-400 font-medium mb-1.5">RSI Length</label>
                        <input
                          type="number"
                          min="1"
                          max="14"
                          value={strategyParams.rsiLength}
                          disabled 
                          className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 font-mono opacity-80 cursor-not-allowed"
                        />
                        <span className="text-[10px] text-slate-500 mt-1 block font-mono">Def: 1 (User Locked)</span>
                      </div>
                      
                      {/* RSI SMA Length */}
                      <div>
                        <label className="block text-slate-400 font-medium mb-1.5">RSI SMA Length</label>
                        <input
                          type="number"
                          min="2"
                          max="50"
                          value={strategyParams.rsiSmaLength}
                          onChange={(e) => {
                            const val = Math.max(2, parseInt(e.target.value) || 14);
                            setStrategyParams(prev => ({ ...prev, rsiSmaLength: val }));
                            handleSaveConfig({ ...botConfig, rsiSmaLength: val });
                          }}
                          className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 font-mono outline-none focus:border-amber-500/40"
                        />
                        <span className="text-[10px] text-slate-500 mt-1 block font-mono">Def: 14 (Adjustable)</span>
                      </div>

                      {/* Buy Line Crossover */}
                      <div>
                        <label className="block text-slate-400 font-medium mb-1.5">Buy Line Threshold</label>
                        <input
                          type="number"
                          min="10"
                          max="40"
                          value={strategyParams.buyThreshold}
                          onChange={(e) => {
                            const val = Math.max(10, parseInt(e.target.value) || 30);
                            setStrategyParams(prev => ({ ...prev, buyThreshold: val }));
                            handleSaveConfig({ ...botConfig, buyThreshold: val });
                          }}
                          className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 font-mono outline-none focus:border-amber-500/40"
                        />
                        <span className="text-[10px] text-slate-500 mt-1 block font-mono">Def: 30 (Adjustable)</span>
                      </div>

                      {/* Sell Line Crossover */}
                      <div>
                        <label className="block text-slate-400 font-medium mb-1.5">Sell Line Threshold</label>
                        <input
                          type="number"
                          min="60"
                          max="90"
                          value={strategyParams.sellThreshold}
                          onChange={(e) => {
                            const val = Math.min(90, parseInt(e.target.value) || 70);
                            setStrategyParams(prev => ({ ...prev, sellThreshold: val }));
                            handleSaveConfig({ ...botConfig, sellThreshold: val });
                          }}
                          className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 font-mono outline-none focus:border-amber-500/40"
                        />
                        <span className="text-[10px] text-slate-500 mt-1 block font-mono">Def: 70 (Adjustable)</span>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800 text-slate-400 max-w-4xl text-[11px] leading-relaxed">
                      <strong className="text-amber-400 font-medium font-sans">Formula Breakdown:</strong> When index RSI length is set to 1, the values become absolute binary shocks (100 if the close price rises, 0 if close price falls). Taking a 14-candle Simple Moving Average (SMA) of this transforms it into a clean, oscillator-bound momentum wave indicating what fraction of the last 14 candles were positive.
                    </div>
                  </div>
                )}

                {/* 3. PERFORMANCE STATS GRID */}
                <StatsGrid stats={backtestStats} signals={signalsList} ticker={tickerStats} />

                {/* 4. PRIMARY CONTENT ROW (CHART & DATA PANEL) */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
                  {/* Candlestick Chart Display */}
                  <div className="lg:col-span-2 h-[500px]">
                    <ScreenerChart
                      candles={candles}
                      indicators={indicators}
                      signals={signalsList}
                      selectedCandleIndex={hoveredIndex}
                      onHoverCandle={(val) => setHoveredIndex(val)}
                    />
                  </div>

                  {/* Sidebar Signal Table display */}
                  <div className="lg:col-span-1 h-[500px]">
                    <SignalsTable
                      signals={signalsList}
                      trades={backtestStats.trades}
                      soundEnabled={soundEnabled}
                      onToggleSound={() => setSoundEnabled(!soundEnabled)}
                      onSelectKlineTime={handleSelectKlineTime}
                    />
                  </div>
                </div>

                {/* 5. STRATEGY SUMMARY ACCORDION & FAQ */}
                <div className="bg-slate-900/60 border border-slate-900 rounded-xl p-5 shadow-sm text-xs text-slate-300">
                  <h3 className="font-semibold text-slate-100 flex items-center gap-2 mb-3 text-sm">
                    <HelpCircle className="h-4 w-4 text-slate-400" />
                    <span>Strategy Rules Documentation</span>
                  </h3>
                  
                  <div className="space-y-4 max-w-5xl leading-relaxed text-slate-400">
                    <p>
                      This system implements a momentum crossover pattern tailored to futures scalping on Gold (XAUUSDT) on a tight <strong>3-minute bar interval</strong>. The mechanics operate under standard mathematical guidelines:
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px] font-mono mt-2 bg-slate-950 p-4 rounded-lg border border-slate-800">
                      <div>
                        <strong className="text-emerald-400 font-sans block mb-1">🟢 Long Entry Signal (BUY)</strong>
                        1. For each bar, compute the binary RSI of length 1 (100 is green close, 0 is red close).<br />
                        2. Take the Simple Average over the last 14 RSI inputs (RSI SMA).<br />
                        3. A BUY is flagged if the SMA <strong>crosses above 30</strong>.
                      </div>
                      <div>
                        <strong className="text-pink-400 font-sans block mb-1">🔴 Short Exit Signal (SELL)</strong>
                        1. Recompute the active SMA on the arrival of new candlestick tickers.<br />
                        2. Trigger a exit/SELL if the RSI SMA value <strong>crosses below 70</strong>.<br />
                        3. A descending crossing marks rapid momentum exhausting, and signals taking profit.
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">
                      Note: Real-time streams listen continuously to public trades on wss://fstream.binance.com and compute indicators tick-by-tick. Historical data is updated dynamically from public REST proxies. Past performance is no guarantee of future results.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* AUTOMATED BOT TAB CONTENT */}
            {activeTab === 'bot' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start animate-fade-in">
                
                {/* Column 1: Config, Credentials and Switches */}
                <div className="flex flex-col gap-6 lg:col-span-1">
                  
                  {/* Power status switch card */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 h-16 w-16 bg-gradient-to-bl from-amber-500/10 to-transparent pointer-events-none" />
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Zap className={`h-5 w-5 ${botConfig.isEnabled ? 'text-amber-400 animate-pulse' : 'text-slate-500'}`} />
                        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-tight">Active Operation</h3>
                      </div>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full uppercase leading-none font-semibold ${
                        botConfig.isEnabled
                          ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                          : 'bg-slate-950 border border-slate-850 text-slate-500'
                      }`}>
                        {botConfig.isEnabled ? 'Executing' : 'Sleeping'}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 bg-slate-950/85 p-3 rounded-lg border border-slate-850 mb-4 text-xs text-slate-300">
                      <div className="flex-grow">
                        <div className="font-semibold text-slate-200 text-xs">Automated Trading Switch</div>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {botConfig.isEnabled 
                            ? 'Server is running the calculations 24/7. When a 3m candle closes and crosses our limit line, a trade triggers.' 
                            : 'Bot calculations are suspended on server. No transactions will execute.'}
                        </p>
                      </div>
                      
                      <button
                        onClick={() => {
                          const updated = !botConfig.isEnabled;
                          setBotConfig((p: any) => ({ ...p, isEnabled: updated }));
                          handleSaveConfig({ ...botConfig, isEnabled: updated });
                        }}
                        className={`h-9 px-4 rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-1 text-center shrink-0 shadow-sm border ${
                          botConfig.isEnabled
                            ? 'bg-rose-500/15 border-rose-500/40 text-rose-300 hover:bg-rose-500/25'
                            : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
                        }`}
                      >
                        {botConfig.isEnabled ? (
                          <>
                            <Square className="h-3.5 w-3.5 fill-current" />
                            <span>SUSPEND</span>
                          </>
                        ) : (
                          <>
                            <Play className="h-3.5 w-3.5 fill-current" />
                            <span>ENABLE</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="text-[10.5px] text-slate-400 leading-relaxed font-sans mt-1">
                      <strong className="text-slate-200">How to automate:</strong> Render free tiers sleep after 15m. Copy your active Watchdog Ping Webhook (shown in portfolio panel) into a free ping service (like UptimeRobot) set to 3m intervals to keep this live 24/7!
                    </div>
                  </div>

                  {/* Core parameters settings */}
                  <form onSubmit={(e) => { e.preventDefault(); handleSaveConfig(); }} className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4">
                    <div className="flex items-center gap-2 border-b border-slate-850 pb-2 mb-1">
                      <Settings className="h-4.5 w-4.5 text-slate-350" />
                      <h3 className="text-xs font-bold text-slate-200 uppercase tracking-tight">Rules Configuration Map</h3>
                    </div>

                    {/* Mudrex API Credential Input */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-slate-300 text-xs font-medium">Mudrex Secret Key (fapi)</label>
                        <span className="text-[10px] font-mono text-slate-500 uppercase flex items-center gap-1">
                          {botConfig.apiKey ? (
                            <>
                              <Lock className="h-2.5 w-2.5 text-emerald-400" />
                              <span className="text-emerald-400">Live Linked</span>
                            </>
                          ) : (
                            <>
                              <Unlock className="h-2.5 w-2.5 text-amber-500" />
                              <span className="text-amber-500">Paper-trading only</span>
                            </>
                          )}
                        </span>
                      </div>
                      <input
                        type="password"
                        placeholder="Paste your Mudrex API token here..."
                        value={botConfig.apiKey}
                        onChange={(e) => setBotConfig((p: any) => ({ ...p, apiKey: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-xs text-slate-200 font-mono outline-none focus:border-amber-500/40"
                      />
                      <p className="text-[10px] text-slate-500 mt-1 cursor-help" onClick={() => alert("Mudrex API endpoint uses custom 'X-Authentication' header. Kept completely server-side for elite security.")}>
                        {botConfig.apiKey 
                          ? "✓ API Key securely stored. All trades routed directly through our Mudrex server proxy." 
                          : "⚠ Leaving this blank automatically executes safe paper trading trades."}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3.5">
                      {/* Leverage Slider */}
                      <div>
                        <label className="text-slate-350 text-[11px] block mb-1 font-medium">Futures Leverage</label>
                        <select
                          value={botConfig.leverage}
                          onChange={(e) => setBotConfig((p: any) => ({ ...p, leverage: parseInt(e.target.value) }))}
                          className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-xs font-mono text-slate-250 font-semibold"
                        >
                          <option value="1">1x (Conservative)</option>
                          <option value="5">5x (Moderate)</option>
                          <option value="10">10x (Standard)</option>
                          <option value="25">25x (Fierce)</option>
                          <option value="50">50x (Aggressive)</option>
                        </select>
                      </div>

                      {/* Contract Quantity */}
                      <div>
                        <label className="text-slate-350 text-[11px] block mb-1 font-medium">Position Size (Qty oz)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          max="50"
                          value={botConfig.quantity}
                          onChange={(e) => setBotConfig((p: any) => ({ ...p, quantity: parseFloat(e.target.value) || 0.05 }))}
                          className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-xs font-mono text-slate-250 font-semibold focus:border-amber-500/40 outline-none"
                        />
                      </div>
                    </div>

                    {/* SL / TP configuration toggle */}
                    <div className="border-t border-slate-850 pt-3 flex flex-col gap-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-medium text-slate-300">Set Risk Orders (SL / TP)</span>
                        <input
                          type="checkbox"
                          checked={botConfig.isSlTpEnabled}
                          onChange={(e) => setBotConfig((p: any) => ({ ...p, isSlTpEnabled: e.target.checked }))}
                          className="rounded h-4 w-4 bg-slate-950 border-slate-850 accent-amber-500 cursor-pointer"
                        />
                      </div>

                      {botConfig.isSlTpEnabled && (
                        <div className="grid grid-cols-2 gap-3 animate-fade-in">
                          <div>
                            <label className="text-slate-400 text-[10px] block mb-1 font-mono">Stop-Loss (%)</label>
                            <input
                              type="number"
                              step="0.1"
                              min="0.2"
                              max="10"
                              value={botConfig.stopLossPercent}
                              onChange={(e) => setBotConfig((p: any) => ({ ...p, stopLossPercent: parseFloat(e.target.value) || 1.5 }))}
                              className="w-full bg-slate-950 border border-slate-850 rounded p-1.5 text-xs text-center font-mono font-semibold"
                            />
                          </div>
                          <div>
                            <label className="text-slate-400 text-[10px] block mb-1 font-mono">Take-Profit (%)</label>
                            <input
                              type="number"
                              step="0.1"
                              min="0.2"
                              max="30"
                              value={botConfig.takeProfitPercent}
                              onChange={(e) => setBotConfig((p: any) => ({ ...p, takeProfitPercent: parseFloat(e.target.value) || 3.5 }))}
                              className="w-full bg-slate-950 border border-slate-850 rounded p-1.5 text-xs text-center font-mono font-semibold"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={isSavingConfig}
                      className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold py-3 rounded-lg flex items-center justify-center gap-1.5 transition uppercase shrink-0 font-sans cursor-pointer shadow-md mt-1.5 disabled:opacity-45"
                    >
                      <CheckCircle className="h-4 w-4" />
                      <span>{isSavingConfig ? 'Deploying...' : 'Deploy Screener Guidelines'}</span>
                    </button>
                  </form>
                </div>

                {/* Column 2: Balances & Manual Sandbox operations */}
                <div className="flex flex-col gap-6 lg:col-span-1">
                  
                  {/* Account Wallet Drawer */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
                    <div className="flex items-center justify-between border-b border-slate-850 pb-2.5 mb-3.5">
                      <div className="flex items-center gap-1.5">
                        <Coins className="h-4.5 w-4.5 text-slate-350" />
                        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-tight">Active Financial Hub</h3>
                      </div>
                      
                      {botConfig.apiKey && (
                        <button
                          onClick={() => fetchMudrexLiveWallet()}
                          title="Refresh wallet balances"
                          className="p-1 text-slate-500 hover:text-white hover:bg-slate-800 rounded transition"
                        >
                          <RefreshCw className={`h-3 w-3 ${isUpdatingWallet ? 'animate-spin' : ''}`} />
                        </button>
                      )}
                    </div>

                    {botConfig.apiKey ? (
                      /* Live balance output */
                      <div className="flex flex-col gap-3 animate-fade-in text-xs font-mono">
                        <div className="bg-slate-950 p-3 rounded-lg border border-slate-850">
                          <span className="text-[10px] text-slate-400 block uppercase font-sans mb-1.5 flex items-center gap-1">
                            <Lock className="h-2.5 w-2.5 text-emerald-400" />
                            <span>MUDREX SPOT BALANCES (USDT)</span>
                          </span>
                          <div className="font-bold text-lg text-emerald-400">
                            ${mudrexLiveWallet?.spot?.data?.total !== undefined ? parseFloat(mudrexLiveWallet.spot.data.total).toFixed(2) : "—"}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-1 flex justify-between">
                            <span>Withdrawable: ${mudrexLiveWallet?.spot?.data?.withdrawable || "0.00"}</span>
                            <span>Invested: ${mudrexLiveWallet?.spot?.data?.invested || "0.00"}</span>
                          </div>
                        </div>

                        <div className="bg-slate-950 p-3 rounded-lg border border-slate-850">
                          <span className="text-[10px] text-slate-400 block uppercase font-sans mb-1.5">MUDREX FUTURES MARGIN</span>
                          <div className="font-bold text-lg text-cyan-400">
                            ${mudrexLiveWallet?.futures?.data?.balance !== undefined ? parseFloat(mudrexLiveWallet.futures.data.balance).toFixed(4) : "—"}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-1">
                            Pending Locked Margin: ${mudrexLiveWallet?.futures?.data?.locked_amount || "0.0000"}
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Mock sandbox balance */
                      <div className="flex flex-col gap-3 animate-fade-in text-xs font-mono">
                        <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-850">
                          <span className="text-[10px] text-amber-500 block uppercase font-sans mb-1 leading-none font-semibold">Mock Capital Account Base</span>
                          <div className="text-xl font-bold text-slate-100">
                            ${botStatus?.paperWallet?.balance !== undefined ? botStatus.paperWallet.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "10,000.00"} <span className="text-xs text-slate-500 font-sans">USDT</span>
                          </div>
                          <p className="text-[9.5px] text-slate-500 mt-2 font-sans leading-normal">
                            Paper-trades auto-execute inside the server memory based on real closed 3m RSI breakouts. Zero capital exposure.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Watchdog setup guide card */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
                    <div className="flex items-center justify-between border-b border-slate-850 pb-2.5 mb-3">
                      <div className="flex items-center gap-1.5">
                        <Globe className="h-4.5 w-4.5 text-slate-350" />
                        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-tight">Render Watchdog Heartbeat</h3>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-400 font-sans leading-relaxed mb-3">
                      Free Render services fall asleep after some minutes. Set up a free interval pinger to hit this endpoint every 3m to run calculations 24/7!
                    </p>

                    <div className="bg-slate-950 border border-slate-850 rounded-lg p-2 flex items-center justify-between font-mono text-[10px] mb-3 text-slate-300">
                      <span className="truncate select-all pr-2 max-w-[200px]" title={`${window.location.origin}/api/bot/tick`}>
                        {window.location.origin}/api/bot/tick
                      </span>
                      <button
                        onClick={handleCopyUptimeWidget}
                        className="px-2.5 py-1 bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:text-white rounded flex items-center gap-1 shrink-0 font-sans text-[10px] transition font-bold text-amber-300"
                      >
                        {copiedPingUrl ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-400" />
                            <span>COPIED</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            <span>COPY URL</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="flex gap-2 text-xs">
                      <button
                        onClick={handleForceTick}
                        className="w-full bg-slate-950 hover:bg-slate-850 border border-slate-800 font-medium text-slate-300 hover:text-white py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition font-sans text-xs shrink-0 cursor-pointer"
                        title="Force server tick analysis right now on Binance"
                      >
                        <RefreshCw className="h-3.5 w-3.5 text-slate-400" />
                        <span>Force Diagnostic Re-Tick</span>
                      </button>
                    </div>
                  </div>

                  {/* Manual sandbox execution desk */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
                    <div className="flex items-center gap-1.5 border-b border-slate-850 pb-2.5 mb-3.5">
                      <SlidersHorizontal className="h-4.5 w-4.5 text-slate-350" />
                      <h3 className="text-xs font-bold text-slate-200 uppercase tracking-tight">Traders Manual Desk</h3>
                    </div>

                    <p className="text-[11px] text-slate-400 font-sans leading-normal mb-3">
                      Allows instant override. Open or close positions manually over the network.
                    </p>

                    <div className="flex flex-col gap-3 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-mono block mb-1.5">Trade Size Size (Qty oz)</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={manualOrderQty}
                          onChange={(e) => setManualOrderQty(parseFloat(e.target.value) || 0.05)}
                          className="w-full bg-slate-950 border border-slate-850 p-2 text-xs rounded-lg text-slate-200 font-mono font-semibold"
                        />
                      </div>

                      {manualError && (
                        <div className="p-2 border border-red-500/10 bg-red-500/5 text-rose-400 text-[10px] leading-relaxed rounded">
                          {manualError}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3.5 font-sans">
                        <button
                          onClick={() => handleManualOrder('BUY')}
                          disabled={manualSubmitting}
                          className="bg-emerald-500 hover:bg-emerald-600 font-bold py-2.5 text-slate-950 rounded-lg text-xs transition uppercase shadow-sm shrink-0 cursor-pointer flex items-center justify-center gap-1"
                        >
                          <Play className="h-3 w-3 fill-current rotate-90" />
                          <span>Buy Long</span>
                        </button>
                        
                        <button
                          onClick={() => handleSquareOffPaperPosition()}
                          disabled={manualSubmitting || (!botStatus?.paperWallet?.positions?.some((p: any) => p.status === 'OPEN') && !botConfig.apiKey)}
                          className="bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white font-bold py-2.5 rounded-lg text-xs transition uppercase shadow-sm shrink-0 cursor-pointer flex items-center justify-center gap-1"
                        >
                          <Square className="h-3 w-3 fill-current" />
                          <span>Square Off</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Column 3: Active positions and Terminal log */}
                <div className="flex flex-col gap-6 lg:Col-span-1">
                  
                  {/* Account open positions panel */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
                    <div className="flex items-center gap-1.5 border-b border-slate-850 pb-2.5 mb-3.5">
                      <Award className="h-4.5 w-4.5 text-slate-350" />
                      <h3 className="text-xs font-bold text-slate-200 uppercase tracking-tight">Active Terminal Position</h3>
                    </div>

                    {/* Paper or Mudrex positions display */}
                    {botStatus?.paperWallet?.positions?.filter((p: any) => p.status === 'OPEN').length > 0 ? (
                      <div className="flex flex-col gap-3 font-mono text-xs">
                        {botStatus.paperWallet.positions.filter((p: any) => p.status === 'OPEN').map((p: any) => (
                          <div key={p.id} className="bg-slate-950 rounded-lg border border-slate-850 p-3.5 relative overflow-hidden animate-fade-in flex flex-col gap-2">
                            <div className="absolute right-0 top-0 h-10 w-10 bg-emerald-500/5 rotate-45 pointer-events-none" />
                            
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 rounded font-bold font-sans">
                                LONG {p.leverage}x
                              </span>
                              <span className="text-[10px] text-slate-550 font-mono">XAUUSDT PERPETUAL</span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-900">
                              <div>
                                <span className="text-slate-500 text-[10px] block mb-0.5">CONTRACT SIZE</span>
                                <span className="font-semibold text-slate-300">{p.quantity} oz</span>
                              </div>
                              <div>
                                <span className="text-slate-500 text-[10px] block mb-0.5">ENTRY GOLD RATE</span>
                                <span className="font-semibold text-slate-300">${p.entryPrice.toFixed(2)}</span>
                              </div>
                            </div>

                            <div className="text-[10px] text-slate-450 border-t border-slate-900 pt-1.5 flex flex-col gap-0.5 select-none">
                              {p.stoplossPrice && <div>• Virtual Stop Loss: ${p.stoplossPrice.toFixed(2)}</div>}
                              {p.takeprofitPrice && <div>• Virtual Take Profit: ${p.takeprofitPrice.toFixed(2)}</div>}
                            </div>

                            <button
                              onClick={() => handleSquareOffPaperPosition()}
                              className="mt-2.5 w-full bg-rose-500/15 border border-rose-500/25 hover:bg-rose-500/25 text-rose-300 py-1.5 rounded text-[11px] transition font-sans font-bold uppercase shrink-0 cursor-pointer"
                            >
                              SQUARE OFF POSITION
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-950/50 border border-dashed border-slate-850 rounded-xl text-slate-500">
                        <ShieldAlert className="h-6 w-6 text-slate-600 mb-1.5 animate-pulse" />
                        <span className="text-xs font-semibold">No open positions</span>
                        <p className="text-[10px] text-slate-650 mt-1 max-w-[200px]">
                          Waiting for strategy breakout crossover trigger on candle closes.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Retro logging block terminal */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-3">
                    <div className="flex items-center justify-between border-b border-slate-850 pb-2">
                      <div className="flex items-center gap-1.5">
                        <Terminal className="h-4.5 w-4.5 text-slate-350" />
                        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-tight">Active Bot Execution Console</h3>
                      </div>

                      <button
                        onClick={handleClearLogs}
                        title="Clear console"
                        className="p-1 px-2 hover:bg-slate-800 text-[10px] text-slate-500 hover:text-rose-450 rounded-lg transition"
                      >
                        Clear History
                      </button>
                    </div>

                    <div className="w-full bg-slate-950 border border-slate-850 rounded-lg p-3 h-[250px] overflow-y-auto font-mono text-[10px] leading-relaxed flex flex-col gap-1.5 scrollbar-thin scrollbar-thumb-slate-800">
                      {botStatus?.logs && botStatus.logs.length > 0 ? (
                        botStatus.logs.map((log: any) => {
                          const dateStr = new Date(log.timestamp).toLocaleTimeString();
                          let badgeStyle = "text-slate-450";
                          if (log.type === 'BUY') badgeStyle = "text-emerald-400 font-bold";
                          if (log.type === 'SELL') badgeStyle = "text-pink-400 font-bold";
                          if (log.type === 'SUCCESS') badgeStyle = "text-lime-400 font-bold";
                          if (log.type === 'ERROR') badgeStyle = "text-rose-400 font-bold";

                          return (
                            <div key={log.id} className="border-b border-slate-900pb-1.5 select-text hover:bg-slate-900/50 p-1 rounded">
                              <span className="text-slate-600 font-normal">[{dateStr}] </span>
                              <span className={`uppercase font-semibold tracking-wider mr-1.5 ${badgeStyle}`}>
                                ({log.type})
                              </span>
                              <span className="text-slate-200">{log.message}</span>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-slate-600 block italic py-1">Console is currently empty. Awaiting tickers...</div>
                      )}
                    </div>
                  </div>

                </div>

              </div>
            )}
          </>
        )}
      </main>

      {/* Footer credits */}
      <footer className="border-t border-slate-900 bg-slate-950/40 p-4 text-center text-[11px] text-slate-600 font-mono mt-auto">
        XAUUSDT RSI 3M Scalper Dashboard • Synchronized with live Binance USD-M Perpetual Feed.
      </footer>
    </div>
  );
}
