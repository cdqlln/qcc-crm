# NextCRM · 企查查 CRM 重构

基于《企查查 CRM 重构产品设计文档（NextCRM v1.0）》生成的前端实现，聚焦
**L2C 核心链路**：线索 → 客户 → 商机 → 报价 → 合同 → 回款 → 开票。

后端沿用现有 245 张表结构；本仓库为前端工程，内置**内存 Mock API 层**（`src/api` + `src/mock`），
可独立运行与演示，真实环境替换为 `/api/crm/{entity}` 即可。

## 技术栈（§2）

| 维度 | 选型 |
|---|---|
| 框架 | React 18 + TypeScript 5（strict） |
| 样式 | Tailwind CSS 3 + CSS 变量（Design Token） |
| 路由 | React Router 6 |
| 服务端状态 | TanStack Query |
| 全局 UI 状态 | Zustand |
| 表格 | 统一 `DataTable` 组件 |
| 表单/校验 | React Hook Form + Zod |
| 图表 | ECharts（漏斗/饼图/趋势/仪表） |
| 图标 | lucide-react |
| 金额 | decimal.js（对齐 DB decimal(19,2)，禁用 float） |
| 日期 | Day.js |

## 快速开始

```bash
npm install
npm run dev      # 启动开发服务器 http://localhost:5173
npm run build    # 类型检查 + 生产构建
```

## 目录结构（按 feature 切分，§2）

```
src/
  app/            AppShell / TopBar / SideNav / CommandPalette(⌘K) / 路由
  components/
    ui/           DataTable · StatusTag · MoneyText · Drawer · StageStepper
                  ProgressBar · Timeline · SavedViewBar · Tabs · ApprovalBadge …
    ai/           AiPanel（§8 贯穿各实体的 AI 助手）
  features/
    dashboard/    工作台（KPI 下钻 / 漏斗 / 转化率 / PK 榜 / 跟进流）
    tasks/        待办中心（统一 back_log）
    leads/        线索（列表 + 详情抽屉 + 转客户）
    customers/    客户（列表 + 整页详情多 Tab）
    opportunities/商机（列表 + 拖拽看板 + 详情抽屉）
    quotations/   报价（列表 + 实时算价编辑器）
    contracts/    合同（列表 + 详情 + 收款进度 + 续约）
    payments/     回款 / 开票 / 预授信（催收看板）
    analytics/    商机分析(洞察→动作) / 线索分析 / 过程量 / 目标管理
    settings/     产品管理 / 设置中心
  hooks/          useTerms（字典翻译）· useListQuery（列表查询）
  store/          ui（密度/导航/命令面板/Toast）
  lib/            money（decimal）· format（dayjs）· cn
  mock/           terms 字典 · org 组织 · data 实体数据 · ai 报告
  types/          §10.2 全部 TS 实体类型
```

## 已落地的重构要点

- **§3 信息架构**：13 菜单重组为「工作/销售/资金/分析/协同/设置」+ ⌘K 全局命令面板。
- **§4 设计系统**：Design Token CSS 变量（禁止硬编码色）；统一 `DataTable`
  （密度切换 / 排序 / 行选 / 批量操作条 / 分页 / 保存视图）；骨架屏·空态·错误态三件套。
- **§4.2 状态色**：`StatusTag` 按语义统一取色；状态/来源/阶段全部经 `terms` 字典翻译（无前端硬编码）。
- **§6.4 商机**：列表/看板双视图，**拖拽改阶段**并即时校验超时；停留超时标红。
- **§6.5 报价**：行内**实时算价**，毛利率低于阈值高亮，折扣超限提示触发审批。
- **§6.6 合同**：收款进度条；待续约 Tab + 到期前 90/60/30 天自动续约提醒。
- **§6.7 资金**：回款催收看板（逾期/本周/本月，一键提醒）。
- **§6.9 分析**：商机洞察**可点击 → 筛选列表 → 批量指派/建计划/提醒 → 写入待办**，形成「分析→待办→动作」闭环。
- **§8 AI 助手**：统一 `AiPanel` 挂在 线索/客户/商机/合同 详情，结构化输出
  要点/风险/建议/行动项，**行动项一键转待办**，支持报告追问。
- **§4.3 MoneyText**：decimal 金额格式化 + 权限脱敏（hover 提示）。
- **§10.3 新建表单**：线索/客户/商机/合同的「新建」走统一 `CreateDialog`
  （React Hook Form + Zod 校验，字段表→schema→表单三处一致）；TopBar QuickCreate、
  ⌘K 命令面板、各列表「新建」、客户详情「建商机」均接入，提交后即时写入并刷新列表。
- **§4.3 高级筛选**：`FilterPanel` 抽屉式多条件筛选（下拉/多选/文本/日期区间/数值区间），
  已应用条件以可移除标签条 `FilterChips` 展示；筛选 + Tab **可保存为视图**（`SavedViewBar`）
  一键复用。已接入 线索 / 客户 / 商机 / 合同 四个列表。

## 部署

纯前端站点（当前内置 Mock 数据，无需后端）。提供四种方式，任选其一：

### 1) Docker（推荐）
```bash
docker compose up -d --build      # 宿主机 8080 → 容器 80
# 或
docker build -t nextcrm:latest .
docker run -d -p 8080:80 --restart unless-stopped nextcrm:latest
```
镜像内置 `deploy/nginx.conf`（已含 SPA history 路由回退、gzip、静态资源强缓存）。

基础镜像与 npm 源均可用 `--build-arg` 换成加速源（国内网络 / Docker Hub 限流时）：
```bash
docker build \
  --build-arg NODE_IMAGE=mirror.gcr.io/library/node:22-alpine \
  --build-arg NGINX_IMAGE=mirror.gcr.io/library/nginx:1.27-alpine \
  --build-arg NPM_REGISTRY=https://registry.npmmirror.com \
  -t nextcrm:latest .
```

CI 已产出 `dist/` 时，可只打运行时镜像（更快、无需容器内访问 npm）：
```bash
npm ci && npm run build
docker build -f deploy/Dockerfile.runtime -t nextcrm:latest .
```

### 2) 静态文件 + nginx
```bash
npm ci && npm run build           # 产出 dist/
# 将 dist/ 上传到服务器，例如 /var/www/nextcrm
# nginx 站点参考 deploy/nginx.conf，root 指向该目录后 reload
```

### 3) 一键 rsync 脚本
```bash
DEPLOY_HOST=user@1.2.3.4 DEPLOY_PATH=/var/www/nextcrm ./deploy/deploy.sh
```
本地构建并 `rsync --delete` 到服务器（需已配置 SSH 免密）。

### 4) GitHub Actions 自动部署
`.github/workflows/deploy.yml`：推送到部署分支即自动构建并 rsync。
在仓库 Secrets 配置 `SSH_HOST / SSH_USER / SSH_PORT / SSH_PRIVATE_KEY / DEPLOY_PATH`。

> 关键点：本应用用 React Router 6（history 模式），任何静态托管都**必须配置 SPA 回退**
> （未命中文件的请求返回 `index.html`），否则刷新子路由会 404。`deploy/nginx.conf` 已处理。
>
> 接后端时：把 `deploy/nginx.conf` 中 `/api/` 反代段取消注释指向后端，并将
> `src/api/crm.ts` 的 mock 换为真实 `fetch`。

## 业务数据库（PostgreSQL）

L2C 核心链路的 PostgreSQL 16 库（DDL + 种子 + 优化），详见 `docs/DATABASE.md`。

```bash
cd db && docker compose up -d        # 起 Postgres + Adminer，自动建表+导入种子
# 或对已有库执行：
DATABASE_URL=postgres://crm:crm@localhost:5432/nextcrm ./db/apply.sh
```

要点：34 表 / 95 索引；金额公式用 GENERATED 列固化，回款/开票额由触发器从下游回写；
可配置枚举走 `term` 字典，固定枚举用 CHECK；名称检索用 pg_trgm GIN、标签用数组 GIN、
催收/续约/待办用部分索引（均经 EXPLAIN 验证命中）。

## 登录与鉴权

- **账号密码登录** + **企业微信扫码 SSO**；后端 **JWT（access + refresh）+ 全局守卫**，
  所有 `/api/crm` 接口强制鉴权，401 自动刷新或跳登录。
- 演示账号：`admin / crm123456`（其余 `lina`、`wangfang`… 同密码）。
- 企业微信：未配置企业凭据时进入**开发模拟**（扫码按钮直接以演示账号登录）；
  生产填 `WECOM_CORP_ID / WECOM_AGENT_ID / WECOM_SECRET` 即走真实扫码（授权码流程，
  按 `wecom_userid` 绑定系统用户）。
- 前端：`/login` 页 + 全局路由守卫；令牌存于 localStorage，API 请求自动附带
  `Authorization`，过期用 refresh 续期。Mock 模式同样需登录（内置演示账号）。

## 报价与折扣权限

- **报价单类型**：询价 / 报价 / 标书 / 框架协议（政府国企招投标）。
- **草稿**：报价编辑器可「保存草稿」(status=草稿) 完善后再操作。
- **询价销售自助 vs 报价审批**：询价单折扣在销售权限内 → 「确认出单」无需审批；
  报价/标书/框架协议，或折扣超销售权限 → 「提交审批」走审批流。
- **折扣权限**：销售自主折扣下限 = max(客户分级上限, 产品自主下限)。
  - 客户分级上限按 ABC 在「设置→询价折扣权限」配置（A 0.85 / B 0.90 / C 0.95，可改）；
  - 产品自主下限 `product.sales_discount`（不同产品可不同）；
  - 低于绝对下限 `min_discount` 则禁止。
- **数据类阶梯报价**：数据产品按采购量自动取阶梯单价。
- **整单折扣纳入权限**：有效折扣 = 行折扣 × 整单折扣，整单让利同样触发审批。
- **按用量/接口单价报价（框架）**：数据/API 类调用量未知时，行可切「按用量」——
  只约定接口单价(折后)，不计入固定总价(小计=按量结算)，自动归为框架协议，按实际用量结算。
- 客户确认（`/quotations/:id/confirm`）作为询价后续动作的前置门槛。
- **价格保护**：报价编辑器自动带入「同客户同产品的历史报价单价」，低于历史价时行内红字提醒。
- **客户负责人移交（交接审批）**：客户详情「移交」→ 走 bt=8 审批流，**通过后才**转移负责人
  （写 `pre_leader_id`）并推送通知；审批中不变更。
- **询价/报价单 PDF**：编辑器「导出PDF」生成 A4 打印视图（浏览器 print-to-PDF，中文直接可用）。

## 令牌吊销与协同模块

- **令牌吊销**：`app_user.token_version`，改密码或管理员踢人时 +1，旧 JWT 立即失效。
  用户菜单「修改密码」（其它设备需重新登录）；管理员 `POST /api/auth/kick/:userId`（需 scope=4 角色）。
- **外勤签到**（`/sign`）：上下班/外勤打卡 + 浏览器定位，个人/团队视图。
- **工单**（`/tickets`）：受理→处理中→解决→关闭，处理记录评论，指派即推送企微通知。
- **审批流**（`/approvals`）：可配置多级路由（`work_flow_route`），发起→逐级审批→结果回写
  单据 `approval` 列（报价/合同/发票/预授信/商机），待我审批/我发起的；报价单「提交审批」已接入。
- **企微协同**（`/qywx`）：审批/工单等通知推送企业微信（未配置凭据时落库留痕），含消息记录与测试发送。

## 后端 API（Express + Postgres）

`server/` 是按 `db/` 表结构实现的 L2C 接口层（Express + node-postgres），统一返回
`{ code, msg, data }`，前缀 `/api/crm`。

```bash
cd server && cp .env.example .env && npm install
npm run dev          # http://localhost:8080，/health 自检
```

前端切换到真实接口：根目录 `cp .env.example .env.local`，设置
`VITE_API_BASE=http://localhost:8080`（不设置则用内存 Mock）。

接口覆盖：terms、leads（list/get/convert/create）、customers（list/get/contacts/
trackings/create）、opportunities（list/get/stage/create）、quotations（list/get/
products）、contracts（list/get/payments/invoices/create）、payments/invoices/
pre-credits（list）、products（list/all）、tasks（list/complete/counts）、targets、
ai/generate、search。列表支持 tab/关键字/多条件筛选/排序/分页，金额与回写由数据库
生成列 + 触发器保证。

### 全栈一键启动（Postgres + 后端 + 前端同源反代）
```bash
docker compose -f docker-compose.full.yml up -d --build
# 访问 http://localhost:8088（nginx 静态前端 + /api 反代到后端）
```

## 与后端对接

`src/api/client.ts` 封装了统一返回 `{ code, msg, data }` 与分页约定；
将 `src/api/crm.ts` 中各方法替换为真实 `fetch('/api/crm/...')` 调用即可，
其余页面与组件无需改动（已按字段表映射）。
