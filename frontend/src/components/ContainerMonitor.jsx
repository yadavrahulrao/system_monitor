import React, { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";

export default function ContainerMonitor() {
  const [containers, setContainers] = useState([]);
  const [chartData, setChartData] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      const res = await fetch("/api/containers");
      const data = await res.json();
      if (data.containers) {
        setContainers(data.containers);

        // Prepare data for chart
        const timestamp = new Date().toLocaleTimeString();
        const point = {};
        data.containers.forEach((c) => {
          const cpu = parseFloat(c.cpu.replace("%", "")) || 0;
          point[c.name] = cpu;
        });
        setChartData((prev) => [...prev.slice(-20), { time: timestamp, ...point }]);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-4 bg-gray-800 rounded-2xl shadow-lg">
      <h2 className="text-xl font-semibold mb-4 text-yellow-400 text-center">
        🧱 Podman Container Monitor
      </h2>

      {containers.length === 0 ? (
        <p className="text-gray-400 text-center">No containers running.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 mb-6">
            {containers.map((c) => (
              <div key={c.id} className="bg-gray-700 p-3 rounded-lg">
                <p className="font-bold text-green-400">{c.name}</p>
                <p>Image: <span className="text-gray-300">{c.image}</span></p>
                <p>CPU: <span className="text-blue-400">{c.cpu}</span></p>
                <p>Memory: <span className="text-pink-400">{c.mem}</span></p>
              </div>
            ))}
          </div>

          <div className="flex justify-center">
            <LineChart width={700} height={300} data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#444" />
              <XAxis dataKey="time" stroke="#aaa" />
              <YAxis stroke="#aaa" />
              <Tooltip />
              <Legend />
              {containers.map((c, idx) => (
                <Line
                  key={idx}
                  type="monotone"
                  dataKey={c.name}
                  stroke={`hsl(${(idx * 50) % 360}, 70%, 60%)`}
                  dot={false}
                />
              ))}
            </LineChart>
          </div>
        </>
      )}
    </div>
  );
}
