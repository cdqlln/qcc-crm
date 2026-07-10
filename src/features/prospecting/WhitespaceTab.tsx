import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { prospectingApi } from '@/api/crm';
import { useUI } from '@/store/ui';
import { Button } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/Dialog';
import { StatusTag } from '@/components/ui/StatusTag';
import { Field, Select, TextInput } from '@/components/ui/form';
import { TableSkeleton } from '@/components/ui/states';
import { cn } from '@/lib/cn';
import { WS_STATUS, pct } from './shared';

// 引擎三：存量客户 × SKU 白空间矩阵（第九条）
//   实格 = 合同/商机产品行推导；白格可标记（越界信号→已验证需求优先跟进）
export function WhitespaceTab() {
  const qc = useQueryClient();
  const toast = useUI((s) => s.toast);
  const q = useQuery({ queryKey: ['prospect-whitespace'], queryFn: prospectingApi.whitespace });
  const [cell, setCell] = useState<{ customerId: number; customerName: string; productId: number; productName: string; status: number | null; note: string } | null>(null);

  if (q.isLoading) return <TableSkeleton rows={8} cols={8} />;
  const data = q.data;
  if (!data) return null;

  const save = async (status: number | null, note: string) => {
    if (!cell) return;
    try {
      await prospectingApi.setWhitespace({ customerId: cell.customerId, productId: cell.productId, status, note: note || undefined });
      toast(status == null ? '已清除标记' : '白格已标记', 'success');
      setCell(null);
      void qc.invalidateQueries({ queryKey: ['prospect-whitespace'] });
    } catch (e) {
      toast(e instanceof Error ? e.message : '保存失败', 'error');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded-md bg-bg px-3 py-1.5">存量客户 <b className="tabular-nums">{data.stats.customerCount}</b></span>
        <span className="rounded-md bg-bg px-3 py-1.5">多SKU客户占比 <b className="tabular-nums text-primary">{pct(data.stats.multiSkuRatio)}</b></span>
        <span className="rounded-md bg-bg px-3 py-1.5">户均SKU <b className="tabular-nums text-primary">{data.stats.avgSku.toFixed(1)}</b></span>
        <span className="flex items-center gap-2 text-xs text-text-faint">
          <span className="inline-block h-3.5 w-3.5 rounded-sm bg-primary" /> 已签（实格）
          <span className="inline-block h-3.5 w-3.5 rounded-sm border border-border bg-surface" /> 白空间
          {Object.entries(WS_STATUS).map(([k, v]) => <StatusTag key={k} {...v} dot={false} />)}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg/60 text-left text-xs text-text-faint">
              <th className="sticky left-0 z-10 bg-bg px-3 py-2 font-medium">客户 \ SKU</th>
              {data.products.map((p) => (
                <th key={p.productId} className="px-2 py-2 text-center font-medium" title={p.name}>
                  <div className="max-w-24 truncate">{p.name}</div>
                  <div className="font-normal text-text-faint">{p.code}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.customerId} className="border-b border-border/60 last:border-0 hover:bg-bg/40">
                <td className="sticky left-0 z-10 bg-surface px-3 py-1.5">
                  <div className="max-w-52 truncate font-medium text-text">{r.customerName}</div>
                  <div className="text-xs text-text-faint">{r.industry || '—'} · {r.ownedProductIds.length} SKU</div>
                </td>
                {data.products.map((p) => {
                  const owned = r.ownedProductIds.includes(p.productId);
                  const flag = r.flags[p.productId];
                  return (
                    <td key={p.productId} className="px-2 py-1.5 text-center">
                      {owned ? (
                        <span className="inline-block h-5 w-5 rounded-sm bg-primary" title="已签" />
                      ) : (
                        <button
                          className={cn(
                            'inline-block h-5 w-5 rounded-sm border transition-colors',
                            flag
                              ? flag.status === 2
                                ? 'border-danger bg-[#FDECEC]'
                                : flag.status === 3
                                  ? 'border-warning bg-[#FEF3E0]'
                                  : 'border-success bg-[#E7F7F0]'
                              : 'border-border bg-surface hover:border-primary',
                          )}
                          title={flag ? `${WS_STATUS[flag.status].label}${flag.note ? `：${flag.note}` : ''}` : '白空间 · 点击标记'}
                          onClick={() =>
                            setCell({
                              customerId: r.customerId,
                              customerName: r.customerName,
                              productId: p.productId,
                              productName: p.name,
                              status: flag?.status ?? null,
                              note: flag?.note ?? '',
                            })
                          }
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {data.rows.length === 0 && <div className="p-8 text-center text-sm text-text-faint">暂无存量客户</div>}
      </div>

      {cell && <CellDialog cell={cell} onClose={() => setCell(null)} onSave={save} />}
    </div>
  );
}

function CellDialog({
  cell,
  onClose,
  onSave,
}: {
  cell: { customerName: string; productName: string; status: number | null; note: string };
  onClose: () => void;
  onSave: (status: number | null, note: string) => Promise<void>;
}) {
  const [status, setStatus] = useState<number>(cell.status ?? 2);
  const [note, setNote] = useState(cell.note);
  return (
    <Dialog
      open
      onClose={onClose}
      title={`标记白格 · ${cell.customerName} × ${cell.productName}`}
      footer={
        <>
          {cell.status != null && <Button onClick={() => void onSave(null, '')}>清除标记</Button>}
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={() => void onSave(status, note)}>保存</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="标记" required hint="越界使用预警自动标记为已验证需求（客户用行为投票），优先跟进">
          <Select value={status} onChange={(e) => setStatus(Number(e.target.value))}>
            {Object.entries(WS_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </Field>
        <Field label="备注" hint="同族白格由客户成功随续约推进；跨族白格按新商机报备">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="需求来源 / 推进方式…" />
        </Field>
      </div>
    </Dialog>
  );
}
