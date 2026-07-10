-- ============================================================
-- 种子数据：参考字典 + 组织/部门/员工/产品 + 一条完整 L2C 链路
-- term_id / 组织 / 部门 / 员工 使用显式 ID（OVERRIDING SYSTEM VALUE）
-- 与前端常量（src/mock/terms.ts、TERMS_BIZ）保持一致。
-- ============================================================

-- ---- 组织 ----
INSERT INTO organization (organization_id, name, ref_company_id) OVERRIDING SYSTEM VALUE
VALUES (1, '企查查科技', 'QCC00000001');

-- ---- 部门树 ----
INSERT INTO department (department_id, organization_id, parent_id, name, path, depth) OVERRIDING SYSTEM VALUE VALUES
 (1,1,NULL,'企查查科技','1',0),
 (2,1,1,'华东销售部','1,2',1),
 (3,1,1,'华南销售部','1,3',1),
 (4,1,1,'大客户部','1,4',1),
 (5,1,2,'华东一组','1,2,5',2),
 (6,1,2,'华东二组','1,2,6',2);

-- ---- 员工 ----
INSERT INTO app_user (user_id, organization_id, department_id, name, position) OVERRIDING SYSTEM VALUE VALUES
 (1,1,5,'张伟',1),(2,1,5,'李娜',0),(3,1,6,'王芳',0),(4,1,3,'刘洋',1),
 (5,1,3,'陈静',0),(6,1,4,'赵磊',1),(7,1,4,'孙宇',0),(8,1,6,'周敏',0);

-- ---- 角色 / 权限 ----
INSERT INTO role (role_id, organization_id, name, scope) OVERRIDING SYSTEM VALUE VALUES
 (1,1,'销售员',1),(2,1,'销售主管',3),(3,1,'管理员',4);
-- 权限点目录主要由迁移18/26建立（先于本 seed 执行），此处仅补充遗留码，冲突跳过
INSERT INTO permission (permission_id, code, name, type) OVERRIDING SYSTEM VALUE VALUES
 (1,'customer.export','导出客户',10),(2,'money.view','查看金额',10),(3,'admin.all','全部管理',20)
ON CONFLICT DO NOTHING;
INSERT INTO user_role (user_id, role_id) VALUES (1,2),(2,1),(3,1),(4,2),(5,1),(6,2),(7,1),(8,1);

-- ---- 字典 term（business_type 见 03_terms.sql 注释）----
INSERT INTO term (term_id, organization_id, business_type, name, kind, sort_order) OVERRIDING SYSTEM VALUE VALUES
 -- 1 来源
 (1,NULL,1,'官网注册','info',1),(2,NULL,1,'广告投放','info',2),(3,NULL,1,'转介绍','info',3),
 (4,NULL,1,'陌拜','info',4),(5,NULL,1,'展会','info',5),(6,NULL,1,'企查查导入','info',6),
 -- 2 商机阶段
 (30,NULL,2,'需求沟通','info',1),(31,NULL,2,'方案评估','info',2),(32,NULL,2,'报价阶段','info',3),
 (33,NULL,2,'签约流程中','warning',4),(34,NULL,2,'赢单','success',5),(35,NULL,2,'输单','danger',6),
 -- 3 客户状态
 (8,NULL,3,'初访','info',1),(9,NULL,3,'意向','info',2),(10,NULL,3,'方案','info',3),
 (11,NULL,3,'谈判','warning',4),(12,NULL,3,'已签约','success',5),(13,NULL,3,'已开票','success',6),(14,NULL,3,'已回款','success',7),
 -- 4 线索状态
 (15,NULL,4,'未分配','neutral',1),(16,NULL,4,'待处理','warning',2),(18,NULL,4,'跟进中','info',3),
 (17,NULL,4,'已转换','success',4),(19,NULL,4,'无效','danger',5),
 -- 8 跟进方式
 (80,NULL,8,'电话','info',1),(81,NULL,8,'微信','info',2),(82,NULL,8,'拜访','info',3),
 (83,NULL,8,'邮件','info',4),(84,NULL,8,'线上会议','info',5),
 -- 9 线索无效原因
 (90,NULL,9,'空号/无法联系','danger',1),(91,NULL,9,'无采购需求','danger',2),
 (92,NULL,9,'同行/竞品','danger',3),(93,NULL,9,'预算不足','danger',4),
 -- 100 分级
 (25,NULL,100,'A 级','success',1),(26,NULL,100,'B 级','info',2),(27,NULL,100,'C 级','neutral',3),
 -- 101 线索分组
 (101,NULL,101,'高潜','success',1),(102,NULL,101,'常规','info',2),(103,NULL,101,'待培育','warning',3),
 -- 102 标签
 (110,NULL,102,'重点客户','danger',1),(111,NULL,102,'老客户','success',2),
 (112,NULL,102,'新客户','info',3),(113,NULL,102,'战略合作','warning',4),
 -- 103 回款类型
 (120,NULL,103,'保证金','info',1),(121,NULL,103,'常规回款','info',2),
 (122,NULL,103,'尾款','warning',3),(123,NULL,103,'预付款','info',4),
 -- 104 发票种类
 (130,NULL,104,'增值税专票',NULL,1),(131,NULL,104,'增值税普票',NULL,2),(132,NULL,104,'电子专票',NULL,3),
 (133,NULL,104,'电子普票',NULL,4),(134,NULL,104,'收据',NULL,5),
 -- 105 支付方式
 (140,NULL,105,'银行转账',NULL,1),(141,NULL,105,'支付宝',NULL,2),(142,NULL,105,'微信',NULL,3),(143,NULL,105,'承兑汇票',NULL,4);

-- ---- 产品 ----
INSERT INTO product_category (category_id, organization_id, name, path) OVERRIDING SYSTEM VALUE VALUES
 (1,1,'基础服务','1'),(2,1,'数据服务','2'),(3,1,'增值服务','3');
INSERT INTO product (product_id, organization_id, category_id, code, name, spec, unit, time_limits, price, cost, min_discount, max_discount) OVERRIDING SYSTEM VALUE VALUES
 (1,1,1,'P0001','企业查询专业版','专业版','年',12, 30000, 8000, 0.70,1.00),
 (2,1,2,'P0002','风险监控服务','标准版','年',12, 50000,12000, 0.70,1.00),
 (3,1,3,'P0003','尽调报告(单次)','旗舰版','次',0,  8000, 2000, 0.80,1.00),
 (4,1,2,'P0004','数据API套餐','企业版','套',12,120000,30000, 0.75,1.00),
 (5,1,3,'P0005','海外KYC服务','专业版','年',12, 60000,15000, 0.80,1.00);

-- ---- 一条完整 L2C 链路（客户→联系人→商机→报价→合同→回款→开票）----
INSERT INTO customer (customer_id, organization_id, name, ref_company_id, category, level_term_id, source_term_id, status_term_id, industry, province, city, labels, phone_name, phone, leader_id, created_by) OVERRIDING SYSTEM VALUE VALUES
 (1,1,'星辰云图科技有限公司','QCC10000001',3,25,3,11,'软件和信息技术服务','江苏省','苏州市','{110,111}','王总','13800000001',1,1),
 (2,1,'锐思智联信息技术有限公司','QCC10000002',1,26,2,16,'金融业','上海市','上海市','{112}','李经理','13800000002',2,2);

INSERT INTO contact (contact_id, organization_id, customer_id, name, phone, position, type, maintainer_id) OVERRIDING SYSTEM VALUE VALUES
 (1,1,1,'王强','13900000001','采购经理',1,1),
 (2,1,1,'李敏','13900000002','CFO',2,1);

INSERT INTO customer_tracking (organization_id, customer_id, tracking_type_term, comment, next_tracking_at, priority_level, created_by) VALUES
 (1,1,80,'电话沟通，客户对专业版有兴趣，约定下周发方案。', now()+interval '5 day',1,1),
 (1,1,82,'上门拜访，确认采购需求与决策链。', now()+interval '3 day',1,1);

INSERT INTO opportunity (opportunity_id, organization_id, code, name, customer_id, liaison_id, key_man_id, estimated_amount, expiry_date, status_term_id, status_expiry_at, all_stay_time, leader_id, department_id, main_product) OVERRIDING SYSTEM VALUE VALUES
 (1,1,'OPP20260001','星辰云图·风险监控采购',1,1,2, 480000, now()::date+30, 32, now()+interval '7 day', 12, 1, 5, '风险监控服务');

UPDATE customer SET opportunity_count = 1 WHERE customer_id = 1;

INSERT INTO quotation (quotation_id, organization_id, code, version, name, customer_id, contact_id, opportunity_id, bidder_id, quote_date, expired_date, currency, status, total, cost, order_discount_rate, other_charges, discount) OVERRIDING SYSTEM VALUE VALUES
 (1,1,'QT20260001',1,'星辰云图 报价单',1,1,1,1, now()::date, now()::date+15,'CNY',3, 500000, 130000, 0.95, 5000, 10000);

INSERT INTO quotation_product (quotation_id, product_id, spec, quantity, price, discount_rate, cost) VALUES
 (1,2,'标准版',5,50000,0.95,12000),
 (1,3,'旗舰版',1,8000,0.90,2000);

INSERT INTO contract (contract_id, organization_id, code, name, customer_id, quotation_id, opportunity_id, contract_type, renew_type, begin_date, expired_date, currency, status, amount, gross_profit, leader_id) OVERRIDING SYSTEM VALUE VALUES
 (1,1,'HT20260001','星辰云图 服务合同',1,1,1,1,2, now()::date-10, now()::date+80,'CNY',2, 480000, 350000, 1);

INSERT INTO contract_product (contract_id, product_id, quantity, price, cost) VALUES
 (1,2,5,48000,12000),(1,3,1,7200,2000);

-- 回款计划（两期）
INSERT INTO payment (payment_id, organization_id, contract_id, customer_id, plan_amount, type_term_id, plan_date, leader_id) OVERRIDING SYSTEM VALUE VALUES
 (1,1,1,1,240000,123, now()::date-5, 1),   -- 预付款（已逾期，催收看板可见）
 (2,1,1,1,240000,122, now()::date+40, 1);  -- 尾款

-- 回款单：第一期实收 240000 → 触发器回写 payment & contract
INSERT INTO payment_sheet (organization_id, contract_id, payment_id, amount, pay_method_term, arrival_date, write_off, approval) VALUES
 (1,1,1,240000,140, now()::date-3, true, 11);

-- 发票：开蓝票 240000 → 触发器回写 contract.invoice_amount
INSERT INTO invoice (organization_id, code, contract_id, customer_id, invoice_type_term, red_blue_flag, amount, tax_amount, status, approval) VALUES
 (1,'FP202600001',1,1,130,1,240000, 13584.91, 1, 11);

-- ---- 目标 ----
INSERT INTO target (organization_id, user_id, year, month, category, target_amount, finished_amount, new_sign_amount, renew_amount)
SELECT 1, u, extract(year from now())::int, extract(month from now())::int, 1,
       (300000 + u*50000), (200000 + u*30000), (140000 + u*20000), (60000 + u*10000)
FROM generate_series(1,8) AS u;

-- ---- AI 提示词（系统级）----
INSERT INTO ai_prompt (organization_id, prompt_name, product_code, business_type, content) VALUES
 (NULL,'商机阶段分析',3,32,'分析该商机当前阶段的关键要点、风险、建议与下一步行动。'),
 (NULL,'客户画像分析',1,NULL,'基于客户工商与跟进信息，输出画像、机会点与风险。');

-- ============================================================
-- 重置所有 IDENTITY 序列，避免后续自增与显式 ID 冲突
-- ============================================================
SELECT setval(pg_get_serial_sequence('organization','organization_id'), (SELECT max(organization_id) FROM organization));
SELECT setval(pg_get_serial_sequence('department','department_id'),     (SELECT max(department_id) FROM department));
SELECT setval(pg_get_serial_sequence('app_user','user_id'),             (SELECT max(user_id) FROM app_user));
SELECT setval(pg_get_serial_sequence('role','role_id'),                 (SELECT max(role_id) FROM role));
SELECT setval(pg_get_serial_sequence('permission','permission_id'),     (SELECT max(permission_id) FROM permission));
SELECT setval(pg_get_serial_sequence('term','term_id'),                 (SELECT max(term_id) FROM term));
SELECT setval(pg_get_serial_sequence('product_category','category_id'), (SELECT max(category_id) FROM product_category));
SELECT setval(pg_get_serial_sequence('product','product_id'),           (SELECT max(product_id) FROM product));
SELECT setval(pg_get_serial_sequence('customer','customer_id'),         (SELECT max(customer_id) FROM customer));
SELECT setval(pg_get_serial_sequence('contact','contact_id'),           (SELECT max(contact_id) FROM contact));
SELECT setval(pg_get_serial_sequence('opportunity','opportunity_id'),   (SELECT max(opportunity_id) FROM opportunity));
SELECT setval(pg_get_serial_sequence('quotation','quotation_id'),       (SELECT max(quotation_id) FROM quotation));
SELECT setval(pg_get_serial_sequence('contract','contract_id'),         (SELECT max(contract_id) FROM contract));
SELECT setval(pg_get_serial_sequence('payment','payment_id'),           (SELECT max(payment_id) FROM payment));
