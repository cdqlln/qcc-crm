-- ============================================================
-- 30 合同法务审核 + 销售协同
--   contract.review_status：0未送审 1待法务审核 2审核通过 3已驳回
--   contract_review：送审/通过/驳回/协同留言 全过程留痕
--   权限点 contract.review + 「法务」角色（全公司数据范围）
-- ============================================================

ALTER TABLE contract ADD COLUMN IF NOT EXISTS review_status smallint NOT NULL DEFAULT 0
  CHECK (review_status IN (0,1,2,3));

CREATE TABLE contract_review (
  review_id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id bigint NOT NULL REFERENCES organization,
  contract_id     bigint NOT NULL REFERENCES contract ON DELETE CASCADE,
  action          smallint NOT NULL CHECK (action IN (1,2,3,4)),  -- 1送审 2通过 3驳回 4协同留言
  comment         text,
  attachments     jsonb NOT NULL DEFAULT '[]',
  created_by      bigint REFERENCES app_user,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_ctreview_contract ON contract_review (contract_id, review_id);

-- 权限点
INSERT INTO permission (code, name, type, module, sort_order) VALUES
 ('contract.review','合同-法务审核',20,'合同',3)
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, type=EXCLUDED.type, module=EXCLUDED.module, sort_order=EXCLUDED.sort_order;

-- 管理员默认拥有
INSERT INTO role_permission (role_id, permission_id)
SELECT 3, permission_id FROM permission WHERE code='contract.review'
ON CONFLICT DO NOTHING;

-- 「法务」角色（全公司数据范围）：合同查看/审核 + 客户/报价查看
INSERT INTO role (organization_id, name, scope)
SELECT 1, '法务', 4
WHERE NOT EXISTS (SELECT 1 FROM role WHERE organization_id=1 AND name='法务');

INSERT INTO role_permission (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM role r JOIN permission p ON p.code IN ('contract.view','contract.review','customer.view','quotation.view')
WHERE r.organization_id=1 AND r.name='法务'
ON CONFLICT DO NOTHING;
