-- ============================================================
-- 37 线索池管理：分配与进展跟踪归销售管理人员
--   权限点 lead.pool（线索池-分配/进展跟踪），授 销售主管(2)/管理员(3)
--   （领取 claim 仍归 lead.assign，销售可自助领取）
-- ============================================================
INSERT INTO permission (code, name, type, module, sort_order) VALUES
 ('lead.pool','线索池-分配/进展跟踪',20,'线索',5)
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, type=EXCLUDED.type, module=EXCLUDED.module, sort_order=EXCLUDED.sort_order;

INSERT INTO role_permission (role_id, permission_id)
SELECT r.role_id, p.permission_id FROM role r JOIN permission p ON p.code='lead.pool'
WHERE r.role_id IN (2,3)
ON CONFLICT DO NOTHING;
