#!/bin/sh
# 容器首次初始化时执行：按顺序跑 migrations，再导入 seed。
# postgres 官方入口只执行 /docker-entrypoint-initdb.d 顶层文件且不递归子目录，
# 故由本脚本统一驱动 /migrations 与 /seed.sql。
set -e
echo "==> 执行 migrations"
for f in /migrations/*.sql; do
  echo "    - $f"
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$f"
done
echo "==> 导入 seed.sql"
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /seed.sql
if [ -f /seed_auth.sql ]; then
  echo "==> 导入 seed_auth.sql（登录账号）"
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /seed_auth.sql
fi
echo "==> 数据库初始化完成"
