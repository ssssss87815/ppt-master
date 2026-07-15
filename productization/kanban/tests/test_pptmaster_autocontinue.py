#!/usr/bin/env python3
"""Tests for the fail-closed, read-only PPT Master admission guard."""

from __future__ import annotations

import importlib.util
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
RUNNER = ROOT / "productization/kanban/pptmaster_autocontinue.py"
SPEC = importlib.util.spec_from_file_location("pptmaster_autocontinue", RUNNER)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def create_db(
    path: Path,
    *,
    root_status: str = "blocked",
    root_lock: str | None = None,
    executable: str | None = None,
    root_incoming: bool = False,
) -> None:
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
        "INSERT INTO tasks(id, status, claim_lock, worker_pid) VALUES (?, ?, ?, NULL)",
        ("t_a4281740", root_status, root_lock),
    )
    if executable:
        con.execute(
            "INSERT INTO tasks(id, status, claim_lock, worker_pid) VALUES (?, ?, NULL, NULL)",
            ("t_probe", executable),
        )
    if root_incoming:
        con.execute("INSERT INTO task_links(parent_id, child_id) VALUES (?, ?)", ("t_probe", "t_a4281740"))
    con.commit()
    con.close()


class AdmissionGuardTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.db = self.root / "kanban.db"
        self.original_minimum = MODULE.MIN_FREE_GIB
        MODULE.MIN_FREE_GIB = 0

    def tearDown(self) -> None:
        MODULE.MIN_FREE_GIB = self.original_minimum
        self.tmp.cleanup()

    def evaluate_read_only(self):
        before = self.db.read_bytes() if self.db.exists() else None
        result = MODULE.evaluate_admission(self.db, self.root)
        if before is not None:
            self.assertEqual(self.db.read_bytes(), before, "guard must never mutate the board DB")
        return result

    def test_allows_clean_tracker_only_board_without_executable_tasks(self) -> None:
        create_db(self.db)
        result = self.evaluate_read_only()
        self.assertTrue(result.allowed)
        self.assertEqual(result.executable_tasks, 0)
        self.assertEqual(result.reasons, ())

    def test_quarantines_ready_and_running_tasks(self) -> None:
        for status in ("ready", "running"):
            with self.subTest(status=status):
                self.db.unlink(missing_ok=True)
                create_db(self.db, executable=status)
                result = self.evaluate_read_only()
                self.assertFalse(result.allowed)
                self.assertIn("recovery-quarantine-executable-tasks:1", result.reasons)

    def test_rejects_root_status_lock_and_incoming_dependency(self) -> None:
        cases = (
            ({"root_status": "ready"}, "root-status-ready"),
            ({"root_lock": "worker-lock"}, "root-has-execution-lock"),
            ({"root_incoming": True}, "root-has-incoming-dependency"),
        )
        for kwargs, reason in cases:
            with self.subTest(reason=reason):
                self.db.unlink(missing_ok=True)
                create_db(self.db, **kwargs)
                result = self.evaluate_read_only()
                self.assertFalse(result.allowed)
                self.assertIn(reason, result.reasons)

    def test_rejects_missing_corrupt_and_unreadable_repo_inputs(self) -> None:
        result = MODULE.evaluate_admission(self.db, self.root)
        self.assertFalse(result.allowed)
        self.assertIn("board-db-missing", result.reasons)

        self.db.write_bytes(b"not a sqlite database")
        result = self.evaluate_read_only()
        self.assertFalse(result.allowed)
        self.assertTrue(any(reason.startswith("board-unreadable:") for reason in result.reasons))

        result = MODULE.evaluate_admission(self.db, self.root / "missing-repo")
        self.assertFalse(result.allowed)
        self.assertEqual(result.free_gib, None)
        self.assertTrue(any(reason.startswith("repo-root-unreadable:") for reason in result.reasons))

    def test_rejects_insufficient_disk_before_board_admission(self) -> None:
        create_db(self.db)
        MODULE.MIN_FREE_GIB = 10**9
        result = self.evaluate_read_only()
        self.assertFalse(result.allowed)
        self.assertTrue(any(reason.startswith("disk-below-minimum:") for reason in result.reasons))

    def test_cli_emits_structured_rejection_for_unreadable_repo(self) -> None:
        env = os.environ | {
            "PPTMASTER_REPO_ROOT": str(self.root / "missing-repo"),
            "HERMES_KANBAN_ROOT": str(self.root),
            "HERMES_KANBAN_BOARD": ".",
            "PPTMASTER_MIN_FREE_GIB": "0",
        }
        proc = subprocess.run([sys.executable, str(RUNNER)], env=env, text=True, capture_output=True)
        self.assertEqual(proc.returncode, 2)
        payload = json.loads(proc.stdout)
        self.assertFalse(payload["allowed"])
        self.assertTrue(any(reason.startswith("repo-root-unreadable:") for reason in payload["reasons"]))
        self.assertEqual(proc.stderr, "")

    def test_source_contains_no_lifecycle_mutation_commands(self) -> None:
        source = RUNNER.read_text()
        for token in ("kanban complete", "kanban claim", "kanban promote", "kanban reclaim", "kanban dispatch"):
            self.assertNotIn(token, source)


if __name__ == "__main__":
    unittest.main(verbosity=2)
