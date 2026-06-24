-- ============================================================
-- 19 跟进记录附件（文件 + 图片）
--   attachments: [{name, url, mime, size}]
-- ============================================================
ALTER TABLE customer_tracking
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]';
