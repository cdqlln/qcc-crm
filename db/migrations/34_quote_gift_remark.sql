-- ============================================================
-- 34 报价单增强：报价说明 + 服务年限 + 赠送行
--   quotation.remark：报价说明（随单展示/打印）
--   quotation.service_years：服务年限（年）
--   quotation_product.gift：赠送项目（折扣 0、实际单价 0，不参与折扣权限校验）
-- ============================================================
ALTER TABLE quotation
  ADD COLUMN IF NOT EXISTS remark text,
  ADD COLUMN IF NOT EXISTS service_years smallint;

ALTER TABLE quotation_product
  ADD COLUMN IF NOT EXISTS gift boolean NOT NULL DEFAULT false;
