import React, { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export default function SystemNetworkChart() {
  const [data, setData] = useState([]);

  useEffect(() => {
    const fetchNetwork = async () => {
      try {
        const res = await fetch("/api/network");
        const json = await res.json();
        const entry = {
          time: new Date().toLocaleTimeString(),
          upload: json.upload,
          download: json.download,
        };
        setData((prev) => [...prev.slice(-30), entry]);
      } catch (err) {
        console.error("Error fetching network data:", err);
      }
    };

    fetchNetwork();
    const interval = setInterval(fetchNetwork, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-4 bg-gray-900 border border-gray-700 rounded-2xl shadow-md">
      <h2 className="text-xl font-semibold mb-3 text-gray-100">
        📡 System Network Usage (KB/s)
      </h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#444" />
          <XAxis dataKey="time" stroke="#ccc" />
          <YAxis stroke="#ccc" />
          <Tooltip />
          <Legend />
          <Line
            type="monotone"
            dataKey="download"
            stroke="#33FF57"
            strokeWidth={2}
            dot={false}
            name="Download (KB/s)"
          />
          <Line
            type="monotone"
            dataKey="upload"
            stroke="#FF5733"
            strokeWidth={2}
            dot={false}
            name="Upload (KB/s)"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
