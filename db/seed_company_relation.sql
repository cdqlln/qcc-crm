-- 工商关系演示数据：不同名公司归同一集团（模拟企查查实控人/集团关系）
INSERT INTO company_relation (ref_company_id, ext_key, group_name) VALUES
 ('QCCDEMO_A1','GRP_STARMAP','星图控股集团'),
 ('QCCDEMO_A2','GRP_STARMAP','星图控股集团'),
 ('QCCDEMO_A3','GRP_STARMAP','星图控股集团'),
 ('QCCDEMO_T1','GRP_RUISI','锐思系'),
 ('QCCDEMO_T2','GRP_RUISI','锐思系')
ON CONFLICT (ref_company_id) DO UPDATE SET ext_key=EXCLUDED.ext_key, group_name=EXCLUDED.group_name;
