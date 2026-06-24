import { one } from '../db.js';

// 企查查工商关系配置（生产）：填 QCC_API_KEY 即走真实接口
const QCC = {
  base: process.env.QCC_API_BASE ?? 'https://api.qcc.com',
  key: process.env.QCC_API_KEY ?? '',
  get enabled() {
    return !!this.key;
  },
};

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
 *  1) 配置了企查查 API → 调实控人/集团接口；
 *  2) 否则查 company_relation 映射表（开发/演示）；
 *  3) 再否则按字号兜底。
 */
export async function resolveGroup(refCompanyId: string | null | undefined, name: string): Promise<GroupRel> {
  if (refCompanyId && QCC.enabled) {
    try {
      const r = (await fetch(`${QCC.base}/ECIGroupMember/GetList?key=${QCC.key}&keyword=${encodeURIComponent(refCompanyId)}`).then((x) => x.json())) as any;
      const ext = r?.Result?.GroupId || r?.Result?.HolderKeyNo;
      const gname = r?.Result?.GroupName || r?.Result?.HolderName;
      if (ext) return { extKey: String(ext), groupName: gname || `${nameToKey(name)}集团` };
    } catch {
      /* 失败则降级 */
    }
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
