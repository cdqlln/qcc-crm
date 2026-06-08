import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Tag, Undo2, Upload, UserCog } from 'lucide-react';
import { customersApi } from '@/api/crm';
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
import { CountBadge } from '@/components/ui/primitives';
import { useTerm } from '@/hooks/useTerms';
import { TERMS_BIZ } from '@/mock/terms';
import { MOCK_USERS, userName } from '@/mock/org';
import { formatDate } from '@/lib/format';
import type { Customer } from '@/types';

const TABS = [
  { key: 'all', label: '全部' },
  { key: 'mine', label: '我负责的' },
  { key: 'deal', label: '成交客户' },
  { key: 'sea', label: '客户公海' },
];

const DEFAULT_VIEWS: SavedView[] = [
  { id: 'v1', name: '我负责的·跟进逾期', scope: 'mine', pinned: true },
  { id: 'v2', name: '本月新签', scope: 'team' },
  { id: 'v3', name: 'A 级客户', scope: 'mine' },
];

export function CustomersPage() {
  const q = useListQuery<Customer>('customers', customersApi.list);
  const [views, setViews] = useState(DEFAULT_VIEWS);
  const [activeView, setActiveView] = useState<string>();
  const [filterOpen, setFilterOpen] = useState(false);
  const navigate = useNavigate();
  const toast = useUI((s) => s.toast);
  const openCreate = useCreate((s) => s.open);
  const term = useTerm();

  const opt = (biz: number) => term.options(biz).map((t) => ({ label: t.name, value: t.termId }));
  const filterSchema: FilterField[] = [
    { key: 'level', label: '客户分级', type: 'multiselect', options: opt(TERMS_BIZ.level) },
    { key: 'currentTrackingStatus', label: '客户状态', type: 'multiselect', options: opt(TERMS_BIZ.customerStatus) },
    { key: 'source', label: '来源', type: 'select', options: opt(TERMS_BIZ.source) },
    { key: 'labels', label: '客户标签', type: 'multiselect', options: opt(TERMS_BIZ.label) },
    { key: 'leaderId', label: '负责人', type: 'select', options: MOCK_USERS.map((u) => ({ label: u.name, value: u.userId })) },
    { key: 'industry', label: '行业', type: 'text', placeholder: '如：制造业' },
    { key: 'trackingUpdateDate', label: '最新跟进时间', type: 'dateRange' },
  ];

  const selectView = (id: string) => {
    setActiveView(id);
    const v = views.find((x) => x.id === id);
    if (v) q.applyView({ tab: v.tab, filters: v.filters });
  };

  const columns: Column<Customer>[] = [
    { key: 'name', header: '客户名称', render: (r) => <span className="font-medium text-primary">{r.name}</span> },
    { key: 'opportunityCount', header: '商机数', numeric: true, render: (r) => <CountBadge count={r.opportunityCount ?? 0} kind="neutral" /> },
    { key: 'labels', header: '客户标签', render: (r) => <TermTags ids={r.labels} /> },
    { key: 'industry', header: '行业', render: (r) => <span className="text-text-weak">{r.industry}</span> },
    { key: 'province', header: '地区', render: (r) => <span className="text-text-weak">{r.province}{r.city}</span> },
    { key: 'level', header: '客户分级', render: (r) => <TermTag id={r.level} dot={false} /> },
    { key: 'currentTrackingStatus', header: '状态', render: (r) => <TermTag id={r.currentTrackingStatus} /> },
    { key: 'leaderId', header: '负责人', render: (r) => <UserCell name={userName(r.leaderId)} /> },
    { key: 'source', header: '来源', render: (r) => <TermTag id={r.source} dot={false} /> },
    { key: 'trackingUpdateDate', header: '最新跟进', numeric: true, sortable: true, render: (r) => (
      <span className="text-text-weak">{formatDate(r.trackingUpdateDate)}</span>
    ) },
  ];

  return (
    <div>
      <PageHeader
        title="客户"
        description="客户公海领取 / 导入更新 / 全链路视图"
        extra={
          <>
            <SearchInput value={q.keyword} onChange={q.setKeyword} placeholder="搜索客户名称 / 行业" />
            <FilterButton count={q.filterCount} onClick={() => setFilterOpen(true)} />
            <Button size="md"><Upload size={14} />导入(含更新)</Button>
            <Button size="md"><Download size={14} />导出</Button>
            <Button variant="primary" size="md" onClick={() => openCreate('customer')}>新建客户</Button>
          </>
        }
      />

      <div className="mb-3">
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
        onRowClick={(r) => navigate(`/customers/${r.customerId}`)}
        selectable
        sort={q.sort}
        onSortChange={q.setSort}
        bulkActions={[
          { label: '指派', icon: <UserCog size={13} />, onClick: (rows) => toast(`已指派 ${rows.length} 个客户`, 'success') },
          { label: '转移', icon: <UserCog size={13} />, onClick: () => toast('已转移', 'success') },
          { label: '打标签', icon: <Tag size={13} />, onClick: () => toast('已打标签', 'success') },
          { label: '退回公海', icon: <Undo2 size={13} />, onClick: (rows) => toast(`已退回 ${rows.length} 个到公海`, 'info') },
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
    </div>
  );
}
