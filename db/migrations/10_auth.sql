-- ============================================================
-- 10 认证：账号密码登录 + 企业微信 SSO 绑定
-- ============================================================

ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS username      varchar(80),
  ADD COLUMN IF NOT EXISTS email_login   varchar(120),
  ADD COLUMN IF NOT EXISTS password_hash varchar(100),
  ADD COLUMN IF NOT EXISTS wecom_userid  varchar(120),   -- 企业微信 UserId（SSO 绑定）
  ADD COLUMN IF NOT EXISTS status        smallint NOT NULL DEFAULT 1, -- 1启用 0停用
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

-- 登录唯一性（大小写不敏感，忽略空值）
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_username ON app_user (lower(username)) WHERE username IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_email    ON app_user (lower(email_login)) WHERE email_login IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_wecom    ON app_user (wecom_userid) WHERE wecom_userid IS NOT NULL;
