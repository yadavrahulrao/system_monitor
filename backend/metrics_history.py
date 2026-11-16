"""SQLite-backed historical host metrics storage and analytics."""
from __future__ import annotations

import csv
import os
import sqlite3
import time
from io import StringIO
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent / "data"
DB_PATH = Path(os.getenv("METRICS_DB_PATH", str(DATA_DIR / "metrics_history.sqlite3")))
RETENTION_DAYS = max(1, int(os.getenv("METRICS_RETENTION_DAYS", "30")))
RANGES = {
    "1h": 60 * 60,
    "6h": 6 * 60 * 60,
    "24h": 24 * 60 * 60,
    "7d": 7 * 24 * 60 * 60,
    "30d": 30 * 24 * 60 * 60,
}


class MetricsHistory:
    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.initialize()

    def _connect(self):
        conn = sqlite3.connect(str(self.db_path), timeout=10)
        conn.row_factory = sqlite3.Row
        return conn

    def initialize(self):
        with self._connect() as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("""
                CREATE TABLE IF NOT EXISTS metric_samples (
                    timestamp REAL PRIMARY KEY,
                    cpu_percent REAL NOT NULL,
                    memory_percent REAL NOT NULL,
                    disk_percent REAL NOT NULL,
                    net_upload_kbps REAL NOT NULL,
                    net_download_kbps REAL NOT NULL,
                    disk_read_kbps REAL NOT NULL,
                    disk_write_kbps REAL NOT NULL
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_metric_samples_timestamp ON metric_samples(timestamp)")

    def record(self, sample: dict[str, Any]):
        timestamp = float(sample.get("timestamp", time.time()))
        cpu = sample.get("cpu", {})
        memory = sample.get("memory", {})
        network = sample.get("network", {})
        disk = sample.get("disk", {})
        values = (
            timestamp,
            float(cpu.get("overall", 0) or 0),
            float(memory.get("percent", 0) or 0),
            float(sample.get("disk_percent", 0) or 0),
            float(network.get("upload", 0) or 0),
            float(network.get("download", 0) or 0),
            float(disk.get("read", 0) or 0),
            float(disk.get("write", 0) or 0),
        )
        with self._connect() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO metric_samples
                (timestamp, cpu_percent, memory_percent, disk_percent,
                 net_upload_kbps, net_download_kbps, disk_read_kbps, disk_write_kbps)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, values)

    @staticmethod
    def _range_seconds(range_key: str) -> int:
        if range_key not in RANGES:
            raise ValueError(f"Unsupported range. Choose one of: {', '.join(RANGES)}")
        return RANGES[range_key]

    def query(self, range_key: str = "24h", limit: int = 1000):
        seconds = self._range_seconds(range_key)
        end = time.time()
        start = end - seconds
        bucket = max(1, int(seconds / max(1, min(limit, 2000))))
        with self._connect() as conn:
            rows = conn.execute("""
                SELECT CAST(timestamp / ? AS INTEGER) * ? AS timestamp,
                       AVG(cpu_percent) AS cpu_percent,
                       AVG(memory_percent) AS memory_percent,
                       AVG(disk_percent) AS disk_percent,
                       AVG(net_upload_kbps) AS net_upload_kbps,
                       AVG(net_download_kbps) AS net_download_kbps,
                       AVG(disk_read_kbps) AS disk_read_kbps,
                       AVG(disk_write_kbps) AS disk_write_kbps,
                       COUNT(*) AS samples
                FROM metric_samples
                WHERE timestamp >= ? AND timestamp <= ?
                GROUP BY CAST(timestamp / ? AS INTEGER)
                ORDER BY timestamp ASC
            """, (bucket, bucket, start, end, bucket)).fetchall()
        result = []
        for row in rows:
            item = dict(row)
            item["timestamp"] = int(item["timestamp"])
            for key in ("cpu_percent", "memory_percent", "disk_percent", "net_upload_kbps", "net_download_kbps", "disk_read_kbps", "disk_write_kbps"):
                item[key] = round(float(item[key] or 0), 2)
            result.append(item)
        return {"range": range_key, "start": int(start), "end": int(end), "interval_seconds": bucket, "count": len(result), "samples": result}

    def summary(self, range_key: str = "24h"):
        seconds = self._range_seconds(range_key)
        end = time.time()
        start = end - seconds
        fields = ["cpu_percent", "memory_percent", "disk_percent", "net_upload_kbps", "net_download_kbps", "disk_read_kbps", "disk_write_kbps"]
        sql_fields = ", ".join(f"AVG({f}) AS {f}_avg, MIN({f}) AS {f}_min, MAX({f}) AS {f}_max" for f in fields)
        with self._connect() as conn:
            row = conn.execute(f"SELECT COUNT(*) AS sample_count, {sql_fields} FROM metric_samples WHERE timestamp >= ? AND timestamp <= ?", (start, end)).fetchone()
            latest = conn.execute("SELECT * FROM metric_samples WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC LIMIT 1", (start, end)).fetchone()
        stats = {"sample_count": row["sample_count"], "range": range_key, "start": int(start), "end": int(end)}
        for field in fields:
            stats[field] = {
                "average": round(float(row[f"{field}_avg"] or 0), 2),
                "minimum": round(float(row[f"{field}_min"] or 0), 2),
                "maximum": round(float(row[f"{field}_max"] or 0), 2),
            }
        stats["latest"] = dict(latest) if latest else None
        return stats

    def export_csv(self, range_key: str = "24h") -> str:
        data = self.query(range_key, limit=2000)
        output = StringIO()
        columns = ["timestamp", "cpu_percent", "memory_percent", "disk_percent", "net_upload_kbps", "net_download_kbps", "disk_read_kbps", "disk_write_kbps", "samples"]
        writer = csv.DictWriter(output, fieldnames=columns)
        writer.writeheader()
        writer.writerows(data["samples"])
        return output.getvalue()

    def cleanup(self, retention_days: int = RETENTION_DAYS):
        cutoff = time.time() - max(1, retention_days) * 86400
        with self._connect() as conn:
            cursor = conn.execute("DELETE FROM metric_samples WHERE timestamp < ?", (cutoff,))
            return cursor.rowcount


metrics_history = MetricsHistory()
