#!/usr/bin/env python3
"""Read-only admission guard for PPT Master productization automation.

This runner never mutates Kanban lifecycle state. Hermes remains the sole
writer for claim/promote/complete/reclaim/dispatch. The guard is intentionally
fail-closed: it reports why a board may not be dispatched but cannot select a
card, create a worktree, create a successor, or close a task.
"""

from __future__ import annotations

import json
import os
import shutil
import sqlite3
import sys
from dataclasses import dataclass
from pathlib import Path

DEFAULT_REPO_ROOT = Path("/home/ubuntu/projects/ppt-master-upstream")
REPO_ROOT = Path(os.environ.get("PPTMASTER_REPO_ROOT", str(DEFAULT_REPO_ROOT))).resolve()
BOARD = os.environ.get("HERMES_KANBAN_BOARD", "ppt-master-productization-mainline")
BOARD_ROOT = Path(os.environ.get("HERMES_KANBAN_ROOT", "/home/ubuntu/.hermes/kanban/boards"))
DB = BOARD_ROOT / BOARD / "kanban.db"
MIN_FREE_GIB = float(os.environ.get("PPTMASTER_MIN_FREE_GIB", "6"))


@dataclass(frozen=True)
class Admission:
    allowed: bool
    reasons: tuple[str, ...]
    free_gib: float | None
    executable_tasks: int | None

    def as_dict(self) -> dict[str, object]:
        return {
            "allowed": self.allowed,
            "reasons": list(self.reasons),
            "free_gib": self.free_gib,
            "minimum_free_gib": MIN_FREE_GIB,
            "executable_tasks": self.executable_tasks,
            "mode": "read-only-admission",
        }


def root_is_tracker_only(cur: sqlite3.Cursor) -> tuple[bool, str]:
    row = cur.execute(
        "SELECT status, claim_lock, worker_pid FROM tasks WHERE id = ?",
        ("t_a4281740",),
    ).fetchone()
    if row is None:
        return False, "root-missing"
    status, claim_lock, worker_pid = row
    if status != "blocked":
        return False, f"root-status-{status}"
    if claim_lock is not None or worker_pid is not None:
        return False, "root-has-execution-lock"
    incoming = cur.execute(
        "SELECT COUNT(*) FROM task_links WHERE child_id = ?", ("t_a4281740",)
    ).fetchone()[0]
    if incoming:
        return False, "root-has-incoming-dependency"
    return True, "ok"


def free_gib(path: Path) -> float:
    usage = shutil.disk_usage(path)
    return usage.free / (1024**3)


def executable_task_count(cur: sqlite3.Cursor) -> int:
    return cur.execute(
        "SELECT COUNT(*) FROM tasks WHERE status IN ('ready', 'running')"
    ).fetchone()[0]


def evaluate_admission(db_path: Path = DB, repo_root: Path = REPO_ROOT) -> Admission:
    """Evaluate dispatch admission without changing the database or filesystem."""
    reasons: list[str] = []
    try:
        free = free_gib(repo_root)
    except OSError as exc:
        return Admission(False, (f"repo-root-unreadable:{exc.__class__.__name__}",), None, None)
    if free < MIN_FREE_GIB:
        reasons.append(f"disk-below-minimum:{free:.2f}GiB<{MIN_FREE_GIB:.2f}GiB")
    if not db_path.exists():
        reasons.append("board-db-missing")
        return Admission(False, tuple(reasons), free, None)

    try:
        con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        cur = con.cursor()
        integrity = cur.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            reasons.append(f"board-integrity-{integrity}")
            return Admission(False, tuple(reasons), free, None)
        root_ok, root_reason = root_is_tracker_only(cur)
        if not root_ok:
            reasons.append(root_reason)
        executable = executable_task_count(cur)
        # A recovered board with executable tasks is quarantined. Explicit
        # lifecycle handling must settle them before Gateway dispatch resumes.
        if executable:
            reasons.append(f"recovery-quarantine-executable-tasks:{executable}")
        return Admission(not reasons, tuple(reasons), free, executable)
    except sqlite3.DatabaseError as exc:
        reasons.append(f"board-unreadable:{exc}")
        return Admission(False, tuple(reasons), free, None)
    finally:
        try:
            con.close()
        except UnboundLocalError:
            pass


def main() -> int:
    admission = evaluate_admission()
    print(json.dumps(admission.as_dict(), ensure_ascii=False, sort_keys=True))
    return 0 if admission.allowed else 2


if __name__ == "__main__":
    raise SystemExit(main())
