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

          const newEntry = {
            time: new Date().toLocaleTimeString(),
          };
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

  return (
    <div className="p-4 rounded-2xl shadow bg-gray-900 border border-gray-700">
      <h2 className="text-xl font-semibold mb-3 text-gray-100">
        📉 Container Memory Usage (%)
      </h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#444" />
          <XAxis dataKey="time" stroke="#ccc" />
          <YAxis domain={[0, 100]} stroke="#ccc" />
          <Tooltip />
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
  );
}
