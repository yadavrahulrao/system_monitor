import React, { useEffect, useState } from "react";
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

  useEffect(() => {
    const fetchMem = async () => {
      try {
        const res = await fetch("/api/memory");
        const json = await res.json();

        const entry = {
          time: new Date().toLocaleTimeString(),
          percent: json.percent,
          used: json.used,
          total: json.total,
        };

        setData((prev) => [...prev.slice(-30), entry]);
      } catch (err) {
        console.error("Error fetching memory data:", err);
      }
    };

    fetchMem();
    const interval = setInterval(fetchMem, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-4 bg-gray-900 border border-gray-700 rounded-2xl shadow-md">
      <h2 className="text-xl font-semibold mb-3 text-gray-100">
        💾 System Memory Usage (%)
      </h2>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#444" />
          <XAxis dataKey="time" stroke="#ccc" />
          <YAxis domain={[0, 100]} stroke="#ccc" />
          <Tooltip />
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

      {data.length > 0 && (
        <p className="mt-3 text-sm text-gray-400">
          Used: {data[data.length - 1].used} GB / {data[data.length - 1].total} GB
        </p>
      )}
    </div>
  );
}
