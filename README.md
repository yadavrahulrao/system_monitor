# 🖥️ System & Container Monitoring 

A full-stack real-time monitoring dashboard that tracks **system resources** (CPU, memory, disk I/O, network) and **Podman containers** (CPU/memory usage, start/stop controls) 
— visualized live with interactive charts.

Built with **FastAPI** (backend) + **React + Vite** (frontend), styled using **Bootstrap** and **Tailwind**, and powered by **Recharts** for live data visualization.

---

## ✨ Features

- 📊 **Live System Metrics** — CPU (per-core), memory, swap, disk usage, and network I/O
- 🧱 **Podman Container Monitoring** — view running containers, their CPU/memory usage, and start/stop them directly from the UI
- 📈 **Real-time Charts** — auto-refreshing line charts for CPU cores, memory, disk I/O, and network throughput
- 🌓 **Dark-themed Dashboard UI** built with Bootstrap cards
- 🔁 **Polling-based live updates** (every 2–3 seconds) — no page refresh needed

---

## 🧰 Tech Stack

### Backend
- **FastAPI** — REST API server
- **psutil** — system metrics (CPU, memory, disk, network)
- **Podman CLI** (via subprocess) — container stats & control
- **Uvicorn** — ASGI server

### Frontend
- **React** (with Vite)
- **Recharts** — charts & graphs
- **Axios / Fetch API** — API calls
- **Bootstrap 5** + **Tailwind CSS** — styling

---

## 📂 Project Structure

```
├── backend/
│   ├── main.py              # FastAPI app & all API routes
│   ├── podman_utils.py      # Helper functions for Podman CLI commands
│   └── requirements.txt     # Python dependencies
│
├── frontend/
│   ├── index.html
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── index.css
│       ├── api.js
│       └── components/
│           ├── ContainerMonitor.jsx
│           ├── ContainerMemoryChart.jsx
│           ├── SystemMemoryChart.jsx
│           ├── SystemNetworkChart.jsx
│           └── SystemDiskChart.jsx
```

---

## 🔌 API Endpoints

| Method | Endpoint                       | Description                                              |
| `GET`  | `/`                            | Health check — confirms backend is running               |
| `GET`  | `/api/system`                  | Full system snapshot (CPU, memory, swap, disks, network) |
| `GET`  | `/api/cpu`                     | Per-core and overall CPU usage                           |
| `GET`  | `/api/memory`                  | Memory usage (total, used, percent)                      |
| `GET`  | `/api/disk`                    | Disk read/write speed (KB/s)                             |
| `GET`  | `/api/network`                 | Upload/download speed (KB/s)                             |
| `GET`  | `/api/containers`              | List running Podman containers with CPU/memory stats     |
| `POST` | `/api/containers/{name}/start` | Start a stopped container                                |
| `POST` | `/api/containers/{name}/stop`  | Stop a running container                                 |

---

## ⚙️ Prerequisites

Make sure you have the following installed:

- **Python 3.9+**
- **Node.js 16+** and **npm**
- **Podman** installed and accessible from the command line (required for container monitoring features)

---

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/yadavrahulrao/system_monitor.git
cd system_monitor
```

### 2. Backend Setup (FastAPI)

```bash
cd backend

# create and activate a virtual environment
python -m venv venv
source venv/bin/activate      # On Windows: venv\Scripts\activate

# install dependencies
pip install -r requirements.txt

# run the backend server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend will be running at: **http://localhost:8000**

You can verify it's working by visiting `http://localhost:8000/` — you should see:
```json
{"message": "Backend is running 🚀"}
```

### 3. Frontend Setup (React + Vite)

Open a new terminal:

```bash
cd frontend

# install dependencies
npm install

# run the development server
npm run dev
```

Frontend will be running at: **http://localhost:5173**

> The Vite dev server is pre-configured to proxy `/api` requests to `http://127.0.0.1:8000`, so the backend must be running for the dashboard to load data.

### 4. Open the Dashboard

Visit **http://localhost:5173** in your browser to see the live dashboard.

---

## 📝 Notes

- Container monitoring features require **Podman** to be installed and running on the host machine. If Podman isn't available, the `/api/containers` endpoint will return an empty list or an error.
- CORS is enabled for all origins in the backend for ease of local development — restrict this (`allow_origins`) before deploying to production.
- Charts keep only the last 20–30 data points in memory to keep the UI smooth; older data points are dropped automatically.

---

## 📌 Future Improvements
Add authentication for container start/stop actions
Persist historical metrics to a database
Add Docker support alongside Podman
Add alerting/notifications for high resource usage

---

## 👤 Author

Rahul Yadav - 
Github -https://github.com/yadavrahulrao
Email - rahul507538@gmail.com

Built as part of hands-on practice with FastAPI, React, and container monitoring tooling.

> "Monitor everything, miss nothing."
