#!/usr/bin/env bash
# Local development PostgreSQL manager (no Docker required).
#
# Uses the system PostgreSQL 16 binaries to run a project-local cluster in
# .dev/postgres on port 54329. Migrations live in supabase/migrations and are
# plain SQL, compatible with `supabase db push` when the Supabase CLI + Docker
# are available. The shim in supabase/local/auth_shim.sql recreates the parts
# of Supabase's auth schema that our RLS policies rely on (auth.uid()).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
DATA_DIR="$ROOT/.dev/postgres"
PORT="${CX_DB_PORT:-54329}"
DB_NAME="cx_platform"
SOCKET_DIR="$DATA_DIR/sock"
LOG_FILE="$DATA_DIR/postgres.log"

export PGHOST=127.0.0.1
export PGPORT="$PORT"

# PostgreSQL refuses to run as root. When this script runs as root (e.g. in a
# development container), server processes are executed as the unprivileged
# user CX_PG_USER (created on demand); psql still runs as the caller over TCP.
PG_RUNAS="${CX_PG_USER:-cxpg}"
run_pg() {
  if [ "$(id -u)" = "0" ]; then
    if ! id "$PG_RUNAS" >/dev/null 2>&1; then
      useradd -r -m -s /bin/bash "$PG_RUNAS"
    fi
    runuser -u "$PG_RUNAS" -- "$@"
  else
    "$@"
  fi
}

admin_psql() {
  "$PGBIN/psql" -v ON_ERROR_STOP=1 -U postgres "$@"
}

cmd_init() {
  if [ -d "$DATA_DIR/base" ]; then
    echo "cluster already initialized at $DATA_DIR"
  else
    mkdir -p "$DATA_DIR" && { [ "$(id -u)" = "0" ] && { id "$PG_RUNAS" >/dev/null 2>&1 || useradd -r -m -s /bin/bash "$PG_RUNAS"; chown -R "$PG_RUNAS" "$ROOT/.dev"; } || true; }
    run_pg "$PGBIN/initdb" -D "$DATA_DIR" -U postgres --auth=trust --no-instructions -E UTF8 --locale=C.UTF-8 >/dev/null
    mkdir -p "$SOCKET_DIR" && { [ "$(id -u)" = "0" ] && chown -R "$PG_RUNAS" "$ROOT/.dev" || true; }
    {
      echo "port = $PORT"
      echo "listen_addresses = '127.0.0.1'"
      echo "unix_socket_directories = '$SOCKET_DIR'"
      echo "shared_buffers = 128MB"
      echo "max_connections = 50"
    } >> "$DATA_DIR/postgresql.conf"
    echo "initialized cluster at $DATA_DIR (port $PORT)"
  fi
  cmd_start
  if ! admin_psql -tAc "select 1 from pg_database where datname='$DB_NAME'" | grep -q 1; then
    admin_psql -c "create database $DB_NAME" >/dev/null
    echo "created database $DB_NAME"
  fi
  cmd_migrate
}

cmd_start() {
  mkdir -p "$SOCKET_DIR" && { [ "$(id -u)" = "0" ] && chown -R "$PG_RUNAS" "$ROOT/.dev" || true; }
  if run_pg "$PGBIN/pg_ctl" -D "$DATA_DIR" status >/dev/null 2>&1; then
    echo "postgres already running on port $PORT"
  else
    run_pg "$PGBIN/pg_ctl" -D "$DATA_DIR" -l "$LOG_FILE" start >/dev/null
    echo "postgres started on port $PORT (log: $LOG_FILE)"
  fi
}

cmd_stop() {
  run_pg "$PGBIN/pg_ctl" -D "$DATA_DIR" stop -m fast >/dev/null 2>&1 || true
  echo "postgres stopped"
}

cmd_migrate() {
  # Local auth shim first (idempotent; on hosted Supabase this file is NOT applied).
  admin_psql -d "$DB_NAME" -f "$ROOT/supabase/local/auth_shim.sql" >/dev/null
  admin_psql -d "$DB_NAME" -c "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())" >/dev/null
  for f in "$ROOT"/supabase/migrations/*.sql; do
    name="$(basename "$f")"
    if admin_psql -d "$DB_NAME" -tAc "select 1 from _migrations where name='$name'" | grep -q 1; then
      continue
    fi
    echo "applying $name"
    admin_psql -d "$DB_NAME" -f "$f" >/dev/null
    admin_psql -d "$DB_NAME" -c "insert into _migrations(name) values ('$name')" >/dev/null
  done
  echo "migrations up to date"
}

cmd_reset() {
  cmd_stop
  rm -rf "$DATA_DIR"
  echo "cluster removed"
  cmd_init
}

cmd_psql() {
  shift || true
  admin_psql -d "$DB_NAME" "$@"
}

case "${1:-}" in
  init) cmd_init ;;
  start) cmd_start ;;
  stop) cmd_stop ;;
  migrate) cmd_migrate ;;
  reset) cmd_reset ;;
  psql) cmd_psql "$@" ;;
  *) echo "usage: $0 {init|start|stop|migrate|reset|psql}"; exit 1 ;;
esac
