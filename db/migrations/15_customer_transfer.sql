-- ============================================================
-- 15 客户负责人移交（需交接审批）
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_transfer (
  transfer_id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id bigint NOT NULL REFERENCES organization,
  customer_id     bigint NOT NULL REFERENCES customer,
  from_user_id    bigint REFERENCES app_user,
  to_user_id      bigint NOT NULL REFERENCES app_user,
  reason          text,
  status          smallint NOT NULL DEFAULT 2 CHECK (status IN (2,3,11)), -- 2进行中3驳回11通过
  task_id         bigint,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_transfer_customer ON customer_transfer (customer_id, status);

-- 客户移交审批路由（business_type=8）
INSERT INTO work_flow_route (organization_id, business_type, name, nodes)
SELECT 1, 8, '客户移交审批', '[{"name":"销售主管审批","approverIds":[1]}]'
WHERE NOT EXISTS (SELECT 1 FROM work_flow_route WHERE organization_id=1 AND business_type=8);
