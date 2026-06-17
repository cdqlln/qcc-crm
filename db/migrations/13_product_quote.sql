-- ============================================================
-- 13 报价单类型 + 产品大类/交付方式 + 数据类阶梯报价
-- ============================================================

-- 报价单类型：1询价 2报价 3标书 4框架协议（政府/国企招投标场景）
ALTER TABLE quotation
  ADD COLUMN IF NOT EXISTS quote_type smallint NOT NULL DEFAULT 2 CHECK (quote_type IN (1,2,3,4));

-- 产品大类与交付方式
--   kind：1 数据（API/离线数据包，核心交付数据）  2 产品（账号/订阅，交付系统）
--   delivery_type：1 API  2 离线数据包  3 账号  4 订阅
ALTER TABLE product
  ADD COLUMN IF NOT EXISTS kind smallint NOT NULL DEFAULT 2 CHECK (kind IN (1,2)),
  ADD COLUMN IF NOT EXISTS delivery_type smallint CHECK (delivery_type IN (1,2,3,4));

-- 数据类产品的采购量阶梯报价（按数量区间取单价；max_qty 为空表示该档以上）
CREATE TABLE IF NOT EXISTS product_tier (
  tier_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id bigint NOT NULL REFERENCES product ON DELETE CASCADE,
  min_qty    integer NOT NULL DEFAULT 1,
  max_qty    integer,                       -- NULL = 不封顶
  unit_price money_amt NOT NULL DEFAULT 0,
  sort_order smallint NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_tier_product ON product_tier (product_id, sort_order);
