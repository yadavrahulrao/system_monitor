import React, { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

export default function ContainerMonitor() {
  const [data, setData] = useState([]);
  const [containers, setContainers] = useState([]);

  // Fetch container stats every 2 seconds
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/containers");
        const json = await res.json();

        if (json.containers && json.containers.length > 0) {
          setContainers(json.containers);

          const entry = {
            time: new Date().toLocaleTimeString(),
          };

          json.containers.forEach((c) => {
            entry[c.name] = c.cpu_percent || 0;
          });

          setData((prev) => [...prev.slice(-20), entry]);
        } else {
          setContainers([]);
        }
      } catch (err) {
        console.error("Error fetching container data:", err);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, []);

  const colors = [
    "#FF5733", "#33FF57", "#3357FF", "#FF33A1",
    "#FFD433", "#33FFF5", "#A633FF", "#FF8F33"
  ];

  const handleAction = async (name, action) => {
    try {
      const res = await fetch(`/api/containers/${name}/${action}`, {
        method: "POST",
      });
      const json = await res.json();
      console.log(json);
      alert(json.message || json.error);
    } catch (err) {
      console.error("Error performing container action:", err);
    }
  };

  return (
    <div className="bg-gray-800 rounded-2xl p-6 shadow-lg">
      <h2 className="text-2xl font-bold mb-4 text-yellow-400 flex items-center">
        🧱 Podman Container Monitor
      </h2>

      {containers.length === 0 ? (
        <p className="text-gray-400">No running containers detected...</p>
      ) : (
        <>
          {containers.map((c, idx) => (
            <div key={idx} className="mb-4 border-b border-gray-700 pb-3">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-lg font-semibold">{c.name}</p>
                  <p>Image: {c.image}</p>
                  <p>CPU: {c.cpu_percent?.toFixed(2)}%</p>
                  <p>Memory: {c.mem_percent?.toFixed(2)}%</p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleAction(c.name, "start")}
                    className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded-lg"
                  >
                    ▶ Start
                  </button>
                  <button
                    onClick={() => handleAction(c.name, "stop")}
                    className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-lg"
                  >
                    ⏹ Stop
                  </button>
                </div>
              </div>
            </div>
          ))}

          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#555" />
              <XAxis dataKey="time" stroke="#aaa" />
              <YAxis stroke="#aaa" domain={[0, 100]} />
              <Tooltip />
              <Legend />
              {containers.map((c, i) => (
                <Line
                  key={c.name}
                  type="monotone"
                  dataKey={c.name}
                  stroke={colors[i % colors.length]}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}
