-- ============================================================
-- 29 商机创建体验：客户需求描述（涉及产品复用 opportunity_product）
-- ============================================================
ALTER TABLE opportunity ADD COLUMN IF NOT EXISTS requirement text;
