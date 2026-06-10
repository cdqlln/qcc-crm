# 基础镜像可通过 --build-arg 覆盖（如使用镜像加速源）：
#   docker build --build-arg NODE_IMAGE=mirror.gcr.io/library/node:22-alpine \
#                --build-arg NGINX_IMAGE=mirror.gcr.io/library/nginx:1.27-alpine .
ARG NODE_IMAGE=node:22-alpine
ARG NGINX_IMAGE=nginx:1.27-alpine

# ---- 构建阶段 ----
FROM ${NODE_IMAGE} AS build
WORKDIR /app

# 优先复制依赖清单，利用层缓存
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- 运行阶段（nginx 静态托管）----
FROM ${NGINX_IMAGE} AS runtime
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1
CMD ["nginx", "-g", "daemon off;"]
