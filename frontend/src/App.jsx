import React, { useEffect, useMemo, useState } from "react";
import ContainerMonitor from "./components/ContainerMonitor";
import AlertCenter from "./components/AlertCenter";
import HistoricalAnalytics from "./components/HistoricalAnalytics";
import AdvancedSystemPanel from "./components/AdvancedSystemPanel";
import HardwareHealth from "./components/HardwareHealth";
import { useMonitoring } from "./MonitoringContext";
import ContainerMemoryChart from "./components/ContainerMemoryChart";
import SystemMemoryChart from "./components/SystemMemoryChart";
import SystemNetworkChart from "./components/SystemNetworkChart";
import SystemDiskChart from "./components/SystemDiskChart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const formatRate = (value = 0) => `${Number(value || 0).toFixed(1)} KB/s`;
const formatBytes = (bytes = 0) => {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Number(bytes) || 0;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(unit ? 1 : 0)} ${units[unit]}`;
};

function MetricCard({ icon, label, value, detail, percent, tone = "blue" }) {
  return <article className={`metric-card metric-${tone}`}>
    <div className="metric-card-top"><span className="metric-icon">{icon}</span><span className="metric-label">{label}</span><span className="metric-live-dot" /></div>
    <div className="metric-value">{value}</div>
    <div className="metric-detail">{detail}</div>
    {Number.isFinite(Number(percent)) && <div className="metric-track"><span style={{ width: `${Math.min(100, Math.max(0, Number(percent)))}%` }} /></div>}
  </article>;
}

function SectionHeading({ eyebrow, title, description, action }) {
  return <div className="section-heading"><div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>;
}

export default function App() {
  const [coreHistory, setCoreHistory] = useState([]);
  const [host, setHost] = useState(null);
  const { metrics, connectionStatus } = useMonitoring();

  useEffect(() => {
    fetch("/api/system/advanced").then(r => r.ok ? r.json() : null).then(setHost).catch(() => {});
    const timer = window.setInterval(() => fetch("/api/system/advanced").then(r => r.ok ? r.json() : null).then(setHost).catch(() => {}), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!metrics?.cpu?.cores) return;
    const point = { time: new Date((metrics.timestamp || Date.now() / 1000) * 1000).toLocaleTimeString() };
    metrics.cpu.cores.forEach((value, index) => { point[`core${index}`] = value; });
    setCoreHistory(previous => [...previous.slice(-35), point]);
  }, [metrics]);

  const cpu = Number(metrics?.cpu?.overall ?? metrics?.cpu?.percent ?? 0);
  const memory = Number(metrics?.memory?.percent ?? 0);
  const disk = Number(metrics?.disk_percent ?? 0);
  const coreCount = metrics?.cpu?.cores?.length || 0;
  const colors = ["#3978e8", "#16a085", "#e0a12f", "#8b69d6", "#e16d83", "#20a4b8", "#6b9d46", "#c17b45"];
  const updated = metrics?.timestamp ? new Date(metrics.timestamp * 1000).toLocaleTimeString() : "Waiting for first sample";
  const connectionLabel = connectionStatus === "connected" ? "Live connection" : connectionStatus === "connecting" ? "Connecting" : `Reconnecting · ${connectionStatus}`;
  const navItems = useMemo(() => [
    ["overview", "Overview", "▦"], ["performance", "Performance", "⌁"], ["containers", "Containers", "▣"], ["alerts", "Alerts", "◉"], ["history", "Historical analytics", "▤"], ["hardware", "Hardware health", "⚙"], ["host-details", "Host details", "⌘"],
  ], []);

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#overview"><span className="brand-mark">SM</span><span><strong>SYSTEM</strong><small>MONITORING</small></span></a>
      <div className="sidebar-caption">WORKSPACE</div>
      <nav className="side-nav" aria-label="Main navigation">
        {navItems.map(([id, label, icon], index) => <a key={id} className={index === 0 ? "nav-link active" : "nav-link"} href={`#${id}`}><span className="nav-icon">{icon}</span>{label}</a>)}
      </nav>
      <div className="sidebar-bottom"><div className="sidebar-status"><span className={`status-dot ${connectionStatus === "connected" ? "online" : "offline"}`} /><div><strong>{connectionStatus === "connected" ? "Monitoring active" : "Connection pending"}</strong><small>Metrics stream</small></div></div><div className="sidebar-version">System Monitor <span>v1.0</span></div></div>
    </aside>

    <main className="main-area" id="overview">
      <header className="topbar"><div className="breadcrumb">SYSTEM <span>/</span> <strong>CONTAINER</strong></div><div className="topbar-right"><span className={`connection-pill ${connectionStatus === "connected" ? "is-online" : "is-offline"}`}><i />{connectionLabel}</span><span className="topbar-time">Updated {updated}</span><div className="avatar">SM</div></div></header>

      <div className="page-content">
        <section className="welcome-row"><div><h1> SYSTEM HEALTH</h1></div><div className="host-chip"><span className="host-chip-icon">⌘</span><div><small>MONITORED HOST</small><strong>{host?.hostname || "Local host"}</strong></div><span className="host-chip-dot" /></div></section>

        <section className="metric-grid" aria-label="Live system metrics">
          <MetricCard icon="◉" label="CPU utilization" value={`${cpu.toFixed(1)}%`} detail={`${metrics?.cpu?.logical_cores ?? host?.cpu?.logical_cores ?? "—"} logical cores`} percent={cpu} tone="blue" />
          <MetricCard icon="▥" label="Memory utilization" value={`${memory.toFixed(1)}%`} detail={metrics?.memory ? `${formatBytes(metrics.memory.used)} of ${formatBytes(metrics.memory.total)}` : "Waiting for memory data"} percent={memory} tone="violet" />
          <MetricCard icon="▤" label="Network · download" value={formatRate(metrics?.network?.download)} detail={`Upload ${formatRate(metrics?.network?.upload)}`} tone="green" />
          <MetricCard icon="▦" label="Disk I/O" value={formatRate(metrics?.disk?.read)} detail={`Write ${formatRate(metrics?.disk?.write)}`} tone="amber" />
        </section>

        <section className="content-section" id="performance">
          <SectionHeading eyebrow="REAL-TIME PERFORMANCE" title="Computer Performance" description="Activity and Resource utilization" />
          <div className="panel-card chart-panel"><div className="panel-heading"><div><h3>CPU Core</h3><p>Logical processor</p></div><span className="chart-legend"><i /> Live stream</span></div>
            {coreCount ? <ResponsiveContainer width="100%" height={285}><LineChart data={coreHistory} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}><CartesianGrid stroke="#edf1f6" vertical={false} /><XAxis dataKey="time" tick={{ fill: "#8290a3", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={28} /><YAxis domain={[0, 100]} tick={{ fill: "#8290a3", fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ border: "1px solid #e6ebf2", borderRadius: 12, boxShadow: "0 8px 24px #1e293b14" }} /><Line type="monotone" dataKey="core0" stroke="#3978e8" strokeWidth={2.5} dot={false} isAnimationActive={false} name="Core 0" />{Array.from({ length: Math.max(0, coreCount - 1) }).map((_, index) => <Line key={index + 1} type="monotone" dataKey={`core${index + 1}`} stroke={colors[(index + 1) % colors.length]} strokeWidth={1.7} dot={false} isAnimationActive={false} name={`Core ${index + 1}`} />)}</LineChart></ResponsiveContainer> : <div className="empty-state">Waiting for live CPU samples…</div>}
          </div>
          <div className="secondary-chart-grid"><div className="panel-card embedded-panel"><SystemMemoryChart /></div><div className="panel-card embedded-panel"><SystemNetworkChart /></div></div>
          <div className="panel-card embedded-panel"><SystemDiskChart /></div>
        </section>

        <section className="content-section" id="containers"><SectionHeading eyebrow="CONTAINER OPERATIONS" title="Container Monitoring"/><div className="panel-card embedded-panel"><ContainerMonitor /></div><div className="panel-card embedded-panel"><ContainerMemoryChart /></div></section>

        <section className="content-section" id="alerts"><SectionHeading eyebrow="EVENT MANAGEMENT" title="Alerts and Notifications" /><div className="panel-card embedded-panel"><AlertCenter /></div></section>

        <section className="content-section" id="history"><SectionHeading eyebrow="CAPACITY & TRENDS" title="Historical analytics"  /><div className="panel-card embedded-panel"><HistoricalAnalytics /></div></section>

        <section className="content-section" id="hardware"><SectionHeading eyebrow="DEVICE DIAGNOSTICS" title="Hardware Health Center" description="Components, Sensor Readings" /><div className="panel-card embedded-panel"><HardwareHealth /></div></section>

        <section className="content-section" id="host-details"><SectionHeading eyebrow="HOST DIAGNOSTICS" title="PROCESSES" /><div className="panel-card embedded-panel"><AdvancedSystemPanel /></div></section>
        <footer className="app-footer"><span>SYSTEM AND CONTAINER MONITORING</span></footer>
      </div>
    </main>
  </div>;
}
