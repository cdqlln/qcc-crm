-- ============================================================
-- 34 报价单增强：赠送项目 / 报价说明 / 服务年限
--   · quotation_product.gift：赠送项目（折扣为 0、售价与小计随之为 0）
--   · quotation.service_years：服务年限（年，配合数据接口预估量按年）
--   · quotation.remark：报价说明信息（随报价单打印导出）
-- ============================================================
ALTER TABLE quotation_product
  ADD COLUMN IF NOT EXISTS gift boolean NOT NULL DEFAULT false; -- 赠送项目

ALTER TABLE quotation
  ADD COLUMN IF NOT EXISTS service_years integer,  -- 服务年限（年）
  ADD COLUMN IF NOT EXISTS remark        text;     -- 报价说明信息
