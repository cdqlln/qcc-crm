import { one, query } from '../db.js';

// 归属追溯：线索/客户/商机 负责人变更全量留痕（谁、何时、通过什么动作、从谁到谁）
export type OwnerVia = 'init' | 'claim' | 'assign' | 'pool' | 'transfer' | 'edit' | 'unlink';
export type OwnerEntity = 'lead' | 'customer' | 'opportunity';

export async function logOwnerChange(
  orgId: number, entityType: OwnerEntity, entityId: number,
  fromUserId: number | null, toUserId: number | null,
  via: OwnerVia, operatorId: number | null, remark?: string,
): Promise<void> {
  await one(
    `INSERT INTO owner_change_log (organization_id, entity_type, entity_id, from_user_id, to_user_id, via, operator_id, remark)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING log_id`,
    [orgId, entityType, entityId, fromUserId, toUserId, via, operatorId, remark?.slice(0, 200) ?? null],
  ).catch((e) => console.warn('[owner-trace] log failed:', e instanceof Error ? e.message : e)); // 留痕失败不阻断业务
}

export async function listOwnerLogs(orgId: number, entityId: number, types: OwnerEntity[]) {
  const rows = await query<any>(
    `SELECT l.*, f.name AS from_name, t.name AS to_name, o.name AS operator_name
     FROM owner_change_log l
     LEFT JOIN app_user f ON f.user_id = l.from_user_id
     LEFT JOIN app_user t ON t.user_id = l.to_user_id
     LEFT JOIN app_user o ON o.user_id = l.operator_id
     WHERE l.organization_id=$1 AND l.entity_id=$2 AND l.entity_type = ANY($3)
     ORDER BY l.log_id DESC LIMIT 100`,
    [orgId, entityId, types],
  );
  return rows.map((r: any) => ({
    logId: Number(r.log_id),
    entityType: r.entity_type,
    entityId: Number(r.entity_id),
    fromUserId: r.from_user_id,
    fromName: r.from_name ?? '',
    toUserId: r.to_user_id,
    toName: r.to_name ?? '',
    via: r.via,
    operatorId: r.operator_id,
    operatorName: r.operator_name ?? '',
    remark: r.remark ?? '',
    createDate: r.created_at,
  }));
}
