import { one } from '../db.js';

// 系统设置读写（带 60s 缓存；写入即失效）
const cache = new Map<string, { v: string | null; at: number }>();
const TTL = 60_000;

export async function getSetting(orgId: number, key: string): Promise<string | null> {
  const ck = `${orgId}:${key}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < TTL) return hit.v;
  const row = await one<{ value: string | null }>(
    `SELECT value FROM system_setting WHERE organization_id=$1 AND key=$2`,
    [orgId, key],
  );
  const v = row?.value ?? null;
  cache.set(ck, { v, at: Date.now() });
  return v;
}

export async function setSetting(orgId: number, key: string, value: string | null): Promise<void> {
  await one(
    `INSERT INTO system_setting (organization_id, key, value) VALUES ($1,$2,$3)
     ON CONFLICT (organization_id, key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
    [orgId, key, value],
  );
  cache.set(`${orgId}:${key}`, { v: value, at: Date.now() });
}
