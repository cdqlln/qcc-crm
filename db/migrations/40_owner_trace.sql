-- ============================================================
-- 40 归属追溯：线索/客户/商机 负责人变更完整留痕
--   via：init建档 / claim领取 / assign分配 / pool退回线索池 / transfer移交
--        convert线索转化 / edit调整 / unlink解除转化关联
-- ============================================================
CREATE TABLE owner_change_log (
  log_id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id bigint NOT NULL REFERENCES organization,
  entity_type     varchar(16) NOT NULL CHECK (entity_type IN ('lead','customer','opportunity')),
  entity_id       bigint NOT NULL,
  from_user_id    bigint,
  to_user_id      bigint,
  via             varchar(16) NOT NULL,
  operator_id     bigint,
  remark          varchar(200),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_ownerlog_entity ON owner_change_log (entity_type, entity_id, log_id DESC);
CREATE INDEX ix_ownerlog_org ON owner_change_log (organization_id, log_id DESC);
