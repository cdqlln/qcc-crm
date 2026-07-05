import { Dialog } from '@/components/ui/Dialog';
import { Descriptions } from '@/components/ui/Descriptions';
import { Button } from '@/components/ui/primitives';
import { formatDate } from '@/lib/format';
import type { Customer } from '@/types';

/** 查看原线索：展示转化那一刻固化的线索快照（不随客户后续编辑变化） */
export function LeadOriginDialog({ cust, onClose }: { cust: Customer; onClose: () => void }) {
  const s = cust.leadSnapshot;
  return (
    <Dialog open title="原线索信息（转化留痕）" onClose={onClose} footer={<Button onClick={onClose}>关闭</Button>}>
      <p className="mb-4 rounded-md bg-primary-weak/60 px-3 py-2 text-xs text-primary">
        该客户由线索转化而来，转化时间 {formatDate(cust.convertedAt, 'YYYY-MM-DD HH:mm')}。以下为转化那一刻的线索原貌。
      </p>
      {!s ? (
        <p className="text-sm text-text-faint">未记录线索快照（历史数据在留痕功能上线前转化）。</p>
      ) : (
        <Descriptions
          columns={2}
          items={[
            { label: '线索名称', value: s.name },
            { label: '线索来源', value: s.sourceName || '—' },
            { label: '线索分组', value: s.poolGroupName || '—' },
            { label: '行业', value: s.industry || '—' },
            { label: '地区', value: s.region || '—' },
            { label: '联系人', value: s.phoneName || '—' },
            { label: '联系电话', value: s.phone || '—' },
            { label: '转化前负责人', value: s.leaderName || '—' },
            { label: '转化前跟进次数', value: String(s.trackingNum) },
            { label: '线索创建时间', value: formatDate(s.createdAt) },
            { label: '领取时间', value: s.claimAt ? formatDate(s.claimAt) : '—' },
            { label: '分配时间', value: s.assignAt ? formatDate(s.assignAt) : '—' },
            ...(s.utmSource || s.utmMedium || s.utmCampaign
              ? [{ label: 'UTM 归因', value: [s.utmSource, s.utmMedium, s.utmCampaign].filter(Boolean).join(' / ') }]
              : []),
          ]}
        />
      )}
    </Dialog>
  );
}
