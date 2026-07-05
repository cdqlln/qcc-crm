-- ============================================================
-- 32 开放平台·数据产品价目表（数据API套餐 的接口级报价依据）
--   api_price：系统维护的接口价目（类别/ApiCode/名称/类型/标准价/备注）
--   quotation_product.api_items：按量计费行挂载的接口报价清单
--     [{ apiCode, name, price(标准价), quotePrice(报价单价), estCalls(预估月调用量) }]
-- ============================================================

CREATE TABLE api_price (
  api_price_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id bigint NOT NULL REFERENCES organization,
  category        varchar(60),                     -- 接口类别（工商信息/司法涉诉/…/标准企业户套餐）
  api_code        varchar(20) NOT NULL,
  name            varchar(160) NOT NULL,
  api_type        varchar(20),                     -- 数据类/核查类/套餐 等
  price           numeric(12,4) NOT NULL DEFAULT 0,-- 标准单价（元/次 或 元/户）
  unit            varchar(10) NOT NULL DEFAULT '次',
  remark          varchar(400),
  active          boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, api_code)
);
CREATE INDEX ix_apiprice_org ON api_price (organization_id, active, sort_order);
CREATE TRIGGER trg_apiprice_updated BEFORE UPDATE ON api_price FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE quotation_product ADD COLUMN IF NOT EXISTS api_items jsonb;
