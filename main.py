from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import psutil
import subprocess
import json
import os
import statistics  # For CPU average

app = FastAPI(title="Container & System Monitoring")

# Mount static files (CSS/JS)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Templates
templates = Jinja2Templates(directory="templates")

@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/api/system")  # FIXED: Changed to /api/system to match JS fetch
async def system_details():
    """Get system resource metrics using psutil."""
    try:
        # CPU: Overall percentage (scalar for dashboard); per-core optional
        cpu_per_core = psutil.cpu_percent(percpu=True, interval=0.5)
        cpu_overall = round(statistics.mean(cpu_per_core), 2) if cpu_per_core else 0
        
        # Memory info
        memory = psutil.virtual_memory()
        
        # Disk info (FIXED: Use disk_usage for storage, not I/O; path='/' for root)
        disk = psutil.disk_usage('/')
        
        # Network info (kept as-is, but aligned keys)
        net = psutil.net_io_counters()
        
        return {
            "cpu_percent": cpu_overall,  # FIXED: Scalar overall % for JS
            "cpu_per_core": cpu_per_core,  # Optional: List for advanced use
            "memory": {
                "total": round(memory.total / (1024 ** 3), 2),
                "used": round(memory.used / (1024 ** 3), 2),
                "percent": memory.percent,
            },
            "disk": {  # FIXED: Storage usage (GB, %), not I/O
                "total": round(disk.total / (1024 ** 3), 2),
                "used": round(disk.used / (1024 ** 3), 2),
                "percent": disk.percent,
            },
            "network": {
                "bytes_sent": round(net.bytes_sent / (1024 ** 2), 2),  # FIXED: Standard key
                "bytes_recv": round(net.bytes_recv / (1024 ** 2), 2),
            }
        }
    except Exception as e:
        print(f"Error in system_details: {e}")  # Debug log
        # FIXED: Consistent fallback (scalar CPU)
        return {
            "cpu_percent": 0,
            "cpu_per_core": [],
            "memory": {"total": 0, "used": 0, "percent": 0},
            "disk": {"total": 0, "used": 0, "percent": 0},
            "network": {"bytes_sent": 0, "bytes_recv": 0},
            "error": str(e)
        }

@app.get("/api/containers")
async def get_containers():
    """Get running containers and stats using Podman CLI."""
    try:
        # Get list of running containers (IMPROVED: Check returncode)
        result = subprocess.run(['podman', 'ps', '--format', 'json'], capture_output=True, text=True)
        if result.returncode != 0:
            print(f"Podman ps error: {result.stderr}")  # Debug
            return {"containers": [], "error": "Podman ps failed (install/check Podman)"}
        
        containers = []
        try:
            containers = json.loads(result.stdout) if result.stdout.strip() else []
        except json.JSONDecodeError as e:
            print(f"JSON parse error for podman ps: {e}, output: {result.stdout}")  # Debug
            return {"containers": [], "error": "Invalid Podman output"}

        # Get stats for each (IMPROVED: Robust parsing, timeout=10, fallback basics)
        stats = []
        for container in containers:
            try:
                container_id = container.get('Id', '')[:12]
                container_name = container.get('Names', ['Unknown'])[0]
                container_status = container.get('State', 'unknown')
                
                # Basic fallback if stats fail
                stat_entry = {
                    "id": container_id,
                    "name": container_name,
                    "status": container_status,
                    "cpu": 0,
                    "mem_usage": "N/A",
                    "mem_percent": 0
                }
                
                if not container_id:
                    stats.append(stat_entry)
                    continue
                
                stat_cmd = ['podman', 'stats', '--no-stream', '--format', 'json', container_id]
                stat_result = subprocess.run(stat_cmd, capture_output=True, text=True, timeout=10)  # Increased timeout
                if stat_result.returncode != 0:
                    print(f"Podman stats error for {container_id}: {stat_result.stderr}")  # Debug
                    stats.append(stat_entry)
                    continue
                
                stat_data = []
                try:
                    stat_data = json.loads(stat_result.stdout) if stat_result.stdout.strip() else []
                except json.JSONDecodeError as e:
                    print(f"JSON parse error for stats {container_id}: {e}")  # Debug
                    stats.append(stat_entry)
                    continue
                
                # Parse stats (IMPROVED: Handle keys with spaces, safe float)
                if stat_data:
                    stat_item = stat_data[0]
                    cpu_str = stat_item.get('CPU %', '0')  # FIXED: Podman key has space
                    stat_entry["cpu"] = float(cpu_str.replace('%', '').strip()) if cpu_str and cpu_str != '0 / 0' else 0
                    
                    mem_usage = stat_item.get('MEM USAGE / LIMIT', 'N/A')
                    stat_entry["mem_usage"] = mem_usage
                    
                    mem_percent_str = stat_item.get('MEM %', '0%')  # Space in key
                    stat_entry["mem_percent"] = float(mem_percent_str.replace('%', '').strip()) if mem_percent_str and '%' in mem_percent_str else 0
                
                stats.append(stat_entry)
            except (IndexError, ValueError, subprocess.TimeoutExpired) as e:
                print(f"Error processing container {container.get('Id', 'unknown')}: {e}")  # Debug
                stats.append({
                    "id": container.get('Id', 'N/A')[:12],
                    "name": container.get('Names', ['Unknown'])[0],
                    "status": container.get('State', 'unknown'),
                    "cpu": 0,
                    "mem_usage": "N/A",
                    "mem_percent": 0
                })

        return {"containers": stats}
    except FileNotFoundError:  # IMPROVED: Catch Podman not found
        return {"containers": [], "error": "Podman not found (install with 'sudo dnf install podman')"}
    except subprocess.CalledProcessError as e:
        return {"error": f"Podman error: {e}"}
    except Exception as e:
        print(f"Unexpected error in get_containers: {e}")  # Debug
        return {"error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)