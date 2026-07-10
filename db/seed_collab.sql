-- 协同模块种子：工单类型字典 + 审批路由 + 示例工单/签到
-- 工单类型 term（business_type=7）
INSERT INTO term (term_id, organization_id, business_type, name, kind, sort_order) OVERRIDING SYSTEM VALUE VALUES
 (200,NULL,7,'咨询','info',1),(201,NULL,7,'投诉','danger',2),
 (202,NULL,7,'故障','warning',3),(203,NULL,7,'需求','info',4)
ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('term','term_id'), (SELECT max(term_id) FROM term));

-- 审批路由：合同(bt=2) 两级；报价(bt=1) 一级
INSERT INTO work_flow_route (organization_id, business_type, name, nodes) VALUES
 (1, 2, '合同审批流', '[{"name":"部门主管审批","approverIds":[1]},{"name":"大客户负责人审批","approverIds":[6]}]'),
 (1, 1, '报价审批流', '[{"name":"销售主管审批","approverIds":[1]}]');

-- 客户移交审批（bt=8）：迁移15在全新库上因 org 尚未种子而跳过，这里兜底
INSERT INTO work_flow_route (organization_id, business_type, name, nodes)
SELECT 1, 8, '客户移交审批', '[{"name":"销售主管审批","approverIds":[1]}]'
WHERE NOT EXISTS (SELECT 1 FROM work_flow_route WHERE organization_id=1 AND business_type=8);

-- 示例工单
INSERT INTO ticket (organization_id, code, title, type_term_id, customer_id, priority, status, assignee_id, creator_id, description) VALUES
 (1,'WO20260001','专业版无法登录',202,1,3,2,3,2,'客户反馈账号登录报错，需排查'),
 (1,'WO20260002','发票信息变更',200,1,2,1,5,2,'客户要求修改开票抬头'),
 (1,'WO20260003','增购数据API咨询',203,1,2,1,6,1,'客户咨询API套餐升级');

-- 示例签到
INSERT INTO sign (organization_id, user_id, type, customer_id, address, longitude, latitude, remark) VALUES
 (1,1,2,1,'江苏省苏州市工业园区星海街',120.678,31.317,'拜访客户王总，确认续约意向'),
 (1,2,1,NULL,'公司',120.585,31.298,'上班打卡');
