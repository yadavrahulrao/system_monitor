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

export default function SystemDiskChart() {
  const [data, setData] = useState([]);

  useEffect(() => {
    const fetchDisk = async () => {
      try {
        const res = await fetch("/api/disk");
        const json = await res.json();
        const entry = {
          time: new Date().toLocaleTimeString(),
          read: json.read,
          write: json.write,
        };
        setData((prev) => [...prev.slice(-30), entry]);
      } catch (err) {
        console.error("Error fetching disk data:", err);
      }
    };

    fetchDisk();
    const interval = setInterval(fetchDisk, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-4 bg-gray-900 border border-gray-700 rounded-2xl shadow-md">
      <h2 className="text-xl font-semibold mb-3 text-gray-100">
        💽 System Disk I/O (KB/s)
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
            dataKey="read"
            stroke="#33B5FF"
            strokeWidth={2}
            dot={false}
            name="Read (KB/s)"
          />
          <Line
            type="monotone"
            dataKey="write"
            stroke="#FF8C33"
            strokeWidth={2}
            dot={false}
            name="Write (KB/s)"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
