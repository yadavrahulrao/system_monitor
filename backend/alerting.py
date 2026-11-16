"""Configurable threshold alert engine for host metrics.

Rules are stored as JSON beside the backend package. Alert history is kept in
memory in this phase; Phase 5 will move history to a database.
"""
from __future__ import annotations

import json
import os
import threading
import time
import uuid
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

DATA_DIR = Path(__file__).resolve().parent / "data"
RULES_FILE = DATA_DIR / "alert_rules.json"
ALLOWED_METRICS = {"cpu_percent", "memory_percent", "disk_percent"}


class AlertRuleInput(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    metric: Literal["cpu_percent", "memory_percent", "disk_percent"]
    operator: Literal[">", ">=", "<", "<="] = ">="
    threshold: float = Field(ge=0, le=100)
    severity: Literal["warning", "critical"] = "warning"
    enabled: bool = True
    cooldown_seconds: int = Field(default=300, ge=0, le=86400)


class AlertRule(AlertRuleInput):
    id: str
    created_at: int


class AlertEngine:
    def __init__(self):
        self.lock = threading.RLock()
        self.rules: list[dict] = []
        self.alerts: list[dict] = []
        self.last_fired: dict[str, float] = {}
        self.active_by_rule: dict[str, str] = {}
        self._load_rules()

    def _load_rules(self):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        if RULES_FILE.exists():
            try:
                loaded = json.loads(RULES_FILE.read_text())
                if not isinstance(loaded, list):
                    raise ValueError("Alert rules file must contain a JSON list")
                self.rules = [AlertRule.model_validate(item).model_dump() for item in loaded]
            except Exception:
                # Preserve a malformed file for manual recovery rather than overwrite it.
                return
        if not self.rules:
            now = int(time.time())
            self.rules = [
                AlertRule(id="default-cpu", name="High CPU usage", metric="cpu_percent", threshold=85, severity="warning", created_at=now).model_dump(),
                AlertRule(id="default-memory", name="High memory usage", metric="memory_percent", threshold=90, severity="critical", created_at=now).model_dump(),
                AlertRule(id="default-disk", name="High disk usage", metric="disk_percent", threshold=90, severity="warning", created_at=now).model_dump(),
            ]
            self._save_rules()

    def _save_rules(self):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        temp = RULES_FILE.with_suffix(".tmp")
        temp.write_text(json.dumps(self.rules, indent=2))
        os.replace(temp, RULES_FILE)

    def list_rules(self):
        with self.lock:
            return [dict(rule) for rule in self.rules]

    def create_rule(self, data: AlertRuleInput):
        with self.lock:
            rule = AlertRule(id=str(uuid.uuid4()), created_at=int(time.time()), **data.model_dump()).model_dump()
            self.rules.append(rule)
            self._save_rules()
            return dict(rule)

    def update_rule(self, rule_id: str, data: AlertRuleInput):
        with self.lock:
            for index, rule in enumerate(self.rules):
                if rule["id"] == rule_id:
                    self.rules[index] = {**data.model_dump(), "id": rule_id, "created_at": rule["created_at"]}
                    self._save_rules()
                    return dict(self.rules[index])
        return None

    def delete_rule(self, rule_id: str):
        with self.lock:
            before = len(self.rules)
            self.rules = [r for r in self.rules if r["id"] != rule_id]
            if len(self.rules) == before:
                return False
            active_id = self.active_by_rule.pop(rule_id, None)
            if active_id:
                for alert in self.alerts:
                    if alert["id"] == active_id:
                        alert["status"] = "resolved"
                        alert["resolved_at"] = int(time.time())
                        break
            self.last_fired.pop(rule_id, None)
            self._save_rules()
            return True

    @staticmethod
    def _matches(value: float, operator: str, threshold: float) -> bool:
        return {">": value > threshold, ">=": value >= threshold,
                "<": value < threshold, "<=": value <= threshold}[operator]

    def evaluate(self, values: dict[str, float]):
        now = time.time()
        fired = []
        with self.lock:
            for rule in self.rules:
                active_id = self.active_by_rule.get(rule["id"])
                if not rule["enabled"]:
                    if active_id:
                        for alert in self.alerts:
                            if alert["id"] == active_id:
                                alert["status"] = "resolved"
                                alert["resolved_at"] = int(now)
                                break
                        self.active_by_rule.pop(rule["id"], None)
                    continue
                metric = rule["metric"]
                if metric not in values or values[metric] is None:
                    continue
                value = float(values[metric])
                matched = self._matches(value, rule["operator"], float(rule["threshold"]))
                if matched and not active_id:
                    last = self.last_fired.get(rule["id"], 0)
                    if now - last < rule["cooldown_seconds"]:
                        continue
                    alert = {
                        "id": str(uuid.uuid4()), "rule_id": rule["id"], "rule_name": rule["name"],
                        "metric": metric, "value": round(value, 2), "operator": rule["operator"],
                        "threshold": rule["threshold"], "severity": rule["severity"],
                        "status": "active", "acknowledged": False,
                        "message": f"{rule['name']}: {value:.1f}% {rule['operator']} {rule['threshold']:.1f}%",
                        "created_at": int(now), "resolved_at": None,
                    }
                    self.alerts.insert(0, alert)
                    self.alerts = self.alerts[:500]
                    self.active_by_rule[rule["id"]] = alert["id"]
                    self.last_fired[rule["id"]] = now
                    fired.append(dict(alert))
                elif not matched and active_id:
                    for alert in self.alerts:
                        if alert["id"] == active_id:
                            alert["status"] = "resolved"
                            alert["resolved_at"] = int(now)
                            break
                    self.active_by_rule.pop(rule["id"], None)
        return fired

    def record_event(self, event_key: str, title: str, message: str, severity: str = "critical"):
        """Create one active event alert; duplicate active events are suppressed."""
        now = time.time()
        with self.lock:
            if event_key in self.active_by_rule:
                return None
            alert = {
                "id": str(uuid.uuid4()), "rule_id": event_key, "rule_name": title,
                "metric": "container_state", "value": None, "operator": None,
                "threshold": None, "severity": severity, "status": "active",
                "acknowledged": False, "message": message,
                "created_at": int(now), "resolved_at": None,
            }
            self.alerts.insert(0, alert)
            self.alerts = self.alerts[:500]
            self.active_by_rule[event_key] = alert["id"]
            return dict(alert)

    def resolve_event(self, event_key: str):
        with self.lock:
            active_id = self.active_by_rule.pop(event_key, None)
            if not active_id:
                return
            for alert in self.alerts:
                if alert["id"] == active_id:
                    alert["status"] = "resolved"
                    alert["resolved_at"] = int(time.time())
                    break

    def active_alerts(self):
        with self.lock:
            return [dict(a) for a in self.alerts if a["status"] == "active"]

    def history(self, limit: int = 100):
        with self.lock:
            return [dict(a) for a in self.alerts[:limit]]

    def acknowledge(self, alert_id: str):
        with self.lock:
            for alert in self.alerts:
                if alert["id"] == alert_id:
                    alert["acknowledged"] = True
                    alert["acknowledged_at"] = int(time.time())
                    return dict(alert)
        return None


alert_engine = AlertEngine()
