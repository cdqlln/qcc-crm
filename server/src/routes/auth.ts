import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { one } from '../db.js';
import { ah, fail, ok } from '../http.js';
import { getAuthz, requireAuth, signAccess, signRefresh, verifyToken, wecom, type AuthUser } from '../auth.js';

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

// 账号密码登录
const loginSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });
authRouter.post(
  '/login',
  ah(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, '请输入账号与密码');
    const u = await findByLogin(parsed.data.username);
    if (!u || !u.password_hash) return fail(res, '账号或密码错误', 1, 401);
    const okPwd = await bcrypt.compare(parsed.data.password, u.password_hash);
    if (!okPwd) return fail(res, '账号或密码错误', 1, 401);
    await one(`UPDATE app_user SET last_login_at=now() WHERE user_id=$1`, [u.user_id]);
    ok(res, await issue(u));
  }),
);

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
