-- ============================================================
-- 35 数据API 报价：产品分「按接口 / 按企业户」两类 + 接口计费双模式
--   quotation_product.api_mode：
--     'calls'    定量定价：各接口 调用量×单价 → 行总价可算（计入报价总额）
--     'recharge' 只调价不定量：无法得知总价 → 售价=充值金额（销售填写）
--   （历史 pricing_mode='usage' 行为旧版框架按量行，保持不变）
-- ============================================================

ALTER TABLE quotation_product ADD COLUMN IF NOT EXISTS api_mode varchar(10)
  CHECK (api_mode IN ('calls','recharge'));

-- 产品目录拆分：原「数据API套餐」明确为按接口；新增按企业户产品（价格来自价目表套餐条目，自由定价）
UPDATE product SET name='数据API套餐（按接口）' WHERE organization_id=1 AND code='P0004' AND name='数据API套餐';

INSERT INTO product (organization_id, code, name, spec, unit, price, cost, min_discount, max_discount, free_pricing, kind, active)
SELECT 1, 'P0006', '数据API套餐（按企业户）', '标准企业户（普通/高级/历史维度）按户计费', '户', 0, 0, 0.50, 1.00, true, 1, true
WHERE NOT EXISTS (SELECT 1 FROM product WHERE organization_id=1 AND code='P0006');
