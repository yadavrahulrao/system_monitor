import React, { useCallback, useEffect, useMemo, useState } from "react";

const STATUS = {
  healthy: { label: "Operational", icon: "✓" },
  warning: { label: "Warning", icon: "!" },
  critical: { label: "Critical", icon: "×" },
  unknown: { label: "Unverified", icon: "?" },
  "not-tested": { label: "Not tested", icon: "○" },
};

const CATEGORY_LABELS = {
  all: "All components", compute: "Compute", memory: "Memory", storage: "Storage",
  cooling: "Cooling & thermal", power: "Power", system: "System board",
  connectivity: "Connectivity", peripherals: "Peripherals",
};

function pretty(value) {
  if (value === null || value === undefined || value === "") return "Not available";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "None detected";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function DetailRows({ details }) {
  if (!details || !Object.keys(details).length) return <p className="hardware-muted">No additional telemetry was exposed by this system.</p>;
  return <div className="hardware-detail-grid">
    {Object.entries(details).map(([key, value]) => {
      if (value === null || value === undefined || key === "error") return null;
      const label = key.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
      if (Array.isArray(value)) {
        return <div className="hardware-detail-row hardware-detail-wide" key={key}><span>{label}</span><strong>{value.length ? value.map((entry, i) => typeof entry === "object" ? Object.entries(entry).map(([k, v]) => `${k.replaceAll("_", " ")}: ${pretty(v)}`).join(" · ") : pretty(entry)).join("; ") : "None detected"}</strong></div>;
      }
      if (typeof value === "object") {
        return <div className="hardware-detail-row hardware-detail-wide" key={key}><span>{label}</span><strong>{Object.entries(value).map(([k, v]) => `${k.replaceAll("_", " ")}: ${pretty(v)}`).join(" · ")}</strong></div>;
      }
      return <div className="hardware-detail-row" key={key}><span>{label}</span><strong>{pretty(value)}</strong></div>;
    })}
  </div>;
}

export default function HardwareHealth() {
  const [report, setReport] = useState(null);
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState({});

  const loadTests = useCallback(async () => {
    try {
      const response = await fetch("/api/hardware/tests");
      if (response.ok) {
        const data = await response.json();
        setTests(data.tests || []);
      }
    } catch { /* optional manual test catalog */ }
  }, []);

  const scan = useCallback(async (fresh = false) => {
    fresh ? setScanning(true) : setLoading(true);
    setError("");
    try {
      const response = await fetch(fresh ? "/api/hardware/scan" : "/api/hardware/overview", fresh ? { method: "POST" } : undefined);
      if (!response.ok) throw new Error(`Hardware scan failed (${response.status})`);
      setReport(await response.json());
    } catch (err) {
      setError(err.message || "Unable to load hardware diagnostics");
    } finally {
      setLoading(false);
      setScanning(false);
    }
  }, []);

  useEffect(() => { scan(); loadTests(); }, [scan, loadTests]);

  const components = report?.components || [];
  const visible = useMemo(() => components.filter(item => filter === "all" || item.category === filter), [components, filter]);
  const summary = report?.summary || {};

  return <div className="hardware-health">
    <div className="hardware-toolbar">
      <div><div className="hardware-overline">READ-ONLY DEVICE</div><h3>Hardware Health Center</h3></div>
      <button className="hardware-scan-button" onClick={() => scan(true)} disabled={loading || scanning}><span>{scanning ? "◌" : "↻"}</span>{scanning ? "Scanning…" : "Run hardware scan"}</button>
    </div>

    {error && <div className="hardware-error" role="alert">{error}. Check that the backend is running and try again.</div>}
    {loading && !report ? <div className="hardware-loading">Collecting hardware information…</div> : report && <>
      <div className="hardware-summary">
        <div className="hardware-summary-main"><span className="hardware-summary-icon">⌘</span><div><small>SCANNED HOST</small><strong>{report.hostname || "Local host"}</strong><span>{report.platform?.system} {report.platform?.release} · {report.platform?.machine}</span></div></div>
        <div className="hardware-summary-counts">
          <div><strong>{summary.total ?? components.length}</strong><span>Components</span></div>
          <div className="count-good"><strong>{summary.healthy ?? 0}</strong><span>Operational</span></div>
          <div className="count-warning"><strong>{summary.warning ?? 0}</strong><span>Warnings</span></div>
          <div className="count-critical"><strong>{summary.critical ?? 0}</strong><span>Critical</span></div>
          <div className="count-unknown"><strong>{summary.unknown ?? 0}</strong><span>Unverified</span></div>
        </div>
      </div>

      <div className="hardware-notice"><span>ⓘ</span><div><strong>Detection is not the same as a full hardware test.</strong><p>“Unverified” means the operating system did not expose enough information to confirm physical health. No stress tests, firmware changes, camera capture or destructive tests are run automatically.</p></div></div>

      <div className="hardware-filter-row"><div><strong>Detected components</strong><span>{visible.length} shown</span></div><select value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter hardware components">{Object.entries(CATEGORY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>

      <div className="hardware-component-grid">
        {visible.map(item => {
          const status = STATUS[item.status] || STATUS.unknown;
          const open = Boolean(expanded[item.id]);
          return <article className={`hardware-component-card status-${item.status}`} key={item.id}>
            <button className="hardware-component-head" onClick={() => setExpanded(prev => ({ ...prev, [item.id]: !prev[item.id] }))} aria-expanded={open}>
              <span className="hardware-component-symbol">{({ cpu: "▦", memory: "▤", thermal: "♨", fans: "◉", storage: "▱", battery: "▰", gpu: "▧", motherboard: "▦", network: "⌁", usb: "⇄", audio: "♫", camera: "◎", bluetooth: "ᛒ", keyboard: "⌨", touchpad: "▣", display: "▭" })[item.id] || "◇"}</span>
              <span className="hardware-component-title"><strong>{item.name}</strong><small>{CATEGORY_LABELS[item.category] || item.category}</small></span>
              <span className={`hardware-status status-pill-${item.status}`}><i>{status.icon}</i>{status.label}</span>
              <span className={`hardware-chevron ${open ? "is-open" : ""}`}>⌄</span>
            </button>
            <p className="hardware-component-summary">{item.summary}</p>
            {open && <div className="hardware-component-expanded"><DetailRows details={item.details} />{item.note && <div className="hardware-component-note">{item.note}</div>}</div>}
          </article>;
        })}
      </div>
      {!visible.length && <div className="hardware-loading">No components in this category.</div>}

      <div className="hardware-tools-row"><div><strong>Diagnostic utilities</strong></div><div className="hardware-tool-list">{Object.entries(report.diagnostic_tools || {}).map(([name, installed]) => <span key={name} className={installed ? "tool-installed" : "tool-missing"}><i />{name}</span>)}</div></div>
      <div className="hardware-test-section"><div className="hardware-test-heading"><div><strong>Guided hardware tests</strong><p>Tests that require your interaction or special boot-time tools.</p></div><span>Manual / user initiated</span></div>
        <div className="hardware-test-grid">{tests.map(test => <article key={test.id} className="hardware-test-card"><div><strong>{test.name}</strong><span>{test.kind.replaceAll("_", " ")}</span></div><p>{test.instructions}</p></article>)}</div>
      </div>
      <div className="hardware-footnote">Last scan: {new Date((report.scanned_at || 0) * 1000).toLocaleString()} · Scan mode: {report.safety?.mode || "read-only"}. {report.safety?.message}</div>
    </>}
  </div>;
}
