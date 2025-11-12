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

  // ✅ Custom Tooltip to show time and container CPU usage
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div
          className="bg-dark text-light p-2 rounded border border-secondary"
          style={{ fontSize: "0.85rem" }}
        >
          <p className="mb-1 fw-bold text-info">Time: {label}</p>
          {payload.map((p, index) => (
            <p key={index} className="mb-0">
              <span style={{ color: p.stroke }}>{p.name}:</span>{" "}
              {p.value.toFixed(2)}%
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="card bg-dark text-light shadow-lg border border-secondary mb-4">
      <div className="card-body">
        <h2 className="card-title text-warning fw-bold mb-4 text-center">
          🧱 Podman Container Monitor
        </h2>

        {containers.length === 0 ? (
          <p className="text-secondary text-center">
            No running containers detected...
          </p>
        ) : (
          <>
            {containers.map((c, idx) => (
              <div
                key={idx}
                className="border-bottom border-secondary pb-3 mb-3"
              >
                <div className="d-flex justify-content-between align-items-center">
                  <div>
                    <p className="h6 text-uppercase fw-semibold">{c.name}</p>
                    <p className="mb-0">
                      CPU Usage: {c.cpu_percent?.toFixed(2)}%
                    </p>
                    <p className="mb-0">
                      Memory Usage: {c.mem_percent?.toFixed(2)}%
                    </p>
                  </div>

                  <div>
                    <button
                      onClick={() => handleAction(c.name, "stop")}
                      className="btn btn-danger btn-sm px-3 py-1"
                    >
                      ⏹ Stop
                    </button>
                  </div>
                </div>
              </div>
            ))}

            <div style={{ width: "100%", height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#555" />
                  <XAxis dataKey="time" stroke="#ccc" />
                  <YAxis stroke="#ccc" domain={[0, 100]} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  {containers.map((c, i) => (
                    <Line
                      key={c.name}
                      type="monotone"
                      dataKey={c.name}
                      stroke={colors[i % colors.length]}
                      dot={false}
                      strokeWidth={2}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
