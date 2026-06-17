import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { productsApi } from '@/api/crm';
import { useListQuery } from '@/hooks/useListQuery';
import { PageHeader, SearchInput } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { MoneyText } from '@/components/ui/MoneyText';
import { StatusTag } from '@/components/ui/StatusTag';
import { Drawer } from '@/components/ui/Drawer';
import { Descriptions } from '@/components/ui/Descriptions';
import { TableSkeleton } from '@/components/ui/states';
import { PRODUCT_KIND, DELIVERY_TYPE } from '@/lib/enums';
import { formatMoney } from '@/lib/money';
import type { Product } from '@/types';

export function ProductsPage() {
  const q = useListQuery<Product>('products', productsApi.list);
  const [openId, setOpenId] = useState<number | null>(null);

  const columns: Column<Product>[] = [
    { key: 'code', header: '编号', minWidth: 80, render: (r) => <span className="text-text-faint">{r.code}</span> },
    { key: 'name', header: '产品名称', minWidth: 160, truncate: 220, render: (r) => <span className="font-medium text-text">{r.name}</span> },
    { key: 'kind', header: '大类', minWidth: 70, render: (r) => <StatusTag kind={PRODUCT_KIND[r.kind]?.kind} label={PRODUCT_KIND[r.kind]?.label ?? '—'} dot={false} /> },
    { key: 'deliveryType', header: '交付方式', minWidth: 90, render: (r) => (r.deliveryType ? DELIVERY_TYPE[r.deliveryType] : '—') },
    { key: 'spec', header: '规格', minWidth: 70 },
    { key: 'unit', header: '单位', minWidth: 56 },
    { key: 'timeLimits', header: '服务周期', minWidth: 80, render: (r) => (r.timeLimits ? `${r.timeLimits} 月` : '一次性') },
    {
      key: 'price',
      header: '价格',
      numeric: true,
      minWidth: 110,
      sortable: true,
      render: (r) => (r.kind === 1 ? <span className="text-primary">阶梯价 ›</span> : <MoneyText value={r.price} />),
    },
    { key: 'cost', header: '成本', numeric: true, minWidth: 90, render: (r) => <MoneyText value={r.cost} className="text-text-weak" /> },
    { key: 'minDiscount', header: '最低折扣', numeric: true, minWidth: 80, render: (r) => r.minDiscount },
    { key: 'active', header: '状态', minWidth: 70, render: (r) => <StatusTag kind={r.active ? 'success' : 'neutral'} label={r.active ? '上架' : '下架'} /> },
  ];

  return (
    <div>
      <PageHeader
        title="产品管理"
        description="大类(数据/产品) · 交付方式 · 数据类阶梯报价 · 折扣约束"
        extra={
          <>
            <SearchInput value={q.keyword} onChange={q.setKeyword} placeholder="搜索产品 / 编号" />
            <Button variant="primary" size="md">新建产品</Button>
          </>
        }
      />
      <DataTable
        columns={columns}
        data={q.data}
        rowKey={(r) => r.productId}
        loading={q.isLoading}
        error={q.isError}
        onRetry={q.refetch}
        onRowClick={(r) => setOpenId(r.productId)}
        sort={q.sort}
        onSortChange={q.setSort}
        pagination={{ page: q.page, pageSize: q.pageSize, total: q.total, onChange: q.setPage }}
      />
      {openId != null && <ProductDrawer product={q.data.find((p) => p.productId === openId)!} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function ProductDrawer({ product, onClose }: { product: Product; onClose: () => void }) {
  const isData = product.kind === 1;
  const { data: tiers = [], isLoading } = useQuery({
    queryKey: ['product-tiers', product.productId],
    queryFn: () => productsApi.tiers(product.productId),
    enabled: isData,
  });

  return (
    <Drawer open onClose={onClose} title={product.name} subtitle={product.code} width="w-[560px]">
      <div className="space-y-5 p-5">
        <Descriptions
          items={[
            { label: '大类', value: <StatusTag kind={PRODUCT_KIND[product.kind]?.kind} label={PRODUCT_KIND[product.kind]?.label} dot={false} /> },
            { label: '交付方式', value: product.deliveryType ? DELIVERY_TYPE[product.deliveryType] : '—' },
            { label: '核心交付', value: isData ? '数据（API / 离线数据包）' : '系统（账号 / 订阅）' },
            { label: '规格', value: product.spec },
            { label: '单位', value: product.unit },
            { label: '服务周期', value: product.timeLimits ? `${product.timeLimits} 月` : '一次性' },
            { label: '标准价', value: <MoneyText value={product.price} /> },
            { label: '成本', value: <MoneyText value={product.cost} /> },
          ]}
        />
        {isData && (
          <div>
            <div className="mb-2 text-sm font-semibold text-text">采购量阶梯报价</div>
            {isLoading ? (
              <TableSkeleton rows={3} cols={2} />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-bg/60 text-xs text-text-weak">
                    <th className="px-3 py-2 text-left">采购量（{product.unit}）</th>
                    <th className="px-3 py-2 text-right">单价</th>
                  </tr>
                </thead>
                <tbody>
                  {tiers.map((t) => (
                    <tr key={t.tierId} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">{t.minQty}{t.maxQty != null ? ` ~ ${t.maxQty}` : ' 及以上'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(t.unitPrice)}</td>
                    </tr>
                  ))}
                  {tiers.length === 0 && <tr><td colSpan={2} className="py-6 text-center text-text-faint">未配置阶梯价</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}
