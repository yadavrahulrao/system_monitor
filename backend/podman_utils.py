# podman_utils.py
# Helpers to call podman and parse container info/stats.

import json
import subprocess
from typing import List, Dict, Any


def _run_cmd(cmd: List[str]) -> str:
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.DEVNULL)
        return out.decode("utf-8")
    except Exception:
        return ""


def list_containers() -> List[Dict[str, Any]]:
    """Return list of running containers using `podman ps --format json`.
    Fallback if JSON not available, returns minimal info.
    """
    out = _run_cmd(["podman", "ps", "--format", "json"])
    if out:
        try:
            data = json.loads(out)
            # Each item contains Id, Names, Image, Status, etc.
            return data
        except Exception:
            pass

    # Fallback: simple table output
    out2 = _run_cmd(["podman", "ps", "--format", "{{.ID}}|{{.Image}}|{{.Names}}|{{.Status}}\n"])
    res = []
    for line in out2.splitlines():
        if not line.strip():
            continue
        parts = line.split("|")
        res.append({
            "Id": parts[0],
            "Image": parts[1] if len(parts) > 1 else "",
            "Names": parts[2] if len(parts) > 2 else "",
            "Status": parts[3] if len(parts) > 3 else "",
        })
    return res


def container_stats() -> List[Dict[str, Any]]:
    """Return instantaneous container stats using `podman stats --no-stream --format json`.
    If not available, returns list with minimal fields.
    """
    out = _run_cmd(["podman", "stats", "--no-stream", "--format", "json"])
    if out:
        try:
            return json.loads(out)
        except Exception:
            pass

    # Fallback: no stats
    containers = list_containers()
    for c in containers:
        c.setdefault("CPUPerc", None)
        c.setdefault("MemPerc", None)
        c.setdefault("NetIO", None)
        c.setdefault("BlockIO", None)
    return containers