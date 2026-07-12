#!/usr/bin/env python3
"""Regression tests for the PPT Master Kanban guard policy."""

import ast
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "pptmaster_autocontinue.py"
source = SCRIPT.read_text(encoding="utf-8")
tree = ast.parse(source)
functions = {node.name: node for node in tree.body if isinstance(node, ast.FunctionDef)}

assert "spawn_next" not in functions, "guard must not dynamically create successors"
assert "latest_done_with_successor" not in functions, "guard must not infer successors from completed cards"
assert "lane_body" not in functions, "guard must not manufacture task bodies"
assert "candidate_seen_recently" not in functions, "guard must not dedupe dynamically created work"
assert "existing_open_title" not in functions, "guard must not search for dynamically created work"

main = functions["main"]
main_calls = {
    node.func.id
    for node in ast.walk(main)
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
}
assert "root_is_clean" in main_calls
assert "autoclose_latest" in main_calls
assert "spawn_next" not in main_calls
assert "extract_candidate" not in main_calls

root = functions["root_is_clean"]
root_source = ast.get_source_segment(source, root) or ""
assert 'status == "blocked"' in root_source
assert 'block_kind in {"needs_input", "waiting_dependency"}' in root_source
assert '"SELECT COUNT(*) FROM task_links WHERE child_id = ?"' in root_source

policy = functions["should_autoclose"]
policy_source = ast.get_source_segment(source, policy) or ""
assert '"review-required"' in policy_source
assert "extract_changed_files" in policy_source
assert "extract_verification_commands" in policy_source
assert "allowed_changed_files" in policy_source
assert "commands_allowed" in policy_source

assert "unlinked successor" not in source
assert "kanban --board {board} create" not in source

print("pptmaster autocontinue policy test: no dynamic successor creation; root invariant and review handoff gates present")
