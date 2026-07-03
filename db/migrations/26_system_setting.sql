-- ============================================================
-- 26 系统设置（集成凭据等键值配置，管理员端维护）
-- ============================================================
CREATE TABLE IF NOT EXISTS system_setting (
  organization_id bigint NOT NULL REFERENCES organization,
  key             varchar(80) NOT NULL,
  value           text,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, key)
);

-- 集成配置权限点，授予管理员角色
INSERT INTO permission (code, name, type, module, sort_order)
VALUES ('system.integration','系统-集成配置',20,'系统',5)
ON CONFLICT (code) DO NOTHING;
INSERT INTO role_permission (role_id, permission_id)
SELECT r.role_id, p.permission_id FROM role r, permission p
WHERE r.scope = 4 AND p.code = 'system.integration'
ON CONFLICT DO NOTHING;
