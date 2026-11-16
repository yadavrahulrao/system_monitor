import React, { useCallback, useEffect, useState } from "react";
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";

const RANGE_OPTIONS = [
  ["1h", "Last hour"], ["6h", "Last 6 hours"], ["24h", "Last 24 hours"],
  ["7d", "Last 7 days"], ["30d", "Last 30 days"],
];
const METRICS = [
  ["cpu_percent", "CPU", "%"], ["memory_percent", "Memory", "%"],
  ["disk_percent", "Disk", "%"],
];

function StatCard({ title, stat, unit = "%" }) {
  return (
    <div className="col-12 col-md-4">
      <div className="card bg-black border-secondary h-100">
        <div className="card-body">
          <div className="text-secondary small">{title} average</div>
          <div className="fs-3 fw-semibold text-info">{stat?.average ?? "—"}{stat ? unit : ""}</div>
          <div className="small text-secondary">Min {stat?.minimum ?? "—"}{stat ? unit : ""} · Max {stat?.maximum ?? "—"}{stat ? unit : ""}</div>
        </div>
      </div>
    </div>
  );
}

export default function HistoricalAnalytics() {
  const [range, setRange] = useState("24h");
  const [samples, setSamples] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [metricsResponse, summaryResponse] = await Promise.all([
        fetch(`/api/history/metrics?range=${range}&limit=1000`),
        fetch(`/api/history/summary?range=${range}`),
      ]);
      if (!metricsResponse.ok || !summaryResponse.ok) throw new Error("Unable to load historical metrics. Check the backend connection.");
      const [metricsData, summaryData] = await Promise.all([metricsResponse.json(), summaryResponse.json()]);
      setSamples((metricsData.samples || []).map((item) => ({
        ...item,
        label: new Date(item.timestamp * 1000).toLocaleString(),
      })));
      setSummary(summaryData);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    setLoading(true);
    refresh();
    const timer = window.setInterval(refresh, 60000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  function exportCsv() {
    window.location.assign(`/api/history/export.csv?range=${range}`);
  }

  const hasData = samples.length > 0;
  return (
    <section className="text-light">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
        <div>
          <h2 className="h4 text-info mb-1">Historical Monitoring & Analytics</h2>
          <p className="text-secondary mb-0">Persistent Host Metrics & Trends</p>
        </div>
        <div className="d-flex gap-2">
          <select className="form-select form-select-sm bg-dark text-light border-secondary" value={range} onChange={(event) => setRange(event.target.value)} aria-label="Historical time range">
            {RANGE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button className="btn btn-outline-info btn-sm" onClick={exportCsv} disabled={!hasData}>Export CSV</button>
        </div>
      </div>

      {error && <div className="alert alert-danger py-2">{error}</div>}
      <div className="row g-3 mb-3">
        <StatCard title="CPU" stat={summary?.cpu_percent} />
        <StatCard title="Memory" stat={summary?.memory_percent} />
        <StatCard title="Disk" stat={summary?.disk_percent} />
      </div>
      <div className="d-flex flex-wrap justify-content-between gap-2 small text-secondary mb-2">
        <span>{summary ? `${summary.sample_count.toLocaleString()} -- Stored Samples` : "Loading sample count…"}</span>
        <span>Auto-Refresh</span>
      </div>

      <div className="card bg-black border-secondary mb-3">
        <div className="card-body">
          <h3 className="h6 text-info">CPU, memory and disk utilization</h3>
          {loading && !hasData ? <p className="text-secondary">Loading historical data…</p> : !hasData ? <p className="text-secondary mb-0">No historical samples yet. Keep the backend running for at least five seconds.</p> : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={samples}>
                <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                <XAxis dataKey="label" stroke="#aaa" minTickGap={35} tick={{ fontSize: 11 }} />
                <YAxis stroke="#aaa" domain={[0, 100]} />
                <Tooltip labelFormatter={(label) => label} />
                <Legend />
                <Line type="monotone" dataKey="cpu_percent" name="CPU %" stroke="#38bdf8" dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="memory_percent" name="Memory %" stroke="#a78bfa" dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="disk_percent" name="Disk %" stroke="#fbbf24" dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="card bg-black border-secondary">
        <div className="card-body">
          <h3 className="h6 text-info">Network throughput</h3>
          {!hasData ? <p className="text-secondary mb-0">Network history will appear as samples are collected.</p> : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={samples}>
                <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                <XAxis dataKey="label" stroke="#aaa" minTickGap={35} tick={{ fontSize: 11 }} />
                <YAxis stroke="#aaa" />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="net_upload_kbps" name="Upload KB/s" stroke="#34d399" dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="net_download_kbps" name="Download KB/s" stroke="#fb7185" dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </section>
  );
}
