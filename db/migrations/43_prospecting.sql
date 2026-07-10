-- ============================================================
-- 43 商机开拓管理（QCC-SALES-DEV-2026-005《商机开拓管理办法》）
--    引擎一 作战名单：ICP → 名单批次 → 名单目标（承接/触达/转商机/冷冻/收回）
--    引擎二 信号雷达：四类信号（监管/预算/换约/扩张）+ SLA 处置留痕
--    引擎三 白空间：存量客户 × SKU 矩阵标记（实格由合同/商机产品行推导）
--    战役机制 + 开拓指标分析由路由层聚合
-- ============================================================

-- ICP 理想客户画像（场景卡级，季度版本化，第四条）
CREATE TABLE IF NOT EXISTS prospect_icp (
  icp_id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id bigint NOT NULL REFERENCES organization,
  name            varchar(120) NOT NULL,             -- 场景卡 / ICP 名称
  line            varchar(40)  NOT NULL,             -- 行业线（B线/G线/S线/区域…）
  industry_scope  varchar(200),                      -- 行业范围（企业库行业标签）
  size_range      varchar(200),                      -- 规模区间（参保/资本/等级）
  qualifications  text,                              -- 必要资质特征
  exclusions      text,                              -- 排除条件
  version         varchar(20) NOT NULL DEFAULT 'V1.0',
  quarter         varchar(10) NOT NULL,              -- 版本季度，如 2026Q3
  tam_count       integer NOT NULL DEFAULT 0,        -- TAM 市场容量（第五条）
  active          smallint NOT NULL DEFAULT 1,
  created_by      bigint REFERENCES app_user,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_picp_org ON prospect_icp (organization_id, active);

-- 作战名单批次（每季度每线 Top100，第五条）
CREATE TABLE IF NOT EXISTS prospect_list (
  list_id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id bigint NOT NULL REFERENCES organization,
  icp_id          bigint REFERENCES prospect_icp,
  title           varchar(200) NOT NULL,
  quarter         varchar(10) NOT NULL,
  line            varchar(40) NOT NULL,
  status          smallint NOT NULL DEFAULT 1 CHECK (status IN (1,2,3)), -- 1草稿 2已发布 3归档
  published_at    timestamptz,
  created_by      bigint REFERENCES app_user,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_plist_org ON prospect_list (organization_id, quarter, line);

-- 名单目标（第五/六条：承接即触达义务，30天首触/90天三次有效触达）
CREATE TABLE IF NOT EXISTS prospect_target (
  target_id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id      bigint NOT NULL REFERENCES organization,
  list_id              bigint NOT NULL REFERENCES prospect_list ON DELETE CASCADE,
  company_name         varchar(200) NOT NULL,
  ref_company_id       varchar(64),                  -- 企查查公司ID
  industry             varchar(120),
  region               varchar(80),
  q_score              smallint NOT NULL DEFAULT 0,  -- QLS 企业质量分
  t_score              smallint NOT NULL DEFAULT 0,  -- QLS 时机信号分
  rank_no              integer,
  signal_note          varchar(300),                 -- 触发信号加权摘要
  status               smallint NOT NULL DEFAULT 1 CHECK (status IN (1,2,3,4,5)), -- 1待承接 2跟进中 3已转商机 4冷冻 5已收回
  owner_id             bigint REFERENCES app_user,   -- 承接人
  claimed_at           timestamptz,
  first_touch_deadline timestamptz,                  -- 承接+30天
  touch_deadline       timestamptz,                  -- 承接+90天
  touch_count          integer NOT NULL DEFAULT 0,
  effective_touch_count integer NOT NULL DEFAULT 0,
  last_touch_at        timestamptz,
  frozen_until         timestamptz,                  -- 冷冻6个月后重新入池
  customer_id          bigint REFERENCES customer,   -- 转商机建档客户
  opportunity_id       bigint REFERENCES opportunity,
  result_note          varchar(300),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_ptarget_list  ON prospect_target (list_id, status);
CREATE INDEX IF NOT EXISTS ix_ptarget_owner ON prospect_target (organization_id, owner_id, status);
-- 超期收回 / 冷冻解冻扫描
CREATE INDEX IF NOT EXISTS ix_ptarget_deadline ON prospect_target (first_touch_deadline) WHERE status = 2;
CREATE INDEX IF NOT EXISTS ix_ptarget_frozen   ON prospect_target (frozen_until) WHERE status = 4;

-- 触达记录（有效触达口径供完成率考核）
CREATE TABLE IF NOT EXISTS prospect_touch (
  touch_id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id bigint NOT NULL REFERENCES organization,
  target_id       bigint NOT NULL REFERENCES prospect_target ON DELETE CASCADE,
  method          varchar(20) NOT NULL,              -- 电话/拜访/微信/邮件/会议
  content         text,
  effective       boolean NOT NULL DEFAULT true,
  created_by      bigint REFERENCES app_user,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_ptouch_target ON prospect_touch (target_id);

-- 商机信号（第七/八条：类型决定 SLA，处置留痕，误报反馈查准率）
CREATE TABLE IF NOT EXISTS prospect_signal (
  signal_id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id  bigint NOT NULL REFERENCES organization,
  type             smallint NOT NULL CHECK (type IN (1,2,3,4)), -- 1监管 2预算 3换约 4扩张
  title            varchar(200) NOT NULL,
  detail           text,
  company_name     varchar(200) NOT NULL,
  target_id        bigint REFERENCES prospect_target,
  customer_id      bigint REFERENCES customer,
  owner_id         bigint REFERENCES app_user,       -- 管辖方承接人
  due_at           timestamptz NOT NULL,             -- SLA 截止
  status           smallint NOT NULL DEFAULT 1 CHECK (status IN (1,2)), -- 1待处置 2已处置
  disposition      smallint CHECK (disposition IN (1,2,3,4)), -- 1触达 2转商机 3误报 4暂缓
  disposition_note varchar(300),
  opportunity_id   bigint REFERENCES opportunity,
  handled_by       bigint REFERENCES app_user,
  handled_at       timestamptz,
  created_by       bigint REFERENCES app_user,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_psignal_org   ON prospect_signal (organization_id, status, due_at);
CREATE INDEX IF NOT EXISTS ix_psignal_owner ON prospect_signal (organization_id, owner_id, status);

-- 季度开拓战役（第十五条：四件套 + 复盘回写）
CREATE TABLE IF NOT EXISTS prospect_campaign (
  campaign_id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id bigint NOT NULL REFERENCES organization,
  name            varchar(200) NOT NULL,
  quarter         varchar(10) NOT NULL,
  line            varchar(40) NOT NULL,
  scenario_card   varchar(120),                      -- 单张场景卡为单位
  goal            varchar(300),
  owner_id        bigint REFERENCES app_user,
  status          smallint NOT NULL DEFAULT 1 CHECK (status IN (1,2,3,4)), -- 1立项 2进行中 3复盘 4结束
  kit_list        boolean NOT NULL DEFAULT false,    -- 作战名单切片
  kit_script      boolean NOT NULL DEFAULT false,    -- 话术与异议应答包
  kit_content     boolean NOT NULL DEFAULT false,    -- 内容物料
  kit_signal      boolean NOT NULL DEFAULT false,    -- 信号监测规则
  review_note     text,                              -- 复盘强制回写
  started_at      timestamptz,
  ended_at        timestamptz,
  created_by      bigint REFERENCES app_user,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_pcampaign_org ON prospect_campaign (organization_id, quarter);

-- 白空间格标记（第九条：仅存非默认格；实格由 contract_product ∪ opportunity_product 推导）
CREATE TABLE IF NOT EXISTS prospect_whitespace (
  organization_id bigint NOT NULL REFERENCES organization,
  customer_id     bigint NOT NULL REFERENCES customer ON DELETE CASCADE,
  product_id      bigint NOT NULL REFERENCES product ON DELETE CASCADE,
  status          smallint NOT NULL DEFAULT 2 CHECK (status IN (2,3,4)), -- 2已验证需求 3跟进中 4已转商机
  note            varchar(300),
  updated_by      bigint REFERENCES app_user,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, customer_id, product_id)
);

DROP TRIGGER IF EXISTS trg_picp_updated ON prospect_icp;
CREATE TRIGGER trg_picp_updated BEFORE UPDATE ON prospect_icp FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_ptarget_updated ON prospect_target;
CREATE TRIGGER trg_ptarget_updated BEFORE UPDATE ON prospect_target FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_pcampaign_updated ON prospect_campaign;
CREATE TRIGGER trg_pcampaign_updated BEFORE UPDATE ON prospect_campaign FOR EACH ROW EXECUTE FUNCTION set_updated_at();
