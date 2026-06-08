import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Kanban, List } from 'lucide-react';
import { opportunitiesApi } from '@/api/crm';
import { useListQuery } from '@/hooks/useListQuery';
import { useCreate } from '@/store/create';
import { PageHeader, SearchInput } from '@/components/ui/PageHeader';
import { Button, UserCell } from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { SavedViewBar, type SavedView } from '@/components/ui/SavedViewBar';
import { FilterButton, FilterPanel, FilterChips, type FilterField } from '@/components/ui/FilterPanel';
import { MoneyText } from '@/components/ui/MoneyText';
import { TermTag } from '@/components/ui/TermTag';
import { useTerm } from '@/hooks/useTerms';
import { TERMS_BIZ } from '@/mock/terms';
import { cn } from '@/lib/cn';
import { MOCK_USERS, userName } from '@/mock/org';
import { formatDate, daysUntil } from '@/lib/format';
import { formatCompact } from '@/lib/money';
import type { Opportunity } from '@/types';
import { KanbanBoard } from './KanbanBoard';
import { OpportunityDrawer } from './OpportunityDrawer';

const DEFAULT_VIEWS: SavedView[] = [
  { id: 'v1', name: '我的·本季商机', scope: 'mine', pinned: true },
  { id: 'v2', name: '阶段停留超时', scope: 'team' },
];

export function OpportunitiesPage() {
  const q = useListQuery<Opportunity>('opportunities', opportunitiesApi.list, { pageSize: 50 });
  const [view, setView] = useState<'list' | 'kanban'>('list');
  const [views, setViews] = useState(DEFAULT_VIEWS);
  const [activeView, setActiveView] = useState<string>();
  const [filterOpen, setFilterOpen] = useState(false);
  const navigate = useNavigate();
  const openCreate = useCreate((s) => s.open);
  const term = useTerm();
  const { id } = useParams();

  const filterSchema: FilterField[] = [
    { key: 'status', label: '当前阶段', type: 'multiselect', options: term.options(TERMS_BIZ.oppStage).map((t) => ({ label: t.name, value: t.termId })) },
    { key: 'leaderId', label: '跟进人', type: 'select', options: MOCK_USERS.map((u) => ({ label: u.name, value: u.userId })) },
    { key: 'estimatedAmount', label: '预计成交金额', type: 'numberRange' },
    { key: 'expiryDate', label: '预计成交日期', type: 'dateRange' },
  ];

  const selectView = (vid: string) => {
    setActiveView(vid);
    const v = views.find((x) => x.id === vid);
    if (v) q.applyView({ tab: v.tab, filters: v.filters });
  };

  // 看板需要全量数据
  const { data: all } = useQuery({
    queryKey: ['opportunities-all'],
    queryFn: () => opportunitiesApi.list({ page: 1, pageSize: 999 }),
    enabled: view === 'kanban',
  });

  const totalAmount = q.data.reduce((s, o) => s + Number(o.estimatedAmount), 0);

  const columns: Column<Opportunity>[] = [
    { key: 'name', header: '商机名称', render: (r) => <span className="font-medium text-primary">{r.name}</span> },
    { key: 'code', header: '编号', render: (r) => <span className="text-text-faint">{r.code}</span> },
    { key: 'customerName', header: '客户' },
    { key: 'estimatedAmount', header: '预计成交金额', numeric: true, sortable: true, render: (r) => <MoneyText value={r.estimatedAmount} masked={false} /> },
    { key: 'expiryDate', header: '预计成交日期', numeric: true, render: (r) => formatDate(r.expiryDate) },
    { key: 'status', header: '当前阶段', render: (r) => <TermTag id={r.status} /> },
    { key: 'leaderId', header: '跟进人', render: (r) => <UserCell name={userName(r.leaderId)} /> },
    { key: 'mainProduct', header: '主要商品', render: (r) => <span className="text-text-weak">{r.mainProduct}</span> },
    {
      key: 'allStayTime',
      header: '停留天数',
      numeric: true,
      sortable: true,
      render: (r) => {
        const overdue = daysUntil(r.statusExpiryDate) < 0;
        return <span className={cn('tabular-nums', overdue && 'font-semibold text-danger')}>{r.allStayTime} 天</span>;
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="商机"
        description="列表 / 看板双视图 · 拖拽改阶段 · 阶段超时预警"
        extra={
          <>
            <SearchInput value={q.keyword} onChange={q.setKeyword} placeholder="搜索商机 / 编号 / 客户" />
            <FilterButton count={q.filterCount} onClick={() => setFilterOpen(true)} />
            <Button variant="primary" size="md" onClick={() => openCreate('opportunity')}>新建商机</Button>
          </>
        }
      />

      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-md border border-border p-0.5">
            <button onClick={() => setView('list')} className={cn('flex items-center gap-1 rounded px-2.5 py-1 text-sm', view === 'list' ? 'bg-primary-weak text-primary' : 'text-text-weak')}>
              <List size={14} />列表
            </button>
            <button onClick={() => setView('kanban')} className={cn('flex items-center gap-1 rounded px-2.5 py-1 text-sm', view === 'kanban' ? 'bg-primary-weak text-primary' : 'text-text-weak')}>
              <Kanban size={14} />看板
            </button>
          </div>
          <SavedViewBar
            views={views}
            active={activeView}
            onSelect={selectView}
            onSave={(name) =>
              setViews((v) => [...v, { id: String(Date.now()), name, scope: 'mine', tab: q.tab, filters: q.filters }])
            }
          />
        </div>
        <div className="text-sm text-text-weak">
          共 <b className="text-text">{q.total}</b> 条 · 预计成交 <b className="text-text">{formatCompact(String(totalAmount))}</b>
        </div>
      </div>
      {q.filterCount > 0 && (
        <div className="mb-3">
          <FilterChips schema={filterSchema} value={q.filters} onChange={q.setFilters} />
        </div>
      )}

      {view === 'list' ? (
        <DataTable
          columns={columns}
          data={q.data}
          rowKey={(r) => r.opportunityId}
          loading={q.isLoading}
          error={q.isError}
          onRetry={q.refetch}
          onRowClick={(r) => navigate(`/opportunities/${r.opportunityId}`)}
          sort={q.sort}
          onSortChange={q.setSort}
          pagination={{ page: q.page, pageSize: q.pageSize, total: q.total, onChange: q.setPage }}
        />
      ) : (
        <KanbanBoard data={all?.list ?? []} onCard={(o) => navigate(`/opportunities/${o.opportunityId}`)} />
      )}

      <FilterPanel
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        schema={filterSchema}
        value={q.filters}
        onApply={q.setFilters}
      />

      {id && <OpportunityDrawer id={Number(id)} onClose={() => navigate('/opportunities')} />}
    </div>
  );
}
