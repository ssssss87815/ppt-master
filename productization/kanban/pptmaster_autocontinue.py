#!/usr/bin/env python3
import json
import os
import re
import sqlite3
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

BOARD = os.environ.get("HERMES_KANBAN_BOARD", "ppt-master-productization-mainline")
DB = Path(
    os.environ.get(
        "PPTMASTER_KANBAN_DB",
        f"/home/ubuntu/.hermes/kanban/boards/{BOARD}/kanban.db",
    )
)
ASSIGNEE = os.environ.get("PPTMASTER_KANBAN_ASSIGNEE", "default")
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
    tracker_blocked = status == "blocked" and block_kind in {"needs_input", "waiting_dependency"}
    if status not in {"todo", "ready"} and not tracker_blocked:
        return False, f"root-status-{status}"
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
    autoclose_title_prefix: str
    autoclose_result: str
    autoclose_summary: str
    verify_commands: tuple[str, ...]
    allowed_changed_prefixes: tuple[str, ...]
    allowed_title_prefixes: tuple[str, ...]


def sh(cmd: str):
    return subprocess.run(cmd, shell=True, text=True, capture_output=True)


def sql_in_clause(values: Iterable[str]):
    seq = tuple(values)
    placeholders = ", ".join("?" for _ in seq)
    return placeholders, seq


def extract_json_object(text: str):
    for match in reversed(list(re.finditer(r"\{[^{}]*\}", text, flags=re.S))):
        try:
            parsed = json.loads(match.group(0))
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


def extract_list_field(text: str, key: str):
    obj = extract_json_object(text)
    if obj and key in obj and isinstance(obj[key], list):
        return [str(x) for x in obj[key]]

    heading = {
        "changed_files": r"(?:^|\n)### Changed files[^\n]*\n(.*?)(?=\n### |\Z)",
        "verification_commands": r"(?:^|\n)### Verification commands[^\n]*\n(.*?)(?=\n### |\Z)",
    }.get(key)
    if not heading:
        return None
    match = re.search(heading, text, flags=re.I | re.S)
    if not match:
        return None
    values = []
    for line in match.group(1).splitlines():
        item = re.match(r"\s*-\s+`?([^`\n]+?)`?(?:\s+→.*)?\s*$", line)
        if item:
            values.append(item.group(1).strip())
    return values or None


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
    lanes = []
    for item in raw["lanes"]:
        identity = item["lane_identity"]
        policy = item["changed_file_policy"]
        verify = item["verification_command_policy"]
        messages = item.get("autoclose_messages", {})
        lanes.append(
            LanePolicy(
                key=str(item["lane_id"]),
                predecessor_ids=frozenset(str(x) for x in identity["predecessor_ids"]),
                autoclose_title_prefix=str(identity["autoclose_title_prefix"]),
                autoclose_result=str(messages.get("result", f"auto-accepted {item['lane_id']} slice")),
                autoclose_summary=str(messages.get("summary", "auto-closed after policy validation")),
                verify_commands=tuple(str(x) for x in verify["allowed_commands"]),
                allowed_changed_prefixes=tuple(str(x) for x in policy["allowed_prefixes"]),
                allowed_title_prefixes=tuple(str(x) for x in identity["allowed_title_prefixes"]),
            )
        )
    return tuple(lanes)


LANES = load_registry(REGISTRY_PATH)


def latest_autoclose_candidate(cur, lane: LanePolicy):
    rows = cur.execute(
        """
        SELECT t.id, t.title,
               (
                 SELECT tr.summary
                 FROM task_runs tr
                 WHERE tr.task_id = t.id
                 ORDER BY tr.id DESC
                 LIMIT 1
               ) AS latest_run_summary,
               (
                 SELECT tc.body
                 FROM task_comments tc
                 WHERE tc.task_id = t.id
                 ORDER BY tc.id DESC
                 LIMIT 1
               ) AS latest_comment_body
        FROM tasks t
        WHERE t.status = 'blocked'
          AND t.assignee = ?
          AND t.current_run_id IS NULL
        ORDER BY coalesce(t.started_at, t.created_at) DESC
        """,
        (ASSIGNEE,),
    ).fetchall()
    for task_id, title, summary, body in rows:
        if not any(title.startswith(prefix) for prefix in lane.allowed_title_prefixes):
            continue
        blob = "\n".join(x for x in (summary, body) if x)
        ok, reason = should_autoclose(lane, title, blob)
        if ok:
            return task_id, title, blob
        print(f"[pptmaster-autoclose] {lane.key} rejected {task_id}: {reason}")
    return None


def commands_allowed(lane: LanePolicy, commands: list[str]):
    expected = {f"cd {REPO_ROOT} && {cmd}" for cmd in lane.verify_commands}
    adhoc_pattern = re.compile(
        rf"^cd {re.escape(str(REPO_ROOT))} && npx --yes tsx /tmp/hermes-verify-[A-Za-z0-9_\-]+\.ts$"
    )
    for cmd in commands:
        normalized = cmd if cmd.startswith(f"cd {REPO_ROOT} &&") else f"cd {REPO_ROOT} && {cmd}"
        if normalized in expected:
            continue
        if adhoc_pattern.match(normalized):
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
    changed = extract_changed_files(blob)
    if changed is None:
        return False, "missing-changed-files"
    if not allowed_changed_files(lane, changed):
        return False, "changed-files-out-of-policy"
    commands = extract_verification_commands(blob)
    if not commands:
        return False, "missing-verification-commands"
    if not commands_allowed(lane, commands):
        return False, "verification-commands-out-of-policy"
    return True, "ok"


def autoclose_latest(cur):
    for lane in LANES:
        picked = latest_autoclose_candidate(cur, lane)
        if not picked:
            continue
        task_id, title, blob = picked
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
        return task_id
    return None


def main():
    if not REGISTRY_PATH.exists():
        print(f"[pptmaster-autocontinue] registry missing: {REGISTRY_PATH}")
        return 1
    if not DB.exists():
        print("[pptmaster-autocontinue] no kanban db; silent")
        return 0

    # This process is deliberately a narrow no-agent guard. Its only allowed
    # effect is completing a qualifying review card. Hermes lifecycle and the
    # pre-linked dependency graph decide which existing child becomes ready;
    # this guard never creates or infers a successor, recovers the root, or
    # dispatches work itself.
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
    if autoclose_result == "error":
        return 1
    if autoclose_result is None:
        print("[pptmaster-autocontinue] no qualifying review handoff; silent")
        return 0

    print(f"[pptmaster-autocontinue] auto-close accepted {autoclose_result}; successor must already be linked")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
