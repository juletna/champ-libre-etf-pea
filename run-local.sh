#!/bin/sh
set -eu
PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ ! -f "$PROJECT_DIR/app/dist/index.html" ]; then
  echo "Interface compilée absente. Dans app/, exécutez npm ci puis npm run build." >&2
  exit 1
fi
exec python3 "$PROJECT_DIR/local_server.py" --open "$@"
