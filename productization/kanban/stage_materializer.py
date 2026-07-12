#!/usr/bin/env python3
"""Deterministically create the one manifest-declared adjacent Kanban stage chain.

This is intentionally a control-plane utility: it only reads a direct completed
review handoff and inserts the fixed three-card chain when every declared guard
passes. It never dispatches, claims, promotes, completes, or mutates PPT assets.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import sqlite3
from typing import Any


@dataclass(frozen=True)
class MaterializeResult:
    created: bool
    reason: str
    transition: str | None = None
    created_task_ids: tuple[str, ...] = ()
    idempotency_key: str | None = None
    manifest_hash: str | None = None


def load_manifest(path: Path) -> tuple[dict[str, Any], str]:
    raw = path.read_bytes()
    manifest = json.loads(raw)
    if manifest.get("version") != 1 or not isinstance(manifest.get("transitions"), dict):
        raise ValueError("invalid-stage-manifest")
    return manifest, hashlib.sha256(raw).hexdigest()


def task_row(cur: sqlite3.Cursor, task_id: str):
    return cur.execute(
        "SELECT id,title,status,current_run_id,idempotency_key FROM tasks WHERE id=?", (task_id,)
    ).fetchone()


def root_is_tracker_only(cur: sqlite3.Cursor, root_task_id: str) -> bool:
    row = task_row(cur, root_task_id)
    return bool(row and row[1] == "pptmaster productization mainline" and row[2] == "blocked" and row[3] is None)


def active_canonical_worker_exists(cur: sqlite3.Cursor, root_task_id: str) -> bool:
    row = cur.execute(
        "SELECT 1 FROM tasks WHERE current_run_id IS NOT NULL AND id != ? LIMIT 1", (root_task_id,)
    ).fetchone()
    return row is not None


def latest_review_handoff(cur: sqlite3.Cursor, review_id: str):
    task = task_row(cur, review_id)
    if not task or task[2] != "done" or task[3] is not None:
        return None
    run = cur.execute(
        "SELECT summary,metadata,outcome FROM task_runs WHERE task_id=? ORDER BY id DESC LIMIT 1", (review_id,)
    ).fetchone()
    if not run or run[2] != "completed":
        return None
    try:
        metadata = json.loads(run[1] or "{}")
    except json.JSONDecodeError:
        return None
    return task, run[0] or "", metadata


def review_has_direct_predecessor(cur: sqlite3.Cursor, review_id: str) -> bool:
    return cur.execute("SELECT 1 FROM task_links WHERE child_id=? LIMIT 1", (review_id,)).fetchone() is not None


def command_allowed(command: str, allowed: list[str]) -> bool:
    return command in allowed


def validate_handoff(cur: sqlite3.Cursor, review_id: str, transition: dict[str, Any]) -> str | None:
    handoff = latest_review_handoff(cur, review_id)
    if not handoff:
        return "missing-completed-review-handoff"
    task, summary, metadata = handoff
    if not review_has_direct_predecessor(cur, review_id):
        return "review-has-no-direct-predecessor"
    if not task[1].startswith(transition["predecessor_review_title_prefix"]):
        return "predecessor-review-title-mismatch"
    if metadata.get("verdict") != "approve":
        return "review-not-approved"
    if "review-required" not in summary:
        return "missing-review-required-handoff"
    changed_files = metadata.get("changed_files")
    if not isinstance(changed_files, list) or not changed_files:
        return "missing-changed-files-evidence"
    prefixes = transition["allowed_changed_file_prefixes"]
    if not all(isinstance(item, str) and any(item.startswith(prefix) for prefix in prefixes) for item in changed_files):
        return "changed-files-not-allowed"
    commands = metadata.get("tests_run")
    if not isinstance(commands, list) or not commands:
        return "missing-verification-command-evidence"
    if not all(isinstance(item, str) and command_allowed(item, transition["allowed_verification_commands"]) for item in commands):
        return "verification-command-not-allowed"
    identity = metadata.get("artifact_identity")
    if not isinstance(identity, dict) or any(not identity.get(field) for field in transition["required_artifact_identity_fields"]):
        return "missing-artifact-identity"
    four_piece = metadata.get("four_piece_evidence")
    if not isinstance(four_piece, dict) or any(not four_piece.get(field) for field in transition["required_four_piece_evidence_fields"]):
        return "missing-four-piece-evidence"
    return None


def stable_task_id(idempotency_key: str, role: str) -> str:
    return f"sm_{hashlib.sha256(f'{idempotency_key}:{role}'.encode()).hexdigest()[:12]}"


def stage_body(transition: dict[str, Any], role: str, review_id: str, manifest_hash: str) -> str:
    return "\n".join(
        [
            f"Fixed manifest stage: {transition['next_stage']}",
            f"Role: {role}",
            f"Predecessor review: {review_id}",
            f"Manifest SHA-256: {manifest_hash}",
            "Required same-run workspace evidence: project_id, run_id, checkpoint_id.",
            "Required SVG-final/quality handoff: real SVG output paths plus negative evidence for missing or stale artifacts.",
            "Required four-piece evidence: RTK, codebase, ponytail, agent-skills.",
            "Boundary: this stage is Executor/SVG authoring entry only; it does not claim live-preview acceptance, Quality Check, post-processing, or PPTX export.",
        ]
    )


def materialize_adjacent_stage(
    *,
    db_path: Path,
    manifest_path: Path,
    root_task_id: str,
    predecessor_review_id: str,
    transition: str = "workspace_delivery_availability->executor_svg_authoring",
    now: int,
) -> MaterializeResult:
    manifest, manifest_hash = load_manifest(manifest_path)
    definition = manifest["transitions"].get(transition)
    if not definition:
        return MaterializeResult(False, "transition-not-declared", transition=transition, manifest_hash=manifest_hash)

    idempotency_key = f"pptm-stage-materializer-v{manifest['version']}:{predecessor_review_id}:{transition}"
    with sqlite3.connect(db_path) as con:
        # Serialize the check-and-create sequence so concurrent dispatcher ticks
        # cannot both pass the idempotency check and race on deterministic IDs.
        con.execute("BEGIN IMMEDIATE")
        cur = con.cursor()
        existing = cur.execute(
            "SELECT id FROM tasks WHERE idempotency_key LIKE ? ORDER BY id", (f"{idempotency_key}:%",)
        ).fetchall()
        if existing:
            return MaterializeResult(
                False,
                "already-materialized",
                transition,
                tuple(stable_task_id(idempotency_key, card["role"]) for card in definition["cards"]),
                idempotency_key,
                manifest_hash,
            )
        if not root_is_tracker_only(cur, root_task_id):
            return MaterializeResult(False, "root-tracker-not-clean", transition, idempotency_key=idempotency_key, manifest_hash=manifest_hash)
        if active_canonical_worker_exists(cur, root_task_id):
            return MaterializeResult(False, "active-canonical-worker", transition, idempotency_key=idempotency_key, manifest_hash=manifest_hash)
        refusal = validate_handoff(cur, predecessor_review_id, definition)
        if refusal:
            return MaterializeResult(False, refusal, transition, idempotency_key=idempotency_key, manifest_hash=manifest_hash)

        created_ids: list[str] = []
        parent_id = predecessor_review_id
        for card in definition["cards"]:
            role = card["role"]
            task_id = stable_task_id(idempotency_key, role)
            task_key = f"{idempotency_key}:{role}"
            cur.execute(
                """INSERT INTO tasks(id,title,body,assignee,status,priority,created_by,created_at,workspace_kind,workspace_path,idempotency_key,skills)
                   VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                (task_id, f"{transition.split('->', 1)[1]}: {card['title']}", stage_body(definition, role, predecessor_review_id, manifest_hash), "default", "todo", 0, "stage-materializer", now, "dir", str(manifest_path.parents[2]), task_key, json.dumps(["spec-driven-development", "test-driven-development", "code-review-and-quality"])), 
            )
            cur.execute("INSERT INTO task_links(parent_id,child_id) VALUES(?,?)", (parent_id, task_id))
            created_ids.append(task_id)
            parent_id = task_id
        payload = json.dumps({"transition": transition, "manifest_version": manifest["version"], "manifest_hash": manifest_hash, "created_task_ids": created_ids, "idempotency_key": idempotency_key}, sort_keys=True)
        cur.execute("INSERT INTO task_comments(task_id,author,body,created_at) VALUES(?,?,?,?)", (predecessor_review_id, "stage-materializer", f"Materialized fixed adjacent stage chain: {payload}", now))
        cur.execute("INSERT INTO task_events(task_id,kind,payload,created_at) VALUES(?,?,?,?)", (predecessor_review_id, "stage_materialized", payload, now))
        return MaterializeResult(True, "materialized", transition, tuple(created_ids), idempotency_key, manifest_hash)
