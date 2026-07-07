import crypto from 'node:crypto';
import { getSetting } from './settings.js';

// SSO（OIDC 授权码流）：企业 IdP（Keycloak/Azure AD/钉钉/企业微信网关等 OIDC 兼容服务）
// 配置全部存 system_setting（管理员端维护）：
//   sso.enabled '1' | sso.name 显示名 | sso.authorizeUrl | sso.tokenUrl | sso.userinfoUrl
//   sso.clientId | sso.clientSecret | sso.scope(默认 openid profile email)
//   sso.callbackUrl（本服务对外回调地址，如 https://crm.example.com/api/auth/sso/callback）
//   sso.frontendUrl（登录完成后跳回的前端地址）
//   sso.autoProvision '1'=同步即开通 '0'=同步后待管理员开通 | sso.defaultRoleId 新账号默认角色

export interface SsoCfg {
  enabled: boolean;
  name: string;
  authorizeUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  clientId: string;
  clientSecret: string;
  scope: string;
  callbackUrl: string;
  frontendUrl: string;
  autoProvision: boolean;
  defaultRoleId: number | null;
}

export async function getSsoCfg(orgId: number): Promise<SsoCfg> {
  const g = (k: string) => getSetting(orgId, k);
  const [enabled, name, authorizeUrl, tokenUrl, userinfoUrl, clientId, clientSecret, scope, callbackUrl, frontendUrl, autoProvision, defaultRoleId] =
    await Promise.all([
      g('sso.enabled'), g('sso.name'), g('sso.authorizeUrl'), g('sso.tokenUrl'), g('sso.userinfoUrl'),
      g('sso.clientId'), g('sso.clientSecret'), g('sso.scope'), g('sso.callbackUrl'), g('sso.frontendUrl'),
      g('sso.autoProvision'), g('sso.defaultRoleId'),
    ]);
  const ready = !!(authorizeUrl && tokenUrl && userinfoUrl && clientId && clientSecret && callbackUrl);
  return {
    enabled: enabled === '1' && ready,
    name: name || '企业 SSO',
    authorizeUrl: authorizeUrl ?? '',
    tokenUrl: tokenUrl ?? '',
    userinfoUrl: userinfoUrl ?? '',
    clientId: clientId ?? '',
    clientSecret: clientSecret ?? '',
    scope: scope || 'openid profile email',
    callbackUrl: callbackUrl ?? '',
    frontendUrl: frontendUrl || (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',')[0],
    autoProvision: autoProvision !== '0',
    defaultRoleId: defaultRoleId ? Number(defaultRoleId) : null,
  };
}

// state 防 CSRF（内存，10 分钟有效；多实例部署可换 Redis）
const states = new Map<string, number>();
export function newState(): string {
  const s = crypto.randomBytes(16).toString('hex');
  states.set(s, Date.now());
  for (const [k, t] of states) if (Date.now() - t > 600_000) states.delete(k);
  return s;
}
export function consumeState(s: string): boolean {
  const t = states.get(s);
  states.delete(s);
  return t != null && Date.now() - t <= 600_000;
}

export interface SsoProfile { sub: string; name: string; username: string; email: string }

/** 授权码换取用户信息（token endpoint → userinfo endpoint） */
export async function exchangeCode(cfg: SsoCfg, code: string): Promise<SsoProfile> {
  const tokenRes = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: cfg.callbackUrl,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const tokenBody = (await tokenRes.json().catch(() => null)) as any;
  if (!tokenRes.ok || !tokenBody?.access_token) {
    throw new Error(`IdP 令牌交换失败：${tokenBody?.error_description ?? tokenBody?.error ?? tokenRes.status}`);
  }
  const uiRes = await fetch(cfg.userinfoUrl, {
    headers: { Authorization: `Bearer ${tokenBody.access_token}` },
    signal: AbortSignal.timeout(10_000),
  });
  const ui = (await uiRes.json().catch(() => null)) as any;
  if (!uiRes.ok || !ui?.sub) throw new Error('IdP 用户信息获取失败');
  return {
    sub: String(ui.sub),
    name: String(ui.name ?? ui.preferred_username ?? ui.email ?? ui.sub),
    username: String(ui.preferred_username ?? ui.email ?? ui.sub),
    email: String(ui.email ?? ''),
  };
}
