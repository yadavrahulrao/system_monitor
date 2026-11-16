import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const MonitoringContext = createContext({ metrics: null, connectionStatus: "connecting" });

export function MonitoringProvider({ children }) {
  const [metrics, setMetrics] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState("connecting");

  useEffect(() => {
    let socket;
    let reconnectTimer;
    let retryDelay = 1000;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws/metrics`;
      setConnectionStatus((current) => current === "connected" ? current : "connecting");
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        retryDelay = 1000;
        setConnectionStatus("connected");
      };
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type !== "error") setMetrics(payload);
        } catch (error) {
          console.error("Invalid metrics WebSocket payload:", error);
        }
      };
      socket.onerror = () => setConnectionStatus("disconnected");
      socket.onclose = () => {
        if (disposed) return;
        setConnectionStatus("reconnecting");
        reconnectTimer = window.setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 15000);
      };
    };

    connect();
    return () => {
      disposed = true;
      window.clearTimeout(reconnectTimer);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, []);

  const value = useMemo(() => ({ metrics, connectionStatus }), [metrics, connectionStatus]);
  return <MonitoringContext.Provider value={value}>{children}</MonitoringContext.Provider>;
}

export function useMonitoring() {
  return useContext(MonitoringContext);
}
