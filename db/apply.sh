#!/usr/bin/env bash
# 对一个已运行的 Postgres 应用全部 migrations + seed（用于已存在的库或重建）。
# 用法：
#   DATABASE_URL=postgres://crm:crm@localhost:5432/nextcrm ./db/apply.sh
# 或分项：
#   PGHOST=localhost PGPORT=5432 PGUSER=crm PGPASSWORD=crm PGDATABASE=nextcrm ./db/apply.sh
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"

PSQL=(psql -v ON_ERROR_STOP=1)
if [ -n "${DATABASE_URL:-}" ]; then
  PSQL+=("$DATABASE_URL")
fi

for f in "$DIR"/migrations/*.sql; do
  echo "==> $f"
  "${PSQL[@]}" -f "$f"
done
echo "==> seed.sql"
"${PSQL[@]}" -f "$DIR/seed.sql"
echo "==> seed_auth.sql"
"${PSQL[@]}" -f "$DIR/seed_auth.sql"
echo "✅ 数据库结构与种子数据已就绪"
