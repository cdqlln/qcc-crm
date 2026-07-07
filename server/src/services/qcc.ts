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

/** 通用计数核查（失信/经营异常等列表接口）：返回记录数；null=接口出错/未配置（调用方降级，不臆造） */
async function countCheck(orgId: number, path: string, searchKey: string): Promise<number | null> {
  const cfg = await getQccCfg(orgId);
  if (!cfg.enabled || !searchKey.trim()) return null;
  const url = `${cfg.base}/${path}?key=${encodeURIComponent(cfg.key)}&searchKey=${encodeURIComponent(searchKey)}&pageIndex=1&pageSize=10`;
  try {
    const res = await fetch(url, { headers: authHeaders(cfg), signal: AbortSignal.timeout(8000) });
    const body = (await res.json()) as any;
    if (String(body.Status) === '201') return 0; // 查空 = 确认无记录
    if (String(body.Status) !== '200') {
      console.warn(`[qcc] ${path} non-200:`, body.Status, body.Message);
      return null;
    }
    const total = body.Paging?.TotalRecords ?? body.Paging?.TotalRecord;
    if (total != null) return Number(total);
    return Array.isArray(body.Result) ? body.Result.length : 0;
  } catch (e) {
    console.warn(`[qcc] ${path} failed:`, e instanceof Error ? e.message : e);
    return null;
  }
}

export interface RiskTag { label: string; kind: 'success' | 'warning' | 'danger' | 'neutral' }

/**
 * 风险核查（真实企查查接口）：失信被执行 ShiXin/GetList + 经营异常 ECIException/GetList。
 * 未配置凭据 → enabled:false；单项接口失败 → 该项标注「核查失败」，绝不臆造结论。
 */
export async function riskScan(orgId: number, companyName: string): Promise<{ enabled: boolean; tags: RiskTag[] }> {
  const cfg = await getQccCfg(orgId);
  if (!cfg.enabled) return { enabled: false, tags: [] };
  // 接口路径随账号开通的产品可能不同 → 支持 system_setting 覆盖（qcc.path.shixin / qcc.path.exception）
  const [shixinPath, exceptionPath] = await Promise.all([
    getSetting(orgId, 'qcc.path.shixin'),
    getSetting(orgId, 'qcc.path.exception'),
  ]);
  const [shixin, exception] = await Promise.all([
    countCheck(orgId, shixinPath || 'ShiXin/GetList', companyName),
    countCheck(orgId, exceptionPath || 'ECIException/GetList', companyName),
  ]);
  const tags: RiskTag[] = [
    shixin == null ? { label: '失信核查未获得（接口未开通或网络受限）', kind: 'neutral' }
      : shixin > 0 ? { label: `失信被执行 ${shixin} 条`, kind: 'danger' }
      : { label: '无失信记录', kind: 'success' },
    exception == null ? { label: '经营异常核查未获得（接口未开通或网络受限）', kind: 'neutral' }
      : exception > 0 ? { label: `经营异常 ${exception} 条`, kind: 'warning' }
      : { label: '经营正常', kind: 'success' },
  ];
  return { enabled: true, tags };
}

export interface QccGroup {
  groupKeyNo: string;
  groupName: string;
}

/**
 * 查询企业所属集团（searchKey=统一社会信用代码或企业名称），可能命中多个集团。
 * 返回：QccGroup[]=候选集团（多个时调用方默认第一个）；null=确认无集团(201查空)；
 *       undefined=未配置/接口出错（调用方降级，不臆造）。
 */
export async function belongGroups(orgId: number, searchKey: string): Promise<QccGroup[] | null | undefined> {
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
    // 实测结构：Result.Data = {GroupId, Name, MainName, ActualControlName, Count...}；部分企业可能返回多条（数组）
    const raw = body.Result?.Data ?? body.Result;
    const arr = Array.isArray(raw) ? raw : [raw];
    const list: QccGroup[] = [];
    for (const r of arr) {
      const groupName = r?.Name ?? r?.GroupName;
      const groupKeyNo = r?.GroupId ?? r?.GroupKeyNo ?? (groupName ? `QCCGRP:${groupName}` : null);
      if (groupName && groupKeyNo) list.push({ groupKeyNo: String(groupKeyNo), groupName: String(groupName) });
    }
    return list.length ? list : null;
  } catch (e) {
    console.warn('[qcc] BelongGroup failed:', e instanceof Error ? e.message : e);
    return undefined; // 网络异常 → 降级
  }
}

/** 单集团口径（多候选默认第一个）：自动归集用 */
export async function belongGroup(orgId: number, searchKey: string): Promise<QccGroup | null | undefined> {
  const list = await belongGroups(orgId, searchKey);
  if (list === null || list === undefined) return list;
  return list[0] ?? null;
}
