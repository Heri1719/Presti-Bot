#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$ROOT_DIR/postgres-data"
LOG_FILE="$ROOT_DIR/postgres.log"
PG_BIN_DIR="/opt/homebrew/opt/postgresql@18/bin"
PG_CTL="$PG_BIN_DIR/pg_ctl"
INITDB="$PG_BIN_DIR/initdb"
PG_PORT="${PGPORT:-55432}"

if ! command -v "$PG_CTL" >/dev/null 2>&1; then
  PG_CTL="$(command -v pg_ctl)"
fi

if ! command -v "$INITDB" >/dev/null 2>&1; then
  INITDB="$(command -v initdb)"
fi

if [ ! -d "$DATA_DIR" ]; then
  "$INITDB" -D "$DATA_DIR"
fi

"$PG_CTL" -D "$DATA_DIR" -l "$LOG_FILE" -o "-p $PG_PORT" start
echo "Postgres proyek siap di port $PG_PORT"
