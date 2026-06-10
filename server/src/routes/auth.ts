import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { one } from '../db.js';
import { ah, fail, ok } from '../http.js';
import { requireAuth, signAccess, signRefresh, verifyToken, wecom, type AuthUser } from '../auth.js';

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

function issue(u: any) {
  const au: AuthUser = { userId: u.user_id, orgId: u.organization_id, name: u.name };
  return { accessToken: signAccess(au), refreshToken: signRefresh(u.user_id), user: publicUser(u) };
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
    ok(res, issue(u));
  }),
);

// 当前用户
authRouter.get(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    const u = await findById((req as any).user.userId);
    if (!u) return fail(res, '用户不存在', 1, 404);
    ok(res, publicUser(u));
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
      ok(res, issue(u));
    } catch {
      return fail(res, '刷新令牌无效', 1, 401);
    }
  }),
);

authRouter.post('/logout', (_req, res) => ok(res, { ok: true })); // 无状态：前端清除令牌即可

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
    sendHtml({ ok: true, ...issue(u) });
  }),
);
