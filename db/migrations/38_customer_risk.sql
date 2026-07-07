-- ============================================================
-- 38 客户风险标签：通过企查查 API 真实核查（失信/经营异常），结果缓存在客户行
-- ============================================================
ALTER TABLE customer
  ADD COLUMN IF NOT EXISTS risk_tags jsonb,          -- [{label, kind}]
  ADD COLUMN IF NOT EXISTS risk_checked_at timestamptz;
