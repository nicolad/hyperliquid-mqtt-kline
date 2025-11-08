import { useEffect, useRef, useCallback, useState } from "react";

export type HyperliquidNetwork = "mainnet" | "testnet";

export interface HLSubscription {
  [key: string]: any;
}

export interface HLMessageEnvelope<T = any> {
  channel: string;
  data: T;
}

export interface UseHyperliquidWsOptions<T = any> {
  network?: HyperliquidNetwork;
  urlOverride?: string;
  subscriptions: HLSubscription[];
  onMessage?: (msg: HLMessageEnvelope) => void;
  onOpen?: (ws: WebSocket) => void;
  onError?: (ev: Event) => void;
  onClose?: (ev: CloseEvent) => void;
  reconnect?: boolean;
  reconnectDelayMs?: number;
  maxReconnectAttempts?: number;
}

function deriveUrl(network: HyperliquidNetwork): string {
  return network === "testnet"
    ? "wss://api.hyperliquid-testnet.xyz/ws"
    : "wss://api.hyperliquid.xyz/ws";
}

export function useHyperliquidWs({
  network = "mainnet",
  urlOverride,
  subscriptions,
  onMessage,
  onOpen,
  onError,
  onClose,
  reconnect = true,
  reconnectDelayMs = 3000,
  maxReconnectAttempts = 10,
}: UseHyperliquidWsOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const attemptsRef = useRef(0);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  const targetUrl = urlOverride || deriveUrl(network);

  useEffect(() => {
    isMountedRef.current = true;

    const setupWebSocket = () => {
      if (!isMountedRef.current) return;

      if (
        wsRef.current?.readyState === WebSocket.OPEN ||
        wsRef.current?.readyState === WebSocket.CONNECTING
      ) {
        return;
      }

      try {
        const ws = new WebSocket(targetUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMountedRef.current) {
            ws.close();
            return;
          }
          attemptsRef.current = 0;
          setIsConnected(true);
          subscriptions.forEach((sub) => {
            const payload = { method: "subscribe", subscription: sub };
            ws.send(JSON.stringify(payload));
          });
          onOpen && onOpen(ws);
        };

        ws.onmessage = (ev) => {
          if (!isMountedRef.current) return;
          try {
            const parsed = JSON.parse(ev.data) as HLMessageEnvelope;
            onMessage && onMessage(parsed);
          } catch (e) {
            onMessage && onMessage({ channel: "raw", data: ev.data });
          }
        };

        ws.onerror = (ev) => {
          if (!isMountedRef.current) return;
          onError && onError(ev);
        };

        ws.onclose = (ev) => {
          if (!isMountedRef.current) return;
          setIsConnected(false);
          onClose && onClose(ev);

          if (reconnect && attemptsRef.current < maxReconnectAttempts) {
            attemptsRef.current += 1;
            reconnectTimeoutRef.current = setTimeout(() => {
              setupWebSocket();
            }, reconnectDelayMs);
          }
        };
      } catch (error) {
        if (reconnect && attemptsRef.current < maxReconnectAttempts) {
          attemptsRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(() => {
            setupWebSocket();
          }, reconnectDelayMs);
        }
      }
    };

    if (!subscriptions || subscriptions.length === 0) return;

    setupWebSocket();

    return () => {
      isMountedRef.current = false;
      setIsConnected(false);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [targetUrl, reconnect, reconnectDelayMs, maxReconnectAttempts]);

  return {
    websocket: wsRef.current,
    isConnected,
  };
}

export default useHyperliquidWs;
