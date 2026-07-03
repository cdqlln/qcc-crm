-- ============================================================
-- 27 集团报价：报价单可面向集团（签约/开票主体后续选集团子公司）
-- ============================================================
ALTER TABLE quotation ADD COLUMN IF NOT EXISTS group_id bigint REFERENCES customer_group;
CREATE INDEX IF NOT EXISTS ix_quotation_group ON quotation (group_id) WHERE group_id IS NOT NULL;
