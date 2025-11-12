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

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const { upload, download } = payload[0].payload;
      return (
        <div className="p-2 bg-dark text-light border border-secondary rounded">
          <p className="mb-1"><strong>Time:</strong> {label}</p>
          <p className="mb-0"><strong>Upload:</strong> {upload} KB/s</p>
          <p className="mb-0"><strong>Download:</strong> {download} KB/s</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="card bg-dark text-light border border-secondary shadow-lg mb-4">
      <div className="card-body">
        <h2 className="card-title text-primary fw-bold text-center mb-4">
          📡 System Network Usage (KB/s)
        </h2>
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#555" />
              <XAxis dataKey="time" stroke="#ccc" />
              <YAxis stroke="#ccc" />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line type="monotone" dataKey="download" stroke="#33FF57" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="upload" stroke="#FF5733" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
