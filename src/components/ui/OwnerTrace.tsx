import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { customersApi } from '@/api/crm';
import { Timeline } from '@/components/ui/Timeline';
import { formatDate } from '@/lib/format';
import type { OwnerLog } from '@/types';

const VIA_LABEL: Record<OwnerLog['via'], string> = {
  init: '建档归属', claim: '领取', assign: '分配', pool: '退回线索池',
  transfer: '移交', edit: '调整', unlink: '解除转化关联',
};
const VIA_KIND: Record<OwnerLog['via'], 'info' | 'success' | 'warning' | 'danger' | 'neutral'> = {
  init: 'neutral', claim: 'info', assign: 'warning', pool: 'danger', transfer: 'warning', edit: 'info', unlink: 'danger',
};

/** 归属追溯：负责人变更完整历史（线索/客户/商机通用） */
export function OwnerTrace({ entityId, types, title = '归属追溯' }: { entityId: number; types: string; title?: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['owner-logs', entityId, types],
    queryFn: () => customersApi.ownerLogs(entityId, types),
  });

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-text">
        <History size={14} className="text-primary" />{title}
      </div>
      {isLoading ? (
        <div className="skeleton h-16 w-full" />
      ) : data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-3 text-xs text-text-faint">
          暂无负责人变更记录（建档/领取/分配/移交等将自动留痕）
        </div>
      ) : (
        <Timeline
          items={data.map((l) => ({
            id: l.logId,
            kind: VIA_KIND[l.via] ?? 'neutral',
            title: `${VIA_LABEL[l.via] ?? l.via}：${l.fromName || '（无负责人）'} → ${l.toName || '（进入池/公海）'}`,
            meta: `${l.operatorName || '系统'} · ${formatDate(l.createDate, 'YYYY-MM-DD HH:mm')}`,
            body: l.remark || undefined,
          }))}
        />
      )}
    </div>
  );
}
