#!/usr/bin/env python3
"""Tests for the manifest-gated, read-only PPT Master admission guard."""

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
    repo_root: Path,
    *,
    root_status: str = "blocked",
    root_lock: str | None = None,
    executable: str | None = None,
    executable_id: str = "t_probe",
    executable_workspace_kind: str = "worktree",
    executable_workspace_path: Path | None = None,
    root_incoming: bool = False,
) -> None:
    con = sqlite3.connect(path)
    con.executescript(
        """
        CREATE TABLE tasks (
            id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            claim_lock TEXT,
            worker_pid INTEGER,
            workspace_kind TEXT NOT NULL,
            workspace_path TEXT
        );
        CREATE TABLE task_links (parent_id TEXT NOT NULL, child_id TEXT NOT NULL);
        CREATE TABLE kanban_notify_subs (
            task_id TEXT NOT NULL,
            platform TEXT NOT NULL,
            chat_id TEXT NOT NULL,
            thread_id TEXT NOT NULL DEFAULT '',
            user_id TEXT,
            notifier_profile TEXT,
            PRIMARY KEY (task_id, platform, chat_id, thread_id)
        );
        """
    )
    con.execute(
        "INSERT INTO tasks(id, status, claim_lock, worker_pid, workspace_kind, workspace_path) "
        "VALUES (?, ?, ?, NULL, 'dir', ?)",
        ("t_a4281740", root_status, root_lock, str(repo_root)),
    )
    if executable:
        con.execute(
            "INSERT INTO tasks(id, status, claim_lock, worker_pid, workspace_kind, workspace_path) "
            "VALUES (?, ?, NULL, NULL, ?, ?)",
            (
                executable_id,
                executable,
                executable_workspace_kind,
                str(executable_workspace_path or repo_root),
            ),
        )
        con.execute(
            "INSERT INTO kanban_notify_subs VALUES (?, 'feishu', 'chat-1', 'thread-1', 'user-1', 'coder')",
            (executable_id,),
        )
    if root_incoming:
        con.execute("INSERT INTO task_links(parent_id, child_id) VALUES (?, ?)", ("t_probe", "t_a4281740"))
    con.commit()
    con.close()


def subscription() -> dict[str, str]:
    return {
        "chat_id": "chat-1",
        "thread_id": "thread-1",
        "user_id": "user-1",
        "notifier_profile": "coder",
    }


def candidate(task_id: str, root: Path) -> dict[str, object]:
    return {
        "task_id": task_id,
        "workspace_kind": "worktree",
        "source_repo": str(root),
        "feishu_subscription": subscription(),
    }


def write_manifest(root: Path, candidates: list[dict[str, object]], board: str = MODULE.BOARD) -> Path:
    path = root / "approved-dispatch-manifest.json"
    path.write_text(json.dumps({"version": 2, "board": board, "candidates": candidates}))
    return path


class AdmissionGuardTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.db = self.root / "kanban.db"
        self.manifest = self.root / "approved-dispatch-manifest.json"
        self.original_minimum = MODULE.MIN_FREE_GIB
        MODULE.MIN_FREE_GIB = 0

    def tearDown(self) -> None:
        MODULE.MIN_FREE_GIB = self.original_minimum
        self.tmp.cleanup()

    def evaluate_read_only(self):
        before = self.db.read_bytes() if self.db.exists() else None
        result = MODULE.evaluate_admission(self.db, self.root, self.manifest)
        if before is not None:
            self.assertEqual(self.db.read_bytes(), before, "guard must never mutate the board DB")
        return result

    def test_allows_exact_first_approved_ready_candidate_without_writes(self) -> None:
        create_db(self.db, self.root, executable="ready", executable_id="t_approved")
        write_manifest(self.root, [candidate("t_approved", self.root)])

        result = self.evaluate_read_only()

        self.assertTrue(result.allowed)
        self.assertEqual(result.executable_tasks, 1)
        self.assertEqual(result.candidate_id, "t_approved")
        self.assertEqual(result.reasons, ())

    def test_rejects_legacy_running_and_unknown_ready_tasks(self) -> None:
        create_db(self.db, self.root, executable="running", executable_id="t_legacy")
        write_manifest(self.root, [])
        result = self.evaluate_read_only()
        self.assertFalse(result.allowed)
        self.assertIn("legacy-running-tasks:t_legacy", result.reasons)

        self.db.unlink()
        create_db(self.db, self.root, executable="ready", executable_id="t_unknown")
        write_manifest(self.root, [candidate("t_approved", self.root)])
        result = self.evaluate_read_only()
        self.assertFalse(result.allowed)
        self.assertIn("approved-candidate-missing:t_approved", result.reasons)

    def test_rejects_empty_manifest_with_ready_task(self) -> None:
        create_db(self.db, self.root, executable="ready", executable_id="t_approved")
        write_manifest(self.root, [])

        result = self.evaluate_read_only()

        self.assertFalse(result.allowed)
        self.assertIn("unknown-ready-task:t_approved", result.reasons)

    def test_rejects_missing_invalid_and_wrong_board_manifests(self) -> None:
        create_db(self.db, self.root, executable="ready", executable_id="t_approved")
        result = self.evaluate_read_only()
        self.assertIn("manifest-missing", result.reasons)

        self.manifest.write_text("not json")
        result = self.evaluate_read_only()
        self.assertTrue(any(reason.startswith("manifest-invalid:") for reason in result.reasons))

        write_manifest(self.root, [candidate("t_approved", self.root)], board="wrong-board")
        result = self.evaluate_read_only()
        self.assertIn("manifest-invalid:schema", result.reasons)

    def test_rejects_multiple_ready_and_sequence_violations(self) -> None:
        create_db(self.db, self.root, executable="ready", executable_id="t_second")
        con = sqlite3.connect(self.db)
        con.execute("INSERT INTO tasks VALUES ('t_first', 'todo', NULL, NULL, 'dir', ?)", (str(self.root),))
        con.execute("INSERT INTO tasks VALUES ('t_extra', 'ready', NULL, NULL, 'dir', ?)", (str(self.root),))
        con.commit()
        con.close()
        write_manifest(self.root, [candidate("t_first", self.root), candidate("t_second", self.root)])

        result = self.evaluate_read_only()
        self.assertFalse(result.allowed)
        self.assertIn("multiple-or-missing-ready-tasks:2", result.reasons)

        con = sqlite3.connect(self.db)
        con.execute("UPDATE tasks SET status = 'todo' WHERE id = 't_extra'")
        con.commit()
        con.close()
        result = self.evaluate_read_only()
        self.assertIn("approved-candidate-not-ready:t_first:todo", result.reasons)

    def test_rejects_task_policy_or_source_repo_mismatch(self) -> None:
        create_db(self.db, self.root, executable="ready", executable_id="t_approved")
        write_manifest(self.root, [candidate("t_approved", self.root)])
        con = sqlite3.connect(self.db)
        con.execute("UPDATE tasks SET workspace_path = ? WHERE id = 't_approved'", (str(self.root / "other"),))
        con.commit()
        con.close()
        result = self.evaluate_read_only()
        self.assertIn("approved-candidate-workspace-mismatch:t_approved", result.reasons)

        con = sqlite3.connect(self.db)
        con.execute(
            "UPDATE tasks SET workspace_kind = 'dir', workspace_path = ? WHERE id = 't_approved'",
            (str(self.root),),
        )
        con.commit()
        con.close()
        result = self.evaluate_read_only()
        self.assertIn("approved-candidate-workspace-mismatch:t_approved", result.reasons)

    def test_rejects_missing_or_mismatched_feishu_subscription(self) -> None:
        create_db(self.db, self.root, executable="ready", executable_id="t_approved")
        write_manifest(self.root, [candidate("t_approved", self.root)])
        con = sqlite3.connect(self.db)
        con.execute("DELETE FROM kanban_notify_subs WHERE task_id = 't_approved'")
        con.commit()
        con.close()
        result = self.evaluate_read_only()
        self.assertIn("approved-candidate-feishu-subscription-mismatch:t_approved", result.reasons)

        con = sqlite3.connect(self.db)
        con.execute(
            "INSERT INTO kanban_notify_subs VALUES ('t_approved', 'feishu', 'other-chat', 'thread-1', 'user-1', 'coder')"
        )
        con.commit()
        con.close()
        result = self.evaluate_read_only()
        self.assertIn("approved-candidate-feishu-subscription-mismatch:t_approved", result.reasons)

    def test_root_workspace_is_not_an_execution_invariant(self) -> None:
        create_db(self.db, self.root, executable="ready", executable_id="t_approved")
        write_manifest(self.root, [candidate("t_approved", self.root)])
        con = sqlite3.connect(self.db)
        con.execute("UPDATE tasks SET workspace_path = ?, workspace_kind = 'scratch' WHERE id = 't_a4281740'", (str(self.root / "legacy"),))
        con.commit()
        con.close()
        result = self.evaluate_read_only()
        self.assertTrue(result.allowed)
        self.assertEqual(result.candidate_id, "t_approved")

    def test_rejects_root_status_lock_and_dependency_constraints(self) -> None:
        cases = (
            ({"root_status": "ready"}, "root-status-ready"),
            ({"root_lock": "worker-lock"}, "root-has-execution-lock"),
            ({"root_incoming": True}, "root-has-incoming-dependency"),
        )
        for kwargs, reason in cases:
            with self.subTest(reason=reason):
                self.db.unlink(missing_ok=True)
                create_db(self.db, self.root, **kwargs)
                write_manifest(self.root, [])
                result = self.evaluate_read_only()
                self.assertFalse(result.allowed)
                self.assertIn(reason, result.reasons)

    def test_rejects_missing_corrupt_and_unreadable_repo_inputs(self) -> None:
        write_manifest(self.root, [])
        result = self.evaluate_read_only()
        self.assertFalse(result.allowed)
        self.assertIn("board-db-missing", result.reasons)

        self.db.write_bytes(b"not a sqlite database")
        result = self.evaluate_read_only()
        self.assertFalse(result.allowed)
        self.assertTrue(any(reason.startswith("board-unreadable:") for reason in result.reasons))

        result = MODULE.evaluate_admission(self.db, self.root / "missing-repo", self.manifest)
        self.assertFalse(result.allowed)
        self.assertEqual(result.free_gib, None)
        self.assertTrue(any(reason.startswith("repo-root-unreadable:") for reason in result.reasons))

    def test_rejects_insufficient_disk_before_board_admission(self) -> None:
        create_db(self.db, self.root)
        write_manifest(self.root, [])
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
