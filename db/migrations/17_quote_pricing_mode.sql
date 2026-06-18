-- ============================================================
-- 17 报价计价方式：按数量 / 按用量(API接口单价，框架协议，无固定总价)
-- ============================================================
ALTER TABLE quotation_product
  ADD COLUMN IF NOT EXISTS pricing_mode varchar(8) NOT NULL DEFAULT 'qty'
    CHECK (pricing_mode IN ('qty','usage'));

-- 重建 total_price 生成列：按用量行不计入固定总价（按实际调用量结算）
ALTER TABLE quotation_product DROP COLUMN IF EXISTS total_price;
ALTER TABLE quotation_product
  ADD COLUMN total_price money_amt GENERATED ALWAYS AS (
    CASE WHEN pricing_mode = 'usage' THEN 0
         ELSE round(price * discount_rate * quantity, 2) END
  ) STORED;
