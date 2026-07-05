-- ============================================================
-- 31 线索转客户留痕：转化时间/操作人 + 线索原貌快照
--   同一行 customer 从线索(category 1/2)转为客户(3)，
--   lead_snapshot 固化转化那一刻的线索信息，供客户侧「查看原线索」。
-- ============================================================
ALTER TABLE customer
  ADD COLUMN IF NOT EXISTS converted_at  timestamptz,
  ADD COLUMN IF NOT EXISTS converted_by  bigint REFERENCES app_user,
  ADD COLUMN IF NOT EXISTS lead_snapshot jsonb;

-- 已转化线索检索（线索模块「已转化」页签）
CREATE INDEX IF NOT EXISTS ix_customer_converted ON customer (organization_id, converted_at DESC)
  WHERE converted_at IS NOT NULL;
