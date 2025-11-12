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

  useEffect(() => {
    const fetchCPU = async () => {
      try {
        const res = await fetch("/api/cpu");
        const json = await res.json();

        const entry = {
          time: new Date().toLocaleTimeString(),
        };

        json.cores.forEach((val, i) => {
          entry[`core${i}`] = val;
        });

        setCoreCount(json.cores.length);
        setData((prev) => [...prev.slice(-20), entry]);
      } catch (err) {
        console.error("Error fetching CPU data:", err);
      }
    };

    fetchCPU();
    const interval = setInterval(fetchCPU, 2000);
    return () => clearInterval(interval);
  }, []);

  const colors = [
    "#FF5733",
    "#33FF57",
    "#3357FF",
    "#FF33A1",
    "#FFD433",
    "#33FFF5",
    "#A633FF",
    "#FF8F33",
  ];

  return (
    <div className="container-fluid bg-dark text-light py-5">
      <header className="text-center mb-5">
        <h1
          className="display-4 fw-bold text-primary"
          style={{
            textShadow:
              "0 0 20px rgba(59,130,246,0.8), 0 0 40px rgba(37,99,235,0.6)",
          }}
        >
           Container & System Monitoring
        </h1>
      </header>

      {/* 🧩 CPU Core Usage Monitor */}
      <div className="card bg-dark border border-secondary shadow-lg mb-5">
        <div className="card-body">
          <h2 className="h5 text-center text-info fw-semibold mb-3">
            CPU Core Usage
          </h2>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#444" />
              <XAxis dataKey="time" stroke="#aaa" />
              <YAxis stroke="#aaa" domain={[0, 100]} />
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
      </div>

      {/* 🧱 Podman Container Monitor */}
      <div className="card bg-dark border border-secondary shadow-lg mb-5">
        <div className="card-body">
          <ContainerMonitor />
        </div>
      </div>

      {/* Memory monitoring chart */}
      <div className="card bg-dark border border-secondary shadow-lg mb-5">
        <div className="card-body">
          <ContainerMemoryChart />
        </div>
      </div>

      <div className="card bg-dark border border-secondary shadow-lg mb-5">
        <div className="card-body">
          <SystemMemoryChart />
        </div>
      </div>

      <div className="card bg-dark border border-secondary shadow-lg mb-5">
        <div className="card-body">
          <SystemNetworkChart />
        </div>
      </div>

      <div className="card bg-dark border border-secondary shadow-lg mb-5">
        <div className="card-body">
          <SystemDiskChart />
        </div>
      </div>
    </div>
  );
}
