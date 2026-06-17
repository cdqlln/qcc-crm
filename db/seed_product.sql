-- 产品大类/交付方式 + 数据类阶梯价（基于既有 5 个产品）
-- p1 企业查询专业版 → 产品/账号；p2 风险监控服务 → 产品/订阅
-- p3 尽调报告 → 数据/离线数据包；p4 数据API套餐 → 数据/API；p5 海外KYC → 数据/API
UPDATE product SET kind=2, delivery_type=3 WHERE product_id=1;
UPDATE product SET kind=2, delivery_type=4 WHERE product_id=2;
UPDATE product SET kind=1, delivery_type=2 WHERE product_id=3;
UPDATE product SET kind=1, delivery_type=1 WHERE product_id=4;
UPDATE product SET kind=1, delivery_type=1 WHERE product_id=5;

-- 阶梯报价（数据类按采购量阶梯）
DELETE FROM product_tier WHERE product_id IN (3,4,5);
INSERT INTO product_tier (product_id, min_qty, max_qty, unit_price, sort_order) VALUES
 (3, 1, 9,   8000, 1), (3, 10, 49, 7200, 2), (3, 50, NULL, 6400, 3),
 (4, 1, 9, 120000, 1), (4, 10, 49,108000, 2), (4, 50, NULL,96000, 3),
 (5, 1, 9,  60000, 1), (5, 10, 29, 54000, 2), (5, 30, NULL,48000, 3);

-- 既有报价单标记为「报价」类型
UPDATE quotation SET quote_type=2 WHERE quote_type IS NULL OR quote_type=2;
