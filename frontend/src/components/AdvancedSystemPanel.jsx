import React, { useCallback, useEffect, useState } from "react";

const formatBytes = (value = 0) => {
  if (!Number.isFinite(Number(value))) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = Number(value);
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
};

const formatUptime = (seconds = 0) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
};

function MetricCard({ label, value, detail }) {
  return (
    <div className="col-6 col-xl-3">
      <div className="h-100 rounded border border-secondary bg-black bg-opacity-25 p-3">
        <div className="small text-secondary">{label}</div>
        <div className="fs-4 fw-semibold text-light">{value}</div>
        {detail && <div className="small text-secondary">{detail}</div>}
      </div>
    </div>
  );
}

export default function AdvancedSystemPanel() {
  const [metrics, setMetrics] = useState(null);
  const [processes, setProcesses] = useState([]);
  const [sortBy, setSortBy] = useState("cpu_percent");
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [metricsResponse, processResponse] = await Promise.all([
        fetch("/api/system/advanced"),
        fetch(`/api/processes?limit=15&sort_by=${sortBy}`),
      ]);
      if (!metricsResponse.ok || !processResponse.ok) {
        throw new Error("The backend could not provide advanced system metrics.");
      }
      const [metricsJson, processJson] = await Promise.all([
        metricsResponse.json(),
        processResponse.json(),
      ]);
      setMetrics(metricsJson);
      setProcesses(processJson.processes || []);
      setUpdatedAt(new Date());
      setError("");
    } catch (err) {
      setError(err.message || "Unable to load advanced system metrics.");
    }
  }, [sortBy]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  const cpu = metrics?.cpu;
  const memory = metrics?.memory;
  const frequency = cpu?.frequency;

  return (
    <section className="card bg-dark text-light border border-secondary shadow-lg mb-5">
      <div className="card-body p-3 p-lg-4">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-4">
          <div>
            <h2 className="h4 text-info fw-bold mb-1">Daemons</h2>
            {/* <div className="small text-secondary">
              {metrics?.hostname || "Detecting host…"}
              {metrics?.platform ? ` · ${metrics.platform}` : ""}
            </div> */}
          </div>
          <div className="small text-secondary">
            {updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : "Waiting for metrics…"}
          </div>
        </div>

        {error && <div className="alert alert-warning py-2" role="alert">{error}</div>}

        <div className="row g-3 mb-4">
          <MetricCard label="CPU cores" value={`${cpu?.physical_cores ?? "—"} physical`} detail={`${cpu?.logical_cores ?? "—"} logical`} />
          <MetricCard label="CPU frequency" value={frequency?.current_mhz ? `${frequency.current_mhz} MHz` : "Unavailable"} detail={frequency?.max_mhz ? `Max ${frequency.max_mhz} MHz` : "Hardware data not exposed"} />
          <MetricCard label="Memory available" value={memory ? formatBytes(memory.available) : "—"} detail={memory ? `${memory.percent}% used` : ""} />
          <MetricCard label="System uptime" value={metrics ? formatUptime(metrics.uptime_seconds) : "—"} detail={`${metrics?.process_count ?? "—"} processes`} />
        </div>

        <div className="row g-4">
          <div className="col-12 col-xl-6">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h3 className="h6 text-warning mb-0">Top processes</h3>
              <select className="form-select form-select-sm w-auto bg-dark text-light border-secondary" value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Sort processes">
                <option value="cpu_percent">Sort by CPU</option>
                <option value="memory_percent">Sort by memory %</option>
                <option value="rss">Sort by memory size</option>
              </select>
            </div>
            <div className="table-responsive">
              <table className="table table-dark table-sm table-hover align-middle mb-0">
                <thead><tr><th>Process</th><th>PID</th><th>CPU</th><th>RAM</th></tr></thead>
                <tbody>
                  {processes.map((process) => (
                    <tr key={`${process.pid}-${process.name}`}>
                      <td className="text-truncate" style={{ maxWidth: 190 }} title={process.name}>{process.name}</td>
                      <td>{process.pid}</td>
                      <td>{Number(process.cpu_percent || 0).toFixed(1)}%</td>
                      <td title={formatBytes(process.rss)}>{Number(process.memory_percent || 0).toFixed(1)}%</td>
                    </tr>
                  ))}
                  {processes.length === 0 && <tr><td colSpan="4" className="text-secondary text-center">No process data available yet.</td></tr>}
                </tbody>
              </table>
            </div>
            {/* <p className="small text-secondary mt-2 mb-0">Process visibility depends on the permissions of the backend user. CPU percentages may need a second sample to become meaningful.</p> */}
          </div>

          <div className="col-12 col-xl-6">
            <h3 className="h6 text-warning mb-2">Hardware temperatures</h3>
            {metrics?.temperatures?.length ? (
              <div className="table-responsive mb-4">
                <table className="table table-dark table-sm align-middle mb-0">
                  <thead><tr><th>Sensor</th><th>Current</th><th>High</th></tr></thead>
                  <tbody>{metrics.temperatures.map((sensor, index) => <tr key={`${sensor.sensor}-${sensor.label}-${index}`}><td>{sensor.label}</td><td>{sensor.current_c} °C</td><td>{sensor.high_c == null ? "—" : `${sensor.high_c} °C`}</td></tr>)}</tbody>
                </table>
              </div>
            ) : <p className="small text-secondary mb-4">Temperature sensors are not exposed by this operating system or hardware.</p>}

            <h3 className="h6 text-warning mb-2">Network interfaces</h3>
            <div className="table-responsive">
              <table className="table table-dark table-sm align-middle mb-0">
                <thead><tr><th>Interface</th><th>Status</th><th>Received</th><th>Sent</th><th>Errors</th></tr></thead>
                <tbody>
                  {(metrics?.network_interfaces || []).map((network) => (
                    <tr key={network.name}>
                      <td title={(network.ip_addresses || []).join(", ")}>{network.name}</td>
                      <td><span className={`badge ${network.is_up ? "bg-success" : "bg-secondary"}`}>{network.is_up ? "Up" : "Down"}</span></td>
                      <td>{formatBytes(network.bytes_recv)}</td>
                      <td>{formatBytes(network.bytes_sent)}</td>
                      <td>{(network.errors_in || 0) + (network.errors_out || 0)}</td>
                    </tr>
                  ))}
                  {!metrics?.network_interfaces?.length && <tr><td colSpan="5" className="text-secondary text-center">No interface data available.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
