import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ticketsApi } from '@/api/crm';
import { useListQuery } from '@/hooks/useListQuery';
import { useUI } from '@/store/ui';
import { useTerm } from '@/hooks/useTerms';
import { PageHeader, SearchInput } from '@/components/ui/PageHeader';
import { Button, UserCell } from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Tabs } from '@/components/ui/Tabs';
import { StatusTag } from '@/components/ui/StatusTag';
import { Drawer } from '@/components/ui/Drawer';
import { Dialog } from '@/components/ui/Dialog';
import { Descriptions } from '@/components/ui/Descriptions';
import { Timeline } from '@/components/ui/Timeline';
import { Field, Select, TextArea, TextInput } from '@/components/ui/form';
import { TableSkeleton } from '@/components/ui/states';
import { MOCK_USERS, userName } from '@/mock/org';
import { formatDateTime } from '@/lib/format';
import type { Ticket } from '@/types';

const STATUS: Record<number, { label: string; kind: 'warning' | 'info' | 'success' | 'neutral' }> = {
  1: { label: '待处理', kind: 'warning' },
  2: { label: '处理中', kind: 'info' },
  3: { label: '已解决', kind: 'success' },
  4: { label: '已关闭', kind: 'neutral' },
};
const PRIORITY: Record<number, { label: string; kind: 'neutral' | 'info' | 'danger' }> = {
  1: { label: '低', kind: 'neutral' },
  2: { label: '中', kind: 'info' },
  3: { label: '高', kind: 'danger' },
};

export function TicketsPage() {
  const q = useListQuery<Ticket>('tickets', ticketsApi.list, { defaultTab: 'open' });
  const [openId, setOpenId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const term = useTerm();
  const qc = useQueryClient();
  const toast = useUI((s) => s.toast);

  const columns: Column<Ticket>[] = [
    { key: 'code', header: '工单号', minWidth: 110, render: (r) => <span className="font-medium text-primary">{r.code}</span> },
    { key: 'title', header: '标题', minWidth: 180, truncate: 260 },
    { key: 'typeTerm', header: '类型', minWidth: 70, render: (r) => term.name(r.typeTerm) },
    { key: 'customerName', header: '客户', minWidth: 140, truncate: 200, render: (r) => r.customerName ?? '—' },
    { key: 'priority', header: '优先级', render: (r) => <StatusTag {...PRIORITY[r.priority]} dot={false} /> },
    { key: 'assigneeName', header: '处理人', render: (r) => <UserCell name={r.assigneeName ?? userName(r.assigneeId)} /> },
    { key: 'status', header: '状态', render: (r) => <StatusTag {...STATUS[r.status]} /> },
    { key: 'createDate', header: '创建时间', numeric: true, render: (r) => formatDateTime(r.createDate) },
  ];

  return (
    <div>
      <PageHeader
        title="工单"
        description="售后/咨询工单受理与流转"
        extra={
          <>
            <SearchInput value={q.keyword} onChange={q.setKeyword} placeholder="搜索工单 / 标题 / 客户" />
            <Button variant="primary" onClick={() => setCreateOpen(true)}>新建工单</Button>
          </>
        }
      />
      <div className="mb-3">
        <Tabs
          items={[{ key: 'open', label: '待处理/处理中' }, { key: 'mine', label: '我负责的' }, { key: 'closed', label: '已结束' }, { key: 'all', label: '全部' }]}
          value={q.tab}
          onChange={q.setTab}
          className="border-0"
        />
      </div>
      <DataTable
        columns={columns}
        data={q.data}
        rowKey={(r) => r.ticketId}
        loading={q.isLoading}
        error={q.isError}
        onRetry={q.refetch}
        onRowClick={(r) => setOpenId(r.ticketId)}
        pagination={{ page: q.page, pageSize: q.pageSize, total: q.total, onChange: q.setPage }}
      />

      {openId != null && <TicketDrawer id={openId} onClose={() => setOpenId(null)} onChanged={() => qc.invalidateQueries({ queryKey: ['tickets'] })} />}
      {createOpen && <TicketCreate onClose={() => setCreateOpen(false)} onCreated={() => { qc.invalidateQueries({ queryKey: ['tickets'] }); toast('工单已创建', 'success'); }} />}
    </div>
  );
}

function TicketDrawer({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const term = useTerm();
  const qc = useQueryClient();
  const toast = useUI((s) => s.toast);
  const [comment, setComment] = useState('');
  const { data: t, isLoading } = useQuery({ queryKey: ['ticket', id], queryFn: () => ticketsApi.get(id) });
  const { data: comments = [] } = useQuery({ queryKey: ['ticket-comments', id], queryFn: () => ticketsApi.comments(id) });

  const setStatus = async (status: number) => {
    await ticketsApi.updateStatus(id, status);
    qc.invalidateQueries({ queryKey: ['ticket', id] });
    onChanged();
    toast('状态已更新', 'success');
  };
  const addComment = async () => {
    if (!comment.trim()) return;
    await ticketsApi.addComment(id, comment.trim());
    setComment('');
    qc.invalidateQueries({ queryKey: ['ticket-comments', id] });
  };

  return (
    <Drawer open onClose={onClose} title={t?.title ?? '工单'} subtitle={t?.code} width="w-[620px]">
      {isLoading || !t ? (
        <TableSkeleton rows={5} cols={2} />
      ) : (
        <div className="space-y-5 p-5">
          <Descriptions
            items={[
              { label: '类型', value: term.name(t.typeTerm) },
              { label: '优先级', value: <StatusTag {...PRIORITY[t.priority]} dot={false} /> },
              { label: '客户', value: t.customerName ?? '—' },
              { label: '处理人', value: userName(t.assigneeId) },
              { label: '状态', value: <StatusTag {...STATUS[t.status]} /> },
              { label: '创建时间', value: formatDateTime(t.createDate) },
            ]}
          />
          {t.description && <div className="rounded-md bg-bg p-3 text-sm text-text-weak">{t.description}</div>}

          <div>
            <div className="mb-2 text-sm font-medium text-text">流转</div>
            <div className="flex gap-2">
              {([2, 3, 4] as const).map((s) => (
                <Button key={s} size="sm" variant={t.status === s ? 'primary' : 'default'} onClick={() => setStatus(s)}>
                  {STATUS[s].label}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium text-text">处理记录</div>
            {comments.length === 0 ? (
              <p className="py-3 text-sm text-text-faint">暂无评论</p>
            ) : (
              <Timeline items={comments.map((c) => ({ id: c.id, title: userName(c.userId), meta: formatDateTime(c.createDate), body: c.content }))} />
            )}
            <div className="mt-3 flex gap-2">
              <TextInput value={comment} onChange={(e) => setComment(e.target.value)} placeholder="添加处理记录…" onKeyDown={(e) => e.key === 'Enter' && addComment()} />
              <Button variant="primary" onClick={addComment}>发送</Button>
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}

function TicketCreate({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const term = useTerm();
  const [title, setTitle] = useState('');
  const [typeTerm, setTypeTerm] = useState('');
  const [priority, setPriority] = useState('2');
  const [assigneeId, setAssigneeId] = useState('');
  const [description, setDescription] = useState('');
  const toast = useUI((s) => s.toast);

  const submit = async () => {
    if (title.trim().length < 2) return toast('请填写标题', 'error');
    await ticketsApi.create({
      title: title.trim(),
      typeTerm: typeTerm ? Number(typeTerm) : undefined,
      priority: Number(priority) as 1 | 2 | 3,
      assigneeId: assigneeId ? Number(assigneeId) : undefined,
      description,
    });
    onCreated();
    onClose();
  };

  return (
    <Dialog open onClose={onClose} title="新建工单" footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" onClick={submit}>提交</Button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="标题" required className="col-span-2"><TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="问题简述" /></Field>
        <Field label="类型">
          <Select value={typeTerm} onChange={(e) => setTypeTerm(e.target.value)}>
            <option value="">请选择</option>
            {term.options(7).map((t) => <option key={t.termId} value={t.termId}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="优先级">
          <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="1">低</option><option value="2">中</option><option value="3">高</option>
          </Select>
        </Field>
        <Field label="处理人" className="col-span-2">
          <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">未指派</option>
            {MOCK_USERS.map((u) => <option key={u.userId} value={u.userId}>{u.name}（{u.depName}）</option>)}
          </Select>
        </Field>
        <Field label="描述" className="col-span-2"><TextArea value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      </div>
    </Dialog>
  );
}
