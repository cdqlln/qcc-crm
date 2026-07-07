import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { one } from '../db.js';
import { ah, fail, ok } from '../http.js';
import { getAuthz, requireAuth, signAccess, signRefresh, verifyToken, wecom, type AuthUser } from '../auth.js';
import { consumeState, exchangeCode, getSsoCfg, newState } from '../services/sso.js';

export const authRouter = Router();

const publicUser = (u: any) => ({
  userId: u.user_id,
  name: u.name,
  username: u.username,
  email: u.email_login,
  depId: u.department_id,
  depName: u.dep_name,
  position: u.position,
  organizationId: u.organization_id,
  avatar: u.avatar ?? null,
});

async function findByLogin(login: string) {
  return one<any>(
    `SELECT u.*, d.name AS dep_name FROM app_user u LEFT JOIN department d ON d.department_id=u.department_id
     WHERE u.status=1 AND (lower(u.username)=lower($1) OR lower(u.email_login)=lower($1)) LIMIT 1`,
    [login],
  );
}
async function findById(id: number) {
  return one<any>(
    `SELECT u.*, d.name AS dep_name FROM app_user u LEFT JOIN department d ON d.department_id=u.department_id
     WHERE u.user_id=$1 LIMIT 1`,
    [id],
  );
}
async function findByWecom(wecomId: string) {
  return one<any>(
    `SELECT u.*, d.name AS dep_name FROM app_user u LEFT JOIN department d ON d.department_id=u.department_id
     WHERE u.status=1 AND u.wecom_userid=$1 LIMIT 1`,
    [wecomId],
  );
}

async function issue(u: any) {
  const au: AuthUser = { userId: u.user_id, orgId: u.organization_id, name: u.name };
  const tv = Number(u.token_version ?? 0);
  const az = await getAuthz(u.user_id);
  return {
    accessToken: signAccess(au, tv),
    refreshToken: signRefresh(u.user_id, tv),
    user: { ...publicUser(u), scope: az.scope, permissions: az.permissions, isAdmin: az.isAdmin },
  };
}

// 登录日志审计（成功/失败均留痕，SSO 与密码登录统一口径）
async function logAuth(orgId: number | null, userId: number | null, userName: string, action: string, ip: string, success: boolean, detail?: string) {
  await one(
    `INSERT INTO audit_log (organization_id, user_id, user_name, action, method, path, detail, ip, status)
     VALUES ($1,$2,$3,$4,'POST','/api/auth',$5,$6,$7) RETURNING audit_id`,
    [orgId ?? 1, userId, userName.slice(0, 80), action, detail?.slice(0, 300) ?? null, ip.slice(0, 64), success ? 200 : 401],
  ).catch(() => null); // 审计失败不影响登录主流程
}
const clientIp = (req: any) => String(req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? '').split(',')[0].trim();

// 账号密码登录
const loginSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });
authRouter.post(
  '/login',
  ah(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, '请输入账号与密码');
    const u = await findByLogin(parsed.data.username);
    if (!u || !u.password_hash) {
      await logAuth(null, null, parsed.data.username, '登录失败', clientIp(req), false, '账号不存在或未开通');
      return fail(res, '账号或密码错误', 1, 401);
    }
    const okPwd = await bcrypt.compare(parsed.data.password, u.password_hash);
    if (!okPwd) {
      await logAuth(u.organization_id, u.user_id, u.name, '登录失败', clientIp(req), false, '密码错误');
      return fail(res, '账号或密码错误', 1, 401);
    }
    await one(`UPDATE app_user SET last_login_at=now() WHERE user_id=$1`, [u.user_id]);
    await logAuth(u.organization_id, u.user_id, u.name, '登录', clientIp(req), true);
    ok(res, await issue(u));
  }),
);

// ---------- SSO 单点登录（OIDC 授权码流；配置见 设置→集成配置） ----------
const ORG_ID = 1; // 单租户部署；多租户可按域名解析

// 前端探测：是否显示「SSO 登录」按钮
authRouter.get('/sso/status', ah(async (_req, res) => {
  const cfg = await getSsoCfg(ORG_ID);
  ok(res, { enabled: cfg.enabled, name: cfg.name });
}));

// 跳转 IdP 授权页
authRouter.get('/sso/login', ah(async (_req, res) => {
  const cfg = await getSsoCfg(ORG_ID);
  if (!cfg.enabled) return fail(res, 'SSO 未启用或未配置完整');
  const url = new URL(cfg.authorizeUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', cfg.callbackUrl);
  url.searchParams.set('scope', cfg.scope);
  url.searchParams.set('state', newState());
  res.redirect(url.toString());
}));

// IdP 回调：换码取用户 → 绑定/同步账号 → 签发本系统会话
authRouter.get('/sso/callback', ah(async (req, res) => {
  const cfg = await getSsoCfg(ORG_ID);
  const back = (q: string) => res.redirect(`${cfg.frontendUrl.replace(/\/$/, '')}/login?${q}`);
  try {
    if (!cfg.enabled) return back('ssoError=' + encodeURIComponent('SSO 未启用'));
    const code = String(req.query.code ?? '');
    const state = String(req.query.state ?? '');
    if (!code || !consumeState(state)) return back('ssoError=' + encodeURIComponent('SSO 校验失败（state 无效或已过期）'));
    const profile = await exchangeCode(cfg, code);

    // 1) 按 sso_sub 绑定 → 2) 按邮箱/用户名匹配并绑定 → 3) 自动建号（按配置决定是否直接开通）
    let u = await one<any>(`SELECT * FROM app_user WHERE organization_id=$1 AND sso_sub=$2`, [ORG_ID, profile.sub]);
    if (!u && (profile.email || profile.username)) {
      u = await one<any>(
        `SELECT * FROM app_user WHERE organization_id=$1 AND (lower(email_login)=lower($2) OR lower(username)=lower($3)) LIMIT 1`,
        [ORG_ID, profile.email || '__no_email__', profile.username || '__no_username__'],
      );
      if (u) {
        await one(`UPDATE app_user SET sso_sub=$1, sso_provider=$2, sso_synced_at=now() WHERE user_id=$3 RETURNING user_id`,
          [profile.sub, cfg.name, u.user_id]);
      }
    }
    if (!u) {
      // 自动同步建号：autoProvision=开通(1)；否则待管理员开通(0)
      u = await one<any>(
        `INSERT INTO app_user (organization_id, name, username, email_login, sso_sub, sso_provider, sso_synced_at, status, position)
         VALUES ($1,$2,$3,$4,$5,$6, now(), $7, 0) RETURNING *`,
        [ORG_ID, profile.name, profile.username, profile.email || null, profile.sub, cfg.name, cfg.autoProvision ? 1 : 0],
      );
      if (cfg.defaultRoleId) {
        await one(`INSERT INTO user_role (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING user_id`,
          [u.user_id, cfg.defaultRoleId]).catch(() => null);
      }
      await logAuth(ORG_ID, u.user_id, profile.name, 'SSO账号同步', clientIp(req), true,
        cfg.autoProvision ? '自动建号并开通' : '自动建号，待管理员开通');
    } else {
      // 账号同步：姓名/邮箱随 IdP 更新
      await one(`UPDATE app_user SET name=$1, email_login=COALESCE(NULLIF($2,''), email_login), sso_synced_at=now() WHERE user_id=$3 RETURNING user_id`,
        [profile.name, profile.email, u.user_id]);
    }
    if (Number(u.status) !== 1) {
      await logAuth(ORG_ID, u.user_id, profile.name, 'SSO登录失败', clientIp(req), false, '账号未开通CRM使用权限');
      return back('ssoError=' + encodeURIComponent('账号已同步，但尚未开通 CRM 使用权限，请联系管理员'));
    }
    const fresh = await findById(u.user_id);
    await one(`UPDATE app_user SET last_login_at=now() WHERE user_id=$1`, [u.user_id]);
    await logAuth(ORG_ID, u.user_id, fresh.name, 'SSO登录', clientIp(req), true, cfg.name);
    const session = await issue(fresh);
    return back(`ssoAccess=${encodeURIComponent(session.accessToken)}&ssoRefresh=${encodeURIComponent(session.refreshToken)}`);
  } catch (e) {
    console.error('[sso] callback error:', e);
    return back('ssoError=' + encodeURIComponent(e instanceof Error ? e.message : 'SSO 登录失败'));
  }
}));

// 当前用户
authRouter.get(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    const uid = (req as any).user.userId;
    const u = await findById(uid);
    if (!u) return fail(res, '用户不存在', 1, 404);
    const az = await getAuthz(uid);
    ok(res, { ...publicUser(u), scope: az.scope, permissions: az.permissions, isAdmin: az.isAdmin });
  }),
);

// 刷新令牌
authRouter.post(
  '/refresh',
  ah(async (req, res) => {
    const rt = req.body?.refreshToken as string;
    if (!rt) return fail(res, '缺少 refreshToken', 1, 401);
    try {
      const p = verifyToken(rt);
      if (p.typ !== 'refresh') throw new Error('bad');
      const u = await findById(Number(p.sub));
      if (!u || u.status !== 1) throw new Error('inactive');
      if (Number(p.tv ?? 0) !== Number(u.token_version ?? 0)) throw new Error('revoked');
      ok(res, await issue(u));
    } catch {
      return fail(res, '刷新令牌无效', 1, 401);
    }
  }),
);

authRouter.post('/logout', (_req, res) => ok(res, { ok: true })); // 无状态：前端清除令牌即可

// 修改密码：校验旧密码 → 更新 hash 并 token_version+1（其它会话立即失效）→ 重新签发
const pwdSchema = z.object({ oldPassword: z.string().min(1), newPassword: z.string().min(6) });
authRouter.post(
  '/password',
  requireAuth,
  ah(async (req, res) => {
    const parsed = pwdSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, '新密码至少 6 位');
    const uid = (req as any).user.userId as number;
    const u = await findById(uid);
    if (!u?.password_hash || !(await bcrypt.compare(parsed.data.oldPassword, u.password_hash)))
      return fail(res, '原密码错误', 1, 401);
    const hash = await bcrypt.hash(parsed.data.newPassword, 10);
    const updated = await one<any>(
      `UPDATE app_user SET password_hash=$1, token_version=token_version+1 WHERE user_id=$2 RETURNING *`,
      [hash, uid],
    );
    const u2 = await findById(updated.user_id);
    ok(res, await issue(u2)); // 返回新令牌，当前设备保持登录
  }),
);

// 强制下线（踢人）：管理员将目标用户 token_version+1，其所有令牌立即失效
authRouter.post(
  '/kick/:userId',
  requireAuth,
  ah(async (req, res) => {
    const me = (req as any).user.userId as number;
    const admin = await one<{ is_admin: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM user_role ur JOIN role r ON r.role_id=ur.role_id
         WHERE ur.user_id=$1 AND r.scope=4) AS is_admin`,
      [me],
    );
    if (!admin?.is_admin) return fail(res, '无权限（需管理员）', 1, 403);
    const target = Number(req.params.userId);
    const r = await one(`UPDATE app_user SET token_version=token_version+1 WHERE user_id=$1 RETURNING user_id`, [target]);
    if (!r) return fail(res, '用户不存在', 1, 404);
    ok(res, { ok: true, userId: target });
  }),
);

// ---------- 企业微信 SSO ----------
// 返回扫码登录 URL（未配置企业凭据时进入开发模拟）
authRouter.get(
  '/wecom/url',
  ah(async (req, res) => {
    const state = Math.random().toString(36).slice(2);
    if (!wecom.enabled) {
      // 开发模拟：直接指向回调，code 形如 DEV:<wecom_userid>
      const demo = String(req.query.as || 'WECOM_admin');
      const url = `${wecom.selfBase}/api/auth/wecom/callback?code=${encodeURIComponent('DEV:' + demo)}&state=${state}`;
      return ok(res, { url, dev: true });
    }
    const redirect = encodeURIComponent(`${wecom.selfBase}/api/auth/wecom/callback`);
    const url =
      `https://login.work.weixin.qq.com/wwlogin/sso/login?login_type=CorpApp` +
      `&appid=${wecom.corpId}&agentid=${wecom.agentId}&redirect_uri=${redirect}&state=${state}`;
    ok(res, { url, dev: false });
  }),
);

// 通过 code 换取企业微信 UserId
async function resolveWecomUserId(code: string): Promise<string | null> {
  if (code.startsWith('DEV:')) return code.slice(4);
  // gettoken → getuserinfo
  const t = await fetch(
    `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${wecom.corpId}&corpsecret=${wecom.secret}`,
  ).then((r) => r.json() as any);
  if (!t.access_token) return null;
  const info = await fetch(
    `https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=${t.access_token}&code=${code}`,
  ).then((r) => r.json() as any);
  return info.userid || info.UserId || null;
}

// 回调：换取用户 → 签发令牌 → postMessage 回前端弹窗
authRouter.get(
  '/wecom/callback',
  ah(async (req, res) => {
    const code = String(req.query.code || '');
    const sendHtml = (payload: object) => {
      res.set('Content-Type', 'text/html; charset=utf-8').send(
        `<!doctype html><meta charset="utf-8"><body><script>
          (function(){var msg=${JSON.stringify(payload)};
           if(window.opener){window.opener.postMessage({source:'nextcrm-wecom',...msg}, '*');window.close();}
           else{document.body.innerText = msg.ok ? '登录成功，请返回应用' : ('登录失败：'+msg.msg);}
          })();
        </script></body>`,
      );
    };
    if (!code) return sendHtml({ ok: false, msg: '缺少 code' });
    const wecomId = await resolveWecomUserId(code).catch(() => null);
    if (!wecomId) return sendHtml({ ok: false, msg: '企业微信授权失败' });
    const u = await findByWecom(wecomId);
    if (!u) return sendHtml({ ok: false, msg: '该企业微信账号未绑定系统用户' });
    await one(`UPDATE app_user SET last_login_at=now() WHERE user_id=$1`, [u.user_id]);
    sendHtml({ ok: true, ...(await issue(u)) });
  }),
);
