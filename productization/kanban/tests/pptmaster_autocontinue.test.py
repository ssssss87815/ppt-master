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
            workspace_path TEXT NOT NULL
        );
        CREATE TABLE task_links (parent_id TEXT NOT NULL, child_id TEXT NOT NULL);
        """
    )
    con.execute("INSERT INTO tasks VALUES ('t_a4281740', 'blocked', NULL, NULL, 'dir', ?)", (str(root),))
    con.execute("INSERT INTO tasks VALUES ('t_approved', 'ready', NULL, NULL, 'dir', ?)", (str(root),))
    con.commit()
    con.close()


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        db = root / "kanban.db"
        manifest = root / "approved-dispatch-manifest.json"
        make_board(db, root)
        manifest.write_text(json.dumps({
            "version": 1,
            "board": MODULE.BOARD,
            "candidates": [{
                "task_id": "t_approved",
                "workspace_kind": "dir",
                "workspace_path": str(root),
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
