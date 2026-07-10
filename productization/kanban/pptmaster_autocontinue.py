#!/usr/bin/env python3
import json
import re
import sqlite3
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Any

BOARD = os.environ.get("HERMES_KANBAN_BOARD", "ppt-master-productization-mainline")
DB = Path(
    os.environ.get(
        "PPTMASTER_KANBAN_DB",
        f"/home/ubuntu/.hermes/kanban/boards/{BOARD}/kanban.db",
    )
)
ASSIGNEE = os.environ.get("PPTMASTER_KANBAN_ASSIGNEE", "coder")
REPO_ROOT = Path(
    os.environ.get("PPTMASTER_REPO_ROOT", str(Path(__file__).resolve().parents[2]))
).resolve()
REGISTRY_PATH = REPO_ROOT / "productization/kanban/lane-registry.json"
HERMES_BIN = os.environ.get("HERMES_BIN", "/home/ubuntu/.local/bin/hermes")
ROOT_TASK_ID = os.environ.get("PPTMASTER_ROOT_TASK_ID", "t_a4281740")


def root_is_clean(cur) -> tuple[bool, str]:
    root = cur.execute(
        "SELECT status, block_kind, claim_lock, worker_pid, current_run_id FROM tasks WHERE id = ?",
        (ROOT_TASK_ID,),
    ).fetchone()
    if root is None:
        return False, "root-missing"
    status, block_kind, claim_lock, worker_pid, current_run_id = root
    tracker_blocked = status == "blocked" and block_kind == "needs_input"
    if status not in ("todo", "ready") and not tracker_blocked:
        return False, f"root-status-{status}"
    if any(value is not None for value in (claim_lock, worker_pid, current_run_id)):
        return False, "root-has-active-execution-state"
    inbound = cur.execute(
        "SELECT COUNT(*) FROM task_links WHERE child_id = ?",
        (ROOT_TASK_ID,),
    ).fetchone()[0]
    if inbound:
        return False, f"root-has-{inbound}-incoming-links"
    return True, "ok"


@dataclass(frozen=True)
class LanePolicy:
    key: str
    predecessor_ids: frozenset[str]
    spawn_title_prefix: str
    autoclose_title_prefix: str
    autoclose_result: str
    autoclose_summary: str
    next_candidate_key: str
    verify_commands: tuple[str, ...]
    allowed_changed_prefixes: tuple[str, ...]
    allowed_title_prefixes: tuple[str, ...]
    doc_anchors: tuple[str, ...]
    clean_stop_condition: tuple[str, ...]
    human_decision_boundary: tuple[str, ...]
    duplicate_suppression_strategy: str
    candidate_label: str
    worker_handoff_note: str | None = None


def sh(cmd: str):
    return subprocess.run(cmd, shell=True, text=True, capture_output=True)


def sql_in_clause(values: Iterable[str]):
    seq = tuple(values)
    placeholders = ", ".join("?" for _ in seq)
    return placeholders, seq


def extract_json_object(text: str):
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    candidate = text[start : end + 1]
    try:
        return json.loads(candidate)
    except Exception:
        return None


def extract_list_field(text: str, key: str):
    obj = extract_json_object(text)
    if not obj or key not in obj:
        return None
    value = obj.get(key)
    if not isinstance(value, list):
        return None
    return [str(x) for x in value]


def extract_changed_files(text: str):
    return extract_list_field(text, "changed_files")


def extract_verification_commands(text: str):
    return extract_list_field(text, "verification_commands") or extract_list_field(text, "tests_run")


def extract_candidate(text: str, key: str):
    m = re.search(rf'{re.escape(key)}\"\s*:\s*\"([^\"]+)\"', text)
    if not m:
        m = re.search(rf'{re.escape(key)}[^\n:]*[:：]\s*\"?([^\n\"]+)', text)
    return m.group(1).strip() if m else None


def normalize_slug(text: str):
    t = text.lower()
    t = re.sub(r'[^a-z0-9]+', '-', t).strip('-')
    return t[:90]


def load_registry(path: Path) -> tuple[LanePolicy, ...]:
    raw = json.loads(path.read_text())
    lanes: list[LanePolicy] = []
    for item in raw.get("lanes", []):
        identity = item["lane_identity"]
        changed_policy = item["changed_file_policy"]
        verification_policy = item["verification_command_policy"]
        autoclose_messages = item["autoclose_messages"]
        lanes.append(
            LanePolicy(
                key=str(item["lane_id"]),
                predecessor_ids=frozenset(str(x) for x in identity.get("predecessor_ids", [])),
                spawn_title_prefix=str(identity["spawn_title_prefix"]),
                autoclose_title_prefix=str(identity["autoclose_title_prefix"]),
                autoclose_result=str(autoclose_messages["result"]),
                autoclose_summary=str(autoclose_messages["summary"]),
                next_candidate_key=str(item["successor_field_name"]),
                verify_commands=tuple(str(x) for x in verification_policy.get("allowed_commands", [])),
                allowed_changed_prefixes=tuple(str(x) for x in changed_policy.get("allowed_prefixes", [])),
                allowed_title_prefixes=tuple(str(x) for x in identity.get("allowed_title_prefixes", [])),
                doc_anchors=tuple(str(REPO_ROOT / x) for x in item.get("doc_anchors", [])),
                clean_stop_condition=tuple(str(x) for x in item.get("clean_stop_condition", [])),
                human_decision_boundary=tuple(str(x) for x in item.get("human_decision_boundary", [])),
                duplicate_suppression_strategy=str(item.get("duplicate_suppression_key_choice", {}).get("strategy", "normalized_successor_title")),
                candidate_label=(
                    "Current UI candidate from accepted handoff"
                    if str(item["successor_field_name"]) == "next_smallest_ui_candidate"
                    else "Current candidate from accepted handoff"
                ),
                worker_handoff_note=item.get("worker_handoff_note"),
            )
        )
    return tuple(lanes)


LANES = load_registry(REGISTRY_PATH)


def latest_done_with_successor(cur, lane: LanePolicy):
    rows = cur.execute(
        """
        SELECT t.id, t.title, t.completed_at, tr.summary, tr.metadata, c.body
        FROM tasks t
        LEFT JOIN task_runs tr ON tr.task_id = t.id AND tr.status = 'done'
        LEFT JOIN task_comments c ON c.task_id = t.id
        WHERE t.status = 'done' AND t.title LIKE ?
        GROUP BY t.id, t.title, t.completed_at, tr.summary, tr.metadata, c.body, tr.ended_at, c.id
        ORDER BY t.completed_at DESC, tr.ended_at DESC, c.id ASC
        """,
        (f"{lane.spawn_title_prefix}%",),
    ).fetchall()
    seen = set()
    for row in rows:
        blob = "\n".join(x for x in row[3:] if x)
        candidate = extract_candidate(blob, lane.next_candidate_key)
        if not candidate:
            continue
        marker = normalize_slug(candidate)
        if marker in seen:
            continue
        seen.add(marker)
        return row[0], row[1], blob

    placeholders, params = sql_in_clause(lane.predecessor_ids)
    rows = cur.execute(
        f"""
        SELECT t.id, t.title, t.completed_at, tr.summary, tr.metadata, c.body
        FROM tasks t
        LEFT JOIN task_runs tr ON tr.task_id = t.id AND tr.status = 'done'
        LEFT JOIN task_comments c ON c.task_id = t.id
        WHERE t.status = 'done' AND t.id IN ({placeholders})
        GROUP BY t.id, t.title, t.completed_at, tr.summary, tr.metadata, c.body, tr.ended_at, c.id
        ORDER BY t.completed_at DESC, tr.ended_at DESC, c.id ASC
        """,
        params,
    ).fetchall()
    seen = set()
    for row in rows:
        blob = "\n".join(x for x in row[3:] if x)
        candidate = extract_candidate(blob, lane.next_candidate_key)
        if not candidate:
            continue
        marker = normalize_slug(candidate)
        if marker in seen:
            continue
        seen.add(marker)
        return row[0], row[1], blob
    return None


def latest_autoclose_candidate(cur, lane: LanePolicy):
    rows = cur.execute(
        """
        SELECT t.id, t.title, tr.summary,
               (
                 SELECT tc.body
                 FROM task_comments tc
                 WHERE tc.task_id = t.id
                 ORDER BY tc.id ASC
                 LIMIT 1
               ) AS first_comment_body
        FROM tasks t
        LEFT JOIN task_runs tr ON tr.id = t.current_run_id
        WHERE t.status = 'blocked'
          AND t.assignee = ?
          AND t.block_kind = 'needs_input'
          AND t.current_run_id IS NULL
        ORDER BY coalesce(t.started_at, t.created_at) DESC
        """,
        (ASSIGNEE,),
    ).fetchall()
    for row in rows:
        task_id, title, summary, body = row
        if not any(title.startswith(prefix) for prefix in lane.allowed_title_prefixes):
            continue
        blob = "\n".join(x for x in (summary, body) if x)
        ok, reason = should_autoclose(lane, title, blob)
        return task_id, title, blob, extract_candidate(blob, lane.next_candidate_key), ok, reason
    return None


def commands_allowed(lane: LanePolicy, commands: list[str]):
    expected = {f"cd {REPO_ROOT} && {cmd}" for cmd in lane.verify_commands}
    adhoc_pattern = re.compile(
        rf"^cd {re.escape(str(REPO_ROOT))} && npx --yes tsx /tmp/hermes-verify-[A-Za-z0-9_\-]+\.ts$"
    )
    for cmd in commands:
        if cmd in expected:
            continue
        if adhoc_pattern.match(cmd):
            continue
        return False
    return True


def allowed_changed_files(lane: LanePolicy, changed: list[str]):
    normalized = [path.replace(f"{REPO_ROOT}/", "") for path in changed]
    return all(any(path.startswith(prefix) for prefix in lane.allowed_changed_prefixes) for path in normalized)


def should_autoclose(lane: LanePolicy, title: str, blob: str):
    if not any(title.startswith(prefix) for prefix in lane.allowed_title_prefixes):
        return False, "title-family-mismatch"
    if "review-required" not in blob:
        return False, "missing-review-required"
    candidate = extract_candidate(blob, lane.next_candidate_key)
    if not candidate:
        return False, f"missing-{lane.next_candidate_key}"
    changed = extract_changed_files(blob)
    if changed is None:
        return False, "missing-changed-files"
    if not allowed_changed_files(lane, changed):
        return False, "changed-files-out-of-policy"
    commands = extract_verification_commands(blob)
    if not commands:
        return False, "missing-verification-commands"
    normalized = [cmd if cmd.startswith(f"cd {REPO_ROOT} &&") else f"cd {REPO_ROOT} && {cmd}" for cmd in commands]
    if not commands_allowed(lane, normalized):
        return False, "verification-commands-out-of-policy"
    return True, "ok"


def existing_open_title(cur, marker):
    row = cur.execute(
        "SELECT id, status FROM tasks WHERE title LIKE ? AND status IN ('ready','running','blocked','todo','scheduled','triage') ORDER BY created_at DESC LIMIT 1",
        (f"%{marker}%",),
    ).fetchone()
    return row


def candidate_seen_recently(cur, candidate_text: str, recent_limit=8):
    needle = candidate_text.strip()
    rows = cur.execute(
        """
        SELECT title, status
        FROM tasks
        WHERE title LIKE ?
        ORDER BY coalesce(completed_at, created_at) DESC
        LIMIT ?
        """,
        (f"%: {needle} [%", recent_limit),
    ).fetchall()
    return len(rows) > 0


def autoclose_latest(cur):
    for lane in LANES:
        picked = latest_autoclose_candidate(cur, lane)
        if not picked:
            continue
        task_id, title, blob, successor, ok, reason = picked
        if not ok:
            print(f"[pptmaster-autoclose] {lane.key} rejected {task_id}: {reason}")
            return None
        metadata = json.dumps(
            {
                "accepted_by": "autoclose-policy",
                "policy": f"pptmaster-{lane.key}-v1",
                "bucket": "auto-close",
                "basis": f"narrow review-required {lane.key} card satisfied auto-close contract",
            },
            ensure_ascii=False,
        )
        cmd = (
            "{hermes} kanban --board {board} complete {task_id} "
            "--result {result} --summary {summary} --metadata {metadata}"
        ).format(
            hermes=subprocess.list2cmdline([HERMES_BIN]),
            board=BOARD,
            task_id=task_id,
            result=subprocess.list2cmdline([lane.autoclose_result]),
            summary=subprocess.list2cmdline([lane.autoclose_summary]),
            metadata=subprocess.list2cmdline([metadata]),
        )
        res = sh(cmd)
        if res.returncode != 0:
            print("[pptmaster-autoclose] complete failed")
            print(res.stderr.strip() or res.stdout.strip())
            return "error"
        print(f"[pptmaster-autoclose] auto-closed {task_id} ({lane.key})")
        if successor:
            print(f"[pptmaster-autoclose] successor hint: {successor}")
        return task_id
    return None


def lane_body(lane: LanePolicy, task_id: str, candidate: str):
    anchors = "\n".join(f"- {x}" for x in lane.doc_anchors)
    verify = "\n".join(f"- {x}" for x in lane.verify_commands)
    stop = "\n".join(f"- {x}" for x in lane.clean_stop_condition)
    human_boundary = "\n".join(f"- {x}" for x in lane.human_decision_boundary)
    handoff_note = f"\nWorker handoff contract:\n- {lane.worker_handoff_note}\n" if lane.worker_handoff_note else ""
    return f"""Doc anchors:
{anchors}

{lane.candidate_label}:
- {candidate}

Verification:
{verify}

Worker handoff contract:
- Emit review-required handoff metadata with changed_files and verification_commands.
- Emit successor field '{lane.next_candidate_key}' to allow declarative auto-next when the slice qualifies.{handoff_note}
Clean stop condition:
{stop}

Human-decision boundary:
{human_boundary}

Read the latest accepted predecessor handoff on {task_id} before editing.
Write changes only into {REPO_ROOT} repo.
"""


def spawn_next(cur):
    for lane in LANES:
        picked = latest_done_with_successor(cur, lane)
        if not picked:
            continue
        task_id, task_title, blob = picked
        candidate = extract_candidate(blob, lane.next_candidate_key)
        if not candidate:
            continue
        marker = normalize_slug(candidate)
        if existing_open_title(cur, marker):
            continue
        if candidate_seen_recently(cur, candidate):
            print(f"[pptmaster-autocontinue] suppressing duplicate recent candidate from {task_id}: {candidate}")
            continue
        body = lane_body(lane, task_id, candidate)
        title = f"{lane.spawn_title_prefix}: {candidate} [{marker}]"
        cmd = "{hermes} kanban --board {board} create {title} --assignee {assignee} --body {body}".format(
            hermes=subprocess.list2cmdline([HERMES_BIN]),
            board=BOARD,
            title=subprocess.list2cmdline([title]),
            assignee=ASSIGNEE,
            body=subprocess.list2cmdline([body]),
        )
        res = sh(cmd)
        if res.returncode != 0:
            print("[pptmaster-autocontinue] create failed")
            print(res.stderr.strip() or res.stdout.strip())
            return 1
        print(f"[pptmaster-autocontinue] spawned next card from {task_id} ({lane.key}): {candidate}")
        print((res.stdout or res.stderr).strip())
        return 0
    return 0


def main():
    if not REGISTRY_PATH.exists():
        print(f"[pptmaster-autocontinue] registry missing: {REGISTRY_PATH}")
        return 1
    if not DB.exists():
        print("[pptmaster-autocontinue] no kanban db; silent")
        return 0
    con = sqlite3.connect(str(DB))
    cur = con.cursor()
    root_ok, root_reason = root_is_clean(cur)
    con.close()
    if not root_ok:
        print(f"[pptmaster-autocontinue] root invariant not clean; silent: {root_reason}")
        return 0

    con = sqlite3.connect(str(DB))
    cur = con.cursor()
    autoclose_result = autoclose_latest(cur)
    con.close()

    con = sqlite3.connect(str(DB))
    cur = con.cursor()
    root_ok, root_reason = root_is_clean(cur)
    if not root_ok:
        con.close()
        print(f"[pptmaster-autocontinue] root invariant changed; no successor: {root_reason}")
        return 0
    spawn_rc = spawn_next(cur)
    con.close()
    if autoclose_result == "error":
        return 1
    return spawn_rc


if __name__ == '__main__':
    raise SystemExit(main())
