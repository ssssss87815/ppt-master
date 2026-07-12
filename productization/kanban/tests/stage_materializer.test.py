#!/usr/bin/env python3
"""Focused contract tests for the fixed PPT Master adjacent-stage materializer."""

from __future__ import annotations

import importlib.util
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
MODULE_PATH = ROOT / "productization/kanban/stage_materializer.py"
MANIFEST_PATH = ROOT / "productization/kanban/stage-manifest.json"


def load_module():
    spec = importlib.util.spec_from_file_location("stage_materializer", MODULE_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class StageMaterializerTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="pptm-stage-materializer-")
        self.db_path = Path(self.temp.name) / "kanban.db"
        self.materializer = load_module()
        self.create_schema()
        self.root_id = "root-tracker"
        self.review_id = "delivery-review"
        self.implementation_id = "delivery-implementation"
        self.insert_task(self.root_id, "pptmaster productization mainline", "blocked")
        self.insert_task(self.implementation_id, "PPTM [delivery]: workspace availability", "done")
        self.insert_task(self.review_id, "PPTM [delivery availability remediation review]: workspace availability", "done")
        self.link(self.implementation_id, self.review_id)
        self.complete_review_handoff()

    def tearDown(self):
        self.temp.cleanup()

    def connect(self):
        return sqlite3.connect(self.db_path)

    def create_schema(self):
        with self.connect() as con:
            con.executescript(
                """
                CREATE TABLE tasks (
                    id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT, assignee TEXT,
                    status TEXT NOT NULL, priority INTEGER DEFAULT 0, created_by TEXT,
                    created_at INTEGER NOT NULL, started_at INTEGER, completed_at INTEGER,
                    workspace_kind TEXT NOT NULL DEFAULT 'dir', workspace_path TEXT,
                    branch_name TEXT, project_id TEXT, claim_lock TEXT, claim_expires INTEGER,
                    tenant TEXT, result TEXT, idempotency_key TEXT, consecutive_failures INTEGER DEFAULT 0,
                    worker_pid INTEGER, last_failure_error TEXT, max_runtime_seconds INTEGER,
                    last_heartbeat_at INTEGER, current_run_id INTEGER, workflow_template_id TEXT,
                    current_step_key TEXT, skills TEXT, model_override TEXT, max_retries INTEGER,
                    goal_mode INTEGER DEFAULT 0, goal_max_turns INTEGER, session_id TEXT,
                    block_kind TEXT, block_recurrences INTEGER DEFAULT 0
                );
                CREATE TABLE task_links (parent_id TEXT NOT NULL, child_id TEXT NOT NULL, PRIMARY KEY(parent_id, child_id));
                CREATE TABLE task_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, author TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL);
                CREATE TABLE task_events (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, run_id INTEGER, kind TEXT NOT NULL, payload TEXT, created_at INTEGER NOT NULL);
                CREATE TABLE task_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, profile TEXT, step_key TEXT, status TEXT NOT NULL, claim_lock TEXT, claim_expires INTEGER, worker_pid INTEGER, max_runtime_seconds INTEGER, last_heartbeat_at INTEGER, started_at INTEGER NOT NULL, ended_at INTEGER, outcome TEXT, summary TEXT, metadata TEXT, error TEXT);
                """
            )

    def insert_task(self, task_id, title, status, *, current_run_id=None, idempotency_key=None, body=""):
        with self.connect() as con:
            con.execute(
                "INSERT INTO tasks(id,title,body,assignee,status,created_by,created_at,workspace_path,current_run_id,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?,?)",
                (task_id, title, body, "default", status, "test", 1, str(ROOT), current_run_id, idempotency_key),
            )

    def link(self, parent_id, child_id):
        with self.connect() as con:
            con.execute("INSERT INTO task_links(parent_id,child_id) VALUES(?,?)", (parent_id, child_id))

    def complete_review_handoff(self, *, metadata_override=None, summary="review-required\nChanged files: productization/backend/adapter/generation-runtime-bridge.ts\nVerification commands:\n- npm run runtime:generation-bridge\n- npx tsc -p tsconfig.json --noEmit\n- git diff --check"):
        metadata = {
            "verdict": "approve",
            "changed_files": ["productization/backend/adapter/generation-runtime-bridge.ts"],
            "tests_run": ["npm run runtime:generation-bridge", "npx tsc -p tsconfig.json --noEmit", "git diff --check"],
            "verification": ["same-run workspace evidence", "checkpoint identity"],
            "artifact_identity": {"project_id": "pptm-demo", "run_id": "run-7", "checkpoint_id": "checkpoint-7"},
            "four_piece_evidence": {"rtk": "present", "codebase": "present", "ponytail": "present", "agent_skills": "present"},
        }
        if metadata_override:
            metadata.update(metadata_override)
        with self.connect() as con:
            con.execute(
                "INSERT INTO task_runs(task_id,status,started_at,ended_at,outcome,summary,metadata) VALUES(?,?,?,?,?,?,?)",
                (self.review_id, "done", 1, 2, "completed", summary, json.dumps(metadata)),
            )

    def snapshot(self):
        with self.connect() as con:
            return {
                table: con.execute(f"SELECT * FROM {table} ORDER BY 1").fetchall()
                for table in ("tasks", "task_links", "task_comments", "task_events", "task_runs")
            }

    def materialize(self, **kwargs):
        options = {
            "db_path": self.db_path,
            "manifest_path": MANIFEST_PATH,
            "root_task_id": self.root_id,
            "predecessor_review_id": self.review_id,
            "now": 100,
        }
        options.update(kwargs)
        return self.materializer.materialize_adjacent_stage(**options)

    def test_valid_materialization_creates_exact_todo_chain_and_audit(self):
        result = self.materialize()
        self.assertTrue(result.created, result.reason)
        self.assertEqual(result.transition, "workspace_delivery_availability->executor_svg_authoring")
        self.assertEqual(len(result.created_task_ids), 3)
        with self.connect() as con:
            cards = con.execute("SELECT title,status,idempotency_key,body FROM tasks WHERE id IN (?,?,?) ORDER BY created_at,id", result.created_task_ids).fetchall()
            self.assertEqual([row[1] for row in cards], ["todo", "todo", "todo"])
            self.assertTrue(all("executor_svg_authoring" in row[0] for row in cards))
            self.assertTrue(all("same-run workspace evidence" in row[3] for row in cards))
            self.assertTrue(all("SVG-final/quality handoff" in row[3] for row in cards))
            self.assertTrue(all("four-piece evidence" in row[3] for row in cards))
            links = con.execute("SELECT parent_id,child_id FROM task_links ORDER BY parent_id,child_id").fetchall()
            self.assertIn((self.review_id, result.created_task_ids[0]), links)
            self.assertIn((result.created_task_ids[0], result.created_task_ids[1]), links)
            self.assertIn((result.created_task_ids[1], result.created_task_ids[2]), links)
            self.assertTrue(con.execute("SELECT 1 FROM task_comments WHERE task_id=?", (self.review_id,)).fetchone())
            self.assertTrue(con.execute("SELECT 1 FROM task_events WHERE task_id=? AND kind='stage_materialized'", (self.review_id,)).fetchone())

    def test_rerun_is_idempotent_without_new_rows(self):
        first = self.materialize()
        after_first = self.snapshot()
        second = self.materialize()
        self.assertFalse(second.created)
        self.assertEqual(second.reason, "already-materialized")
        self.assertEqual(second.created_task_ids, first.created_task_ids)
        self.assertEqual(self.snapshot(), after_first)

    def test_refusals_are_explicit_and_side_effect_free(self):
        cases = [
            ("missing-review", lambda: self.delete_review_run(), "missing-completed-review-handoff"),
            ("unapproved", lambda: self.replace_metadata({"verdict": "request_changes"}), "review-not-approved"),
            ("missing-files", lambda: self.replace_metadata({"changed_files": []}), "missing-changed-files-evidence"),
            ("bad-command", lambda: self.replace_metadata({"tests_run": ["curl https://example.invalid"]}), "verification-command-not-allowed"),
            ("missing-identity", lambda: self.replace_metadata({"artifact_identity": {}}), "missing-artifact-identity"),
            ("missing-four-piece", lambda: self.replace_metadata({"four_piece_evidence": {"rtk": "present"}}), "missing-four-piece-evidence"),
            ("active-worker", lambda: self.insert_task("other-canonical", "canonical worker", "running", current_run_id=99), "active-canonical-worker"),
            ("root-not-clean", lambda: self.set_status(self.root_id, "done"), "root-tracker-not-clean"),
        ]
        for label, setup, expected in cases:
            with self.subTest(label=label):
                self.setUp()
                setup()
                before = self.snapshot()
                result = self.materialize()
                self.assertFalse(result.created)
                self.assertEqual(result.reason, expected)
                self.assertEqual(self.snapshot(), before)
                self.tearDown()

    def test_child_to_root_and_unknown_transition_are_rejected_without_side_effects(self):
        before = self.snapshot()
        child_to_root = self.materialize(root_task_id=self.review_id)
        self.assertFalse(child_to_root.created)
        self.assertEqual(child_to_root.reason, "root-tracker-not-clean")
        self.assertEqual(self.snapshot(), before)
        unknown = self.materialize(transition="workspace_delivery_availability->quality_check")
        self.assertFalse(unknown.created)
        self.assertEqual(unknown.reason, "transition-not-declared")
        self.assertEqual(self.snapshot(), before)

    def test_manifest_is_versioned_and_only_declares_one_transition(self):
        manifest = json.loads(MANIFEST_PATH.read_text())
        self.assertEqual(manifest["version"], 1)
        self.assertEqual(list(manifest["transitions"]), ["workspace_delivery_availability->executor_svg_authoring"])

    def delete_review_run(self):
        with self.connect() as con:
            con.execute("DELETE FROM task_runs WHERE task_id=?", (self.review_id,))

    def replace_metadata(self, updates):
        with self.connect() as con:
            raw = con.execute("SELECT metadata FROM task_runs WHERE task_id=? ORDER BY id DESC LIMIT 1", (self.review_id,)).fetchone()[0]
            metadata = json.loads(raw)
            metadata.update(updates)
            con.execute("UPDATE task_runs SET metadata=? WHERE task_id=?", (json.dumps(metadata), self.review_id))

    def set_status(self, task_id, status):
        with self.connect() as con:
            con.execute("UPDATE tasks SET status=? WHERE id=?", (status, task_id))


if __name__ == "__main__":
    unittest.main()
