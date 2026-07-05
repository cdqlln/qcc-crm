-- ============================================================
-- 28 个性客户信息：租户自定义字段（定义 + 值）
--   定义：custom_field_def（管理员在 设置→自定义字段 维护）
--   值：customer.custom_fields jsonb，键为 field_id（改名不丢数据）
-- ============================================================

CREATE TABLE custom_field_def (
  field_id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id bigint NOT NULL REFERENCES organization,
  business_type   smallint NOT NULL DEFAULT 1,            -- 1客户（预留其他对象）
  name            varchar(60) NOT NULL,
  field_type      varchar(12) NOT NULL CHECK (field_type IN ('text','number','date','select')),
  options         jsonb NOT NULL DEFAULT '[]',            -- select 的可选项 ["…"]
  required        boolean NOT NULL DEFAULT false,
  sort_order      integer NOT NULL DEFAULT 0,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, business_type, name)
);
CREATE INDEX ix_cfd_org ON custom_field_def (organization_id, business_type, active);

ALTER TABLE customer ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}';
