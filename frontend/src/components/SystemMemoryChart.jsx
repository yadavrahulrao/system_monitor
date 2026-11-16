import React, { useEffect, useState } from "react";
import { useMonitoring } from "../MonitoringContext";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function SystemMemoryChart() {
  const [data, setData] = useState([]);
  const { metrics } = useMonitoring();

  useEffect(() => {
    if (!metrics?.memory) return;
    const entry = {
      time: new Date(metrics.timestamp * 1000).toLocaleTimeString(),
      percent: metrics.memory.percent,
      used: Number((metrics.memory.used / (1024 ** 3)).toFixed(2)),
      total: Number((metrics.memory.total / (1024 ** 3)).toFixed(2)),
    };
    setData((previous) => [...previous.slice(-29), entry]);
  }, [metrics]);

  // ✅ Custom tooltip content
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const { percent } = payload[0].payload;
      return (
        <div
          style={{
            backgroundColor: "#222",
            border: "1px solid #666",
            borderRadius: "8px",
            padding: "8px 12px",
            color: "#fff",
          }}
        >
          <p className="mb-1">
            <strong>Time:</strong> {label}
          </p>
          <p className="mb-0">
            <strong>Memory Usage:</strong> {percent}%
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="card bg-dark text-light border border-secondary shadow-lg mb-4">
      <div className="card-body">
        <h2 className="card-title text-success fw-bold text-center mb-4">
          💾 System Memory Usage (%)
        </h2>

        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#555" />
              <XAxis dataKey="time" stroke="#ccc" />
              <YAxis domain={[0, 100]} stroke="#ccc" />
              {/* 👇 Use custom tooltip here */}
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="percent"
                stroke="#00FFAA"
                strokeWidth={2}
                dot={false}
                name="Memory %"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {data.length > 0 && (
          <p className="text-center text-muted mt-3">
            Used:{" "}
            <span className="text-info fw-semibold">
              {data[data.length - 1].used} GB
            </span>{" "}
            /{" "}
            <span className="text-warning fw-semibold">
              {data[data.length - 1].total} GB
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
