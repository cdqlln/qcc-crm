-- 折扣政策：A 客户可给到 15% 折扣(0.85)、B 10%(0.90)、C 5%(0.95) —— 均为销售自主上限
INSERT INTO discount_policy (organization_id, level_term_id, max_discount) VALUES
 (1, 25, 0.85), (1, 26, 0.90), (1, 27, 0.95)
ON CONFLICT (organization_id, level_term_id) DO UPDATE SET max_discount = EXCLUDED.max_discount;

-- 不同产品销售自主折扣不同（示例：数据类更紧，产品类略松）
UPDATE product SET sales_discount = 0.92 WHERE kind = 2;  -- 产品类销售自主到 0.92
UPDATE product SET sales_discount = 0.95 WHERE kind = 1;  -- 数据类销售自主到 0.95
