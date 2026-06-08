import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRightLeft, Download, Phone, Tag, Undo2, Upload, UserCheck } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { leadsApi } from '@/api/crm';
import { useListQuery } from '@/hooks/useListQuery';
import { useUI } from '@/store/ui';
import { useCreate } from '@/store/create';
import { PageHeader, SearchInput } from '@/components/ui/PageHeader';
import { Button, UserCell } from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Tabs } from '@/components/ui/Tabs';
import { SavedViewBar, type SavedView } from '@/components/ui/SavedViewBar';
import { FilterButton, FilterPanel, FilterChips, type FilterField } from '@/components/ui/FilterPanel';
import { TermTag, TermTags } from '@/components/ui/TermTag';
import { useTerm } from '@/hooks/useTerms';
import { TERMS_BIZ } from '@/mock/terms';
import { MOCK_USERS, userName } from '@/mock/org';
import { formatDate } from '@/lib/format';
import type { Customer } from '@/types';
import { LeadDrawer } from './LeadDrawer';

const TABS = [
  { key: 'all', label: '销售线索' },
  { key: 'mine', label: '我负责的' },
  { key: 'pool', label: '线索池' },
  { key: 'converted', label: '已转化' },
];

const DEFAULT_VIEWS: SavedView[] = [
  { id: 'v1', name: '我负责的·待处理', scope: 'mine', pinned: true },
  { id: 'v2', name: '本周新增线索', scope: 'mine' },
  { id: 'v3', name: '团队·高潜线索', scope: 'team' },
];

export function LeadsPage() {
  const q = useListQuery<Customer>('leads', leadsApi.list);
  const [views, setViews] = useState(DEFAULT_VIEWS);
  const [activeView, setActiveView] = useState<string>();
  const [filterOpen, setFilterOpen] = useState(false);
  const navigate = useNavigate();
  const { id } = useParams();
  const toast = useUI((s) => s.toast);
  const openCreate = useCreate((s) => s.open);
  const term = useTerm();
  const qc = useQueryClient();

  const opt = (biz: number) => term.options(biz).map((t) => ({ label: t.name, value: t.termId }));
  const filterSchema: FilterField[] = [
    { key: 'source', label: '线索来源', type: 'select', options: opt(TERMS_BIZ.source) },
    { key: 'poolGroup', label: '线索分组', type: 'multiselect', options: opt(TERMS_BIZ.poolGroup) },
    { key: 'currentTrackingStatus', label: '状态', type: 'multiselect', options: opt(TERMS_BIZ.leadStatus) },
    { key: 'leaderId', label: '负责人', type: 'select', options: MOCK_USERS.map((u) => ({ label: u.name, value: u.userId })) },
    { key: 'province', label: '省份', type: 'text', placeholder: '如：江苏省' },
    { key: 'trackingUpdateDate', label: '最新跟进时间', type: 'dateRange' },
  ];

  const selectView = (id: string) => {
    setActiveView(id);
    const v = views.find((x) => x.id === id);
    if (v) q.applyView({ tab: v.tab, filters: v.filters });
  };

  const convert = async (rows: Customer[]) => {
    await Promise.all(rows.map((r) => leadsApi.convert(r.customerId)));
    qc.invalidateQueries({ queryKey: ['leads'] });
    toast(`已将 ${rows.length} 条线索转为客户，并保留跟进记录`, 'success');
  };

  const columns: Column<Customer>[] = [
    { key: 'name', header: '线索名称', render: (r) => <span className="font-medium text-primary">{r.name}</span> },
    { key: 'labels', header: '线索标签', render: (r) => <TermTags ids={r.labels} /> },
    { key: 'phoneName', header: '联系人', render: (r) => (
      <span className="inline-flex items-center gap-1.5">
        {r.phoneName}
        <Phone size={13} className="text-primary" />
      </span>
    ) },
    { key: 'source', header: '线索来源', render: (r) => <TermTag id={r.source} dot={false} /> },
    { key: 'poolGroup', header: '线索分组', render: (r) => <TermTag id={r.poolGroup} dot={false} /> },
    { key: 'currentTrackingStatus', header: '状态', render: (r) => <TermTag id={r.currentTrackingStatus} /> },
    { key: 'leaderId', header: '负责人', render: (r) => <UserCell name={userName(r.leaderId)} /> },
    { key: 'province', header: '所在地区', render: (r) => <span className="text-text-weak">{r.province}{r.city}</span> },
    { key: 'trackingUpdateDate', header: '最新跟进', numeric: true, sortable: true, render: (r) => (
      <span className="text-text-weak">{formatDate(r.trackingUpdateDate)}</span>
    ) },
  ];

  return (
    <div>
      <PageHeader
        title="线索"
        description="线索池领取 / 转客户 / 掉保保护 —— 统一在列表内完成动作"
        extra={
          <>
            <SearchInput value={q.keyword} onChange={q.setKeyword} placeholder="搜索线索名称 / 行业" />
            <FilterButton count={q.filterCount} onClick={() => setFilterOpen(true)} />
            <Button size="md"><Upload size={14} />导入</Button>
            <Button size="md"><Download size={14} />导出</Button>
            <Button variant="primary" size="md" onClick={() => openCreate('lead')}>新建线索</Button>
          </>
        }
      />

      <div className="mb-3 flex items-center justify-between gap-3">
        <Tabs items={TABS} value={q.tab} onChange={q.setTab} className="border-0" />
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SavedViewBar
          views={views}
          active={activeView}
          onSelect={selectView}
          onSave={(name) =>
            setViews((v) => [...v, { id: String(Date.now()), name, scope: 'mine', tab: q.tab, filters: q.filters }])
          }
        />
        <FilterChips schema={filterSchema} value={q.filters} onChange={q.setFilters} />
      </div>

      <DataTable
        columns={columns}
        data={q.data}
        rowKey={(r) => r.customerId}
        loading={q.isLoading}
        error={q.isError}
        onRetry={q.refetch}
        onRowClick={(r) => navigate(`/leads/${r.customerId}`)}
        selectable
        sort={q.sort}
        onSortChange={q.setSort}
        bulkActions={[
          { label: '领取', icon: <UserCheck size={13} />, onClick: (rows) => toast(`已领取 ${rows.length} 条线索`, 'success') },
          { label: '转客户', icon: <ArrowRightLeft size={13} />, onClick: convert },
          { label: '打标签', icon: <Tag size={13} />, onClick: () => toast('已打标签', 'success') },
          { label: '退回线索池', icon: <Undo2 size={13} />, onClick: (rows) => toast(`已退回 ${rows.length} 条到线索池`, 'info') },
          { label: '导出', icon: <Download size={13} />, onClick: () => toast('导出任务已创建', 'info') },
        ]}
        pagination={{ page: q.page, pageSize: q.pageSize, total: q.total, onChange: q.setPage }}
      />

      <FilterPanel
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        schema={filterSchema}
        value={q.filters}
        onApply={q.setFilters}
      />

      {id && <LeadDrawer id={Number(id)} onClose={() => navigate('/leads')} onConvert={convert} />}
    </div>
  );
}
