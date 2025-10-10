from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import psutil
import subprocess
import json
import os

app = FastAPI(title="Container & System Monitoring")

# Mount static files (CSS/JS)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Templates
templates = Jinja2Templates(directory="templates")

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/api/system")
async def get_system_metrics():
    """Get system resource metrics using psutil."""
    try:
        # CPU percentage (interval=1 for a quick sample)
        cpu = psutil.cpu_percent(interval=1)
        
        # Memory info
        memory = psutil.virtual_memory()
        mem_total_gb = round(memory.total / (1024 ** 3), 2)  # Convert to GB
        mem_used_gb = round(memory.used / (1024 ** 3), 2)
        mem_percent = memory.percent
        
        # Disk info (FIX: Add path='/' for root filesystem)
        disk = psutil.disk_usage('/')  # Root disk; change to '/home' if preferred
        disk_total_gb = round(disk.total / (1024 ** 3), 2)
        disk_used_gb = round(disk.used / (1024 ** 3), 2)
        disk_percent = disk.percent
        
        # Network info
        net = psutil.net_io_counters()
        net_sent_mb = round(net.bytes_sent / (1024 ** 2), 2)  # Convert to MB
        net_recv_mb = round(net.bytes_recv / (1024 ** 2), 2)
        
        return {
            "cpu_percent": cpu,
            "memory": {
                "total": mem_total_gb,
                "used": mem_used_gb,
                "percent": mem_percent
            },
            "disk": {
                "total": disk_total_gb,
                "used": disk_used_gb,
                "percent": disk_percent
            },
            "network": {
                "bytes_sent": net_sent_mb,
                "bytes_recv": net_recv_mb
            }
        }
    except Exception as e:
        print(f"Error in get_system_metrics: {e}")  # Debug log to terminal
        # Fallback values to prevent total crash
        return {
            "cpu_percent": 0,
            "memory": {"total": 0, "used": 0, "percent": 0},
            "disk": {"total": 0, "used": 0, "percent": 0},
            "network": {"bytes_sent": 0, "bytes_recv": 0},
            "error": str(e)
        }
  

@app.get("/api/containers")
async def get_containers():
    """Get running containers and stats using Podman CLI."""
    try:
        # Get list of running containers
        result = subprocess.run(['podman', 'ps', '--format', 'json'], capture_output=True, text=True)
        containers = json.loads(result.stdout) if result.stdout else []

        # Get stats for each (simplified; in production, use podman stats --no-stream)
        stats = []
        for container in containers:
            stat_cmd = ['podman', 'stats', '--no-stream', '--format', 'json', container['Id'][:12]]
            stat_result = subprocess.run(stat_cmd, capture_output=True, text=True, timeout=5)
            if stat_result.stdout:
                try:
                    stat_data = json.loads(stat_result.stdout)
                    stats.append({
                        "id": container['Id'][:12],
                        "name": container['Names'][0],
                        "status": container['State'],
                        "cpu": stat_data[0]['CPU%'] if stat_data else 0,
                        "mem_usage": stat_data[0]['MEM USAGE / LIMIT'] if stat_data else "0B / 0B",
                        "mem_percent": float(stat_data[0]['MEM %'].replace('%', '')) if stat_data and stat_data[0]['MEM %'] else 0
                    })
                except (json.JSONDecodeError, IndexError):
                    stats.append({
                        "id": container['Id'][:12],
                        "name": container['Names'][0],
                        "status": container['State'],
                        "cpu": 0,
                        "mem_usage": "0B / 0B",
                        "mem_percent": 0
                    })
            else:
                stats.append({
                    "id": container['Id'][:12],
                    "name": container['Names'][0],
                    "status": container['State'],
                    "cpu": 0,
                    "mem_usage": "0B / 0B",
                    "mem_percent": 0
                })

        return {"containers": stats}
    except subprocess.CalledProcessError as e:
        return {"error": f"Podman error: {e}"}
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
