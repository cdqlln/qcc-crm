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

## 与后端对接

`src/api/client.ts` 封装了统一返回 `{ code, msg, data }` 与分页约定；
将 `src/api/crm.ts` 中各方法替换为真实 `fetch('/api/crm/...')` 调用即可，
其余页面与组件无需改动（已按字段表映射）。
