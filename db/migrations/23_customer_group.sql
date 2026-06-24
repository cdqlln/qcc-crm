-- ============================================================
-- 23 集团客户：集团 + 客户集团归属（按字号自动归属，支持人工调整）
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_group (
  group_id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id bigint NOT NULL REFERENCES organization,
  name            varchar(200) NOT NULL,
  match_key       varchar(120),         -- 字号关键字：客户名包含即自动归属
  ref_company_id  varchar(64),          -- 集团母公司企查查ID（可选）
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_group_org ON customer_group (organization_id);

ALTER TABLE customer ADD COLUMN IF NOT EXISTS group_id bigint REFERENCES customer_group;
CREATE INDEX IF NOT EXISTS ix_customer_group ON customer (group_id) WHERE group_id IS NOT NULL;
