"use client";

import { useState, useEffect } from "react";
import KLineChartComponent from "@/lib/KLineChartComponent";
import { useHyperliquidData } from "@/lib/useHyperliquidData";

const TOP_COINS = ["BTC", "ETH", "SOL", "AVAX"];

export default function MultiChartGrid() {
  const [selectedInterval, setSelectedInterval] = useState("1m");

  // Call hook unconditionally - NEVER wrap hooks in try-catch
  const { coinsData, isConnected, readyState } = useHyperliquidData({
    coins: TOP_COINS,
    interval: selectedInterval,
  });

  // Calculate price change percentage
  const calculatePriceChange = (coin: string) => {
    const data = coinsData[coin];
    if (!data?.candleData || data.candleData.length < 2) {
      return { change: 0, percentage: 0 };
    }

    const current =
      data.currentCandle?.close ||
      data.candleData[data.candleData.length - 1].close;
    const previous = data.candleData[0].open;
    const change = current - previous;
    const percentage = (change / previous) * 100;

    return { change, percentage };
  };

  return (
    <div
      style={{
        fontFamily: "sans-serif",
        height: "100vh",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxSizing: "border-box",
        position: "fixed",
        top: 0,
        left: 0,
      }}
    >
      <div
        style={{
          padding: "0.5rem 1rem",
          display: "flex",
          gap: "1rem",
          alignItems: "center",
          borderBottom: "1px solid #ddd",
          background: "#fafafa",
          flexShrink: 0,
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1.5rem" }}>
          HyperLiquid WebSocket Live Streaming
        </h1>

        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: "1rem",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <div style={{ whiteSpace: "nowrap" }}>
            <label htmlFor="interval-select" style={{ marginRight: "0.5rem" }}>
              Interval:
            </label>
            <select
              id="interval-select"
              value={selectedInterval}
              onChange={(e) => setSelectedInterval(e.target.value)}
              style={{ padding: "0.25rem 0.5rem" }}
            >
              <option value="1m">1m</option>
              <option value="5m">5m</option>
              <option value="15m">15m</option>
              <option value="1h">1h</option>
              <option value="4h">4h</option>
              <option value="1d">1d</option>
            </select>
          </div>
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr",
          gap: "0.5rem",
          flex: 1,
          minHeight: 0,
          padding: "0.5rem",
          boxSizing: "border-box",
        }}
      >
        {TOP_COINS.map((coin) => {
          const priceChange = calculatePriceChange(coin);
          const isPositive = priceChange.percentage >= 0;
          const changeColor = isPositive ? "#26A69A" : "#EF5350";

          return (
            <div
              key={coin}
              style={{
                border: "1px solid #ddd",
                borderRadius: "4px",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                minWidth: 0,
                background: "#fff",
              }}
            >
              <div
                style={{
                  padding: "0.5rem 1rem",
                  background: "#f5f5f5",
                  borderBottom: "1px solid #ddd",
                  fontWeight: "bold",
                  fontSize: "1rem",
                  flexShrink: 0,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                  }}
                >
                  <span>{coin}</span>
                  {coinsData[coin]?.currentCandle && (
                    <>
                      <span
                        style={{
                          fontSize: "0.9rem",
                          fontWeight: "normal",
                          color: "#333",
                        }}
                      >
                        ${coinsData[coin].currentCandle?.close.toFixed(2)}
                      </span>
                      <span
                        style={{
                          fontSize: "0.8rem",
                          fontWeight: "600",
                          color: changeColor,
                          display: "flex",
                          alignItems: "center",
                          gap: "0.2rem",
                        }}
                      >
                        {isPositive ? "▲" : "▼"}
                        {Math.abs(priceChange.percentage).toFixed(2)}%
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
                <KLineChartComponent
                  symbol={coin}
                  interval={selectedInterval}
                  initialData={coinsData[coin]?.candleData || []}
                  height="100%"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
