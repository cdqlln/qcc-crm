import { one } from '../db.js';
import { belongGroup, qccEnabled } from './qcc.js';

export interface GroupRel {
  extKey: string;       // 集团/实控人外部标识
  groupName: string;    // 集团名称
}

// 取字号（公司名去后缀的核心词）作兜底标识
function nameToKey(name: string): string {
  const core = name.replace(/(股份)?有限公司|集团|科技|信息技术|网络科技|智能科技|数据服务|电子商务|分公司|\(.*?\)|（.*?）/g, '').trim();
  return core.slice(0, 6) || name.slice(0, 6);
}

/**
 * 解析公司的集团关系：
 *  1) 配置了企查查凭据 → 调 BelongGroup/GetInfo（searchKey 优先信用代码/名称）；
 *  2) 否则查 company_relation 映射表（开发/演示）；
 *  3) 再否则按字号兜底。
 */
export async function resolveGroup(refCompanyId: string | null | undefined, name: string): Promise<GroupRel> {
  if (qccEnabled()) {
    // BelongGroup 支持 统一社会信用代码 或 企业名称
    const g = await belongGroup(name);
    if (g) return { extKey: g.groupKeyNo, groupName: g.groupName };
    // null=确认无集团：返回独立键，避免把无关公司拼在一起；
    // undefined=接口出错/风控（如境外IP 121）：继续走下方映射表/字号兜底
    if (g === null) return { extKey: `SOLO:${refCompanyId ?? name}`, groupName: '' };
  }
  if (refCompanyId) {
    const rel = await one<{ ext_key: string; group_name: string }>(
      `SELECT ext_key, group_name FROM company_relation WHERE ref_company_id=$1`,
      [refCompanyId],
    );
    if (rel) return { extKey: rel.ext_key, groupName: rel.group_name };
  }
  const key = nameToKey(name);
  return { extKey: `NAME:${key}`, groupName: `${key}集团` };
}
