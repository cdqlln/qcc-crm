import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, MessageSquare, ScrollText, Send, ShieldCheck, XCircle } from 'lucide-react';
import { contractsApi } from '@/api/crm';
import { usePerm } from '@/store/auth';
import { useUI } from '@/store/ui';
import { Button } from '@/components/ui/primitives';
import { StatusTag } from '@/components/ui/StatusTag';
import { Timeline } from '@/components/ui/Timeline';
import { formatDate } from '@/lib/format';
import type { Contract } from '@/types';

export const REVIEW_STATUS: Record<number, { label: string; kind: 'info' | 'success' | 'warning' | 'danger' | 'neutral' }> = {
  0: { label: '未送审', kind: 'neutral' },
  1: { label: '待法务审核', kind: 'warning' },
  2: { label: '法务已通过', kind: 'success' },
  3: { label: '法务已驳回', kind: 'danger' },
};

const ACTION_META: Record<number, { title: string; kind: 'info' | 'success' | 'warning' | 'danger' | 'neutral' }> = {
  1: { title: '提交法务审核', kind: 'info' },
  2: { title: '法务审核通过', kind: 'success' },
  3: { title: '法务驳回', kind: 'danger' },
  4: { title: '协同留言', kind: 'neutral' },
};

/**
 * 合同法务审核 + 销售协同：
 *  销售提交送审 → 法务（contract.review 权限）通过/驳回（驳回必填意见）→ 驳回后可修改重新送审；
 *  全过程留痕，双方可随时协同留言；审核通过是开票的前置条件。
 */
export function ContractReviewTab({ contract }: { contract: Contract }) {
  const { can } = usePerm();
  const qc = useQueryClient();
  const toast = useUI((s) => s.toast);
  const rs = contract.reviewStatus ?? 0;
  const [opinion, setOpinion] = useState('');
  const [msg, setMsg] = useState('');

  const { data: reviews = [] } = useQuery({
    queryKey: ['contract-reviews', contract.contractId],
    queryFn: () => contractsApi.reviews(contract.contractId),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['contract', contract.contractId] });
    qc.invalidateQueries({ queryKey: ['contract-reviews', contract.contractId] });
    qc.invalidateQueries({ queryKey: ['contracts'] });
  };

  const submit = useMutation({
    mutationFn: () => contractsApi.submitReview(contract.contractId, opinion.trim() || undefined),
    onSuccess: () => { toast('已提交法务审核，法务收到待办后将尽快处理', 'success'); setOpinion(''); refresh(); },
    onError: (e) => toast(e instanceof Error ? e.message : '提交失败', 'error'),
  });
  const decide = useMutation({
    mutationFn: (pass: boolean) => contractsApi.review(contract.contractId, pass, opinion.trim()),
    onSuccess: (_d, pass) => { toast(pass ? '已通过法务审核' : '已驳回，销售将收到待办与意见', pass ? 'success' : 'info'); setOpinion(''); refresh(); },
    onError: (e) => toast(e instanceof Error ? e.message : '操作失败', 'error'),
  });
  const comment = useMutation({
    mutationFn: () => contractsApi.reviewComment(contract.contractId, msg.trim()),
    onSuccess: () => { setMsg(''); qc.invalidateQueries({ queryKey: ['contract-reviews', contract.contractId] }); },
    onError: (e) => toast(e instanceof Error ? e.message : '发送失败', 'error'),
  });

  return (
    <div className="space-y-5">
      {/* 状态与操作区 */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-4">
        <ShieldCheck size={18} className="text-primary" />
        <StatusTag {...REVIEW_STATUS[rs]} />
        <span className="text-sm text-text-weak">
          {rs === 0 && '合同签署前请提交法务审核；通过后方可开票。'}
          {rs === 1 && '法务审核中——可在下方留言补充说明，与法务实时协同。'}
          {rs === 2 && '法务审核已通过，可正常开票与执行。'}
          {rs === 3 && '已驳回——请根据审核意见修改后重新送审。'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {(rs === 0 || rs === 3) && (
            <Button variant="primary" size="sm" onClick={() => submit.mutate()} disabled={submit.isPending}>
              <ScrollText size={13} />{rs === 3 ? '重新送审' : '提交法务审核'}
            </Button>
          )}
          {rs === 1 && can('contract.review') && (
            <>
              <Button variant="primary" size="sm" onClick={() => decide.mutate(true)} disabled={decide.isPending}>
                <CheckCircle2 size={13} />通过
              </Button>
              <Button variant="danger" size="sm" onClick={() => decide.mutate(false)} disabled={decide.isPending}>
                <XCircle size={13} />驳回
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 审核意见输入（送审附言 / 法务意见共用） */}
      {(rs === 0 || rs === 3 || (rs === 1 && can('contract.review'))) && (
        <textarea
          value={opinion}
          onChange={(e) => setOpinion(e.target.value)}
          rows={2}
          placeholder={rs === 1 ? '审核意见（驳回时必填，如：付款条款第 3.2 条与公司模板不符…）' : '送审附言（可选，如：客户要求本周内用印）'}
          className="w-full rounded-md border border-border bg-surface p-3 text-sm outline-none focus:border-primary"
        />
      )}

      {/* 审核过程时间线 */}
      {reviews.length === 0 ? (
        <div className="rounded-lg bg-bg p-4 text-center text-sm text-text-faint">尚无审核记录</div>
      ) : (
        <Timeline
          items={reviews.map((r) => ({
            id: r.reviewId,
            kind: ACTION_META[r.action]?.kind ?? 'neutral',
            title: `${ACTION_META[r.action]?.title ?? ''} · ${r.createByName}`,
            meta: formatDate(r.createDate, 'MM-DD HH:mm'),
            body: r.comment || undefined,
          }))}
        />
      )}

      {/* 协同留言 */}
      <div className="flex items-center gap-2 border-t border-border pt-4">
        <MessageSquare size={15} className="shrink-0 text-text-faint" />
        <input
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && msg.trim() && comment.mutate()}
          placeholder="给对方留言（法务↔销售 协同讨论，全程留痕）…"
          className="h-9 flex-1 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
        />
        <Button size="sm" onClick={() => msg.trim() && comment.mutate()} disabled={comment.isPending || !msg.trim()}>
          <Send size={13} />发送
        </Button>
      </div>
    </div>
  );
}
