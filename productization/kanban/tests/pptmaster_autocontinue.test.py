#!/usr/bin/env python3
"""Behavioral tests for the read-only PPT Master admission guard."""

from __future__ import annotations

import importlib.util
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
RUNNER = ROOT / "productization/kanban/pptmaster_autocontinue.py"
SPEC = importlib.util.spec_from_file_location("pptmaster_autocontinue", RUNNER)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def create_db(path: Path, root_status: str = "blocked", executable: str | None = None) -> None:
    con = sqlite3.connect(path)
    con.executescript(
        """
        CREATE TABLE tasks (
            id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            claim_lock TEXT,
            worker_pid INTEGER
        );
        CREATE TABLE task_links (parent_id TEXT NOT NULL, child_id TEXT NOT NULL);
        """
    )
    con.execute(
        "INSERT INTO tasks(id, status, claim_lock, worker_pid) VALUES (?, ?, NULL, NULL)",
        ("t_a4281740", root_status),
    )
    if executable:
        con.execute(
            "INSERT INTO tasks(id, status, claim_lock, worker_pid) VALUES (?, ?, NULL, NULL)",
            ("t_probe", executable),
        )
    con.commit()
    con.close()


def assert_guard_is_read_only(db: Path, repo: Path) -> None:
    before = db.read_bytes()
    original_minimum = MODULE.MIN_FREE_GIB
    MODULE.MIN_FREE_GIB = 0
    try:
        result = MODULE.evaluate_admission(db, repo)
    finally:
        MODULE.MIN_FREE_GIB = original_minimum
    assert db.read_bytes() == before, "admission guard must not mutate the board DB"
    assert result.allowed is True
    assert result.executable_tasks == 0


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        db = root / "kanban.db"
        create_db(db)
        assert_guard_is_read_only(db, root)

        db.unlink()
        create_db(db, executable="running")
        result = MODULE.evaluate_admission(db, root)
        assert result.allowed is False
        assert "recovery-quarantine-executable-tasks:1" in result.reasons

        db.unlink()
        create_db(db, root_status="ready")
        result = MODULE.evaluate_admission(db, root)
        assert result.allowed is False
        assert "root-status-ready" in result.reasons

        # CLI is status-only and never invokes hermes lifecycle commands.
        env = os.environ | {
            "PPTMASTER_REPO_ROOT": str(root),
            "HERMES_KANBAN_ROOT": str(root),
            "HERMES_KANBAN_BOARD": ".",
            "PPTMASTER_MIN_FREE_GIB": "0",
        }
        db.rename(root / "kanban.db") if db.name != "kanban.db" else None
        proc = subprocess.run([sys.executable, str(RUNNER)], env=env, text=True, capture_output=True)
        assert proc.returncode == 2
        payload = json.loads(proc.stdout)
        assert payload["mode"] == "read-only-admission"
        assert payload["allowed"] is False
        assert "root-status-ready" in payload["reasons"]

    source = RUNNER.read_text()
    forbidden = ("kanban complete", "kanban claim", "kanban promote", "kanban reclaim", "kanban dispatch")
    for token in forbidden:
        assert token not in source, f"guard must not contain lifecycle mutation: {token}"

    print("pptmaster admission guard tests: PASS")


if __name__ == "__main__":
    main()
