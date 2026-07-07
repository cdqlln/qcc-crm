-- ============================================================
-- 39 SSO 单点登录（OIDC）：账号绑定字段
--   配置存 system_setting（sso.*，管理员端维护，凭据不入库仓库）
--   status=0 的账号不可登录（SSO 同步后由管理员开通）
-- ============================================================
ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS sso_sub      varchar(190),   -- IdP subject（唯一标识）
  ADD COLUMN IF NOT EXISTS sso_provider varchar(40),
  ADD COLUMN IF NOT EXISTS sso_synced_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_sso ON app_user (organization_id, sso_sub) WHERE sso_sub IS NOT NULL;
