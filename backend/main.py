from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
import psutil
from typing import Dict, Any
import time
import subprocess
import json
import socket
import asyncio
import os
import urllib.request
import smtplib
from email.message import EmailMessage
from contextlib import suppress

from podman_utils import list_containers, container_stats
from advanced_metrics import get_advanced_system_metrics, get_top_processes
from alerting import alert_engine, AlertRuleInput
from metrics_history import metrics_history, RANGES
from hardware_diagnostics import collect_hardware_overview, get_manual_test_catalog

app = FastAPI(title="System + Podman Monitor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class MetricsConnectionManager:
    """Tracks dashboard clients connected to the shared metrics stream."""
    def __init__(self):
        self.active: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active.discard(websocket)

    async def broadcast(self, payload: Dict[str, Any]):
        stale = []
        for connection in tuple(self.active):
            try:
                await connection.send_json(payload)
            except Exception:
                stale.append(connection)
        for connection in stale:
            self.disconnect(connection)


metrics_manager = MetricsConnectionManager()
metrics_task = None
previous_net = None
previous_disk = None
previous_sample_time = None
previous_container_states = {}
last_container_check = 0.0
last_history_sample = 0.0
last_history_cleanup = 0.0

def collect_live_metrics() -> Dict[str, Any]:
    """Collect one shared, non-blocking host metrics sample."""
    global previous_net, previous_disk, previous_sample_time
    now = time.time()
    net = psutil.net_io_counters()
    disk = psutil.disk_io_counters()
    elapsed = max(now - previous_sample_time, 0.001) if previous_sample_time else 1.0

    def rate(current, previous, field):
        if current is None or previous is None:
            return 0.0
        return round(max(0, getattr(current, field) - getattr(previous, field)) / elapsed / 1024, 2)

    vm = psutil.virtual_memory()
    swap = psutil.swap_memory()
    per_core = psutil.cpu_percent(interval=None, percpu=True)
    cpu = round(sum(per_core) / len(per_core), 2) if per_core else 0.0
    interfaces = []
    interface_stats = psutil.net_if_stats()
    interface_addrs = psutil.net_if_addrs()
    for name, counters in psutil.net_io_counters(pernic=True).items():
        addresses = [a.address for a in interface_addrs.get(name, []) if a.family == socket.AF_INET]
        interfaces.append({
            "name": name, "bytes_sent": counters.bytes_sent, "bytes_recv": counters.bytes_recv,
            "packets_sent": counters.packets_sent, "packets_recv": counters.packets_recv,
            "errin": counters.errin, "errout": counters.errout, "dropin": counters.dropin, "dropout": counters.dropout,
            "is_up": interface_stats.get(name).isup if name in interface_stats else None,
            "ipv4": addresses,
        })

    payload = {
        "type": "metrics", "timestamp": int(now),
        "cpu": {"overall": cpu, "cores": per_core, "logical_cores": psutil.cpu_count(logical=True)},
        "memory": {"total": vm.total, "used": vm.used, "available": vm.available, "percent": vm.percent, "cached": getattr(vm, "cached", 0), "buffers": getattr(vm, "buffers", 0), "swap_total": swap.total, "swap_used": swap.used, "swap_percent": swap.percent},
        "network": {"upload": rate(net, previous_net, "bytes_sent"), "download": rate(net, previous_net, "bytes_recv"), "interfaces": interfaces},
        "disk": {"read": rate(disk, previous_disk, "read_bytes"), "write": rate(disk, previous_disk, "write_bytes")},
    }
    previous_net, previous_disk, previous_sample_time = net, disk, now
    return payload


def get_disk_usage_percent() -> float:
    usages = []
    for partition in psutil.disk_partitions(all=False):
        try:
            usages.append(psutil.disk_usage(partition.mountpoint).percent)
        except (PermissionError, OSError):
            continue
    return round(max(usages), 2) if usages else 0.0


def check_container_transitions():
    """Detect running containers that transition to exited/stopped states."""
    global previous_container_states
    try:
        result = subprocess.run(
            ["podman", "ps", "-a", "--format", "json"],
            capture_output=True, text=True, timeout=4,
        )
        if result.returncode != 0 or not result.stdout.strip():
            return
        rows = json.loads(result.stdout)
        if isinstance(rows, dict):
            rows = [rows]
        current = {}
        for item in rows:
            name = item.get("Names") or item.get("Name") or item.get("Id") or "unknown"
            if isinstance(name, list):
                name = name[0] if name else "unknown"
            state = str(item.get("State") or item.get("Status") or "unknown").lower()
            current[str(name)] = state
            old = previous_container_states.get(str(name), "")
            if old.startswith("running") and not state.startswith("running"):
                event_alert = alert_engine.record_event(
                    f"container:{name}", f"Container stopped: {name}",
                    f"Container '{name}' changed from running to '{state}'. Check its logs and health.",
                    "critical",
                )
                if event_alert:
                    send_optional_alert_notifications(event_alert)
            elif state.startswith("running"):
                alert_engine.resolve_event(f"container:{name}")
        previous_container_states = current
    except (FileNotFoundError, subprocess.TimeoutExpired, json.JSONDecodeError, OSError):
        # Podman is optional; absence must not interrupt host metrics or alerting.
        return


def send_optional_alert_notifications(alert: Dict[str, Any]):
    """Send optional Telegram and/or SMTP notifications when configured."""
    message = f"{alert['severity'].upper()}: {alert['rule_name']}\n{alert['message']}"
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    if bot_token and chat_id:
        try:
            body = json.dumps({"chat_id": chat_id, "text": message}).encode()
            request = urllib.request.Request(
                f"https://api.telegram.org/bot{bot_token}/sendMessage",
                data=body, headers={"Content-Type": "application/json"}, method="POST",
            )
            with urllib.request.urlopen(request, timeout=5) as response:
                response.read()
        except Exception:
            pass  # Notification transport failures must not stop monitoring.

    smtp_host = os.getenv("ALERT_SMTP_HOST")
    smtp_to = os.getenv("ALERT_EMAIL_TO")
    smtp_from = os.getenv("ALERT_EMAIL_FROM")
    if smtp_host and smtp_to and smtp_from:
        try:
            email = EmailMessage()
            email["Subject"] = f"System monitor {alert['severity']}: {alert['rule_name']}"
            email["From"] = smtp_from
            email["To"] = smtp_to
            email.set_content(message)
            port = int(os.getenv("ALERT_SMTP_PORT", "587"))
            with smtplib.SMTP(smtp_host, port, timeout=5) as server:
                server.starttls()
                username = os.getenv("ALERT_SMTP_USERNAME")
                password = os.getenv("ALERT_SMTP_PASSWORD")
                if username and password:
                    server.login(username, password)
                server.send_message(email)
        except Exception:
            pass


async def metrics_broadcaster():
    """Sample once per second and broadcast the same sample to all clients."""
    while True:
        try:
            payload = collect_live_metrics()
            disk_percent = get_disk_usage_percent()
            payload["disk_percent"] = disk_percent
            # Persist a compact historical sample every five seconds, even when
            # no dashboard WebSocket clients are connected.
            global last_history_sample, last_history_cleanup
            now_monotonic = time.monotonic()
            if now_monotonic - last_history_sample >= 5:
                await asyncio.to_thread(metrics_history.record, payload)
                last_history_sample = now_monotonic
            if now_monotonic - last_history_cleanup >= 3600:
                await asyncio.to_thread(metrics_history.cleanup)
                last_history_cleanup = now_monotonic
            new_alerts = alert_engine.evaluate({
                "cpu_percent": payload["cpu"]["overall"],
                "memory_percent": payload["memory"]["percent"],
                "disk_percent": disk_percent,
            })
            for alert in new_alerts:
                await asyncio.to_thread(send_optional_alert_notifications, alert)
            global last_container_check
            if time.time() - last_container_check >= 10:
                await asyncio.to_thread(check_container_transitions)
                last_container_check = time.time()
            if metrics_manager.active:
                await metrics_manager.broadcast(payload)
        except Exception as exc:
            # Keep the stream alive if an optional OS metric is unavailable.
            await metrics_manager.broadcast({"type": "error", "message": str(exc)})
        await asyncio.sleep(1)


@app.on_event("startup")
async def start_metrics_broadcaster():
    global metrics_task
    # Prime psutil's non-blocking CPU counters before the first real sample.
    psutil.cpu_percent(interval=None, percpu=True)
    metrics_task = asyncio.create_task(metrics_broadcaster())


@app.on_event("shutdown")
async def stop_metrics_broadcaster():
    global metrics_task
    if metrics_task:
        metrics_task.cancel()
        with suppress(asyncio.CancelledError):
            await metrics_task
        metrics_task = None


@app.websocket("/ws/metrics")
async def live_metrics(websocket: WebSocket):
    await metrics_manager.connect(websocket)
    try:
        # Send an initial sample immediately instead of waiting for the next tick.
        await websocket.send_json(collect_live_metrics())
        while True:
            # Keep the connection open; clients may send a lightweight ping.
            await websocket.receive_text()
    except WebSocketDisconnect:
        metrics_manager.disconnect(websocket)
    except Exception:
        metrics_manager.disconnect(websocket)


@app.get("/api/system")
async def system_metrics() -> Dict[str, Any]:
    """Return instantaneous system metrics: cpu, memory, disk, network (aggregate)
    """
    cpu_percent = psutil.cpu_percent(interval=0.5)
    per_cpu = psutil.cpu_percent(interval=0.0, percpu=True)

    vm = psutil.virtual_memory()
    swap = psutil.swap_memory()

    disks = []
    for p in psutil.disk_partitions(all=False):
        try:
            usage = psutil.disk_usage(p.mountpoint)
            disks.append({
                "device": p.device,
                "mountpoint": p.mountpoint,
                "total": usage.total,
                "used": usage.used,
                "free": usage.free,
                "percent": usage.percent,
            })
        except Exception:
            continue

    net = psutil.net_io_counters()

    return {
        "timestamp": int(time.time()),
        "cpu_percent": cpu_percent,
        "per_cpu": per_cpu,
        "memory": {
            "total": vm.total,
            "available": vm.available,
            "used": vm.used,
            "percent": vm.percent,
        },
        "swap": {
            "total": swap.total,
            "used": swap.used,
            "percent": swap.percent,
        },
        "disks": disks,
        "net": {
            "bytes_sent": net.bytes_sent,
            "bytes_recv": net.bytes_recv,
        },
    }

@app.get("/api/cpu")
def get_cpu_usage():
    # psutil returns list of percentages per core
    per_core = psutil.cpu_percent(percpu=True)
    overall = sum(per_core) / len(per_core)
    return {"overall": overall, "cores": per_core}

@app.get("/")
def root():
    return {"message": "Backend is running 🚀"}


@app.get("/api/system/advanced")
def advanced_system_metrics():
    """Return extended hardware, uptime, memory, and interface metrics."""
    return get_advanced_system_metrics()


@app.get("/api/processes")
def process_metrics(
    limit: int = Query(default=20, ge=1, le=100),
    sort_by: str = Query(default="cpu_percent", pattern="^(cpu_percent|memory_percent|rss)$"),
):
    """Return the highest-consuming processes visible to the backend user."""
    return {"processes": get_top_processes(limit=limit, sort_by=sort_by)}

@app.get("/api/containers")
def get_containers():
    try:
        # Get Podman stats in JSON format
        result = subprocess.run(
            ["podman", "stats", "--no-stream", "--format", "json"],
            capture_output=True, text=True
        )

        if result.returncode != 0:
            return {"error": result.stderr}

        if not result.stdout.strip():
            return {"containers": []}

        stats = json.loads(result.stdout)
        if isinstance(stats, dict):
            stats = [stats]

        containers = []
        for s in stats:
            # clean % signs and convert to float
            cpu = s.get("cpu_percent", "0").replace("%", "").strip()
            mem = s.get("mem_percent", "0").replace("%", "").strip()
            containers.append({
                "name": s.get("name"),
                "image": s.get("image", "unknown"),
                "cpu_percent": float(cpu) if cpu else 0.0,
                "mem_percent": float(mem) if mem else 0.0,
            })

        return {"containers": containers}

    except Exception as e:
        return {"error": str(e)}

@app.post("/api/containers/{container_name}/start")
def start_container(container_name: str):
    """Start a stopped container."""
    try:
        subprocess.run(["podman", "start", container_name], check=True)
        return {"message": f"Container '{container_name}' started successfully."}
    except subprocess.CalledProcessError as e:
        return {"error": f"Failed to start container '{container_name}': {e}"}


@app.post("/api/containers/{container_name}/stop")
def stop_container(container_name: str):
    """Stop a running container."""
    try:
        subprocess.run(["podman", "stop", container_name], check=True)
        return {"message": f"Container '{container_name}' stopped successfully."}
    except subprocess.CalledProcessError as e:
        return {"error": f"Failed to stop container '{container_name}': {e}"}

@app.get("/api/memory")
def get_memory():
    mem = psutil.virtual_memory()
    return {
        "total": round(mem.total / (1024 ** 3), 2),   # in GB
        "used": round(mem.used / (1024 ** 3), 2),     # in GB
        "percent": mem.percent
    }


prev_net = psutil.net_io_counters()
prev_time = time.time()


@app.get("/api/network")
def get_network():
    global prev_net, prev_time
    curr_net = psutil.net_io_counters()
    curr_time = time.time()

    # Calculate bytes per second since last call
    time_diff = curr_time - prev_time
    if time_diff == 0:
        return {"upload": 0, "download": 0}

    upload_speed = (curr_net.bytes_sent - prev_net.bytes_sent) / time_diff
    download_speed = (curr_net.bytes_recv - prev_net.bytes_recv) / time_diff

    # Update previous counters
    prev_net = curr_net
    prev_time = curr_time

    # Convert to Kbps
    upload_kbps = round(upload_speed / 1024, 2)
    download_kbps = round(download_speed / 1024, 2)

    return {"upload": upload_kbps, "download": download_kbps}



prev_disk = psutil.disk_io_counters()
prev_disk_time = time.time()

@app.get("/api/disk")
def get_disk_io():
    global prev_disk, prev_disk_time
    curr_disk = psutil.disk_io_counters()
    curr_time = time.time()

    time_diff = curr_time - prev_disk_time
    if time_diff == 0:
        return {"read": 0, "write": 0}

    read_speed = (curr_disk.read_bytes - prev_disk.read_bytes) / time_diff
    write_speed = (curr_disk.write_bytes - prev_disk.write_bytes) / time_diff

    prev_disk = curr_disk
    prev_disk_time = curr_time

    # Convert to KB/s
    read_kbps = round(read_speed / 1024, 2)
    write_kbps = round(write_speed / 1024, 2)

    return {"read": read_kbps, "write": write_kbps}

# Phase 3: configurable alert rules and alert lifecycle
@app.get("/api/alerts/rules")
def list_alert_rules():
    return {"rules": alert_engine.list_rules()}

@app.post("/api/alerts/rules", status_code=201)
def create_alert_rule(rule: AlertRuleInput):
    return {"rule": alert_engine.create_rule(rule)}

@app.put("/api/alerts/rules/{rule_id}")
def update_alert_rule(rule_id: str, rule: AlertRuleInput):
    updated = alert_engine.update_rule(rule_id, rule)
    if updated is None:
        raise HTTPException(status_code=404, detail="Alert rule not found")
    return {"rule": updated}

@app.delete("/api/alerts/rules/{rule_id}")
def delete_alert_rule(rule_id: str):
    if not alert_engine.delete_rule(rule_id):
        raise HTTPException(status_code=404, detail="Alert rule not found")
    return {"message": "Alert rule deleted"}

@app.get("/api/alerts/active")
def get_active_alerts():
    return {"alerts": alert_engine.active_alerts()}

@app.get("/api/alerts/history")
def get_alert_history(limit: int = Query(default=100, ge=1, le=500)):
    return {"alerts": alert_engine.history(limit)}

@app.post("/api/alerts/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: str):
    alert = alert_engine.acknowledge(alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"alert": alert}


# Phase 5: persistent historical metrics and analytics
def _validate_history_range(range_key: str):
    if range_key not in RANGES:
        raise HTTPException(status_code=400, detail=f"Unsupported range. Choose one of: {', '.join(RANGES)}")
    return range_key


@app.get("/api/history/metrics")
def get_historical_metrics(
    range: str = Query(default="24h", pattern="^(1h|6h|24h|7d|30d)$"),
    limit: int = Query(default=1000, ge=10, le=2000),
):
    """Return downsampled historical host metrics for charting."""
    _validate_history_range(range)
    return metrics_history.query(range, limit)


@app.get("/api/history/summary")
def get_historical_summary(range: str = Query(default="24h", pattern="^(1h|6h|24h|7d|30d)$")):
    """Return average, minimum, maximum and sample count for a time window."""
    _validate_history_range(range)
    return metrics_history.summary(range)


@app.get("/api/history/export.csv")
def export_historical_metrics(range: str = Query(default="24h", pattern="^(1h|6h|24h|7d|30d)$")):
    """Download the selected historical time window as CSV."""
    _validate_history_range(range)
    csv_data = metrics_history.export_csv(range)
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="system-metrics-{range}.csv"'},
    )


@app.get("/api/hardware/overview")
def hardware_overview():
    """Read-only hardware inventory and best-effort health diagnostics."""
    try:
        return collect_hardware_overview()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Hardware scan failed: {exc}")


@app.post("/api/hardware/scan")
def scan_hardware():
    """Run a fresh, read-only hardware scan."""
    try:
        return collect_hardware_overview()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Hardware scan failed: {exc}")


@app.get("/api/hardware/tests")
def hardware_test_catalog():
    """Return safe manual/interactive diagnostic instructions."""
    return get_manual_test_catalog()
