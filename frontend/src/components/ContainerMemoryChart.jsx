import React, { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function ContainerMemoryChart() {
  const [data, setData] = useState([]);
  const [containers, setContainers] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/containers");
        const json = await res.json();

        if (json.containers) {
          setContainers(json.containers);

          const newEntry = { time: new Date().toLocaleTimeString() };
          json.containers.forEach((c) => {
            newEntry[c.name] = parseFloat(c.mem_percent || 0);
          });

          setData((prev) => [...prev.slice(-30), newEntry]);
        }
      } catch (e) {
        console.error("Error fetching memory stats:", e);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, []);

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="p-2 bg-dark text-light border border-secondary rounded">
          <p className="mb-1"><strong>Time:</strong> {label}</p>
          {payload.map((item, i) => (
            <p key={i} className="mb-0">
              <strong>{item.name}:</strong> {item.value}%
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="card bg-dark text-light border border-secondary shadow-lg mb-4">
      <div className="card-body">
        <h2 className="card-title text-warning fw-bold text-center mb-4">
          📉 Container Memory Usage (%)
        </h2>
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#555" />
              <XAxis dataKey="time" stroke="#ccc" />
              <YAxis domain={[0, 100]} stroke="#ccc" />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              {containers.map((c, i) => (
                <Line
                  key={c.name}
                  type="monotone"
                  dataKey={c.name}
                  stroke={`hsl(${(i * 60) % 360}, 70%, 60%)`}
                  dot={false}
                  strokeWidth={2}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
