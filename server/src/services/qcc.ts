import crypto from 'node:crypto';

// 企查查开放平台客户端
// 鉴权：Headers Token = MD5(key + Timespan + SecretKey) 大写；Timespan = Unix 秒
const CFG = {
  base: process.env.QCC_API_BASE ?? 'https://api.qichacha.com',
  key: process.env.QCC_API_KEY ?? '',
  secret: process.env.QCC_SECRET_KEY ?? '',
  get enabled() {
    return !!(this.key && this.secret);
  },
};

function authHeaders(): Record<string, string> {
  const timespan = String(Math.floor(Date.now() / 1000));
  const token = crypto.createHash('md5').update(CFG.key + timespan + CFG.secret).digest('hex').toUpperCase();
  return { Token: token, Timespan: timespan };
}

export interface QccCompany {
  keyNo: string;        // 企查查公司ID
  name: string;         // 公司名
  creditCode?: string;  // 统一社会信用代码
  operName?: string;    // 法人
  status?: string;      // 经营状态
  startDate?: string;
  address?: string;
}

export const qccEnabled = () => CFG.enabled;

/** 模糊搜索企业（名称补全）。未配置凭据或失败时返回 null 交由调用方降级。 */
export async function fuzzySearch(searchKey: string, pageIndex = 1): Promise<QccCompany[] | null> {
  if (!CFG.enabled || !searchKey.trim()) return null;
  const url = `${CFG.base}/FuzzySearch/GetList?key=${encodeURIComponent(CFG.key)}&searchKey=${encodeURIComponent(searchKey)}&pageIndex=${pageIndex}`;
  try {
    const res = await fetch(url, { headers: authHeaders(), signal: AbortSignal.timeout(8000) });
    const body = (await res.json()) as any;
    // 企查查约定：Status "200" 成功；Result 为数组
    if (String(body.Status) !== '200' || !Array.isArray(body.Result)) {
      console.warn('[qcc] FuzzySearch non-200:', body.Status, body.Message);
      return null;
    }
    return body.Result.map((r: any) => ({
      keyNo: r.KeyNo,
      name: r.Name,
      creditCode: r.CreditCode,
      operName: r.OperName,
      status: r.Status,
      startDate: r.StartDate,
      address: r.Address ?? r.No ?? undefined,
    }));
  } catch (e) {
    console.warn('[qcc] FuzzySearch failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

export interface QccGroup {
  groupKeyNo: string;   // 集团标识
  groupName: string;    // 集团名称
}

/**
 * 查询企业所属集团（searchKey=统一社会信用代码或企业名称）。
 * 返回：QccGroup=有集团；null=确认无集团(201查空)；undefined=接口出错/风控（调用方应降级兜底）。
 */
export async function belongGroup(searchKey: string): Promise<QccGroup | null | undefined> {
  if (!CFG.enabled || !searchKey.trim()) return undefined;
  const url = `${CFG.base}/BelongGroup/GetInfo?key=${encodeURIComponent(CFG.key)}&searchKey=${encodeURIComponent(searchKey)}`;
  try {
    const res = await fetch(url, { headers: authHeaders(), signal: AbortSignal.timeout(8000) });
    const body = (await res.json()) as any;
    if (String(body.Status) === '201') return null; // 查空：确认无集团
    if (String(body.Status) !== '200' || !body.Result) {
      console.warn('[qcc] BelongGroup non-200:', body.Status, body.Message);
      return undefined; // 出错/风控（如 121 数据不能出境）→ 降级
    }
    // 实测结构：Result.Data = {GroupId, Name, MainName, ActualControlName, Count...}
    const r = body.Result?.Data ?? body.Result;
    const groupName = r?.Name ?? r?.GroupName;
    const groupKeyNo = r?.GroupId ?? r?.GroupKeyNo ?? (groupName ? `QCCGRP:${groupName}` : null);
    if (!groupName || !groupKeyNo) return null;
    return { groupKeyNo: String(groupKeyNo), groupName: String(groupName) };
  } catch (e) {
    console.warn('[qcc] BelongGroup failed:', e instanceof Error ? e.message : e);
    return undefined; // 网络异常 → 降级
  }
}
