-- ============================================================
-- 22 日志审计：关键写操作留痕
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  audit_id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id bigint,
  user_id         bigint,
  user_name       varchar(80),
  action          varchar(80),          -- 人类可读动作（如「线索-转客户」）
  method          varchar(8),
  path            varchar(200),
  target_id       varchar(40),
  detail          varchar(300),
  ip              varchar(64),
  status          smallint,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_audit_org_time ON audit_log (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_user ON audit_log (organization_id, user_id);
CREATE INDEX IF NOT EXISTS ix_audit_action_trgm ON audit_log USING gin (action gin_trgm_ops);
