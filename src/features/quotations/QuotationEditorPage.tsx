import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileDown, Plus, Save, Send, Trash2 } from 'lucide-react';
import { approvalsApi, customersApi, groupsApi, opportunitiesApi, productsApi, quotationsApi } from '@/api/crm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button, Card, CardHeader } from '@/components/ui/primitives';
import { MoneyText } from '@/components/ui/MoneyText';
import { StatusTag } from '@/components/ui/StatusTag';
import { Field, Select } from '@/components/ui/form';
import { Dialog } from '@/components/ui/Dialog';
import { useUI } from '@/store/ui';
import { add, mul, rate, sub, d } from '@/lib/money';
import { cn } from '@/lib/cn';
import { PRODUCT_KIND, QUOTE_TYPE, QUOTE_TYPE_OPTIONS, resolveTierPrice } from '@/lib/enums';
import { EntitySearchSelect } from '@/components/ui/EntitySearchSelect';
import { dayjs } from '@/lib/format';
import { printQuotation } from './printQuotation';
import { ApiItemsPicker } from './ApiItemsPicker';
import type { ApiQuoteItem, Product, ProductTier } from '@/types';

interface Line {
  id: number;
  productId: number;
  productName: string;
  spec?: string;
  quantity: number;
  price: string;
  discountRate: string;
  cost: string; // 单位成本
  minDiscount: string; // 绝对下限
  salesDiscount: string; // 销售自主下限
  kind?: 1 | 2;
  tiers?: ProductTier[];
  pricingMode: 'qty' | 'usage'; // 按数量 / 按用量(API接口单价，框架)
  apiItems?: ApiQuoteItem[]; // 数据接口报价清单（按量行，选自价目表）
  gift?: boolean; // 赠送项目（折扣 0、实际单价 0；成本照记体现真实毛利）
}

const GROSS_WARN = 30;
let lid = 1;

export function QuotationEditorPage() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const toast = useUI((s) => s.toast);

  const { data: products = [] } = useQuery({ queryKey: ['products-all'], queryFn: () => productsApi.all() });
  const { data: policy = [] } = useQuery({ queryKey: ['discount-policy'], queryFn: () => quotationsApi.discountPolicy() });
  const { data: existing } = useQuery({ queryKey: ['quotation', id], queryFn: () => quotationsApi.get(Number(id)), enabled: !isNew });
  const { data: existingLines = [] } = useQuery({ queryKey: ['quotation-products', id], queryFn: () => quotationsApi.products(Number(id)), enabled: !isNew });
  // 新建时选择客户

  const [lines, setLines] = useState<Line[]>([]);
  const [orderDiscount, setOrderDiscount] = useState('1.00');
  const [ocItems, setOcItems] = useState<{ name: string; amount: string }[]>([]);
  const [discount, setDiscount] = useState('0');
  const otherChargesTotal = ocItems.reduce((s, i) => add(s, i.amount || '0'), '0');
  const [quoteType, setQuoteType] = useState('1'); // 默认询价
  const [customerId, setCustomerId] = useState<number | undefined>();
  const [groupId, setGroupId] = useState<number | undefined>();
  const [groupName, setGroupName] = useState<string | undefined>();
  const [signOpen, setSignOpen] = useState(false);
  const [opportunityId, setOpportunityId] = useState<number | undefined>();
  const [quoteDate, setQuoteDate] = useState('');
  const [expiredDate, setExpiredDate] = useState('');
  const [contractTerm, setContractTerm] = useState('');
  const [name, setName] = useState('');
  const [remark, setRemark] = useState(''); // 报价说明
  const [serviceYears, setServiceYears] = useState(''); // 服务年限（年）
  const [seeded, setSeeded] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [apiPickerLine, setApiPickerLine] = useState<number | null>(null); // 正在编辑接口清单的行

  // 当前报价单的客户分级（决定折扣自主上限）
  const effCustomerId = customerId ?? existing?.customerId;
  const { data: customer } = useQuery({
    queryKey: ['customer', effCustomerId],
    queryFn: () => customersApi.get(effCustomerId!),
    enabled: !!effCustomerId,
  });
  const levelCap = policy.find((p) => p.levelTermId === customer?.level)?.maxDiscount ?? '0.95';
  // 仅该客户名下的商机（服务端按数据范围过滤）
  const { data: oppPage } = useQuery({
    queryKey: ['opps-by-cust', effCustomerId],
    queryFn: () => opportunitiesApi.list({ page: 1, pageSize: 100, filters: { customerId: effCustomerId } }),
    enabled: !!effCustomerId,
  });

  // 价格保护：该客户历史报价单价（同产品）
  const { data: lastPrices = [] } = useQuery({
    queryKey: ['last-prices', effCustomerId],
    queryFn: () => customersApi.lastQuotePrices(effCustomerId!),
    enabled: !!effCustomerId,
  });
  const lastPriceMap = new Map(lastPrices.map((p) => [p.productId, p.unitPrice]));

  if (!isNew && !seeded && existingLines.length > 0) {
    setLines(
      existingLines.map((l) => {
        const p = products.find((x) => x.productId === l.productId);
        return {
          id: lid++, productId: l.productId, productName: l.productName, spec: l.spec, quantity: l.quantity,
          price: l.price, discountRate: l.discountRate, cost: d(l.cost).div(l.quantity || 1).toFixed(2),
          minDiscount: p?.minDiscount ?? '0.70', salesDiscount: p?.salesDiscount ?? '0.95', kind: p?.kind,
          pricingMode: (l.pricingMode ?? 'qty') as 'qty' | 'usage',
          apiItems: l.apiItems,
          gift: l.gift,
        };
      }),
    );
    if (existing) {
      setOrderDiscount(existing.orderDiscountRate);
      setOcItems(
        existing.otherChargesItems?.length
          ? existing.otherChargesItems.map((i) => ({ name: i.name, amount: String(i.amount) }))
          : Number(existing.otherCharges) > 0
          ? [{ name: '其他费用', amount: existing.otherCharges }]
          : [],
      );
      setDiscount(existing.discount); setQuoteType(String(existing.quoteType ?? 2));
      setName(existing.name); setCustomerId(existing.customerId); setSavedId(existing.quotationId);
      setGroupId(existing.groupId ?? undefined); setGroupName(existing.groupName);
      setOpportunityId(existing.opportunityId);
      setQuoteDate((existing.quoteDate ?? '').slice(0, 10));
      setExpiredDate((existing.expiredDate ?? '').slice(0, 10));
      setContractTerm(existing.contractTerm != null ? String(existing.contractTerm) : '');
      setRemark(existing.remark ?? '');
      setServiceYears(existing.serviceYears != null ? String(existing.serviceYears) : '');
    }
    setSeeded(true);
  }

  const addLine = async (p: Product) => {
    const newId = lid++;
    setLines((ls) => [...ls, {
      id: newId, productId: p.productId, productName: p.name, spec: p.spec, quantity: 1, price: p.price,
      discountRate: '1.00', cost: p.cost, minDiscount: p.minDiscount, salesDiscount: p.salesDiscount ?? '0.95', kind: p.kind,
      pricingMode: 'qty',
    }]);
    if (p.kind === 1) {
      const tiers = await productsApi.tiers(p.productId);
      setLines((ls) => ls.map((l) => (l.id === newId ? { ...l, tiers, price: resolveTierPrice(tiers, 1) ?? p.price } : l)));
    }
  };
  const update = (lineId: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.id === lineId ? { ...l, ...patch } : l)));
  const setQty = (lineId: number, qty: number) =>
    setLines((ls) => ls.map((l) => {
      if (l.id !== lineId) return l;
      const quantity = Math.max(1, qty || 1);
      const price = l.tiers?.length ? resolveTierPrice(l.tiers, quantity) ?? l.price : l.price;
      return { ...l, quantity, price };
    }));
  const remove = (lineId: number) => setLines((ls) => ls.filter((l) => l.id !== lineId));
  const setMode = (lineId: number, mode: 'qty' | 'usage') => {
    setLines((ls) => ls.map((l) => (l.id === lineId ? { ...l, pricingMode: mode } : l)));
    if (mode === 'usage' && quoteType !== '4') {
      setQuoteType('4'); // 按用量/接口报价 → 框架协议
      toast('已切换为框架协议（按用量/接口单价，调用量未知）', 'info');
    }
  };

  const calc = useMemo(() => {
    let total = '0', cost = '0';
    const rows = lines.map((l) => {
      const usage = l.pricingMode === 'usage';
      const gift = !!l.gift;
      const salePrice = gift ? '0.00' : mul(l.price, l.discountRate); // 单价/接口单价（折后）；赠送=0
      const subtotal = usage || gift ? '0.00' : mul(salePrice, l.quantity);
      const lineCost = usage ? '0.00' : mul(l.cost, l.quantity); // 赠送成本照记，体现真实毛利
      total = add(total, subtotal); cost = add(cost, lineCost);
      // 销售自主下限 = max(客户分级上限, 产品自主下限)
      const floor = Math.max(Number(levelCap), Number(l.salesDiscount));
      // 有效折扣 = 行折扣 × 整单折扣（整单折扣也纳入权限判定）；赠送项不参与折扣权限校验
      const effRate = mul(l.discountRate, orderDiscount);
      const belowAuthority = !gift && d(effRate).lt(floor.toString());
      const belowHard = !gift && d(effRate).lt(l.minDiscount);
      return { ...l, usage, gift, salePrice, subtotal, lineCost, floor, effRate, belowAuthority, belowHard };
    });
    const amount = sub(add(mul(total, orderDiscount), otherChargesTotal), discount);
    const grossProfit = sub(amount, cost);
    const grossRate = rate(grossProfit, amount);
    const needApproval = rows.some((r) => r.belowAuthority);
    const hasHard = rows.some((r) => r.belowHard);
    const hasUsage = rows.some((r) => r.usage);
    // 数据接口清单：预估月费用（Σ 报价单价×预估月量；框架按实际用量结算，不计入固定总价）
    const estMonthly = rows.reduce(
      (s, r) => (r.usage && r.apiItems ? s + r.apiItems.reduce((x, i) => x + i.quotePrice * i.estCalls, 0) : s), 0);
    return { rows, total, cost, amount, grossProfit, grossRate, needApproval, hasHard, hasUsage, estMonthly };
  }, [lines, orderDiscount, otherChargesTotal, discount, levelCap]);

  const lowMargin = Number(calc.grossRate) < GROSS_WARN && lines.length > 0;
  const isInquiry = quoteType === '1';
  const canSelfIssue = isInquiry && !calc.needApproval; // 询价 + 折扣在销售权限内 → 自助出单
  const persistedId = savedId ?? (isNew ? null : Number(id));

  const payload = () => ({
    name: name || `${customer?.name ?? ''} ${QUOTE_TYPE[Number(quoteType)].label}单`,
    customerId: effCustomerId, groupId, opportunityId, quoteType: Number(quoteType), currency: 'CNY',
    orderDiscountRate: orderDiscount, otherCharges: otherChargesTotal, discount,
    otherChargesItems: ocItems.filter((i) => i.name.trim() || Number(i.amount) > 0).map((i) => ({ name: i.name, amount: Number(i.amount || 0) })),
    quoteDate: quoteDate || undefined, expiredDate: expiredDate || undefined,
    contractTerm: contractTerm ? Number(contractTerm) : undefined,
    remark: remark.trim() || undefined,
    serviceYears: serviceYears ? Number(serviceYears) : undefined,
    lines: lines.map((l) => ({
      productId: l.productId, spec: l.spec, quantity: l.pricingMode === 'usage' ? 1 : l.quantity,
      price: l.price, discountRate: l.gift ? '0' : l.discountRate,
      cost: l.pricingMode === 'usage' ? '0' : mul(l.cost, l.quantity),
      pricingMode: l.pricingMode,
      apiItems: l.pricingMode === 'usage' && l.apiItems?.length ? l.apiItems : undefined,
      gift: !!l.gift,
    })),
  });

  const ensureSaved = async (): Promise<number | null> => {
    if (!effCustomerId) { toast('请先选择客户', 'error'); return null; }
    if (lines.length === 0) { toast('请先添加产品', 'error'); return null; }
    if (expiredDate && expiredDate < dayjs().format('YYYY-MM-DD')) { toast('报价有效期不能早于当前日期', 'error'); return null; }
    if (persistedId) { await quotationsApi.update(persistedId, payload()); return persistedId; }
    const created = await quotationsApi.create(payload());
    setSavedId(created.quotationId);
    return created.quotationId;
  };

  const onSaveDraft = async () => {
    setBusy(true);
    try { const sid = await ensureSaved(); if (sid) toast('已保存草稿', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : '保存失败', 'error'); }
    finally { setBusy(false); }
  };
  const onConfirm = async () => { // 询价自助出单 → 客户确认
    setBusy(true);
    try { const sid = await ensureSaved(); if (!sid) return; await quotationsApi.confirm(sid); toast('询价单已确认出单（销售权限内）', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : '操作失败', 'error'); }
    finally { setBusy(false); }
  };
  const onSubmit = async () => {
    setBusy(true);
    try {
      const sid = await ensureSaved(); if (!sid) return;
      await approvalsApi.submit({ businessType: 1, businessId: sid, businessName: name || `报价单 ${sid}` });
      toast('已提交审批流（折扣超销售权限）', 'success');
    } catch (e) { toast(e instanceof Error ? e.message : '提交失败', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader
        title={isNew ? `新建${QUOTE_TYPE[Number(quoteType)].label}单` : `${existing?.code ?? ''}`}
        description="询价销售自助出单 · 报价/超权限折扣走审批 · 实时算价"
        extra={
          <>
            <Button
              onClick={() => {
                const okPrint = printQuotation({
                  quoteType: Number(quoteType),
                  code: existing?.code,
                  customerName: customer?.name ?? existing?.customerName,
                  date: existing?.quoteDate,
                  currency: 'CNY',
                  lines: calc.rows.map((r) => ({ productName: r.productName, spec: r.spec, quantity: r.quantity, price: r.price, discountRate: r.discountRate, salePrice: r.salePrice, subtotal: r.subtotal, usage: r.usage })),
                  total: calc.total, orderDiscount, otherCharges: otherChargesTotal, discount, amount: calc.amount,
                });
                if (!okPrint) toast('请允许弹出窗口以导出 PDF', 'error');
              }}
            >
              <FileDown size={14} />导出PDF
            </Button>
            <Button onClick={onSaveDraft} disabled={busy}><Save size={14} />保存草稿</Button>
            {canSelfIssue ? (
              <Button variant="primary" onClick={onConfirm} disabled={busy}><CheckCircle2 size={14} />确认出单</Button>
            ) : (
              <Button variant="primary" onClick={onSubmit} disabled={busy}><Send size={14} />提交审批</Button>
            )}
            <Button onClick={async () => { const sid = await ensureSaved(); if (sid) setSignOpen(true); }} disabled={busy}>
              生成合同
            </Button>
          </>
        }
      />

      {apiPickerLine != null && (
        <ApiItemsPicker
          initial={lines.find((l) => l.id === apiPickerLine)?.apiItems ?? []}
          onSave={(items) => update(apiPickerLine, { apiItems: items })}
          onClose={() => setApiPickerLine(null)}
        />
      )}

      {signOpen && (persistedId ?? savedId) && (
        <SignEntityDialog
          quotationId={(persistedId ?? savedId)!}
          groupId={groupId ?? customer?.groupId ?? undefined}
          defaultCustomerId={effCustomerId}
          defaultCustomerName={customer?.name}
          onClose={() => setSignOpen(false)}
        />
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          {/* 基本信息 */}
          <Card>
            <CardHeader title="基本信息" />
            <div className="flex flex-wrap items-end gap-6 p-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text">报价类型</label>
                <Select value={quoteType} onChange={(e) => setQuoteType(e.target.value)} className="w-36">
                  {QUOTE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text">客户</label>
                {isNew ? (
                  <EntitySearchSelect
                    value={customerId}
                    valueName={groupId ? `${groupName ?? '集团'}（集团报价）` : customer?.name}
                    onChange={(id) => { setCustomerId(id); setGroupId(undefined); setGroupName(undefined); setOpportunityId(undefined); }}
                    onPickGroup={(gid, gname, mainId) => {
                      setGroupId(gid); setGroupName(gname);
                      setCustomerId(mainId); // 主成员承载分级/历史价，签约主体生成合同时再选
                      setOpportunityId(undefined);
                      toast(`已按集团报价：${gname}（签约主体在生成合同时选择）`, 'info');
                    }}
                  />
                ) : (
                  <span className="flex h-9 items-center text-sm text-text">{existing?.customerName ?? '—'}</span>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text">关联商机</label>
                <Select
                  value={opportunityId ?? ''}
                  className="w-56"
                  disabled={!effCustomerId}
                  onChange={(e) => setOpportunityId(Number(e.target.value) || undefined)}
                >
                  <option value="">{effCustomerId ? '不关联' : '请先选客户'}</option>
                  {(oppPage?.list ?? []).map((o) => (
                    <option key={o.opportunityId} value={o.opportunityId}>{o.code} · {o.name}</option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text">报价日期</label>
                <input type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} className="h-9 w-40 rounded-md border border-border px-3 text-sm outline-none focus:border-primary" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text">报价有效期</label>
                <input
                  type="date"
                  value={expiredDate}
                  min={dayjs().format('YYYY-MM-DD')}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v && v < dayjs().format('YYYY-MM-DD')) return toast('报价有效期不能早于当前日期', 'error');
                    setExpiredDate(v);
                  }}
                  className="h-9 w-40 rounded-md border border-border px-3 text-sm outline-none focus:border-primary"
                />
                {/* 快捷有效期：自报价日期（未填则今天）起算 */}
                <div className="flex items-center gap-1">
                  {([['三天', 3, 'day'], ['一周', 7, 'day'], ['一月', 1, 'month'], ['三个月', 3, 'month']] as const).map(([label, n, unit]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        const base = quoteDate && quoteDate >= dayjs().format('YYYY-MM-DD') ? dayjs(quoteDate) : dayjs();
                        setExpiredDate(base.add(n, unit).format('YYYY-MM-DD'));
                      }}
                      className="rounded border border-border px-1.5 py-0.5 text-[11px] text-text-weak hover:border-primary/50 hover:text-primary"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text">合同限期(月)</label>
                <input inputMode="numeric" value={contractTerm} onChange={(e) => setContractTerm(e.target.value.replace(/\D/g, ''))} placeholder="如 12" className="h-9 w-28 rounded-md border border-border px-3 text-sm tabular-nums outline-none focus:border-primary" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text">服务年限(年)</label>
                <input inputMode="numeric" value={serviceYears} onChange={(e) => setServiceYears(e.target.value.replace(/\D/g, ''))} placeholder="如 1" className="h-9 w-28 rounded-md border border-border px-3 text-sm tabular-nums outline-none focus:border-primary" />
              </div>
              {customer && (
                <div className="rounded-md bg-bg px-3 py-1.5 text-xs text-text-weak">
                  客户分级 <b className="text-text">{customer.level === 25 ? 'A' : customer.level === 26 ? 'B' : 'C'}</b>
                  {' '}· 销售自主折扣可至 <b className="text-primary">{(Number(levelCap) * 10).toFixed(1)} 折</b>
                  （{((1 - Number(levelCap)) * 100).toFixed(0)}% 内免审批）
                </div>
              )}
            </div>
            {/* 报价说明：随单保存，打印/对外说明用 */}
            <div className="px-4 pb-4">
              <label className="mb-1.5 block text-sm font-medium text-text">报价说明</label>
              <textarea
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                rows={2}
                placeholder="如：本报价含首年服务费；赠送项目随主套餐交付；价格含 6% 增值税…"
                className="w-full rounded-md border border-border bg-surface p-3 text-sm outline-none focus:border-primary"
              />
            </div>
            {(quoteType === '3' || quoteType === '4') && (
              <div className="px-4 pb-3 text-xs text-text-faint">
                {quoteType === '3' ? '招投标标书：建议附技术/商务分册，走审批后用于投标。' : '框架协议：约定阶梯单价与采购总量，走审批。'}
              </div>
            )}
          </Card>

          {/* 行项目 */}
          <Card>
            <CardHeader
              title="产品行项目"
              extra={
                <div className="group relative">
                  <Button size="sm"><Plus size={13} />添加产品</Button>
                  <div className="absolute right-0 top-8 z-20 hidden max-h-80 w-72 overflow-auto rounded-lg border border-border bg-surface py-1 shadow-card group-hover:block">
                    {products.map((p) => (
                      <button key={p.productId} onClick={() => addLine(p)} className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-sm hover:bg-bg">
                        <span className="flex items-center gap-1.5">
                          <StatusTag kind={PRODUCT_KIND[p.kind].kind} label={PRODUCT_KIND[p.kind].label} dot={false} />
                          <span className="truncate">{p.name}</span>
                        </span>
                        <span className="shrink-0 text-xs text-text-faint">{p.kind === 1 ? '阶梯价' : <MoneyText value={p.price} />}</span>
                      </button>
                    ))}
                  </div>
                </div>
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-bg/60 text-xs text-text-weak">
                    <th className="px-3 py-2 text-left">产品</th>
                    <th className="px-2 py-2 text-right">数量</th>
                    <th className="px-2 py-2 text-right">原价</th>
                    <th className="px-2 py-2 text-right">折扣率</th>
                    <th className="px-2 py-2 text-right">售价</th>
                    <th className="px-2 py-2 text-right">小计</th>
                    <th className="px-2 py-2 text-right">毛利</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {calc.rows.map((r) => (
                    <React.Fragment key={r.id}>
                    <tr className={cn('border-b border-border last:border-0', r.usage && r.apiItems?.length && 'border-b-0')}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-text">{r.productName}</span>
                          {r.kind && <StatusTag kind={PRODUCT_KIND[r.kind].kind} label={PRODUCT_KIND[r.kind].label} dot={false} />}
                          {r.gift && <StatusTag kind="success" label="赠送" dot={false} />}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-text-faint">
                          <span>{r.spec}{r.tiers?.length ? <span className="ml-1 text-primary">· 阶梯价</span> : null}</span>
                          {r.kind === 1 && (
                            <span className="inline-flex overflow-hidden rounded border border-border">
                              {(['qty', 'usage'] as const).map((m) => (
                                <button key={m} onClick={() => setMode(r.id, m)}
                                  className={cn('px-1.5 py-0.5 text-[10px]', r.pricingMode === m ? 'bg-primary text-white' : 'text-text-weak')}>
                                  {m === 'qty' ? '按数量' : '按用量'}
                                </button>
                              ))}
                            </span>
                          )}
                          {r.usage && (
                            <button
                              onClick={() => setApiPickerLine(r.id)}
                              className={cn('rounded border px-1.5 py-0.5 text-[10px]',
                                r.apiItems?.length ? 'border-primary/50 bg-primary-weak text-primary' : 'border-dashed border-border text-text-weak hover:border-primary/50 hover:text-primary')}
                            >
                              {r.apiItems?.length ? `数据接口 ${r.apiItems.length} 项` : '+ 选择数据接口（价目表）'}
                            </button>
                          )}
                          {/* 赠送开关：折扣 0、实际单价 0（不参与折扣权限校验，成本照记） */}
                          <button
                            onClick={() => update(r.id, { gift: !r.gift, discountRate: r.gift ? '1.00' : '0.0000' })}
                            className={cn('rounded border px-1.5 py-0.5 text-[10px]',
                              r.gift ? 'border-success bg-success/10 text-success' : 'border-border text-text-weak hover:border-success/60 hover:text-success')}
                            title={r.gift ? '取消赠送（恢复原价）' : '设为赠送项目（折扣 0、单价 0）'}
                          >
                            {r.gift ? '✓ 赠送' : '赠送'}
                          </button>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right">
                        {r.usage ? <span className="text-xs text-text-faint">按量</span>
                          : <NumInput value={String(r.quantity)} onChange={(v) => setQty(r.id, Number(v))} width="w-14" />}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.price}</td>
                      <td className="px-2 py-2 text-right">
                        {r.gift ? (
                          <span className="text-xs font-medium text-success">赠送</span>
                        ) : (
                          <div className="flex flex-col items-end">
                            <NumInput value={r.discountRate} onChange={(v) => update(r.id, { discountRate: v })} width="w-16"
                              className={cn(r.belowHard && 'border-danger text-danger', !r.belowHard && r.belowAuthority && 'border-warning text-warning')} />
                            {r.belowHard ? (
                              <span className="text-[10px] text-danger">超绝对下限 {r.minDiscount}</span>
                            ) : r.belowAuthority ? (
                              <span className="text-[10px] text-warning">超权限({r.floor.toFixed(2)})·需审批</span>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {r.gift ? (
                          <span className="tabular-nums text-success">0.00</span>
                        ) : (
                          <>
                            <div className="flex flex-col items-end">
                              <NumInput
                                value={r.salePrice}
                                width="w-20"
                                onChange={(v) => {
                                  const sale = Number(v);
                                  const base = Number(r.price);
                                  update(r.id, { discountRate: base > 0 ? (sale / base).toFixed(4) : '1.0000' });
                                }}
                              />
                              {r.usage && <span className="text-[10px] text-text-faint">接口单价</span>}
                            </div>
                            {lastPriceMap.has(r.productId) && (
                              <div className={cn('text-[10px]', d(r.salePrice).lt(lastPriceMap.get(r.productId)!) ? 'text-danger' : 'text-text-faint')}>
                                上次 {lastPriceMap.get(r.productId)}
                                {d(r.salePrice).lt(lastPriceMap.get(r.productId)!) && ' ·低于历史'}
                              </div>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right font-medium tabular-nums">
                        {r.gift ? <span className="text-xs text-success">¥0（赠）</span> : r.usage ? <span className="text-xs text-text-faint">按量结算</span> : r.subtotal}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-text-weak">{r.usage ? '—' : sub(r.subtotal, r.lineCost)}</td>
                      <td className="px-2 py-2 text-right"><button onClick={() => remove(r.id)} className="text-text-faint hover:text-danger"><Trash2 size={14} /></button></td>
                    </tr>
                    {/* 已选数据接口：直接在行项目下方列出（点击可再编辑） */}
                    {r.usage && (r.apiItems?.length ?? 0) > 0 && (
                      <tr className="border-b border-border last:border-0">
                        <td colSpan={8} className="px-3 pb-2 pt-0">
                          <div className="ml-4 overflow-hidden rounded-md border border-primary/20 bg-primary-weak/20">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-text-faint">
                                  <th className="px-2 py-1 text-left font-normal">ApiCode</th>
                                  <th className="px-2 py-1 text-left font-normal">数据接口</th>
                                  <th className="px-2 py-1 text-right font-normal">标准价</th>
                                  <th className="px-2 py-1 text-right font-normal">报价单价</th>
                                  <th className="px-2 py-1 text-right font-normal">预估年量</th>
                                  <th className="px-2 py-1 text-right font-normal">年费估算</th>
                                </tr>
                              </thead>
                              <tbody>
                                {r.apiItems!.map((i) => (
                                  <tr key={i.apiCode} className="border-t border-primary/10">
                                    <td className="px-2 py-1 font-mono text-text-faint">{i.apiCode}</td>
                                    <td className="px-2 py-1 text-text">{i.name}</td>
                                    <td className="px-2 py-1 text-right tabular-nums text-text-faint">¥{i.price}/{i.unit}</td>
                                    <td className={cn('px-2 py-1 text-right tabular-nums', i.quotePrice < i.price ? 'text-warning' : 'text-text')}>¥{i.quotePrice}/{i.unit}</td>
                                    <td className="px-2 py-1 text-right tabular-nums text-text-weak">{i.estCalls > 0 ? i.estCalls.toLocaleString() : '按实际'}</td>
                                    <td className="px-2 py-1 text-right tabular-nums text-text">{i.estCalls > 0 ? `≈¥${(i.quotePrice * i.estCalls).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}` : '—'}</td>
                                  </tr>
                                ))}
                                <tr className="border-t border-primary/10">
                                  <td colSpan={6} className="px-2 py-1 text-right">
                                    <button onClick={() => setApiPickerLine(r.id)} className="text-primary hover:underline">编辑接口清单</button>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  ))}
                  {lines.length === 0 && (
                    <tr><td colSpan={8} className="py-10 text-center text-sm text-text-faint">点击「添加产品」开始报价</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* 汇总 */}
        <Card className="h-fit">
          <CardHeader title={`${QUOTE_TYPE[Number(quoteType)].label}汇总`} />
          <div className="space-y-3 p-4 text-sm">
            <Row label="产品合计" value={<MoneyText value={calc.total} strong />} />
            <EditRow label="整单折扣率" value={orderDiscount} onChange={setOrderDiscount} />
            {/* 其他费用明细：内容 + 金额 */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-text-weak">其他费用</span>
                <button onClick={() => setOcItems((it) => [...it, { name: '', amount: '' }])} className="text-xs text-primary">+ 添加</button>
              </div>
              <div className="space-y-1.5">
                {ocItems.map((it, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input value={it.name} onChange={(e) => setOcItems((arr) => arr.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                      placeholder="费用内容(如实施/培训)" className="h-7 flex-1 rounded border border-border px-2 text-xs outline-none focus:border-primary" />
                    <NumInput value={it.amount} width="w-20" onChange={(v) => setOcItems((arr) => arr.map((x, j) => (j === i ? { ...x, amount: v } : x)))} />
                    <button onClick={() => setOcItems((arr) => arr.filter((_, j) => j !== i))} className="text-text-faint hover:text-danger"><Trash2 size={13} /></button>
                  </div>
                ))}
                {ocItems.length === 0 && <div className="text-xs text-text-faint">无其他费用</div>}
              </div>
              {ocItems.length > 0 && (
                <div className="mt-1 flex justify-between text-xs text-text-weak"><span>其他费用合计</span><MoneyText value={otherChargesTotal} /></div>
              )}
            </div>
            <EditRow label="优惠" value={discount} onChange={setDiscount} money />
            <div className="my-2 h-px bg-border" />
            <Row label="金额" value={<MoneyText value={calc.amount} strong className="text-lg text-primary" />} />
            {calc.estMonthly > 0 && (
              <Row
                label="预估年费用(接口)"
                value={<span className="tabular-nums text-text" title="按接口清单 报价单价×预估月调用量 估算；框架按实际用量结算，不计入固定金额">≈ ¥{calc.estMonthly.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}</span>}
              />
            )}
            <Row label="预估成本" value={<MoneyText value={calc.cost} className="text-text-weak" />} />
            <Row label="毛利" value={<MoneyText value={calc.grossProfit} />} />
            <Row label="毛利率" value={<span className={cn('font-semibold tabular-nums', lowMargin ? 'text-danger' : 'text-success')}>{calc.grossRate}%</span>} />

            {canSelfIssue && (
              <div className="flex items-center gap-1.5 rounded-md bg-[#E7F7F0] px-3 py-2 text-xs text-success">
                <CheckCircle2 size={13} />折扣在销售权限内，可直接「确认出单」无需审批
              </div>
            )}
            {calc.hasUsage && (
              <div className="rounded-md bg-[#FEF3E0] px-3 py-2 text-xs text-warning">
                含「按用量/接口单价」行：调用量未知，不计入固定总价，按框架协议约定单价后按实际用量结算。
              </div>
            )}
            {!isInquiry && (
              <div className="flex items-center gap-1.5 rounded-md bg-primary-weak px-3 py-2 text-xs text-primary">
                <Send size={13} />{QUOTE_TYPE[Number(quoteType)].label}需走审批流程
              </div>
            )}
            {isInquiry && calc.needApproval && (
              <div className="flex items-center gap-1.5 rounded-md bg-[#FEF3E0] px-3 py-2 text-xs text-warning">
                <AlertTriangle size={13} />折扣超销售权限，需提交审批
              </div>
            )}
            {calc.hasHard && (
              <div className="flex items-center gap-1.5 rounded-md bg-[#FDECEC] px-3 py-2 text-xs text-danger">
                <AlertTriangle size={13} />存在低于绝对下限的折扣，请调整
              </div>
            )}
            {lowMargin && (
              <div className="flex items-center gap-1.5 rounded-md bg-[#FDECEC] px-3 py-2 text-xs text-danger">
                <AlertTriangle size={13} />毛利率低于 {GROSS_WARN}%
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-center justify-between"><span className="text-text-weak">{label}</span>{value}</div>;
}
function EditRow({ label, value, onChange, money }: { label: string; value: string; onChange: (v: string) => void; money?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-weak">{label}</span>
      <div className="flex items-center gap-1">{money && <span className="text-text-faint">¥</span>}<NumInput value={value} onChange={onChange} width="w-24" /></div>
    </div>
  );
}
function NumInput({ value, onChange, width = 'w-20', className }: { value: string; onChange: (v: string) => void; width?: string; className?: string }) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)}
      className={cn('h-7 rounded border border-border px-2 text-right text-sm tabular-nums outline-none focus:border-primary', width, className)} />
  );
}

// 生成合同：选择签约主体（集团报价时可选集团下子公司）
function SignEntityDialog({ quotationId, groupId, defaultCustomerId, defaultCustomerName, onClose }: {
  quotationId: number; groupId?: number; defaultCustomerId?: number; defaultCustomerName?: string; onClose: () => void;
}) {
  const navigate = useNavigate();
  const toast = useUI((s) => s.toast);
  const [signId, setSignId] = useState<number | undefined>(defaultCustomerId);
  const [beginDate, setBeginDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const { data: members = [] } = useQuery({
    queryKey: ['group-members', groupId],
    queryFn: () => groupsApi.members(groupId!),
    enabled: !!groupId,
  });
  const options = members.length
    ? members
    : defaultCustomerId
    ? [{ customerId: defaultCustomerId, name: defaultCustomerName ?? `客户 ${defaultCustomerId}` } as any]
    : [];

  const submit = async () => {
    if (!signId) return toast('请选择签约主体', 'error');
    setBusy(true);
    try {
      const r = await quotationsApi.toContract(quotationId, { signCustomerId: signId, beginDate });
      toast(`合同 ${r.code} 已生成（签约主体已锁定）`, 'success');
      onClose();
      navigate(`/contracts/${r.contractId}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : '生成失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title="生成合同 · 选择签约主体" width="w-[480px]"
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" onClick={submit} disabled={busy}>{busy ? '生成中…' : '生成合同'}</Button></>}>
      <div className="space-y-4">
        {groupId ? (
          <p className="rounded-md bg-primary-weak/60 px-3 py-2 text-xs text-primary">集团报价：签约及开票主体可为集团下任一子公司，与实际业务一致。</p>
        ) : null}
        <Field label="签约主体" required>
          <Select value={signId ?? ''} onChange={(e) => setSignId(Number(e.target.value) || undefined)}>
            <option value="">请选择</option>
            {options.map((m: any) => <option key={m.customerId} value={m.customerId}>{m.name}</option>)}
          </Select>
        </Field>
        <Field label="合同开始日期">
          <input type="date" value={beginDate} onChange={(e) => setBeginDate(e.target.value)}
            className="h-9 w-44 rounded-md border border-border px-3 text-sm outline-none focus:border-primary" />
        </Field>
        <p className="text-xs text-text-faint">到期日=开始日+报价单「合同限期」；合同金额/毛利继承自报价单。</p>
      </div>
    </Dialog>
  );
}
