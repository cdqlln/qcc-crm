import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { productsApi } from '@/api/crm';
import { useListQuery } from '@/hooks/useListQuery';
import { usePerm } from '@/store/auth';
import { useUI } from '@/store/ui';
import { PageHeader, SearchInput } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { MoneyText } from '@/components/ui/MoneyText';
import { StatusTag } from '@/components/ui/StatusTag';
import { Drawer } from '@/components/ui/Drawer';
import { Dialog } from '@/components/ui/Dialog';
import { Descriptions } from '@/components/ui/Descriptions';
import { Field, Select, TextInput } from '@/components/ui/form';
import { TableSkeleton } from '@/components/ui/states';
import { PRODUCT_KIND, DELIVERY_TYPE } from '@/lib/enums';
import { formatMoney } from '@/lib/money';
import type { Product } from '@/types';

export function ProductsPage() {
  const q = useListQuery<Product>('products', productsApi.list);
  const { can } = usePerm();
  const canEdit = can('system.dict');
  const [openId, setOpenId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);

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
            {canEdit && <Button variant="primary" size="md" onClick={() => setEditing('new')}>新建产品</Button>}
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
      {openId != null && (
        <ProductDrawer
          product={q.data.find((p) => p.productId === openId)!}
          onClose={() => setOpenId(null)}
          onEdit={canEdit ? (p) => setEditing(p) : undefined}
        />
      )}
      {editing != null && (
        <ProductEditDialog
          product={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); q.refetch(); }}
        />
      )}
    </div>
  );
}

function ProductDrawer({ product, onClose, onEdit }: { product: Product; onClose: () => void; onEdit?: (p: Product) => void }) {
  const isData = product.kind === 1;
  const { data: tiers = [], isLoading } = useQuery({
    queryKey: ['product-tiers', product.productId],
    queryFn: () => productsApi.tiers(product.productId),
    enabled: isData,
  });

  return (
    <Drawer open onClose={onClose} title={product.name} subtitle={product.code} width="w-[560px]"
      footer={onEdit && <Button variant="primary" onClick={() => onEdit(product)}>编辑产品</Button>}>
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
            { label: '最低折扣', value: product.minDiscount },
            { label: '状态', value: <StatusTag kind={product.active ? 'success' : 'neutral'} label={product.active ? '上架' : '下架'} /> },
            {
              label: '赠送策略',
              value: product.allowGift === false
                ? <StatusTag kind="danger" label="不允许赠送" dot={false} />
                : <StatusTag kind="success" label="允许赠送" dot={false} />,
            },
            ...(product.allowGift !== false ? [
              { label: '每订单最大赠送量', value: product.maxGiftQty != null ? `${product.maxGiftQty} ${product.unit ?? ''}` : '不限' },
              { label: '赠送金额占比上限', value: product.maxGiftRatio != null ? `${product.maxGiftRatio}%（占订单总额）` : '不限' },
            ] : []),
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

/** 新建/编辑产品：基本信息 + 定价 + 赠送策略（允许赠送 / 每订单最大赠送数量 / 赠送金额占比上限） */
function ProductEditDialog({ product, onClose, onSaved }: { product?: Product; onClose: () => void; onSaved: () => void }) {
  const toast = useUI((s) => s.toast);
  const isEdit = !!product;
  const [name, setName] = useState(product?.name ?? '');
  const [kind, setKind] = useState(String(product?.kind ?? 2));
  const [spec, setSpec] = useState(product?.spec ?? '');
  const [unit, setUnit] = useState(product?.unit ?? '套');
  const [timeLimits, setTimeLimits] = useState(String(product?.timeLimits ?? 12));
  const [price, setPrice] = useState(product?.price ?? '');
  const [cost, setCost] = useState(product?.cost ?? '0');
  const [minDiscount, setMinDiscount] = useState(product?.minDiscount ?? '0.70');
  const [freePricing, setFreePricing] = useState(product?.freePricing ?? false);
  const [active, setActive] = useState(product?.active ?? true);
  const [allowGift, setAllowGift] = useState(product?.allowGift ?? true);
  const [maxGiftQty, setMaxGiftQty] = useState(product?.maxGiftQty != null ? String(product.maxGiftQty) : '');
  const [maxGiftRatio, setMaxGiftRatio] = useState(product?.maxGiftRatio != null ? String(product.maxGiftRatio) : '');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (name.trim().length < 2) return toast('请填写产品名称（至少 2 个字）', 'error');
    if (!price.trim() || Number.isNaN(Number(price))) return toast('请填写有效的标准价', 'error');
    if (maxGiftQty && (!Number.isInteger(Number(maxGiftQty)) || Number(maxGiftQty) <= 0)) return toast('最大赠送数量需为正整数', 'error');
    if (maxGiftRatio && (Number.isNaN(Number(maxGiftRatio)) || Number(maxGiftRatio) <= 0 || Number(maxGiftRatio) > 100)) return toast('金额占比上限需在 0~100 之间', 'error');
    setBusy(true);
    try {
      const input = {
        name: name.trim(),
        kind: Number(kind) as 1 | 2,
        spec: spec.trim() || undefined,
        unit: unit.trim() || '套',
        timeLimits: Number(timeLimits) || 0,
        price: price.trim(),
        cost: cost.trim() || '0',
        minDiscount: minDiscount.trim() || '0.70',
        freePricing,
        active,
        allowGift,
        maxGiftQty: allowGift && maxGiftQty ? Number(maxGiftQty) : null,
        maxGiftRatio: allowGift && maxGiftRatio ? Number(maxGiftRatio) : null,
      };
      if (isEdit) await productsApi.update(product!.productId, input);
      else await productsApi.create(input);
      toast(isEdit ? '产品已更新' : '产品已创建', 'success');
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : '保存失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? `编辑产品 · ${product!.name}` : '新建产品'}
      width="w-[620px]"
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={submit} disabled={busy}>{busy ? '保存中…' : '保存'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="产品名称" required><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="如：尽调报告" /></Field>
          <Field label="大类">
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="2">产品（系统/账号）</option>
              <option value="1">数据（API/数据包）</option>
            </Select>
          </Field>
          <Field label="规格"><TextInput value={spec} onChange={(e) => setSpec(e.target.value)} placeholder="如：专业版" /></Field>
          <Field label="单位"><TextInput value={unit} onChange={(e) => setUnit(e.target.value)} /></Field>
          <Field label="服务周期（月）" hint="0 表示一次性交付"><TextInput type="number" min={0} value={timeLimits} onChange={(e) => setTimeLimits(e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="标准价（元）" required><TextInput type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
          <Field label="成本（元）"><TextInput type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
          <Field label="最低折扣" hint="低于该折扣需审批"><TextInput type="number" min={0} max={1} step="0.01" value={minDiscount} onChange={(e) => setMinDiscount(e.target.value)} /></Field>
        </div>
        <div className="flex items-center gap-6 text-sm text-text">
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={freePricing} onChange={(e) => setFreePricing(e.target.checked)} />自由定价
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />上架
          </label>
        </div>
        <div className="rounded-lg border border-border bg-bg/40 p-3">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-text">
            <input type="checkbox" checked={allowGift} onChange={(e) => setAllowGift(e.target.checked)} />允许作为赠送项目
          </label>
          {allowGift ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="每订单最大赠送数量" hint="留空表示不限数量">
                <TextInput type="number" min={1} value={maxGiftQty} onChange={(e) => setMaxGiftQty(e.target.value)} placeholder="不限" />
              </Field>
              <Field label="赠送金额占比上限（%）" hint="按原价合计占订单总额比例，留空不限">
                <TextInput type="number" min={0.01} max={100} step="0.01" value={maxGiftRatio} onChange={(e) => setMaxGiftRatio(e.target.value)} placeholder="不限" />
              </Field>
            </div>
          ) : (
            <div className="mt-2 text-xs text-text-faint">该产品在报价单中将无法勾选为赠送行</div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
