#!/usr/bin/env python3
"""Read-only admission guard for PPT Master productization automation.

This runner never mutates Kanban lifecycle state. Hermes remains the sole
writer for claim/promote/complete/reclaim/dispatch. The guard fail-closes unless
the repository-versioned manifest authorizes exactly the next ready candidate.
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
MANIFEST_NAME = "approved-dispatch-manifest.json"


@dataclass(frozen=True)
class Admission:
    allowed: bool
    reasons: tuple[str, ...]
    free_gib: float | None
    executable_tasks: int | None
    candidate_id: str | None = None

    def as_dict(self) -> dict[str, object]:
        return {
            "allowed": self.allowed,
            "reasons": list(self.reasons),
            "free_gib": self.free_gib,
            "minimum_free_gib": MIN_FREE_GIB,
            "executable_tasks": self.executable_tasks,
            "candidate_id": self.candidate_id,
            "mode": "read-only-admission",
        }


@dataclass(frozen=True)
class ApprovedCandidate:
    task_id: str
    workspace_kind: str
    workspace_path: Path


def root_is_tracker_only(cur: sqlite3.Cursor, repo_root: Path) -> tuple[bool, str]:
    row = cur.execute(
        "SELECT status, claim_lock, worker_pid, workspace_kind, workspace_path "
        "FROM tasks WHERE id = ?",
        ("t_a4281740",),
    ).fetchone()
    if row is None:
        return False, "root-missing"
    status, claim_lock, worker_pid, workspace_kind, workspace_path = row
    if status != "blocked":
        return False, f"root-status-{status}"
    if claim_lock is not None or worker_pid is not None:
        return False, "root-has-execution-lock"
    if workspace_kind != "dir" or workspace_path != str(repo_root):
        return False, "root-workspace-mismatch"
    incoming = cur.execute(
        "SELECT COUNT(*) FROM task_links WHERE child_id = ?", ("t_a4281740",)
    ).fetchone()[0]
    if incoming:
        return False, "root-has-incoming-dependency"
    outgoing = cur.execute(
        "SELECT COUNT(*) FROM task_links WHERE parent_id = ?", ("t_a4281740",)
    ).fetchone()[0]
    if outgoing:
        return False, "root-has-outgoing-dependency"
    return True, "ok"


def free_gib(path: Path) -> float:
    return shutil.disk_usage(path).free / (1024**3)


def executable_task_count(cur: sqlite3.Cursor) -> int:
    return cur.execute(
        "SELECT COUNT(*) FROM tasks WHERE status IN ('ready', 'running')"
    ).fetchone()[0]


def load_manifest(
    manifest_path: Path, board: str, repo_root: Path
) -> tuple[tuple[ApprovedCandidate, ...] | None, str | None]:
    try:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None, "manifest-missing"
    except (OSError, json.JSONDecodeError) as exc:
        return None, f"manifest-invalid:{exc.__class__.__name__}"
    if not isinstance(payload, dict) or set(payload) != {"version", "board", "candidates"}:
        return None, "manifest-invalid:schema"
    if payload["version"] != 1 or payload["board"] != board or not isinstance(payload["candidates"], list):
        return None, "manifest-invalid:schema"

    candidates: list[ApprovedCandidate] = []
    candidate_ids: set[str] = set()
    for item in payload["candidates"]:
        if not isinstance(item, dict) or set(item) != {"task_id", "workspace_kind", "workspace_path"}:
            return None, "manifest-invalid:candidate-schema"
        task_id = item["task_id"]
        workspace_kind = item["workspace_kind"]
        workspace_path = item["workspace_path"]
        if not isinstance(task_id, str) or not task_id.startswith("t_") or task_id in candidate_ids:
            return None, "manifest-invalid:candidate-id"
        if workspace_kind != "dir" or not isinstance(workspace_path, str):
            return None, "manifest-invalid:candidate-workspace"
        path = Path(workspace_path)
        if not path.is_absolute() or path.resolve() != repo_root:
            return None, "manifest-invalid:candidate-workspace"
        candidate_ids.add(task_id)
        candidates.append(ApprovedCandidate(task_id, workspace_kind, path))
    return tuple(candidates), None


def approved_candidate(
    cur: sqlite3.Cursor, candidates: tuple[ApprovedCandidate, ...]
) -> tuple[str | None, tuple[str, ...]]:
    running = [row[0] for row in cur.execute("SELECT id FROM tasks WHERE status = 'running' ORDER BY id")]
    if running:
        return None, (f"legacy-running-tasks:{','.join(running)}",)

    ready = [row[0] for row in cur.execute("SELECT id FROM tasks WHERE status = 'ready' ORDER BY id")]
    if len(ready) != 1:
        if not candidates and not ready:
            return None, ("approved-sequence-exhausted",)
        return None, (f"multiple-or-missing-ready-tasks:{len(ready)}",)

    for candidate in candidates:
        row = cur.execute(
            "SELECT status, workspace_kind, workspace_path FROM tasks WHERE id = ?",
            (candidate.task_id,),
        ).fetchone()
        if row is None:
            return None, (f"approved-candidate-missing:{candidate.task_id}",)
        status, workspace_kind, workspace_path = row
        if status == "done":
            continue
        if status != "ready":
            return None, (f"approved-candidate-not-ready:{candidate.task_id}:{status}",)
        if ready[0] != candidate.task_id:
            return None, (f"unknown-ready-task:{ready[0]}",)
        if workspace_kind != candidate.workspace_kind or workspace_path != str(candidate.workspace_path):
            return None, (f"approved-candidate-workspace-mismatch:{candidate.task_id}",)
        return candidate.task_id, ()

    return None, (f"unknown-ready-task:{ready[0]}",)


def evaluate_admission(
    db_path: Path = DB,
    repo_root: Path = REPO_ROOT,
    manifest_path: Path | None = None,
    board: str = BOARD,
) -> Admission:
    """Evaluate dispatch admission without changing the database or filesystem."""
    repo_root = repo_root.resolve()
    manifest_path = manifest_path or repo_root / "productization/kanban" / MANIFEST_NAME
    reasons: list[str] = []
    try:
        free = free_gib(repo_root)
    except OSError as exc:
        return Admission(False, (f"repo-root-unreadable:{exc.__class__.__name__}",), None, None)
    if free < MIN_FREE_GIB:
        reasons.append(f"disk-below-minimum:{free:.2f}GiB<{MIN_FREE_GIB:.2f}GiB")
    candidates, manifest_reason = load_manifest(manifest_path, board, repo_root)
    if manifest_reason:
        reasons.append(manifest_reason)
    if candidates is None:
        return Admission(False, tuple(reasons), free, None)
    if not db_path.exists():
        reasons.append("board-db-missing")
        return Admission(False, tuple(reasons), free, None)

    con: sqlite3.Connection | None = None
    try:
        con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        cur = con.cursor()
        integrity = cur.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            reasons.append(f"board-integrity-{integrity}")
            return Admission(False, tuple(reasons), free, None)
        root_ok, root_reason = root_is_tracker_only(cur, repo_root)
        if not root_ok:
            reasons.append(root_reason)
        executable = executable_task_count(cur)
        candidate_id, candidate_reasons = approved_candidate(cur, candidates)
        reasons.extend(candidate_reasons)
        return Admission(not reasons, tuple(reasons), free, executable, candidate_id)
    except sqlite3.DatabaseError as exc:
        reasons.append(f"board-unreadable:{exc}")
        return Admission(False, tuple(reasons), free, None)
    finally:
        if con is not None:
            con.close()


def main() -> int:
    admission = evaluate_admission()
    print(json.dumps(admission.as_dict(), ensure_ascii=False, sort_keys=True))
    return 0 if admission.allowed else 2


if __name__ == "__main__":
    raise SystemExit(main())
