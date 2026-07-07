-- ============================================================
-- 42 产品赠送策略：是否允许赠送 + 每订单最大赠送数量 / 赠送金额占比上限
--   max_gift_ratio：赠送原价合计 占 订单金额 的最大百分比（如 10.00 = 10%）
-- ============================================================
ALTER TABLE product
  ADD COLUMN IF NOT EXISTS allow_gift    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_gift_qty  integer,          -- NULL=不限
  ADD COLUMN IF NOT EXISTS max_gift_ratio numeric(5,2);    -- NULL=不限
