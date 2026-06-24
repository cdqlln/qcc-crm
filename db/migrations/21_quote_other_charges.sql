-- ============================================================
-- 21 报价单：其他费用明细（内容 + 金额）
--   other_charges_items: [{name, amount}]；other_charges 仍存合计(供 amount 生成列使用)
-- ============================================================
ALTER TABLE quotation
  ADD COLUMN IF NOT EXISTS other_charges_items jsonb NOT NULL DEFAULT '[]';
