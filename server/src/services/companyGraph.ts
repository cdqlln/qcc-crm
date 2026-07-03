import { one } from '../db.js';
import { belongGroup, getQccCfg } from './qcc.js';

export interface GroupRel {
  extKey: string;       // 集团外部标识
  groupName: string;    // 集团名称
}

/**
 * 解析公司的集团关系 —— 只用真实外部数据，绝不按字号臆造集团：
 *  1) 配置了企查查凭据 → BelongGroup/GetInfo（有集团=归集；查空=独立；出错→2)）
 *  2) company_relation 映射表（外部数据镜像/人工同步）
 *  3) 均无 → 独立键（不成组，保留人工调整入口）
 */
export async function resolveGroup(orgId: number, refCompanyId: string | null | undefined, name: string): Promise<GroupRel> {
  const cfg = await getQccCfg(orgId);
  if (cfg.enabled) {
    const g = await belongGroup(orgId, name);
    if (g) return { extKey: g.groupKeyNo, groupName: g.groupName };
    // null=确认无集团 → 独立；undefined=接口出错/风控 → 继续查映射表
    if (g === null) return { extKey: `SOLO:${refCompanyId ?? name}`, groupName: '' };
  }
  if (refCompanyId) {
    const rel = await one<{ ext_key: string; group_name: string }>(
      `SELECT ext_key, group_name FROM company_relation WHERE ref_company_id=$1`,
      [refCompanyId],
    );
    if (rel) return { extKey: rel.ext_key, groupName: rel.group_name };
  }
  // 无外部数据支撑 → 不臆造集团
  return { extKey: `SOLO:${refCompanyId ?? name}`, groupName: '' };
}
