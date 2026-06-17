import { useNavigate } from 'react-router-dom';
import { quotationsApi } from '@/api/crm';
import { useListQuery } from '@/hooks/useListQuery';
import { PageHeader, SearchInput } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { MoneyText } from '@/components/ui/MoneyText';
import { StatusTag } from '@/components/ui/StatusTag';
import { QUOTE_TYPE } from '@/lib/enums';
import { userName } from '@/mock/org';
import { formatDate } from '@/lib/format';
import { formatCompact } from '@/lib/money';
import { currencySymbol } from '@/lib/money';
import type { Quotation } from '@/types';

const STATUS: Record<number, { label: string; kind: 'info' | 'success' | 'danger' | 'neutral' }> = {
  0: { label: '草稿', kind: 'neutral' },
  1: { label: '报价中', kind: 'info' },
  2: { label: '失效', kind: 'danger' },
  3: { label: '已生成合同', kind: 'success' },
};

export function QuotationsPage() {
  const q = useListQuery<Quotation>('quotations', quotationsApi.list);
  const navigate = useNavigate();
  const totalQuote = q.data.reduce((s, x) => s + Number(x.amount), 0);

  const columns: Column<Quotation>[] = [
    { key: 'name', header: '报价单名称', minWidth: 160, truncate: 220, render: (r) => <span className="font-medium text-primary">{r.name}</span> },
    { key: 'code', header: '编号', minWidth: 120, render: (r) => <span className="text-text-faint">{r.code} v{r.version}</span> },
    { key: 'quoteType', header: '类型', minWidth: 80, render: (r) => <StatusTag {...(QUOTE_TYPE[r.quoteType ?? 2])} dot={false} /> },
    { key: 'customerName', header: '客户', minWidth: 140, truncate: 180 },
    { key: 'currency', header: '币种', render: (r) => currencySymbol(r.currency) },
    { key: 'amount', header: '报价金额', numeric: true, sortable: true, render: (r) => <MoneyText value={r.amount} currency={r.currency} strong /> },
    { key: 'comDiscountRate', header: '综合折扣率', numeric: true, render: (r) => `${r.comDiscountRate}%` },
    { key: 'status', header: '报价状态', render: (r) => <StatusTag {...STATUS[r.status]} /> },
    { key: 'bidderId', header: '报价人', render: (r) => userName(r.bidderId) },
    { key: 'quoteDate', header: '报价日期', numeric: true, render: (r) => formatDate(r.quoteDate) },
    { key: 'expiredDate', header: '有效期', numeric: true, render: (r) => formatDate(r.expiredDate) },
  ];

  return (
    <div>
      <PageHeader
        title="报价单"
        description="实时算价 · 折扣约束 · 一键生成合同"
        extra={
          <>
            <SearchInput value={q.keyword} onChange={q.setKeyword} placeholder="搜索报价单 / 编号 / 客户" />
            <Button variant="primary" size="md" onClick={() => navigate('/quotations/new')}>新建报价</Button>
          </>
        }
      />
      <div className="mb-3 text-sm text-text-weak">
        共 <b className="text-text">{q.total}</b> 条 · 总报价 <b className="text-text">{formatCompact(String(totalQuote))}</b>
      </div>
      <DataTable
        columns={columns}
        data={q.data}
        rowKey={(r) => r.quotationId}
        loading={q.isLoading}
        error={q.isError}
        onRetry={q.refetch}
        onRowClick={(r) => navigate(`/quotations/${r.quotationId}`)}
        sort={q.sort}
        onSortChange={q.setSort}
        pagination={{ page: q.page, pageSize: q.pageSize, total: q.total, onChange: q.setPage }}
      />
    </div>
  );
}
