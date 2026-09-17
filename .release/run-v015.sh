#!/usr/bin/env bash
set -euo pipefail

python - <<'PY'
from pathlib import Path
p = Path('.release/prepare-v015.sh')
text = p.read_text()
old = "if text.count(calls) != 2:\n    raise SystemExit(f'Expected two client maintenance calls, found {text.count(calls)}')"
new = "if text.count(calls) != 3:\n    raise SystemExit(f'Expected three client maintenance calls, found {text.count(calls)}')"
if old not in text:
    raise SystemExit('maintenance call-count guard not found')
p.write_text(text.replace(old, new, 1))
PY

exec bash .release/prepare-v015.sh
