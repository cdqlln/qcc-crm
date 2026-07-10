-- 认证种子：为已有员工设置登录账号与密码（演示）。
-- 统一初始密码：crm123456（bcrypt hash 如下）。生产请改密或走 SSO。
-- 账号：admin（张伟，主管）、lina、wangfang、liuyang、chenjing、zhaolei、sunyu、zhoumin
UPDATE app_user SET
  password_hash = '$2b$10$Igxbmaj6G.pK8P9FThmfNuViFRfNI/IRmPUlCdYKuHx.KozxLOzWm',
  status = 1
WHERE user_id BETWEEN 1 AND 8;

UPDATE app_user SET username='admin',    email_login='admin@qcc.com',    wecom_userid='WECOM_admin'    WHERE user_id=1;
-- admin 赋予管理员角色（scope=4，可踢人/全公司数据范围）
INSERT INTO user_role (user_id, role_id) VALUES (1,3) ON CONFLICT DO NOTHING;
UPDATE app_user SET username='lina',     email_login='lina@qcc.com',     wecom_userid='WECOM_lina'     WHERE user_id=2;
UPDATE app_user SET username='wangfang', email_login='wangfang@qcc.com', wecom_userid='WECOM_wangfang' WHERE user_id=3;
UPDATE app_user SET username='liuyang',  email_login='liuyang@qcc.com',  wecom_userid='WECOM_liuyang'  WHERE user_id=4;
UPDATE app_user SET username='chenjing', email_login='chenjing@qcc.com', wecom_userid='WECOM_chenjing' WHERE user_id=5;
UPDATE app_user SET username='zhaolei',  email_login='zhaolei@qcc.com',  wecom_userid='WECOM_zhaolei'  WHERE user_id=6;
UPDATE app_user SET username='sunyu',    email_login='sunyu@qcc.com',    wecom_userid='WECOM_sunyu'    WHERE user_id=7;
UPDATE app_user SET username='zhoumin',  email_login='zhoumin@qcc.com',  wecom_userid='WECOM_zhoumin'  WHERE user_id=8;

-- 角色授权兜底：全新库上迁移18/26执行时 role 尚未种子，这里在角色就绪后重放授权
-- 管理员：全部权限
INSERT INTO role_permission (role_id, permission_id)
SELECT 3, permission_id FROM permission ON CONFLICT DO NOTHING;
-- 销售主管：除系统类外全部
INSERT INTO role_permission (role_id, permission_id)
SELECT 2, permission_id FROM permission WHERE module IS DISTINCT FROM '系统' ON CONFLICT DO NOTHING;
-- 销售员：核心查看 + 线索编辑/分配 + 报价编辑
INSERT INTO role_permission (role_id, permission_id)
SELECT 1, permission_id FROM permission
WHERE code IN ('lead.view','lead.edit','lead.assign','lead.export','customer.view','customer.edit',
               'opportunity.view','opportunity.edit','quotation.view','quotation.edit','contract.view','finance.view')
ON CONFLICT DO NOTHING;
