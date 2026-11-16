import React, { useCallback, useEffect, useRef, useState } from "react";

const API = "/api/alerts";
const metricLabels = {
  cpu_percent: "CPU usage (%)",
  memory_percent: "Memory usage (%)",
  disk_percent: "Disk usage (%)",
};

export default function AlertCenter() {
  const [rules, setRules] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [history, setHistory] = useState([]);
  const [permission, setPermission] = useState(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  );
  const notifiedIds = useRef(new Set());
  const [form, setForm] = useState({
    name: "High CPU warning", metric: "cpu_percent", threshold: 85,
    severity: "warning", cooldown_seconds: 300,
  });
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [ruleResponse, activeResponse, historyResponse] = await Promise.all([
        fetch(`${API}/rules`), fetch(`${API}/active`), fetch(`${API}/history?limit=30`),
      ]);
      if (!ruleResponse.ok || !activeResponse.ok || !historyResponse.ok) {
        throw new Error("Could not load alert data. Check that the backend is running.");
      }
      const [ruleData, activeData, historyData] = await Promise.all([
        ruleResponse.json(), activeResponse.json(), historyResponse.json(),
      ]);
      setRules(ruleData.rules || []);
      setAlerts(activeData.alerts || []);
      setHistory(historyData.alerts || []);
      for (const alert of activeData.alerts || []) {
        if (!notifiedIds.current.has(alert.id)) {
          notifiedIds.current.add(alert.id);
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification(`${alert.severity.toUpperCase()}: ${alert.rule_name}`, { body: alert.message });
          }
        }
      }
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function requestNotifications() {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPermission(result);
  }

  async function createRule(event) {
    event.preventDefault();
    try {
      const response = await fetch(`${API}/rules`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, threshold: Number(form.threshold), operator: ">=" , enabled: true }),
      });
      if (!response.ok) throw new Error((await response.json()).detail || "Unable to create rule");
      setForm({ ...form, name: "" });
      refresh();
    } catch (err) { setError(err.message); }
  }

  async function updateRule(rule, changes) {
    const response = await fetch(`${API}/rules/${rule.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...rule, ...changes }),
    });
    if (!response.ok) setError("Unable to update this rule");
    refresh();
  }

  async function deleteRule(id) {
    const response = await fetch(`${API}/rules/${id}`, { method: "DELETE" });
    if (!response.ok) setError("Unable to delete this rule");
    refresh();
  }

  async function acknowledge(id) {
    const response = await fetch(`${API}/${id}/acknowledge`, { method: "POST" });
    if (!response.ok) setError("Unable to acknowledge this alert");
    refresh();
  }

  const badgeClass = (severity) => severity === "critical" ? "bg-danger" : "bg-warning text-dark";

  return (
    <section className="alert-center text-light">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div>
          <h2 className="h4 text-info mb-1">Alert Center</h2>
          {/* <p className="text-secondary mb-0">Threshold rules, container failure events and alert acknowledgement</p> */}
        </div>
        <button className="btn btn-outline-info btn-sm" onClick={requestNotifications} disabled={permission === "unsupported" || permission === "granted"}>
          {permission === "granted" ? "Browser notifications enabled" : permission === "denied" ? "Notifications blocked in browser" : "Enable browser notifications"}
        </button>
      </div>
      {error && <div className="alert alert-danger py-2">{error}</div>}

      <div className="row g-3 mb-4">
        <div className="col-12 col-xl-5">
          <div className="card bg-dark border-secondary h-100"><div className="card-body">
            <h3 className="h6 text-info">Create threshold rule</h3>
            <form onSubmit={createRule} className="row g-2">
              <div className="col-12"><input className="form-control form-control-sm" required minLength="2" maxLength="80" placeholder="Rule name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div className="col-12"><select className="form-select form-select-sm" value={form.metric} onChange={e => setForm({ ...form, metric: e.target.value })}>{Object.entries(metricLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
              <div className="col-6"><input className="form-control form-control-sm" type="number" min="0" max="100" step="0.5" required value={form.threshold} onChange={e => setForm({ ...form, threshold: e.target.value })} /></div>
              <div className="col-6"><select className="form-select form-select-sm" value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}><option value="warning">Warning</option><option value="critical">Critical</option></select></div>
              <div className="col-12"><label className="form-label small mb-1">Cooldown (seconds)</label><input className="form-control form-control-sm" type="number" min="0" max="86400" value={form.cooldown_seconds} onChange={e => setForm({ ...form, cooldown_seconds: Number(e.target.value) })} /></div>
              <div className="col-12"><button className="btn btn-info btn-sm w-100" type="submit">Add alert rule (≥ threshold)</button></div>
            </form>
          </div></div>
        </div>
        <div className="col-12 col-xl-7">
          <div className="card bg-dark border-secondary h-100"><div className="card-body">
            <h3 className="h6 text-info">Configured rules ({rules.length})</h3>
            {rules.length === 0 ? <p className="text-secondary small">No rules configured.</p> : rules.map(rule => (
              <div key={rule.id} className="d-flex flex-wrap align-items-center justify-content-between border-bottom border-secondary py-2 gap-2">
                <div><div className="fw-semibold">{rule.name} <span className={`badge ${badgeClass(rule.severity)}`}>{rule.severity}</span></div><small className="text-secondary">{metricLabels[rule.metric]} {rule.operator} {rule.threshold}% · cooldown {rule.cooldown_seconds}s</small></div>
                <div className="d-flex align-items-center gap-2"><div className="form-check form-switch"><input className="form-check-input" type="checkbox" checked={rule.enabled} onChange={e => updateRule(rule, { enabled: e.target.checked })} aria-label={`Enable ${rule.name}`} /></div><button className="btn btn-outline-danger btn-sm" onClick={() => deleteRule(rule.id)}>Delete</button></div>
              </div>
            ))}
          </div></div>
        </div>
      </div>

      <div className="card bg-dark border-secondary mb-3"><div className="card-body">
        <div className="d-flex justify-content-between align-items-center mb-2"><h3 className="h6 text-info mb-0">Active alerts</h3><span className="badge bg-danger">{alerts.length} active</span></div>
        {alerts.length === 0 ? <p className="text-secondary small mb-0">No active alerts. Monitoring is running.</p> : alerts.map(alert => (
          <div key={alert.id} className="d-flex flex-wrap justify-content-between align-items-center gap-2 border-bottom border-secondary py-2">
            <div><span className={`badge me-2 ${badgeClass(alert.severity)}`}>{alert.severity}</span><strong>{alert.rule_name}</strong><div className="small text-secondary">{alert.message} · {new Date(alert.created_at * 1000).toLocaleString()}</div></div>
            {!alert.acknowledged && <button className="btn btn-outline-success btn-sm" onClick={() => acknowledge(alert.id)}>Acknowledge</button>}
            {alert.acknowledged && <span className="badge bg-success">Acknowledged</span>}
          </div>
        ))}
      </div></div>

      <details className="card bg-dark border-secondary"><summary className="card-header text-info" role="button">Recent alert history ({history.length})</summary><div className="card-body">
        {history.length === 0 ? <p className="text-secondary small mb-0">No alert history yet.</p> : history.slice(0, 20).map(alert => <div key={alert.id} className="small border-bottom border-secondary py-2"><span className={`badge me-2 ${badgeClass(alert.severity)}`}>{alert.severity}</span><strong>{alert.rule_name}</strong> — {alert.message}<span className="text-secondary"> · {alert.status} · {new Date(alert.created_at * 1000).toLocaleString()}</span></div>)}
      </div></details>
    </section>
  );
}
