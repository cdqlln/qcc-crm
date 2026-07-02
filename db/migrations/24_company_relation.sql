-- ============================================================
-- 24 工商关系归集：按外部数据(企查查)集团/实控人 ext_key 自动归集
-- ============================================================
ALTER TABLE customer       ADD COLUMN IF NOT EXISTS ext_key varchar(80);   -- 外部集团/实控人标识
ALTER TABLE customer_group ADD COLUMN IF NOT EXISTS ext_key varchar(80);   -- 集团对应的外部标识
CREATE INDEX IF NOT EXISTS ix_customer_extkey ON customer (organization_id, ext_key) WHERE ext_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_group_extkey ON customer_group (organization_id, ext_key) WHERE ext_key IS NOT NULL;

-- 工商关系映射表（开发/无外部凭据时使用；生产由企查查 API 实时返回）
-- ref_company_id → 集团外部标识 + 集团名
CREATE TABLE IF NOT EXISTS company_relation (
  ref_company_id varchar(64) PRIMARY KEY,
  ext_key        varchar(80) NOT NULL,
  group_name     varchar(200) NOT NULL
);
