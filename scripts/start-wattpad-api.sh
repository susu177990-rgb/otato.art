#!/usr/bin/env bash
set -euo pipefail
# 从根目录 scripts/ 定位到仓库根目录
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/services/wattpad-api"

if [[ ! -x .venv/bin/python ]] || ! .venv/bin/python --version >/dev/null 2>&1; then
  rm -rf .venv
  echo "创建 Python 虚拟环境 .venv …"
  python3 -m venv .venv
fi

VENV_PY=".venv/bin/python"
"$VENV_PY" -m pip install -q -r requirements.txt

echo "Wattpad API: http://127.0.0.1:8765  (Ctrl+C 停止)"
exec "$VENV_PY" -m uvicorn main:app --host 127.0.0.1 --port 8765
