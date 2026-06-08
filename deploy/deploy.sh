#!/usr/bin/env bash
# NextCRM 静态部署脚本：本地构建后 rsync 到服务器静态目录。
#
# 用法：
#   DEPLOY_HOST=user@1.2.3.4 DEPLOY_PATH=/var/www/nextcrm ./deploy/deploy.sh
# 可选：
#   DEPLOY_PORT=22                # SSH 端口
#   SSH_KEY=~/.ssh/id_ed25519     # 指定私钥
#
# 前置条件：本机已配置好对目标服务器的 SSH 免密（或提供 SSH_KEY），
#          服务器上 DEPLOY_PATH 已由 nginx 指向（参考 deploy/nginx.conf）。
set -euo pipefail

: "${DEPLOY_HOST:?请设置 DEPLOY_HOST，如 user@1.2.3.4}"
: "${DEPLOY_PATH:?请设置 DEPLOY_PATH，如 /var/www/nextcrm}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"

SSH_OPTS="-p ${DEPLOY_PORT}"
if [ -n "${SSH_KEY:-}" ]; then
  SSH_OPTS="${SSH_OPTS} -i ${SSH_KEY}"
fi

echo "==> 1/3 安装依赖并构建"
npm ci
npm run build

echo "==> 2/3 确保远端目录存在"
ssh ${SSH_OPTS} "${DEPLOY_HOST}" "mkdir -p '${DEPLOY_PATH}'"

echo "==> 3/3 同步 dist/ 到 ${DEPLOY_HOST}:${DEPLOY_PATH}（--delete 清理旧文件）"
rsync -avz --delete -e "ssh ${SSH_OPTS}" dist/ "${DEPLOY_HOST}:${DEPLOY_PATH}/"

echo "✅ 部署完成。若使用本仓库 nginx 配置，记得 reload：ssh ${DEPLOY_HOST} 'nginx -s reload'"
