import type { StatusKind } from '@/types';

// 业务固定枚举的标签与配色（非字典项；可配置项仍走 terms）

// 报价单类型（政府/国企招投标）：1询价 2报价 3标书 4框架协议
export const QUOTE_TYPE: Record<number, { label: string; kind: StatusKind }> = {
  1: { label: '询价', kind: 'neutral' },
  2: { label: '报价', kind: 'info' },
  3: { label: '标书', kind: 'warning' },
  4: { label: '框架协议', kind: 'success' },
};
export const QUOTE_TYPE_OPTIONS = [1, 2, 3, 4].map((v) => ({ value: v, label: QUOTE_TYPE[v].label }));

// 产品大类：1数据 2产品
export const PRODUCT_KIND: Record<number, { label: string; kind: StatusKind }> = {
  1: { label: '数据', kind: 'info' },
  2: { label: '产品', kind: 'success' },
};

// 交付方式：1 API 2 离线数据包 3 账号 4 订阅
export const DELIVERY_TYPE: Record<number, string> = {
  1: 'API',
  2: '离线数据包',
  3: '账号',
  4: '订阅',
};

/** 按采购数量从阶梯价中解析单价（取数量落入的区间） */
export function resolveTierPrice(
  tiers: { minQty: number; maxQty?: number | null; unitPrice: string }[],
  qty: number,
): string | undefined {
  if (!tiers || tiers.length === 0) return undefined;
  const hit = tiers.find((t) => qty >= t.minQty && (t.maxQty == null || qty <= t.maxQty));
  return (hit ?? tiers[tiers.length - 1]).unitPrice;
}
