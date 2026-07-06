-- ============================================================
-- 36 客户组织结构收集 + 联系人 KP 标志
--   customer_org_node：客户内部组织架构树（销售调研收集，联系人可挂节点）
--   contact.is_kp：关键人（Key Person）标志
--   contact.org_node_id：联系人所属组织节点（删节点仅解挂不删人）
-- ============================================================

CREATE TABLE customer_org_node (
  node_id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id bigint NOT NULL REFERENCES organization,
  customer_id     bigint NOT NULL REFERENCES customer ON DELETE CASCADE,
  parent_id       bigint REFERENCES customer_org_node ON DELETE CASCADE,
  name            varchar(80) NOT NULL,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_custorg_customer ON customer_org_node (customer_id, parent_id, sort_order);

ALTER TABLE contact
  ADD COLUMN IF NOT EXISTS is_kp boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS org_node_id bigint REFERENCES customer_org_node ON DELETE SET NULL;
