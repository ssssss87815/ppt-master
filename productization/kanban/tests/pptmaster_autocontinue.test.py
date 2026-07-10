import importlib.util
import sqlite3
import tempfile
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / 'pptmaster_autocontinue.py'
spec = importlib.util.spec_from_file_location('pptmaster_autocontinue', SCRIPT)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

with tempfile.TemporaryDirectory() as tmp:
    db = Path(tmp) / 'kanban.db'
    con = sqlite3.connect(db)
    con.executescript('''
      create table tasks (id text primary key, status text, block_kind text, claim_lock text, worker_pid integer, current_run_id integer);
      create table task_links (parent_id text, child_id text);
    ''')
    con.execute("insert into tasks values ('root', 'ready', null, null, null, null)")
    cur = con.cursor()
    original_root = module.ROOT_TASK_ID
    module.ROOT_TASK_ID = 'root'
    assert module.root_is_clean(cur) == (True, 'ok')

    con.execute("update tasks set status = 'blocked', block_kind = 'needs_input' where id = 'root'")
    assert module.root_is_clean(cur) == (True, 'ok')

    con.execute("update tasks set status = 'running' where id = 'root'")
    assert module.root_is_clean(cur) == (False, 'root-status-running')

    con.execute("update tasks set status = 'ready', claim_lock = 'lock' where id = 'root'")
    assert module.root_is_clean(cur) == (False, 'root-has-active-execution-state')

    con.execute("update tasks set claim_lock = null where id = 'root'")
    con.execute("insert into task_links values ('lane', 'root')")
    assert module.root_is_clean(cur) == (False, 'root-has-1-incoming-links')
    module.ROOT_TASK_ID = original_root
    con.close()

print('pptmaster autocontinue root invariant test: ok')
