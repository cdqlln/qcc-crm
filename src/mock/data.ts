import type {
  BackLog,
  Contact,
  Contract,
  Customer,
  Invoice,
  Opportunity,
  Payment,
  PaymentSheet,
  PreCredit,
  Product,
  ProductTier,
  Quotation,
  QuotationProduct,
  Target,
  Tracking,
} from '@/types';
import { add, mul, rate, sub } from '@/lib/money';
import { dayjs } from '@/lib/format';

// 简单可复现伪随机
let seed = 20260608;
function rnd(): number {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}
function int(min: number, max: number): number {
  return Math.floor(rnd() * (max - min + 1)) + min;
}
function daysAgo(n: number): string {
  return dayjs().subtract(n, 'day').toISOString();
}
function daysAhead(n: number): string {
  return dayjs().add(n, 'day').toISOString();
}

const COMPANY_SUFFIX = ['科技有限公司', '信息技术有限公司', '网络科技有限公司', '智能科技有限公司', '数据服务有限公司', '电子商务有限公司'];
const COMPANY_PREFIX = ['星辰', '云图', '智联', '泛海', '锐思', '恒通', '万象', '博望', '津泰', '远见', '畅行', '聚信', '华瑞', '中科', '联创', '鼎峰', '盛元', '微澜', '青柚', '海岳'];
const INDUSTRIES = ['软件和信息技术服务', '批发和零售', '制造业', '金融业', '房地产', '教育', '医疗健康', '物流运输'];
const PROVINCES: [string, string, string][] = [
  ['江苏省', '苏州市', '工业园区'],
  ['上海市', '上海市', '浦东新区'],
  ['广东省', '深圳市', '南山区'],
  ['浙江省', '杭州市', '余杭区'],
  ['北京市', '北京市', '海淀区'],
  ['四川省', '成都市', '高新区'],
];
const PRODUCT_NAMES = ['企业查询专业版', '风险监控服务', '尽调报告(单次)', '数据API套餐', '海外KYC服务', '大数据风控引擎', '招投标监控', '知识产权监测'];

function companyName(): string {
  return pick(COMPANY_PREFIX) + pick(COMPANY_PREFIX) + pick(COMPANY_SUFFIX);
}

// ---------- 产品 §6.8 ----------
// 大类/交付：1数据 2产品；交付 1API 2离线数据包 3账号 4订阅（与 DB seed 对齐）
const PRODUCT_META: [1 | 2, 1 | 2 | 3 | 4][] = [
  [2, 3], [2, 4], [1, 2], [1, 1], [1, 1], [2, 4], [2, 4], [1, 1],
];
export const products: Product[] = PRODUCT_NAMES.map((name, i) => {
  const [kind, deliveryType] = PRODUCT_META[i] ?? [2, 3];
  return {
    productId: i + 1,
    code: `P${String(i + 1).padStart(4, '0')}`,
    name,
    categoryId: (i % 3) + 1,
    categoryName: ['基础服务', '数据服务', '增值服务'][i % 3],
    spec: pick(['标准版', '专业版', '旗舰版', '企业版']),
    unit: kind === 1 ? pick(['次', '万次', '套']) : pick(['账号', '年', '套']),
    timeLimits: pick([0, 12, 24, 36]),
    kind,
    deliveryType,
    active: true,
    freePricing: false,
    price: String(int(2, 60) * 1000),
    cost: String(int(1, 20) * 1000),
    minDiscount: '0.70',
    maxDiscount: '1.00',
  };
});

// 数据类产品的采购量阶梯价（量大单价递减）
export const productTiers: Record<number, ProductTier[]> = {};
for (const p of products) {
  if (p.kind !== 1) continue;
  const base = Number(p.price);
  productTiers[p.productId] = [
    { tierId: p.productId * 10 + 1, productId: p.productId, minQty: 1, maxQty: 9, unitPrice: String(base) },
    { tierId: p.productId * 10 + 2, productId: p.productId, minQty: 10, maxQty: 49, unitPrice: String(Math.round(base * 0.9)) },
    { tierId: p.productId * 10 + 3, productId: p.productId, minQty: 50, maxQty: null, unitPrice: String(Math.round(base * 0.8)) },
  ];
}

// ---------- 客户/线索 §6.2 6.3 ----------
export const customers: Customer[] = [];
export const contacts: Contact[] = [];
export const trackings: Tracking[] = [];

let contactId = 1;
let trackingId = 1;

for (let i = 1; i <= 120; i++) {
  // 前 50 条为线索(category 1/2)，其余为客户(category 3/4)
  const isLead = i <= 50;
  const category = isLead ? pick([1, 2] as const) : pick([3, 4] as const);
  const [province, city, district] = pick(PROVINCES);
  const trackingStatus = isLead ? pick([15, 16, 18, 17, 19]) : pick([8, 9, 10, 11, 12, 13, 14]);
  const cust: Customer = {
    customerId: i,
    name: companyName(),
    refCompanyId: `QCC${String(int(10000000, 99999999))}`,
    organizationId: 1,
    category,
    level: pick([25, 26, 27]),
    source: pick([1, 2, 3, 4, 5, 6]),
    currentTrackingStatus: trackingStatus,
    industry: pick(INDUSTRIES),
    province,
    city,
    district,
    poolGroup: pick([101, 102, 103]),
    origin: int(1, 4),
    labels: rnd() > 0.5 ? [pick([110, 111, 112, 113])] : [],
    phoneName: pick(['采购', '王总', '李经理', '财务', '张工']),
    phone: `1${int(3, 9)}${String(int(100000000, 999999999))}`,
    email: `contact${i}@example.com`,
    trackingNum: int(0, 18),
    trackingUpdateDate: daysAgo(int(0, 40)),
    nextTrackingDate: rnd() > 0.4 ? daysAhead(int(-5, 14)) : undefined,
    leaderId: int(1, 8),
    loseTime: rnd() > 0.7 ? daysAhead(int(-3, 10)) : undefined,
    opportunityCount: isLead ? 0 : int(0, 4),
    approval: pick([-1, 0, 2, 11] as const),
    active: 1,
    createDate: daysAgo(int(1, 120)),
  };
  customers.push(cust);

  // 联系人
  const nContacts = int(1, 3);
  for (let c = 0; c < nContacts; c++) {
    contacts.push({
      contactId: contactId++,
      customerId: i,
      name: pick(['王强', '李敏', '张磊', '刘洋', '陈晨', '赵丽', '孙浩', '周婷']),
      phone: `1${int(3, 9)}${String(int(100000000, 999999999))}`,
      email: `c${contactId}@example.com`,
      wechat: `wx_${int(1000, 9999)}`,
      position: pick(['采购经理', 'CEO', 'CFO', 'CTO', '行政主管', '财务']),
      department: pick(['采购部', '财务部', '技术部', '管理层']),
      type: c === 0 ? 1 : 2,
      maintainerId: cust.leaderId,
    });
  }

  // 跟进记录
  const nTrack = int(0, 5);
  for (let t = 0; t < nTrack; t++) {
    trackings.push({
      trackingId: trackingId++,
      customerId: i,
      businessType: 1,
      trackingType: pick([80, 81, 82, 83, 84]),
      comment: pick([
        '电话沟通，客户对专业版有兴趣，约定下周发方案。',
        '微信跟进，客户正在内部评估预算。',
        '上门拜访，确认采购需求与决策链。',
        '客户反馈竞品报价更低，需要给出折扣方案。',
        '发送报价单，等待客户回复。',
      ]),
      nextTrackingDate: daysAhead(int(1, 10)),
      priorityLevel: pick([1, 2] as const),
      createBy: cust.leaderId ?? 1,
      createDate: daysAgo(int(0, 30)),
    });
  }
}

// ---------- 商机 §6.4 ----------
export const opportunities: Opportunity[] = [];
const customerEntities = customers.filter((c) => c.category >= 3);
for (let i = 1; i <= 60; i++) {
  const cust = pick(customerEntities);
  const stage = pick([30, 31, 32, 33, 34, 35]);
  const stay = int(1, 45);
  opportunities.push({
    opportunityId: i,
    code: `OPP${dayjs().format('YYYY')}${String(i).padStart(4, '0')}`,
    name: `${cust.name.slice(0, 4)}·${pick(PRODUCT_NAMES)}采购`,
    customerId: cust.customerId,
    customerName: cust.name,
    liaisonId: undefined,
    estimatedAmount: String(int(5, 120) * 10000),
    expiryDate: daysAhead(int(-10, 60)),
    status: stage,
    statusExpiryDate: daysAhead(int(-8, 12)),
    allStayTime: stay,
    leaderId: cust.leaderId,
    depId: int(2, 6),
    competitor: rnd() > 0.6 ? pick(['天眼查', '启信宝', '爱企查']) : undefined,
    mainProduct: pick(PRODUCT_NAMES),
    renewType: pick([1, 2] as const),
    additional: pick([1, 2] as const),
    approval: pick([-1, 0, 2, 11] as const),
    active: 1,
    createDate: daysAgo(int(1, 90)),
  });
}

// ---------- 报价单 §6.5 ----------
export const quotations: Quotation[] = [];
export const quotationProducts: QuotationProduct[] = [];
let qpId = 1;
for (let i = 1; i <= 40; i++) {
  const opp = pick(opportunities);
  const nLines = int(1, 4);
  let total = '0';
  let cost = '0';
  const lines: QuotationProduct[] = [];
  for (let l = 0; l < nLines; l++) {
    const prod = pick(products);
    const qty = int(1, 10);
    const price = prod.price;
    const discountRate = (int(70, 100) / 100).toFixed(2);
    const discountPrice = mul(price, discountRate);
    const totalPrice = mul(discountPrice, qty);
    const lineCost = mul(prod.cost, qty);
    total = add(total, totalPrice);
    cost = add(cost, lineCost);
    lines.push({
      id: qpId++,
      quotationId: i,
      productId: prod.productId,
      productName: prod.name,
      spec: prod.spec,
      quantity: qty,
      price,
      discountRate,
      discountPrice,
      totalPrice,
      cost: lineCost,
    });
  }
  const orderDiscountRate = (int(90, 100) / 100).toFixed(2);
  const otherCharges = String(int(0, 5) * 1000);
  const discount = String(int(0, 8) * 500);
  const amount = sub(add(mul(total, orderDiscountRate), otherCharges), discount);
  const grossProfit = sub(amount, cost);
  quotations.push({
    quotationId: i,
    code: `QT${dayjs().format('YYYY')}${String(i).padStart(4, '0')}`,
    version: int(1, 3),
    name: `${opp.customerName?.slice(0, 6)} 报价单`,
    customerId: opp.customerId,
    customerName: opp.customerName,
    opportunityId: opp.opportunityId,
    bidderId: opp.leaderId,
    quoteDate: daysAgo(int(0, 30)),
    expiredDate: daysAhead(int(5, 30)),
    currency: 'CNY',
    status: pick([0, 1, 2, 3] as const),
    quoteType: pick([1, 2, 3, 4] as const),
    total,
    comDiscountRate: rate(amount, total),
    orderDiscountRate,
    otherCharges,
    discount,
    amount,
    cost,
    grossProfit,
    grossProfitRate: rate(grossProfit, amount),
    approval: pick([-1, 0, 2, 11] as const),
  });
  quotationProducts.push(...lines);
}

// ---------- 合同 §6.6 ----------
export const contracts: Contract[] = [];
for (let i = 1; i <= 35; i++) {
  const q = pick(quotations);
  const amount = q.amount;
  const receivedRate = int(0, 100) / 100;
  const receivedAmount = mul(amount, receivedRate.toFixed(2));
  const outstanding = sub(amount, receivedAmount);
  const invoiceAmount = mul(amount, (int(0, 100) / 100).toFixed(2));
  const status = pick([1, 2, 3, 4, 5] as const);
  const expired = daysAhead(int(-30, 120));
  contracts.push({
    contractId: i,
    code: `HT${dayjs().format('YYYY')}${String(i).padStart(4, '0')}`,
    name: `${q.customerName?.slice(0, 6)} 服务合同`,
    customerId: q.customerId,
    customerName: q.customerName,
    quotationId: q.quotationId,
    opportunityId: q.opportunityId,
    contractType: pick([1, 1, 1, 2, 3] as const),
    parentContractId: undefined,
    renewType: pick([1, 2] as const),
    beginDate: daysAgo(int(30, 200)),
    expiredDate: expired,
    currency: 'CNY',
    status,
    amount,
    receivedAmount,
    outstandingAmount: outstanding,
    badDebtsAmount: '0.00',
    receivedRate: rate(receivedAmount, amount),
    invoiceAmount,
    notInvoiceAmount: sub(amount, invoiceAmount),
    grossProfit: q.grossProfit,
    cashProfit: mul(q.grossProfit, receivedRate.toFixed(2)),
    labels: rnd() > 0.5 ? [pick([110, 111, 113])] : [],
    approval: pick([2, 11, 11, 11] as const),
    changeApproval: -1,
    archive: status === 3 && rnd() > 0.5,
    leaderId: opportunities.find((o) => o.opportunityId === q.opportunityId)?.leaderId,
  });
}

// ---------- 回款 §6.7 ----------
export const payments: Payment[] = [];
export const paymentSheets: PaymentSheet[] = [];
let sheetId = 1;
for (const c of contracts) {
  const nPlans = int(1, 3);
  let allocated = '0';
  for (let p = 0; p < nPlans; p++) {
    const planAmount = p === nPlans - 1 ? sub(c.amount, allocated) : mul(c.amount, '0.3');
    allocated = add(allocated, planAmount);
    const received = mul(planAmount, (int(0, 100) / 100).toFixed(2));
    payments.push({
      paymentId: payments.length + 1,
      contractId: c.contractId,
      contractCode: c.code,
      customerId: c.customerId,
      customerName: c.customerName,
      planAmount,
      receivedAmount: received,
      outstandingAmount: sub(planAmount, received),
      badDebtsAmount: '0.00',
      status: pick([1, 2, 3, 4] as const),
      type: pick([120, 121, 122, 123]),
      planDate: daysAhead(int(-20, 40)),
      leaderId: c.leaderId,
    });
    if (Number(received) > 0) {
      paymentSheets.push({
        sheetId: sheetId++,
        contractId: c.contractId,
        paymentId: payments.length,
        amount: received,
        payMethod: pick([140, 141, 142, 143]),
        arrivalDate: daysAgo(int(0, 30)),
        writeOff: rnd() > 0.3,
        reversed: false,
        approval: pick([2, 11] as const),
      });
    }
  }
}

// ---------- 开票 §6.7 ----------
export const invoices: Invoice[] = [];
for (let i = 1; i <= 30; i++) {
  const c = pick(contracts);
  const amount = mul(c.amount, (int(20, 100) / 100).toFixed(2));
  const taxRate = '0.06';
  const noTax = (Number(amount) / (1 + Number(taxRate))).toFixed(2);
  invoices.push({
    invoiceId: i,
    code: `FP${dayjs().format('YYYY')}${String(i).padStart(5, '0')}`,
    contractId: c.contractId,
    customerId: c.customerId,
    customerName: c.customerName,
    invoiceType: pick([130, 131, 132, 133, 134]),
    redBlueFlag: pick([1, 1, 1, 2] as const),
    invoiceAttributes: pick([1, 2]),
    amount,
    taxAmount: sub(amount, noTax),
    noTaxAmount: noTax,
    status: pick([0, 1, 2, 3] as const),
    invoiceUrl: rnd() > 0.5 ? 'https://lq.example.com/inv' : undefined,
    approval: pick([2, 11] as const),
    invalidApproval: -1,
    createDate: daysAgo(int(0, 60)),
  });
}

// ---------- 预授信 §6.7 ----------
export const preCredits: PreCredit[] = [];
for (let i = 1; i <= 12; i++) {
  const c = pick(customerEntities);
  preCredits.push({
    preCreditId: i,
    customerId: c.customerId,
    customerName: c.name,
    amount: String(int(5, 50) * 10000),
    termDays: pick([30, 60, 90, 180]),
    beginDate: daysAgo(int(0, 30)),
    endDate: daysAhead(int(30, 180)),
    expectSignDate: daysAhead(int(5, 30)),
    expectReceiveDate: daysAhead(int(30, 90)),
    status: pick([1, 2, 3] as const),
    approval: pick([2, 11] as const),
  });
}

// ---------- 待办 §7 ----------
export const backLogs: BackLog[] = [];
const blTypes = [10, 20, 30, 40, 50, 51, 60, 70];
for (let i = 1; i <= 48; i++) {
  const t = pick(blTypes);
  const offset = int(-5, 9);
  backLogs.push({
    backLogId: i,
    businessType: t,
    businessId: int(1, 30),
    businessName: pick([...customers.map((c) => c.name)]).slice(0, 14),
    userId: int(1, 8),
    status: rnd() > 0.55 ? 0 : 1,
    deadlineDate: daysAhead(offset),
    deadlineType: offset < 0 ? 3 : offset === 0 ? 1 : 2,
    tipMsg: t === 30 ? '合同审批待处理' : undefined,
  });
}

// ---------- 目标 §6.9 ----------
export const targets: Target[] = [];
const year = dayjs().year();
const month = dayjs().month() + 1;
for (const u of [1, 2, 3, 4, 5, 6, 7, 8]) {
  const target = int(30, 100) * 10000;
  const finished = Math.floor(target * (int(20, 110) / 100));
  targets.push({
    targetId: targets.length + 1,
    userId: u,
    year,
    month,
    category: 1,
    targetAmount: String(target),
    finishedAmount: String(finished),
    newSignAmount: String(Math.floor(finished * 0.7)),
    renewAmount: String(Math.floor(finished * 0.3)),
  });
}
