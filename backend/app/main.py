from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import psutil
from typing import Dict, Any
import time

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


@app.get("/api/containers")
async def containers():
    """Return running containers and stats from Podman."""
    conts = list_containers()
    stats = container_stats()
    return {"list": conts, "stats": stats}