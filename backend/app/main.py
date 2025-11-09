from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import psutil
from typing import Dict, Any
import time
import subprocess
import json

from .podman_utils import list_containers, container_stats

app = FastAPI(title="System + Podman Monitor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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

@app.get("/api/memory")
def get_memory_usage():
    mem = psutil.virtual_memory()
    return {"total": mem.total, "used": mem.used, "percent": mem.percent}


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