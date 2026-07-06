import { formatMoney } from '@/lib/money';
import { formatDate } from '@/lib/format';
import { QUOTE_TYPE } from '@/lib/enums';
import type { ApiQuoteItem } from '@/types';

interface PrintLine {
  productName: string;
  spec?: string;
  quantity: number;
  price: string;
  discountRate: string;
  salePrice: string;
  subtotal: string;
  usage?: boolean;
  gift?: boolean;
  apiItems?: ApiQuoteItem[];
}
interface PrintData {
  quoteType: number;
  code?: string;
  customerName?: string;
  date?: string;
  currency?: string;
  serviceYears?: number;
  contractTerm?: number;
  remark?: string;
  lines: PrintLine[];
  total: string;
  orderDiscount: string;
  otherCharges: string;
  discount: string;
  amount: string;
}

// 打印为 PDF（浏览器原生 print-to-PDF，中文字体直接可用，无需嵌入字体）
export function printQuotation(d: PrintData) {
  const title = `${QUOTE_TYPE[d.quoteType]?.label ?? '报价'}单`;
  const cur = d.currency ?? 'CNY';
  const rows = d.lines
    .map((l, i) => {
      const apiList = l.usage && l.apiItems?.length
        ? `<div class="api">数据接口（预估量按年）：${l.apiItems
            .map((it) => `${esc(it.name)} ¥${it.quotePrice}/${esc(it.unit)}${it.estCalls > 0 ? ` × 年 ${it.estCalls.toLocaleString('zh-CN')}${esc(it.unit)}` : ''}`)
            .join('；')}</div>`
        : '';
      const nameTag = l.gift ? ' <span class="gift">赠送</span>' : '';
      return `<tr>
        <td>${i + 1}</td>
        <td>${esc(l.productName)}${nameTag}<div class="spec">${esc(l.spec ?? '')}${l.usage ? ' · 按用量/接口单价(框架)' : ''}</div>${apiList}</td>
        <td class="r">${l.usage ? '按量' : l.quantity}</td>
        <td class="r">${formatMoney(l.price, cur)}</td>
        <td class="r">${l.gift ? '赠送' : (Number(l.discountRate) * 100).toFixed(0) + '%'}</td>
        <td class="r">${l.gift ? formatMoney('0', cur) : formatMoney(l.salePrice, cur) + (l.usage ? '/接口' : '')}</td>
        <td class="r">${l.gift ? formatMoney('0', cur) : (l.usage ? '按量结算' : formatMoney(l.subtotal, cur))}</td>
      </tr>`;
    })
    .join('');

  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title>
  <style>
    *{box-sizing:border-box} body{font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#1A2233;margin:0;padding:40px}
    .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #2A6FF0;padding-bottom:16px}
    .brand{font-size:20px;font-weight:700;color:#2A6FF0}
    h1{font-size:24px;margin:4px 0 0}
    .meta{margin:18px 0;font-size:13px;color:#5B6676;line-height:1.9}
    table{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px}
    th,td{border:1px solid #E6E9EE;padding:8px 10px;text-align:left}
    th{background:#F6F8FA;color:#5B6676;font-weight:600}
    td.r,th.r{text-align:right;font-variant-numeric:tabular-nums}
    .spec{color:#97A1B0;font-size:11px}
    .api{color:#5B6676;font-size:11px;margin-top:4px;line-height:1.6}
    .gift{display:inline-block;background:#E7F7F0;color:#12B76A;font-size:10px;padding:1px 5px;border-radius:4px;margin-left:4px}
    .remark{margin-top:18px;font-size:12px;color:#5B6676;line-height:1.8;white-space:pre-wrap;border:1px solid #E6E9EE;border-radius:6px;padding:10px 12px;background:#F6F8FA}
    .totals{margin-top:16px;margin-left:auto;width:300px;font-size:13px}
    .totals div{display:flex;justify-content:space-between;padding:4px 0}
    .totals .amt{border-top:2px solid #2A6FF0;margin-top:6px;padding-top:8px;font-size:16px;font-weight:700;color:#2A6FF0}
    .foot{margin-top:40px;font-size:12px;color:#97A1B0;line-height:1.8}
    @media print{body{padding:0}}
  </style></head><body>
    <div class="head">
      <div><div class="brand">企查查 NextCRM</div><h1>${title}</h1></div>
      <div class="meta" style="text-align:right">
        ${d.code ? `单据编号：${esc(d.code)}<br>` : ''}日期：${formatDate(d.date ?? new Date().toISOString())}
      </div>
    </div>
    <div class="meta">客户名称：<b>${esc(d.customerName ?? '—')}</b>　币种：${cur}${
      d.serviceYears ? `　服务年限：<b>${d.serviceYears} 年</b>` : ''
    }${d.contractTerm ? `　合同限期：${d.contractTerm} 个月` : ''}</div>
    <table>
      <thead><tr><th>#</th><th>产品 / 规格</th><th class="r">数量</th><th class="r">原价</th><th class="r">折扣</th><th class="r">单价</th><th class="r">小计</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7" style="text-align:center;color:#97A1B0">无明细</td></tr>'}</tbody>
    </table>
    <div class="totals">
      <div><span>产品合计</span><span>${formatMoney(d.total, cur)}</span></div>
      <div><span>整单折扣率</span><span>${(Number(d.orderDiscount) * 100).toFixed(0)}%</span></div>
      <div><span>其他费用</span><span>${formatMoney(d.otherCharges, cur)}</span></div>
      <div><span>优惠</span><span>-${formatMoney(d.discount, cur)}</span></div>
      <div class="amt"><span>${title}金额</span><span>${formatMoney(d.amount, cur)}</span></div>
    </div>
    ${d.remark ? `<div class="remark"><b>报价说明</b><br>${esc(d.remark)}</div>` : ''}
    <div class="foot">
      说明：本${title}由销售人员出具，最终以双方签署的合同为准。<br>
      盖章 / 签字：________________________
    </div>
    <script>window.onload=function(){window.print()}</script>
  </body></html>`;

  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}

function esc(s: string): string {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
}
