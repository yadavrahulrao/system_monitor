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

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const read = payload[0]?.payload.read;
      const write = payload[0]?.payload.write;
      return (
        <div className="p-2 bg-dark text-light border border-secondary rounded">
          <p className="mb-1"><strong>Time:</strong> {label}</p>
          <p className="mb-0"><strong>Read:</strong> {read} KB/s</p>
          <p className="mb-0"><strong>Write:</strong> {write} KB/s</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="card bg-dark text-light border border-secondary shadow-lg mb-4">
      <div className="card-body">
        <h2 className="card-title text-info fw-bold text-center mb-4">
          💽 System Disk I/O (KB/s)
        </h2>
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#555" />
              <XAxis dataKey="time" stroke="#ccc" />
              <YAxis stroke="#ccc" />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line type="monotone" dataKey="read" stroke="#33B5FF" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="write" stroke="#FF8C33" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
