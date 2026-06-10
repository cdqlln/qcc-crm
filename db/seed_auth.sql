-- 认证种子：为已有员工设置登录账号与密码（演示）。
-- 统一初始密码：crm123456（bcrypt hash 如下）。生产请改密或走 SSO。
-- 账号：admin（张伟，主管）、lina、wangfang、liuyang、chenjing、zhaolei、sunyu、zhoumin
UPDATE app_user SET
  password_hash = '$2b$10$Igxbmaj6G.pK8P9FThmfNuViFRfNI/IRmPUlCdYKuHx.KozxLOzWm',
  status = 1
WHERE user_id BETWEEN 1 AND 8;

UPDATE app_user SET username='admin',    email_login='admin@qcc.com',    wecom_userid='WECOM_admin'    WHERE user_id=1;
UPDATE app_user SET username='lina',     email_login='lina@qcc.com',     wecom_userid='WECOM_lina'     WHERE user_id=2;
UPDATE app_user SET username='wangfang', email_login='wangfang@qcc.com', wecom_userid='WECOM_wangfang' WHERE user_id=3;
UPDATE app_user SET username='liuyang',  email_login='liuyang@qcc.com',  wecom_userid='WECOM_liuyang'  WHERE user_id=4;
UPDATE app_user SET username='chenjing', email_login='chenjing@qcc.com', wecom_userid='WECOM_chenjing' WHERE user_id=5;
UPDATE app_user SET username='zhaolei',  email_login='zhaolei@qcc.com',  wecom_userid='WECOM_zhaolei'  WHERE user_id=6;
UPDATE app_user SET username='sunyu',    email_login='sunyu@qcc.com',    wecom_userid='WECOM_sunyu'    WHERE user_id=7;
UPDATE app_user SET username='zhoumin',  email_login='zhoumin@qcc.com',  wecom_userid='WECOM_zhoumin'  WHERE user_id=8;
