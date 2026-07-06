-- ============================================================
-- 33 价目表调价留痕：每次报价调整（手工改价/文件导入）记录 旧价→新价
-- ============================================================
CREATE TABLE api_price_history (
  history_id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id bigint NOT NULL REFERENCES organization,
  api_price_id    bigint REFERENCES api_price ON DELETE SET NULL,
  api_code        varchar(20) NOT NULL,           -- 冗余留存，条目删除后记录仍可读
  name            varchar(160) NOT NULL,
  old_price       numeric(12,4),                  -- NULL = 新增条目
  new_price       numeric(12,4) NOT NULL,
  source          varchar(10) NOT NULL CHECK (source IN ('manual','import')),
  changed_by      bigint REFERENCES app_user,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_apihist_org  ON api_price_history (organization_id, history_id DESC);
CREATE INDEX ix_apihist_item ON api_price_history (api_price_id, history_id DESC);
