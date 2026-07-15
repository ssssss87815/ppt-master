#!/usr/bin/env python3
"""Behavioral smoke test for the manifest-gated PPT Master admission guard."""

from __future__ import annotations

import importlib.util
import json
import sqlite3
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


def make_board(path: Path, root: Path) -> None:
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
    con.execute("INSERT INTO tasks VALUES ('t_a4281740', 'blocked', NULL, NULL, 'dir', ?)", (str(root),))
    con.execute("INSERT INTO tasks VALUES ('t_approved', 'ready', NULL, NULL, 'worktree', ?)", (str(root),))
    con.execute(
        "INSERT INTO kanban_notify_subs VALUES ('t_approved', 'feishu', 'chat-1', 'thread-1', 'user-1', 'coder')"
    )
    con.commit()
    con.close()


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        db = root / "kanban.db"
        manifest = root / "approved-dispatch-manifest.json"
        make_board(db, root)
        manifest.write_text(json.dumps({
            "version": 2,
            "board": MODULE.BOARD,
            "candidates": [{
                "task_id": "t_approved",
                "workspace_kind": "worktree",
                "source_repo": str(root),
                "feishu_subscription": {
                    "chat_id": "chat-1",
                    "thread_id": "thread-1",
                    "user_id": "user-1",
                    "notifier_profile": "coder",
                },
            }],
        }))
        before = db.read_bytes()
        original_minimum = MODULE.MIN_FREE_GIB
        MODULE.MIN_FREE_GIB = 0
        try:
            result = MODULE.evaluate_admission(db, root, manifest)
        finally:
            MODULE.MIN_FREE_GIB = original_minimum
        assert result.allowed is True
        assert result.candidate_id == "t_approved"
        assert db.read_bytes() == before, "admission guard must not mutate the board DB"

    source = RUNNER.read_text()
    forbidden = ("kanban complete", "kanban claim", "kanban promote", "kanban reclaim", "kanban dispatch")
    for token in forbidden:
        assert token not in source, f"guard must not contain lifecycle mutation: {token}"

    print("pptmaster manifest admission guard tests: PASS")


if __name__ == "__main__":
    main()
