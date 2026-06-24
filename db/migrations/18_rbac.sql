-- ============================================================
-- 18 RBAC：权限点目录 + 角色权限/数据范围 + 用户角色
-- ============================================================
ALTER TABLE permission ADD COLUMN IF NOT EXISTS module varchar(40);
ALTER TABLE permission ADD COLUMN IF NOT EXISTS sort_order smallint NOT NULL DEFAULT 0;

-- 权限点目录（功能权限）
INSERT INTO permission (code, name, type, module, sort_order) VALUES
 ('lead.view','线索-查看',10,'线索',1),
 ('lead.edit','线索-编辑/转化',10,'线索',2),
 ('lead.assign','线索-分配/领取',10,'线索',3),
 ('lead.export','线索-导出',10,'线索',4),
 ('customer.view','客户-查看',10,'客户',1),
 ('customer.edit','客户-编辑',10,'客户',2),
 ('customer.transfer','客户-移交',10,'客户',3),
 ('customer.export','客户-导出',10,'客户',4),
 ('customer.delete','客户-删除/退公海',20,'客户',5),
 ('opportunity.view','商机-查看',10,'商机',1),
 ('opportunity.edit','商机-编辑',10,'商机',2),
 ('quotation.view','报价-查看',10,'报价',1),
 ('quotation.edit','报价-编辑',10,'报价',2),
 ('quotation.approve','报价/单据-审批',20,'审批',1),
 ('contract.view','合同-查看',10,'合同',1),
 ('contract.edit','合同-编辑',10,'合同',2),
 ('finance.view','资金-查看',10,'资金',1),
 ('system.org','系统-组织/部门',20,'系统',1),
 ('system.role','系统-角色权限',20,'系统',2),
 ('system.dict','系统-字段/字典',20,'系统',3),
 ('system.audit','系统-日志审计',20,'系统',4)
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, type=EXCLUDED.type, module=EXCLUDED.module, sort_order=EXCLUDED.sort_order;

-- 角色授权（role 1销售员 / 2销售主管 / 3管理员，见 seed_auth）
-- 管理员：全部
INSERT INTO role_permission (role_id, permission_id)
SELECT 3, permission_id FROM permission ON CONFLICT DO NOTHING;
-- 销售主管：除系统类外全部
INSERT INTO role_permission (role_id, permission_id)
SELECT 2, permission_id FROM permission WHERE module <> '系统' ON CONFLICT DO NOTHING;
-- 销售员：核心查看 + 线索编辑/分配 + 报价编辑
INSERT INTO role_permission (role_id, permission_id)
SELECT 1, permission_id FROM permission
WHERE code IN ('lead.view','lead.edit','lead.assign','lead.export','customer.view','customer.edit',
               'opportunity.view','opportunity.edit','quotation.view','quotation.edit','contract.view','finance.view')
ON CONFLICT DO NOTHING;
