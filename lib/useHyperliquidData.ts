import { useState, useEffect, useCallback } from "react";
import useWebSocket, { ReadyState } from "react-use-websocket";
import type { KLineData } from "klinecharts";
import {
  convertHyperliquidCandlesToKLine,
  updateCandleWithTrade,
} from "./dataConverter";
import { fetchHyperliquidCandles } from "./fetchCandles";

interface HLMessageEnvelope {
  channel: string;
  data: any;
}

export interface CoinData {
  symbol: string;
  candleData: KLineData[];
  currentCandle: KLineData | null;
}

interface UseHyperliquidDataOptions {
  coins: string[];
  interval: string;
  wsUrl?: string;
}

export function useHyperliquidData({
  coins,
  interval,
  wsUrl = "wss://api.hyperliquid.xyz/ws",
}: UseHyperliquidDataOptions) {
  const [coinsData, setCoinsData] = useState<{ [key: string]: CoinData }>(
    coins.reduce((acc, coin) => {
      acc[coin] = { symbol: coin, candleData: [], currentCandle: null };
      return acc;
    }, {} as { [key: string]: CoinData })
  );
  const [error, setError] = useState<Error | null>(null);

  // Fetch initial historical data
  useEffect(() => {
    const fetchInitialData = async () => {
      const endTime = Date.now();
      const startTime = endTime - 24 * 60 * 60 * 1000;

      for (const coin of coins) {
        try {
          const candles = await fetchHyperliquidCandles(
            coin,
            interval,
            startTime,
            endTime
          );

          if (candles.length > 0) {
            const convertedCandles = convertHyperliquidCandlesToKLine(candles);
            setCoinsData((prev) => ({
              ...prev,
              [coin]: {
                ...prev[coin],
                candleData: convertedCandles,
                currentCandle:
                  convertedCandles.length > 0
                    ? convertedCandles[convertedCandles.length - 1]
                    : null,
              },
            }));
          }
        } catch (error) {
          setError(error as Error);
        }
      }
    };

    fetchInitialData();
  }, [coins, interval]);

  // Handle incoming WebSocket messages
  const handleDataMessage = useCallback(
    (envelope: HLMessageEnvelope) => {
      try {
        if (envelope.channel === "subscriptionResponse") {
          return;
        }

        let coin: string | undefined;

        if (envelope.channel === "candle" && envelope.data) {
          coin = envelope.data.s;
        } else if (
          envelope.channel === "trades" &&
          Array.isArray(envelope.data) &&
          envelope.data.length > 0
        ) {
          coin = envelope.data[0]?.coin;
        }

        if (!coin) {
          return;
        }

        if (!coins.includes(coin)) {
          return;
        }

        if (envelope.channel === "candle") {
          const candleData = envelope.data;

          let candles = [];
          if (Array.isArray(candleData)) {
            candles = candleData;
          } else if (candleData.candles && Array.isArray(candleData.candles)) {
            candles = candleData.candles;
          } else if (candleData.t) {
            candles = [candleData];
          } else {
            return;
          }

          if (candles.length > 0) {
            const convertedCandles = convertHyperliquidCandlesToKLine(candles);

            setCoinsData((prev) => {
              const existingData = prev[coin]?.candleData || [];
              const newCandle = convertedCandles[0];

              if (existingData.length > 0) {
                const lastCandle = existingData[existingData.length - 1];

                if (lastCandle.timestamp === newCandle.timestamp) {
                  const updatedData = [...existingData];
                  updatedData[updatedData.length - 1] = newCandle;

                  return {
                    ...prev,
                    [coin]: {
                      ...prev[coin],
                      candleData: updatedData,
                      currentCandle: newCandle,
                    },
                  };
                } else {
                  const updatedData = [...existingData, newCandle];

                  return {
                    ...prev,
                    [coin]: {
                      ...prev[coin],
                      candleData: updatedData,
                      currentCandle: newCandle,
                    },
                  };
                }
              } else {
                return {
                  ...prev,
                  [coin]: {
                    ...prev[coin],
                    candleData: convertedCandles,
                    currentCandle: newCandle,
                  },
                };
              }
            });
          }
        }

        if (envelope.channel === "trades") {
          const trades = envelope.data;
          if (Array.isArray(trades)) {
            setCoinsData((prev) => {
              const currentCandle = prev[coin]?.currentCandle;
              if (!currentCandle) return prev;

              let updatedCandle = currentCandle;
              trades.forEach((trade: any) => {
                const price = parseFloat(trade.px);
                const volume = parseFloat(trade.sz);
                updatedCandle = updateCandleWithTrade(
                  updatedCandle,
                  price,
                  volume
                );
              });

              const newCandleData = [...prev[coin].candleData];
              if (newCandleData.length > 0) {
                newCandleData[newCandleData.length - 1] = updatedCandle;
              }

              return {
                ...prev,
                [coin]: {
                  ...prev[coin],
                  candleData: newCandleData,
                  currentCandle: updatedCandle,
                },
              };
            });
          }
        }
      } catch (error) {
        setError(error instanceof Error ? error : new Error(String(error)));
      }
    },
    [coins]
  );

  // WebSocket connection
  const { sendJsonMessage, lastJsonMessage, readyState } = useWebSocket(wsUrl, {
    share: false,
    shouldReconnect: (closeEvent) => {
      return true;
    },
    reconnectAttempts: 10,
    reconnectInterval: (attemptNumber) => {
      return Math.min(1000 * Math.pow(2, attemptNumber), 10000);
    },
    onOpen: (event) => {},
    onClose: (event) => {},
    onError: (event) => {},
    onMessage: (event) => {},
  });

  // Send subscriptions when connected
  useEffect(() => {
    if (readyState === ReadyState.OPEN) {
      coins.forEach((coin) => {
        const candleSubscription = {
          method: "subscribe",
          subscription: {
            type: "candle",
            coin: coin,
            interval: interval,
          },
        };
        sendJsonMessage(candleSubscription);

        const tradesSubscription = {
          method: "subscribe",
          subscription: {
            type: "trades",
            coin: coin,
          },
        };
        sendJsonMessage(tradesSubscription);
      });
    }
  }, [readyState, interval, coins, sendJsonMessage]);

  // Handle incoming messages
  useEffect(() => {
    if (lastJsonMessage) {
      handleDataMessage(lastJsonMessage as HLMessageEnvelope);
    }
  }, [lastJsonMessage, handleDataMessage]);

  return {
    coinsData,
    isConnected: readyState === ReadyState.OPEN,
    readyState,
  };
}
