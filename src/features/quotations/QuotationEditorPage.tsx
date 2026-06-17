import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, FileDown, Plus, Send, Trash2 } from 'lucide-react';
import { approvalsApi, productsApi, quotationsApi } from '@/api/crm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button, Card, CardHeader } from '@/components/ui/primitives';
import { MoneyText } from '@/components/ui/MoneyText';
import { StatusTag } from '@/components/ui/StatusTag';
import { Select } from '@/components/ui/form';
import { useUI } from '@/store/ui';
import { add, mul, rate, sub, d } from '@/lib/money';
import { cn } from '@/lib/cn';
import { DELIVERY_TYPE, PRODUCT_KIND, QUOTE_TYPE_OPTIONS, resolveTierPrice } from '@/lib/enums';
import type { Product, ProductTier } from '@/types';

interface Line {
  id: number;
  productId: number;
  productName: string;
  spec?: string;
  quantity: number;
  price: string;
  discountRate: string;
  cost: string;
  minDiscount: string;
  kind?: 1 | 2;
  tiers?: ProductTier[]; // 数据类阶梯价
}

const GROSS_WARN = 30; // 毛利率低于此值高亮

let lid = 1;

export function QuotationEditorPage() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const toast = useUI((s) => s.toast);

  const { data: products = [] } = useQuery({ queryKey: ['products-all'], queryFn: () => productsApi.all() });
  const { data: existing } = useQuery({
    queryKey: ['quotation', id],
    queryFn: () => quotationsApi.get(Number(id)),
    enabled: !isNew,
  });
  const { data: existingLines = [] } = useQuery({
    queryKey: ['quotation-products', id],
    queryFn: () => quotationsApi.products(Number(id)),
    enabled: !isNew,
  });

  const [lines, setLines] = useState<Line[]>([]);
  const [orderDiscount, setOrderDiscount] = useState('1.00');
  const [otherCharges, setOtherCharges] = useState('0');
  const [discount, setDiscount] = useState('0');
  const [quoteType, setQuoteType] = useState('2');
  const [seeded, setSeeded] = useState(false);

  // 用既有数据初始化（一次）
  if (!isNew && !seeded && existingLines.length > 0) {
    setLines(
      existingLines.map((l) => ({
        id: lid++,
        productId: l.productId,
        productName: l.productName,
        spec: l.spec,
        quantity: l.quantity,
        price: l.price,
        discountRate: l.discountRate,
        cost: d(l.cost).div(l.quantity || 1).toFixed(2),
        minDiscount: '0.70',
      })),
    );
    if (existing) {
      setOrderDiscount(existing.orderDiscountRate);
      setOtherCharges(existing.otherCharges);
      setDiscount(existing.discount);
      setQuoteType(String(existing.quoteType ?? 2));
    }
    setSeeded(true);
  }

  const addLine = async (p: Product) => {
    const newId = lid++;
    setLines((ls) => [
      ...ls,
      { id: newId, productId: p.productId, productName: p.name, spec: p.spec, quantity: 1, price: p.price, discountRate: '1.00', cost: p.cost, minDiscount: p.minDiscount, kind: p.kind },
    ]);
    // 数据类：拉取阶梯价，按数量自动取单价
    if (p.kind === 1) {
      const tiers = await productsApi.tiers(p.productId);
      const unit = resolveTierPrice(tiers, 1) ?? p.price;
      setLines((ls) => ls.map((l) => (l.id === newId ? { ...l, tiers, price: unit } : l)));
    }
  };
  const update = (id: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  // 数量变化：数据类按阶梯重算单价
  const setQty = (id: number, qty: number) =>
    setLines((ls) =>
      ls.map((l) => {
        if (l.id !== id) return l;
        const quantity = Math.max(1, qty || 1);
        const price = l.tiers && l.tiers.length ? resolveTierPrice(l.tiers, quantity) ?? l.price : l.price;
        return { ...l, quantity, price };
      }),
    );
  const remove = (id: number) => setLines((ls) => ls.filter((l) => l.id !== id));

  // 实时计算
  const calc = useMemo(() => {
    let total = '0';
    let cost = '0';
    const rows = lines.map((l) => {
      const salePrice = mul(l.price, l.discountRate);
      const subtotal = mul(salePrice, l.quantity);
      const lineCost = mul(l.cost, l.quantity);
      total = add(total, subtotal);
      cost = add(cost, lineCost);
      const belowMin = d(l.discountRate).lt(l.minDiscount);
      return { ...l, salePrice, subtotal, lineCost, belowMin };
    });
    const amount = sub(add(mul(total, orderDiscount), otherCharges), discount);
    const grossProfit = sub(amount, cost);
    const grossRate = rate(grossProfit, amount);
    const needApproval = rows.some((r) => r.belowMin);
    return { rows, total, cost, amount, grossProfit, grossRate, needApproval };
  }, [lines, orderDiscount, otherCharges, discount]);

  const lowMargin = Number(calc.grossRate) < GROSS_WARN && lines.length > 0;

  return (
    <div>
      <PageHeader
        title={isNew ? '新建报价单' : `报价单 ${existing?.code ?? ''}`}
        description="行内实时算价 · 毛利率预警 · 折扣超限触发审批"
        extra={
          <>
            <Button onClick={() => toast('已导出 PDF', 'success')}><FileDown size={14} />导出PDF</Button>
            <Button
              onClick={async () => {
                if (isNew) return toast('请先保存报价单再提交审批', 'info');
                try {
                  await approvalsApi.submit({ businessType: 1, businessId: Number(id), businessName: existing?.code ?? `报价单 ${id}` });
                  toast(calc.needApproval ? '折扣超限，已提交审批流' : '已提交审批流', 'success');
                } catch (e) {
                  toast(e instanceof Error ? e.message : '提交失败', 'error');
                }
              }}
            >
              <Send size={14} />提交审批
            </Button>
            <Button variant="primary" onClick={() => { toast('已生成合同并继承全部行项目', 'success'); navigate('/contracts'); }}>
              生成合同
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          {/* 基本信息 */}
          <Card>
            <CardHeader title="基本信息" />
            <div className="flex flex-wrap items-end gap-6 p-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text">报价类型</label>
                <Select value={quoteType} onChange={(e) => setQuoteType(e.target.value)} className="w-40">
                  {QUOTE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
                {(quoteType === '3' || quoteType === '4') && (
                  <span className="text-xs text-text-faint">
                    {quoteType === '3' ? '招投标标书：建议附技术/商务分册' : '框架协议：约定阶梯单价与采购总量'}
                  </span>
                )}
              </div>
              <div className="text-sm text-text-weak">
                客户：{existing?.customerName ?? '—'}
              </div>
            </div>
          </Card>

          {/* 行项目编辑 */}
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
                        <span className="shrink-0 text-xs text-text-faint">
                          {p.kind === 1 ? '阶梯价' : <MoneyText value={p.price} />}
                        </span>
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
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-text">{r.productName}</span>
                          {r.kind && <StatusTag kind={PRODUCT_KIND[r.kind].kind} label={PRODUCT_KIND[r.kind].label} dot={false} />}
                        </div>
                        <div className="text-xs text-text-faint">
                          {r.spec}
                          {r.tiers && r.tiers.length > 0 && <span className="ml-1 text-primary">· 阶梯价</span>}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <NumInput value={String(r.quantity)} onChange={(v) => setQty(r.id, Number(v))} width="w-14" />
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.price}</td>
                      <td className="px-2 py-2 text-right">
                        <div className="flex flex-col items-end">
                          <NumInput
                            value={r.discountRate}
                            onChange={(v) => update(r.id, { discountRate: v })}
                            width="w-16"
                            className={cn(r.belowMin && 'border-danger text-danger')}
                          />
                          {r.belowMin && <span className="text-[10px] text-danger">低于最低折扣 {r.minDiscount}</span>}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.salePrice}</td>
                      <td className="px-2 py-2 text-right font-medium tabular-nums">{r.subtotal}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-text-weak">{sub(r.subtotal, r.lineCost)}</td>
                      <td className="px-2 py-2 text-right">
                        <button onClick={() => remove(r.id)} className="text-text-faint hover:text-danger">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {lines.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-sm text-text-faint">点击「添加产品」开始报价</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* 实时汇总 */}
        <Card className="h-fit">
          <CardHeader title="报价汇总" />
          <div className="space-y-3 p-4 text-sm">
            <Row label="产品合计" value={<MoneyText value={calc.total} strong />} />
            <EditRow label="整单折扣率" value={orderDiscount} onChange={setOrderDiscount} />
            <EditRow label="其他费用" value={otherCharges} onChange={setOtherCharges} money />
            <EditRow label="优惠" value={discount} onChange={setDiscount} money />
            <div className="my-2 h-px bg-border" />
            <Row label="报价金额" value={<MoneyText value={calc.amount} strong className="text-lg text-primary" />} />
            <Row label="预估成本" value={<MoneyText value={calc.cost} className="text-text-weak" />} />
            <Row label="毛利" value={<MoneyText value={calc.grossProfit} />} />
            <Row
              label="毛利率"
              value={
                <span className={cn('font-semibold tabular-nums', lowMargin ? 'text-danger' : 'text-success')}>
                  {calc.grossRate}%
                </span>
              }
            />
            {lowMargin && (
              <div className="flex items-center gap-1.5 rounded-md bg-[#FDECEC] px-3 py-2 text-xs text-danger">
                <AlertTriangle size={13} />毛利率低于 {GROSS_WARN}% 阈值，请关注
              </div>
            )}
            {calc.needApproval && (
              <div className="flex items-center gap-1.5 rounded-md bg-[#FEF3E0] px-3 py-2 text-xs text-warning">
                <AlertTriangle size={13} />存在折扣超限行项目，提交后将触发审批
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-weak">{label}</span>
      {value}
    </div>
  );
}
function EditRow({ label, value, onChange, money }: { label: string; value: string; onChange: (v: string) => void; money?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-weak">{label}</span>
      <div className="flex items-center gap-1">
        {money && <span className="text-text-faint">¥</span>}
        <NumInput value={value} onChange={onChange} width="w-24" />
      </div>
    </div>
  );
}
function NumInput({ value, onChange, width = 'w-20', className }: { value: string; onChange: (v: string) => void; width?: string; className?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn('h-7 rounded border border-border px-2 text-right text-sm tabular-nums outline-none focus:border-primary', width, className)}
    />
  );
}
