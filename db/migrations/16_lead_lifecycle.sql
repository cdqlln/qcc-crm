-- ============================================================
-- 16 线索生命周期：领取/分配时间 + UTM 归因字段（#8/#16）
-- ============================================================
ALTER TABLE customer
  ADD COLUMN IF NOT EXISTS claim_at     timestamptz,   -- 领取时间
  ADD COLUMN IF NOT EXISTS assign_at    timestamptz,   -- 分配时间
  ADD COLUMN IF NOT EXISTS utm_source   varchar(80),
  ADD COLUMN IF NOT EXISTS utm_medium   varchar(80),
  ADD COLUMN IF NOT EXISTS utm_campaign varchar(120);
