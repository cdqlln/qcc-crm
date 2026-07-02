import { auditApi } from '@/api/crm';
import { usePerm } from '@/store/auth';
import { useListQuery } from '@/hooks/useListQuery';
import { PageHeader, SearchInput } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusTag } from '@/components/ui/StatusTag';
import { EmptyState } from '@/components/ui/states';
import { formatDateTime } from '@/lib/format';
import type { AuditLog } from '@/types';

export function AuditPage() {
  const { can } = usePerm();
  const q = useListQuery<AuditLog>('audit', auditApi.list, { pageSize: 30 });
  if (!can('system.audit')) return <div><PageHeader title="日志审计" /><Card><EmptyState title="无权限" description="需要「系统-日志审计」权限" /></Card></div>;

  const columns: Column<AuditLog>[] = [
    { key: 'createDate', header: '时间', minWidth: 150, render: (r) => formatDateTime(r.createDate) },
    { key: 'userName', header: '操作人', minWidth: 90, render: (r) => r.userName ?? '—' },
    { key: 'action', header: '动作', minWidth: 120, render: (r) => <span className="font-medium text-text">{r.action}</span> },
    { key: 'detail', header: '内容概况', minWidth: 160, truncate: 240, render: (r) => r.detail || '—' },
    { key: 'method', header: '方法', minWidth: 64, render: (r) => <span className="text-text-faint">{r.method}</span> },
    { key: 'path', header: '路径', minWidth: 160, truncate: 220, render: (r) => <span className="text-text-faint">{r.path}</span> },
    { key: 'ip', header: 'IP', minWidth: 100, render: (r) => <span className="text-text-faint">{r.ip}</span> },
    { key: 'status', header: '状态', minWidth: 64, render: (r) => <StatusTag kind={r.status < 400 ? 'success' : 'danger'} label={String(r.status)} dot={false} /> },
  ];

  return (
    <div>
      <PageHeader title="日志审计" description="关键写操作留痕：操作人 / 动作 / 内容 / 时间 / IP"
        extra={<SearchInput value={q.keyword} onChange={q.setKeyword} placeholder="搜索动作 / 操作人 / 内容" />} />
      <DataTable
        columns={columns}
        data={q.data}
        rowKey={(r) => r.auditId}
        loading={q.isLoading}
        error={q.isError}
        onRetry={q.refetch}
        pagination={{ page: q.page, pageSize: q.pageSize, total: q.total, onChange: q.setPage }}
      />
    </div>
  );
}
