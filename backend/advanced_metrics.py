"""Advanced host metrics collected with psutil.

All hardware-dependent values are best-effort because availability varies by
OS, kernel, permissions, and hardware sensors.
"""

from __future__ import annotations

import time
from typing import Any

import psutil


def _safe_temperature_sensors() -> list[dict[str, Any]]:
    sensors: list[dict[str, Any]] = []
    try:
        readings = psutil.sensors_temperatures(fahrenheit=False) or {}
    except (AttributeError, NotImplementedError, OSError):
        return sensors

    for sensor_name, entries in readings.items():
        for entry in entries:
            if entry.current is None:
                continue
            sensors.append(
                {
                    "sensor": sensor_name,
                    "label": entry.label or sensor_name,
                    "current_c": round(float(entry.current), 1),
                    "high_c": round(float(entry.high), 1) if entry.high is not None else None,
                    "critical_c": round(float(entry.critical), 1) if entry.critical is not None else None,
                }
            )
    return sensors


def _safe_cpu_frequency() -> dict[str, float | None] | None:
    try:
        frequency = psutil.cpu_freq()
    except (AttributeError, NotImplementedError, OSError):
        return None
    if frequency is None:
        return None
    return {
        "current_mhz": round(frequency.current, 1) if frequency.current is not None else None,
        "min_mhz": round(frequency.min, 1) if frequency.min is not None else None,
        "max_mhz": round(frequency.max, 1) if frequency.max is not None else None,
    }


def _network_interfaces() -> list[dict[str, Any]]:
    counters = psutil.net_io_counters(pernic=True) or {}
    addresses = psutil.net_if_addrs()
    stats = psutil.net_if_stats()
    interfaces: list[dict[str, Any]] = []

    for name, counter in counters.items():
        interface_stats = stats.get(name)
        ip_addresses = []
        for address in addresses.get(name, []):
            # AF_INET and AF_INET6 without importing platform-specific constants.
            if "." in address.address or ":" in address.address:
                ip_addresses.append(address.address.split("%", 1)[0])
        interfaces.append(
            {
                "name": name,
                "is_up": bool(interface_stats.isup) if interface_stats else None,
                "speed_mbps": interface_stats.speed if interface_stats else None,
                "mtu": interface_stats.mtu if interface_stats else None,
                "ip_addresses": ip_addresses,
                "bytes_sent": counter.bytes_sent,
                "bytes_recv": counter.bytes_recv,
                "packets_sent": counter.packets_sent,
                "packets_recv": counter.packets_recv,
                "errors_in": counter.errin,
                "errors_out": counter.errout,
                "drops_in": counter.dropin,
                "drops_out": counter.dropout,
            }
        )
    return interfaces


def get_advanced_system_metrics() -> dict[str, Any]:
    vm = psutil.virtual_memory()
    swap = psutil.swap_memory()
    boot_time = psutil.boot_time()

    try:
        load_average = list(psutil.getloadavg())
    except (AttributeError, OSError):
        load_average = None

    try:
        disk_io = psutil.disk_io_counters()
    except (AttributeError, OSError):
        disk_io = None

    return {
        "timestamp": int(time.time()),
        "hostname": __import__("socket").gethostname(),
        "platform": __import__("platform").platform(),
        "uptime_seconds": max(0, int(time.time() - boot_time)),
        "cpu": {
            "logical_cores": psutil.cpu_count(logical=True),
            "physical_cores": psutil.cpu_count(logical=False),
            "overall_percent": psutil.cpu_percent(interval=None),
            "per_core_percent": psutil.cpu_percent(interval=None, percpu=True),
            "frequency": _safe_cpu_frequency(),
            "load_average": load_average,
        },
        "memory": {
            "total": vm.total,
            "available": vm.available,
            "used": vm.used,
            "free": vm.free,
            "cached": getattr(vm, "cached", None),
            "buffers": getattr(vm, "buffers", None),
            "percent": vm.percent,
        },
        "swap": {
            "total": swap.total,
            "used": swap.used,
            "free": swap.free,
            "percent": swap.percent,
        },
        "process_count": len(psutil.pids()),
        "temperatures": _safe_temperature_sensors(),
        "network_interfaces": _network_interfaces(),
        "disk_io_counters": (
            {
                "read_bytes": disk_io.read_bytes,
                "write_bytes": disk_io.write_bytes,
                "read_count": disk_io.read_count,
                "write_count": disk_io.write_count,
            }
            if disk_io
            else None
        ),
    }


def get_top_processes(limit: int = 20, sort_by: str = "cpu_percent") -> list[dict[str, Any]]:
    """Return visible processes, skipping processes the current user cannot inspect."""
    allowed_sorts = {"cpu_percent", "memory_percent", "rss"}
    if sort_by not in allowed_sorts:
        sort_by = "cpu_percent"

    processes: list[dict[str, Any]] = []
    for process in psutil.process_iter(
        attrs=["pid", "name", "username", "status", "memory_info", "create_time"],
        ad_value=None,
    ):
        try:
            with process.oneshot():
                info = process.info
                memory_info = info.get("memory_info")
                processes.append(
                    {
                        "pid": info.get("pid"),
                        "name": info.get("name") or "Unknown",
                        "username": info.get("username"),
                        "status": info.get("status"),
                        "cpu_percent": round(process.cpu_percent(interval=None), 2),
                        "memory_percent": round(process.memory_percent(), 2),
                        "rss": memory_info.rss if memory_info else 0,
                        "created_at": info.get("create_time"),
                    }
                )
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess, OSError):
            continue

    processes.sort(key=lambda item: item.get(sort_by) or 0, reverse=True)
    return processes[: max(1, min(limit, 100))]
