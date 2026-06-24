import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Building2,
  CalendarPlus,
  FilePlus2,
  MapPin,
  Network,
  PlusCircle,
  ShieldAlert,
  UserCog,
} from 'lucide-react';
import { contracts, customersApi, groupsApi, opportunities, quotations } from '@/api/crm';
import { Tabs } from '@/components/ui/Tabs';
import { Button, Avatar, UserCell } from '@/components/ui/primitives';
import { Card, CardHeader } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Select, TextArea, TextInput } from '@/components/ui/form';
import { MOCK_USERS } from '@/mock/org';
import { Descriptions } from '@/components/ui/Descriptions';
import { TermTag, TermTags } from '@/components/ui/TermTag';
import { Timeline } from '@/components/ui/Timeline';
import { Attachments } from '@/components/ui/Attachments';
import { MoneyText } from '@/components/ui/MoneyText';
import { StatusTag } from '@/components/ui/StatusTag';
import { AiPanel } from '@/components/ai/AiPanel';
import { TableSkeleton, EmptyState } from '@/components/ui/states';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { useUI } from '@/store/ui';
import { useCreate } from '@/store/create';
import { useTerm } from '@/hooks/useTerms';
import { userName } from '@/mock/org';
import { formatDate } from '@/lib/format';
import type { Contract, Customer, Opportunity, Quotation } from '@/types';

export function CustomerDetailPage() {
  const { id } = useParams();
  const cid = Number(id);
  const navigate = useNavigate();
  const toast = useUI((s) => s.toast);
  const openCreate = useCreate((s) => s.open);
  const [tab, setTab] = useState('overview');
  const [transferOpen, setTransferOpen] = useState(false);
  const term = useTerm();

  const { data: cust, isLoading } = useQuery({ queryKey: ['customer', cid], queryFn: () => customersApi.get(cid) });
  const { data: contactList = [] } = useQuery({ queryKey: ['contacts', cid], queryFn: () => customersApi.contacts(cid) });
  const { data: trackList = [] } = useQuery({ queryKey: ['trackings', cid], queryFn: () => customersApi.trackings(cid) });

  if (isLoading) return <Card className="p-6"><TableSkeleton rows={6} cols={3} /></Card>;
  if (!cust) return <EmptyState title="客户不存在" />;

  const custOpps = opportunities.filter((o) => o.customerId === cid);
  const custQuotes = quotations.filter((qq) => qq.customerId === cid);
  const custContracts = contracts.filter((c) => c.customerId === cid);

  const TABS = [
    { key: 'overview', label: '概览' },
    { key: 'contacts', label: '联系人', count: contactList.length },
    { key: 'tracking', label: '跟进记录', count: trackList.length },
    { key: 'opportunities', label: '商机', count: custOpps.length },
    { key: 'quotations', label: '报价', count: custQuotes.length },
    { key: 'contracts', label: '合同', count: custContracts.length },
    { key: 'risk', label: '风险监控' },
    { key: 'dynamic', label: '动态' },
    { key: 'ai', label: 'AI 助手' },
  ];

  return (
    <div>
      {/* Header + 快捷操作 §6.3 */}
      <Card className="mb-4">
        <div className="flex items-start justify-between gap-4 p-5">
          <div className="flex items-start gap-3">
            <Avatar name={cust.name} size={44} />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-text">{cust.name}</h1>
                <TermTag id={cust.level} dot={false} />
                <TermTag id={cust.currentTrackingStatus} />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm text-text-weak">
                <span className="inline-flex items-center gap-1"><Building2 size={13} />{cust.industry}</span>
                <span className="inline-flex items-center gap-1"><MapPin size={13} />{cust.province}{cust.city}{cust.district}</span>
                <span>负责人：<UserCell name={userName(cust.leaderId)} /></span>
              </div>
              <div className="mt-2"><TermTags ids={cust.labels} /></div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => toast('已打开新增跟进', 'info')}><CalendarPlus size={14} />加跟进</Button>
            <Button onClick={() => openCreate('opportunity', { customerId: cid })}><PlusCircle size={14} />建商机</Button>
            <Button onClick={() => navigate('/quotations/new')}><FilePlus2 size={14} />建报价</Button>
            <Button onClick={() => toast('已签到', 'success')}><MapPin size={14} />签到</Button>
            <Button onClick={() => setTransferOpen(true)}><UserCog size={14} />移交</Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="px-4">
          <Tabs items={TABS} value={tab} onChange={setTab} className="border-0" />
        </div>
        <div className="p-5">
          {tab === 'overview' && (
            <div className="grid grid-cols-3 gap-5">
              <div className="col-span-2 space-y-5">
                <Section title="工商信息（企查查）">
                  <Descriptions
                    columns={3}
                    items={[
                      { label: '企查查ID', value: cust.refCompanyId },
                      { label: '行业', value: cust.industry },
                      { label: '来源', value: <TermTag id={cust.source} dot={false} /> },
                      { label: '所在地区', value: `${cust.province}${cust.city}` },
                      { label: '主联系电话', value: cust.phone },
                      { label: '邮箱', value: cust.email },
                    ]}
                  />
                </Section>
                <Section title="关键指标">
                  <div className="grid grid-cols-4 gap-3">
                    <Metric label="商机数" value={String(custOpps.length)} />
                    <Metric label="合同总额" value={<MoneyText value={custContracts.reduce((s, c) => s + Number(c.amount), 0)} />} />
                    <Metric label="已回款" value={<MoneyText value={custContracts.reduce((s, c) => s + Number(c.receivedAmount), 0)} />} />
                    <Metric label="跟进次数" value={String(cust.trackingNum)} />
                  </div>
                </Section>
                <GroupSection cust={cust} />
              </div>
              <div>
                <Section title="风险标签">
                  <div className="flex flex-wrap gap-2">
                    <StatusTag kind="warning" label="存在司法案件" />
                    <StatusTag kind="neutral" label="股权无异常" />
                    <StatusTag kind="success" label="经营正常" />
                  </div>
                </Section>
              </div>
            </div>
          )}

          {tab === 'contacts' && (
            <div className="grid grid-cols-2 gap-3">
              {contactList.map((c) => (
                <div key={c.contactId} className="rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={c.name} size={28} />
                    <span className="font-medium text-text">{c.name}</span>
                    {c.type === 1 && <span className="rounded bg-primary-weak px-1.5 py-0.5 text-xs text-primary">主</span>}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-y-1.5 text-sm text-text-weak">
                    <span>{c.position}</span>
                    <span>{c.department}</span>
                    <span>{c.phone}</span>
                    <span>微信 {c.wechat}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'tracking' && (
            trackList.length === 0 ? <EmptyState title="暂无跟进记录" /> : (
              <Timeline
                items={trackList.map((t) => ({
                  id: t.trackingId,
                  kind: t.priorityLevel === 2 ? 'neutral' : 'info',
                  title: term.name(t.trackingType),
                  meta: `${userName(t.createBy)} · ${formatDate(t.createDate, 'MM-DD HH:mm')}`,
                  body: (
                    <div>
                      <p>{t.comment}</p>
                      <Attachments items={t.attachments} />
                      {t.nextTrackingDate && <p className="mt-1 text-xs text-warning">下次跟进：{formatDate(t.nextTrackingDate)}</p>}
                    </div>
                  ),
                }))}
              />
            )
          )}

          {tab === 'opportunities' && <OppMini rows={custOpps} onRow={(r) => navigate(`/opportunities/${r.opportunityId}`)} />}
          {tab === 'quotations' && <QuoteMini rows={custQuotes} onRow={(r) => navigate(`/quotations/${r.quotationId}`)} />}
          {tab === 'contracts' && <ContractMini rows={custContracts} onRow={(r) => navigate(`/contracts/${r.contractId}`)} />}

          {tab === 'risk' && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-bg p-4">
              <ShieldAlert className="text-warning" />
              <div className="text-sm text-text-weak">风险监控（customer_risk_monitor）：经营异常 0 项 · 司法案件 1 项 · 行政处罚 0 项</div>
            </div>
          )}
          {tab === 'dynamic' && <ActivityTab customerId={cid} />}
          {tab === 'ai' && (
            <div className="-m-5 h-[560px]">
              <AiPanel businessType={1} businessId={cid} />
            </div>
          )}
        </div>
      </Card>

      {transferOpen && (
        <TransferDialog customerId={cid} currentLeaderId={cust.leaderId} onClose={() => setTransferOpen(false)} />
      )}
    </div>
  );
}

function TransferDialog({ customerId, currentLeaderId, onClose }: { customerId: number; currentLeaderId?: number; onClose: () => void }) {
  const toast = useUI((s) => s.toast);
  const [toUserId, setToUserId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!toUserId) return toast('请选择接收人', 'error');
    setBusy(true);
    try {
      await customersApi.transfer(customerId, Number(toUserId), reason);
      toast('移交申请已提交，进入交接审批', 'success');
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : '提交失败', 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} title="客户负责人移交" width="w-[460px]"
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" onClick={submit} disabled={busy}>提交交接审批</Button></>}>
      <div className="space-y-4">
        <p className="rounded-md bg-primary-weak/60 px-3 py-2 text-xs text-primary">移交需经主管交接审批；通过后该客户负责人与历史报价价格随之转移并锁定。</p>
        <Field label="接收人" required>
          <Select value={toUserId} onChange={(e) => setToUserId(e.target.value)}>
            <option value="">请选择</option>
            {MOCK_USERS.filter((u) => u.userId !== currentLeaderId).map((u) => (
              <option key={u.userId} value={u.userId}>{u.name}（{u.depName}）</option>
            ))}
          </Select>
        </Field>
        <Field label="移交原因"><TextArea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="如：区域调整 / 离职交接" /></Field>
      </div>
    </Dialog>
  );
}

const ACT_KIND: Record<string, 'info' | 'success' | 'warning' | 'danger' | 'neutral'> = {
  customer: 'neutral', tracking: 'info', opportunity: 'warning', quotation: 'info', contract: 'success', invoice: 'success',
};
function ActivityTab({ customerId }: { customerId: number }) {
  const { data = [], isLoading } = useQuery({ queryKey: ['activities', customerId], queryFn: () => customersApi.activities(customerId) });
  if (isLoading) return <TableSkeleton rows={5} cols={1} />;
  if (data.length === 0) return <EmptyState title="暂无动态" description="客户的新增线索/商机/报价/合同/开票等行为将在此汇总" />;
  return (
    <Timeline
      items={data.map((a, i) => ({
        id: i,
        kind: ACT_KIND[a.kind] ?? 'neutral',
        title: a.title,
        meta: `${a.operator ?? '系统'} · ${formatDate(a.date, 'YYYY-MM-DD HH:mm')}`,
        body: a.summary,
      }))}
    />
  );
}

// 集团归属：显示所属集团与同集团客户，支持人工调整
function GroupSection({ cust }: { cust: Customer }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data: members = [] } = useQuery({
    queryKey: ['group-members', cust.groupId],
    queryFn: () => groupsApi.members(cust.groupId!),
    enabled: !!cust.groupId,
  });
  const siblings = members.filter((m) => m.customerId !== cust.customerId);
  return (
    <Section title="集团归属">
      <div className="rounded-lg border border-border p-3">
        <div className="flex items-center justify-between">
          <div className="text-sm">
            {cust.groupName ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-text"><Network size={14} className="text-primary" />{cust.groupName}</span>
            ) : (
              <span className="text-text-faint">未归属集团</span>
            )}
          </div>
          <div className="flex gap-2">
            <RegroupButton />
            <Button size="sm" onClick={() => setOpen(true)}><Network size={13} />调整集团</Button>
          </div>
        </div>
        {cust.groupId && (
          <div className="mt-2 text-sm text-text-weak">
            同集团客户（{siblings.length}）：
            {siblings.length === 0 ? <span className="text-text-faint">无</span> : siblings.map((m) => (
              <button key={m.customerId} onClick={() => navigate(`/customers/${m.customerId}`)} className="mr-2 text-primary hover:underline">{m.name}</button>
            ))}
          </div>
        )}
      </div>
      {open && <GroupDialog cust={cust} onClose={() => setOpen(false)} />}
    </Section>
  );
}

// 按工商关系(企查查集团/实控人)全量自动归集
function RegroupButton() {
  const qc = useQueryClient();
  const toast = useUI((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const r = await groupsApi.autoRegroup();
      toast(`工商关系归集完成：扫描 ${r.scanned}，归集 ${r.grouped}`, 'success');
      qc.invalidateQueries();
    } catch (e) {
      toast(e instanceof Error ? e.message : '归集失败', 'error');
    } finally {
      setBusy(false);
    }
  };
  return <Button size="sm" onClick={run} disabled={busy}><Network size={13} />{busy ? '归集中…' : '工商关系归集'}</Button>;
}

function GroupDialog({ cust, onClose }: { cust: Customer; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useUI((s) => s.toast);
  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: () => groupsApi.list() });
  const [groupId, setGroupId] = useState<string>(cust.groupId ? String(cust.groupId) : '');
  const [newName, setNewName] = useState('');
  const [matchKey, setMatchKey] = useState('');
  const refresh = () => { qc.invalidateQueries({ queryKey: ['customer', cust.customerId] }); qc.invalidateQueries({ queryKey: ['groups'] }); qc.invalidateQueries({ queryKey: ['group-members'] }); };
  const save = async () => {
    if (newName.trim()) {
      const r = await groupsApi.create({ name: newName.trim(), matchKey: matchKey.trim() || undefined });
      await groupsApi.setCustomerGroup(cust.customerId, r.groupId);
      toast(`已创建集团并归属${r.attached ? `，自动归集 ${r.attached} 个客户` : ''}`, 'success');
    } else {
      await groupsApi.setCustomerGroup(cust.customerId, groupId ? Number(groupId) : null);
      toast(groupId ? '已调整集团归属' : '已移出集团', 'success');
    }
    refresh(); onClose();
  };
  return (
    <Dialog open onClose={onClose} title="调整集团归属" width="w-[460px]"
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" onClick={save}>保存</Button></>}>
      <div className="space-y-4">
        <Field label="归属到现有集团">
          <Select value={groupId} onChange={(e) => { setGroupId(e.target.value); setNewName(''); }}>
            <option value="">（不归属 / 移出集团）</option>
            {groups.map((g) => <option key={g.groupId} value={g.groupId}>{g.name}（{g.memberCount}）</option>)}
          </Select>
        </Field>
        <div className="text-center text-xs text-text-faint">或 新建集团（按字号自动归集同名客户）</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="集团名称"><TextInput value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="如：星辰云图集团" /></Field>
          <Field label="字号关键字" hint="客户名含此词自动归属"><TextInput value={matchKey} onChange={(e) => setMatchKey(e.target.value)} placeholder="如：星辰云图" /></Field>
        </div>
      </div>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-text">{title}</h3>
      {children}
    </div>
  );
}
function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-bg p-3">
      <div className="text-xs text-text-faint">{label}</div>
      <div className="mt-1 text-lg font-semibold text-text">{value}</div>
    </div>
  );
}

function OppMini({ rows, onRow }: { rows: Opportunity[]; onRow: (r: Opportunity) => void }) {
  const cols: Column<Opportunity>[] = [
    { key: 'name', header: '商机', render: (r) => <span className="text-primary">{r.name}</span> },
    { key: 'estimatedAmount', header: '预计金额', numeric: true, render: (r) => <MoneyText value={r.estimatedAmount} /> },
    { key: 'status', header: '阶段', render: (r) => <TermTag id={r.status} /> },
    { key: 'expiryDate', header: '预计成交', numeric: true, render: (r) => formatDate(r.expiryDate) },
  ];
  return <DataTable columns={cols} data={rows} rowKey={(r) => r.opportunityId} onRowClick={onRow} />;
}
function QuoteMini({ rows, onRow }: { rows: Quotation[]; onRow: (r: Quotation) => void }) {
  const cols: Column<Quotation>[] = [
    { key: 'code', header: '编号', render: (r) => <span className="text-primary">{r.code}</span> },
    { key: 'amount', header: '报价金额', numeric: true, render: (r) => <MoneyText value={r.amount} currency={r.currency} /> },
    { key: 'grossProfitRate', header: '毛利率', numeric: true, render: (r) => `${r.grossProfitRate}%` },
  ];
  return <DataTable columns={cols} data={rows} rowKey={(r) => r.quotationId} onRowClick={onRow} />;
}
function ContractMini({ rows, onRow }: { rows: Contract[]; onRow: (r: Contract) => void }) {
  const cols: Column<Contract>[] = [
    { key: 'code', header: '编号', render: (r) => <span className="text-primary">{r.code}</span> },
    { key: 'amount', header: '合同金额', numeric: true, render: (r) => <MoneyText value={r.amount} currency={r.currency} /> },
    { key: 'receivedRate', header: '收款比例', numeric: true, render: (r) => `${r.receivedRate}%` },
  ];
  return <DataTable columns={cols} data={rows} rowKey={(r) => r.contractId} onRowClick={onRow} />;
}
