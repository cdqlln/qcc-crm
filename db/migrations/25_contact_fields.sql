-- ============================================================
-- 25 联系人：备注 + 企业微信外部联系人关联
-- ============================================================
ALTER TABLE contact
  ADD COLUMN IF NOT EXISTS remark text,
  ADD COLUMN IF NOT EXISTS wecom_external_userid varchar(120); -- 企业微信外部联系人ID
