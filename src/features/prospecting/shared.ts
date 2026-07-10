import type { StatusKind } from '@/types';

// 名单目标状态（第五/六条）
export const TARGET_STATUS: Record<number, { label: string; kind: StatusKind }> = {
  1: { label: '待承接', kind: 'info' },
  2: { label: '跟进中', kind: 'warning' },
  3: { label: '已转商机', kind: 'success' },
  4: { label: '冷冻', kind: 'neutral' },
  5: { label: '已收回', kind: 'danger' },
};

// 名单批次状态
export const LIST_STATUS: Record<number, { label: string; kind: StatusKind }> = {
  1: { label: '草稿', kind: 'neutral' },
  2: { label: '已发布', kind: 'success' },
  3: { label: '归档', kind: 'neutral' },
};

// 信号类型（第七条）：SLA 与对应动作
export const SIGNAL_TYPE: Record<number, { label: string; kind: StatusKind; sla: string; action: string }> = {
  1: { label: '监管信号', kind: 'danger', sla: '48小时触达', action: '场景卡方案直达合规/风控部门' },
  2: { label: '预算信号', kind: 'warning', sla: '24小时报备', action: '启动引导标动作，需求编制期介入' },
  3: { label: '换约信号', kind: 'info', sla: '提前布局(14天)', action: '换约作战计划，对比方案+POC预约' },
  4: { label: '扩张信号', kind: 'success', sla: '1周内触达', action: '以扩张场景切入' },
};

// 信号处置结论（第八条）
export const DISPOSITION: Record<number, { label: string; kind: StatusKind }> = {
  1: { label: '已触达', kind: 'info' },
  2: { label: '转商机', kind: 'success' },
  3: { label: '信号误报', kind: 'danger' },
  4: { label: '暂缓', kind: 'neutral' },
};

// 战役状态（第十五条）
export const CAMPAIGN_STATUS: Record<number, { label: string; kind: StatusKind }> = {
  1: { label: '立项', kind: 'info' },
  2: { label: '进行中', kind: 'warning' },
  3: { label: '复盘', kind: 'info' },
  4: { label: '结束', kind: 'neutral' },
};

// 白空间格标记（第九条）
export const WS_STATUS: Record<number, { label: string; kind: StatusKind }> = {
  2: { label: '已验证需求', kind: 'danger' },
  3: { label: '跟进中', kind: 'warning' },
  4: { label: '已转商机', kind: 'success' },
};

export const LINES = ['B线', 'G线', 'S线', '区域'];

export function currentQuarter(): string {
  const d = new Date();
  return `${d.getFullYear()}Q${Math.floor(d.getMonth() / 3) + 1}`;
}

export const pct = (v: number) => `${(v * 100).toFixed(v >= 0.995 || v === 0 ? 0 : 1)}%`;
