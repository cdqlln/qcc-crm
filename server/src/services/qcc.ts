import crypto from 'node:crypto';
import { getSetting } from './settings.js';

// 企查查开放平台客户端
// 鉴权：Headers Token = MD5(key + Timespan + SecretKey) 大写；Timespan = Unix 秒
// 凭据来源：system_setting（管理员端配置，优先） → 环境变量（兜底）
export interface QccCfg {
  base: string;
  key: string;
  secret: string;
  enabled: boolean;
}

export async function getQccCfg(orgId: number): Promise<QccCfg> {
  const [dbKey, dbSecret, dbBase] = await Promise.all([
    getSetting(orgId, 'qcc.key'),
    getSetting(orgId, 'qcc.secret'),
    getSetting(orgId, 'qcc.base'),
  ]);
  const key = dbKey || process.env.QCC_API_KEY || '';
  const secret = dbSecret || process.env.QCC_SECRET_KEY || '';
  const base = dbBase || process.env.QCC_API_BASE || 'https://api.qichacha.com';
  return { base, key, secret, enabled: !!(key && secret) };
}

function authHeaders(cfg: QccCfg): Record<string, string> {
  const timespan = String(Math.floor(Date.now() / 1000));
  const token = crypto.createHash('md5').update(cfg.key + timespan + cfg.secret).digest('hex').toUpperCase();
  return { Token: token, Timespan: timespan };
}

export interface QccCompany {
  keyNo: string;
  name: string;
  creditCode?: string;
  operName?: string;
  status?: string;
  startDate?: string;
  address?: string;
}

/** 模糊搜索企业（名称补全）。未配置/失败返回 null。 */
export async function fuzzySearch(orgId: number, searchKey: string, pageIndex = 1): Promise<QccCompany[] | null> {
  const cfg = await getQccCfg(orgId);
  if (!cfg.enabled || !searchKey.trim()) return null;
  const url = `${cfg.base}/FuzzySearch/GetList?key=${encodeURIComponent(cfg.key)}&searchKey=${encodeURIComponent(searchKey)}&pageIndex=${pageIndex}`;
  try {
    const res = await fetch(url, { headers: authHeaders(cfg), signal: AbortSignal.timeout(8000) });
    const body = (await res.json()) as any;
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
  groupKeyNo: string;
  groupName: string;
}

/**
 * 查询企业所属集团（searchKey=统一社会信用代码或企业名称）。
 * 返回：QccGroup=有集团；null=确认无集团(201查空)；undefined=未配置/接口出错（调用方降级）。
 */
export async function belongGroup(orgId: number, searchKey: string): Promise<QccGroup | null | undefined> {
  const cfg = await getQccCfg(orgId);
  if (!cfg.enabled || !searchKey.trim()) return undefined;
  const url = `${cfg.base}/BelongGroup/GetInfo?key=${encodeURIComponent(cfg.key)}&searchKey=${encodeURIComponent(searchKey)}`;
  try {
    const res = await fetch(url, { headers: authHeaders(cfg), signal: AbortSignal.timeout(8000) });
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
