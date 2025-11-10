import React, { useEffect, useState } from "react";
import ContainerMonitor from "./components/ContainerMonitor";
import ContainerMemoryChart from "./components/ContainerMemoryChart";
import SystemMemoryChart from "./components/SystemMemoryChart";
import SystemNetworkChart from "./components/SystemNetworkChart";
import SystemDiskChart from "./components/SystemDiskChart";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export default function App() {
  const [data, setData] = useState([]);
  const [coreCount, setCoreCount] = useState(0);

  // Fetch CPU data every 2 seconds
  useEffect(() => {
    const fetchCPU = async () => {
      try {
        const res = await fetch("/api/cpu");
        const json = await res.json();

        // Build entry for chart
        const entry = {
          time: new Date().toLocaleTimeString(),
        };

        json.cores.forEach((val, i) => {
          entry[`core${i}`] = val;
        });

        setCoreCount(json.cores.length);
        setData((prev) => [...prev.slice(-20), entry]); // keep last 20 samples
      } catch (err) {
        console.error("Error fetching CPU data:", err);
      }
    };

    fetchCPU();
    const interval = setInterval(fetchCPU, 2000);
    return () => clearInterval(interval);
  }, []);

  const colors = [
    "#FF5733", "#33FF57", "#3357FF", "#FF33A1",
    "#FFD433", "#33FFF5", "#A633FF", "#FF8F33"
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6 space-y-10">
      <h1 className="text-3xl font-bold mb-4 text-green-400 text-center">
        🧠 System & Podman Monitor
      </h1>

      {/* 🧩 CPU Core Usage Monitor */}
      <div className="bg-gray-800 rounded-2xl p-4 shadow-lg">
        <h2 className="text-xl mb-3 text-blue-400 font-semibold text-center">
          CPU Core Usage
        </h2>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#444" />
            <XAxis dataKey="time" stroke="#aaa" />
            <YAxis stroke="#aaa" domain={[0, 50]} />
            <Tooltip />
            <Legend />
            {Array.from({ length: coreCount }).map((_, i) => (
              <Line
                key={i}
                type="monotone"
                dataKey={`core${i}`}
                stroke={colors[i % colors.length]}
                dot={false}
                name={`Core ${i}`}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 🧱 Podman Container Monitor */}
      <ContainerMonitor />
      {/* Memory monitoring chart */}
      <ContainerMemoryChart />
      <SystemMemoryChart />
      <SystemNetworkChart />
      <SystemDiskChart /> 
    </div>
  );
}
