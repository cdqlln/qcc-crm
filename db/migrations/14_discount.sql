-- ============================================================
-- 14 折扣权限：销售自主折扣 + 按客户分级(ABC)的询价折扣上限 + 报价草稿/确认
-- ============================================================

-- 产品级：销售可自主的最低折扣率（低于此 → 触发审批）；min_discount 仍为绝对下限
ALTER TABLE product
  ADD COLUMN IF NOT EXISTS sales_discount numeric(4,2) NOT NULL DEFAULT 0.95;

-- 折扣政策：按客户分级(level term)设置「询价单最高折扣」= 销售可自主的最低折扣率
CREATE TABLE IF NOT EXISTS discount_policy (
  policy_id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id bigint NOT NULL REFERENCES organization,
  level_term_id   bigint NOT NULL REFERENCES term,        -- 25A/26B/27C
  max_discount    numeric(4,2) NOT NULL DEFAULT 0.95,      -- 销售自主下限（越小=可给越大折扣）
  UNIQUE (organization_id, level_term_id)
);

-- 报价单：客户确认（询价单走销售自助，客户确认后方可后续动作）
ALTER TABLE quotation
  ADD COLUMN IF NOT EXISTS customer_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
