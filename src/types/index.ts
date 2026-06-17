// ============================================================
// §10.2 TS 类型约定（由字段表生成）
// 金额统一字符串 + decimal.js；状态统一通过 useTerm 翻译
// ============================================================

/** 统一 API 返回结构 */
export interface ApiResult<T> {
  code: number;
  msg: string;
  data: T;
}

export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** §9.4 字典项 */
export interface Term {
  termId: number;
  businessType: number; // 1来源 2商机阶段 3客户状态 4线索状态 ...
  name: string;
  /** 状态语义色，用于 StatusTag 取色 */
  kind?: StatusKind;
  order?: number;
}

export type StatusKind = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

/** §9.5 审批状态语义 */
export type ApprovalStatus = -2 | -1 | 0 | 2 | 3 | 4 | 11;

export interface User {
  userId: number;
  name: string;
  avatar?: string;
  depId: number;
  depName?: string;
  position: 0 | 1; // 0职员 1主管
}

export interface Department {
  depId: number;
  name: string;
  parentId: number;
  path: string;
  depth: number;
}

/** customer 表：线索与客户共用（§5.2-1） */
export interface Customer {
  customerId: number;
  name: string;
  refCompanyId?: string; // 企查查公司ID
  organizationId: number;
  category: 1 | 2 | 3 | 4; // 1个人线索 2线索池 3个人客户 4公海
  level?: number; // term_id 客户分级 25A/26B/27C
  source?: number; // term_id 来源
  currentTrackingStatus?: number; // term_id 状态
  industry?: string;
  province?: string;
  city?: string;
  district?: string;
  poolGroup?: number; // term_id 线索分组
  origin?: number; // 来源渠道
  labels?: number[]; // customer_label term_id[]
  phoneName?: string;
  phone?: string;
  email?: string;
  trackingNum: number;
  trackingUpdateDate?: string;
  nextTrackingDate?: string;
  leaderId?: number; // via user_customer
  preLeaderId?: number;
  loseTime?: string;
  opportunityCount?: number;
  approval: ApprovalStatus;
  active: -1 | 0 | 1 | 2;
  createDate?: string;
}

export interface Contact {
  contactId: number;
  customerId: number;
  name: string;
  phone?: string;
  email?: string;
  wechat?: string;
  position?: string;
  department?: string;
  type: 1 | 2; // 1主 2普通
  maintainerId?: number;
  sourceLeadsId?: number;
}

/** customer_tracking 跟进记录 */
export interface Tracking {
  trackingId: number;
  customerId: number;
  businessType: number; // 挂在 线索/客户/商机/合同/报价
  businessId?: number;
  trackingType?: number; // 字典：跟进方式
  comment: string;
  nextTrackingDate?: string;
  priorityLevel?: 1 | 2; // 有效/无效跟进
  ding?: number[]; // 提醒人
  createBy: number;
  createDate: string;
}

export interface Opportunity {
  opportunityId: number;
  code: string;
  name: string;
  customerId: number;
  customerName?: string;
  liaisonId?: number;
  keyManId?: number;
  estimatedAmount: string; // decimal → string
  expiryDate?: string;
  status: number; // 阶段 term_id
  statusExpiryDate?: string;
  allStayTime: number; // 停留天数
  leaderId?: number;
  depId: number;
  competitor?: string;
  mainProduct?: string;
  renewType: 1 | 2;
  additional: 1 | 2;
  approval: ApprovalStatus;
  active: number;
  createDate?: string;
}

export interface OpportunityProduct {
  id: number;
  opportunityId: number;
  productId: number;
  productName: string;
  quantity: number;
  price: string;
}

export interface Quotation {
  quotationId: number;
  code: string;
  version: number;
  sourceCode?: string;
  name: string;
  customerId: number;
  customerName?: string;
  contactId?: number;
  opportunityId?: number;
  bidderId?: number;
  quoteDate?: string;
  expiredDate?: string;
  currency: string;
  status: 0 | 1 | 2 | 3; // 0初始 1报价中 2失效 3已生成合同
  quoteType?: 1 | 2 | 3 | 4; // 1询价 2报价 3标书 4框架协议
  total: string;
  comDiscountRate: string;
  orderDiscountRate: string;
  otherCharges: string;
  discount: string;
  amount: string;
  cost: string;
  grossProfit: string;
  grossProfitRate: string;
  approval: ApprovalStatus;
}

export interface QuotationProduct {
  id: number;
  quotationId: number;
  productId: number;
  productName: string;
  spec?: string;
  quantity: number;
  price: string; // 原价
  discountRate: string;
  discountPrice: string; // 售价
  totalPrice: string; // 小计
  cost: string;
}

export interface Contract {
  contractId: number;
  code: string;
  name: string;
  customerId: number;
  customerName?: string;
  quotationId?: number;
  opportunityId?: number;
  contractType: 1 | 2 | 3; // 1常规 2框架主 3框架子
  parentContractId?: number;
  renewType: 1 | 2; // 1一次性 2到期续约
  beginDate?: string;
  expiredDate?: string;
  currency: string;
  status: 0 | 1 | 2 | 3 | 4 | 5; // 0初始1签约2执行中3完毕4终止5作废
  amount: string;
  receivedAmount: string;
  outstandingAmount: string;
  badDebtsAmount: string;
  receivedRate: string;
  invoiceAmount: string;
  notInvoiceAmount: string;
  grossProfit: string;
  cashProfit: string;
  labels?: number[];
  approval: ApprovalStatus;
  changeApproval: ApprovalStatus;
  archive: boolean;
  leaderId?: number;
}

/** payment 回款计划 */
export interface Payment {
  paymentId: number;
  contractId: number;
  contractCode?: string;
  customerId: number;
  customerName?: string;
  planAmount: string;
  receivedAmount: string;
  outstandingAmount: string;
  badDebtsAmount: string;
  status: 1 | 2 | 3 | 4 | 5; // 1未收 ... 5部分坏账
  type: number; // 保证金/常规/尾款/预付款
  planDate?: string; // 预计回款日
  leaderId?: number;
}

/** payment_sheet 回款单 */
export interface PaymentSheet {
  sheetId: number;
  contractId: number;
  paymentId?: number;
  amount: string;
  payMethod: number;
  arrivalDate?: string;
  writeOff: boolean;
  reversed: boolean;
  approval: ApprovalStatus;
}

export interface Invoice {
  invoiceId: number;
  code: string;
  contractId: number;
  customerId: number;
  customerName?: string;
  invoiceType: number; // 1普票~5收据
  redBlueFlag: 1 | 2; // 蓝/红
  invoiceAttributes: number; // 纸质/数电
  amount: string; // 含税
  taxAmount: string;
  noTaxAmount: string;
  status: 0 | 1 | 2 | 3; // 待开票/已生成/红冲/作废
  invoiceUrl?: string;
  approval: ApprovalStatus;
  invalidApproval: ApprovalStatus;
  createDate?: string;
}

export interface PreCredit {
  preCreditId: number;
  contractId?: number;
  customerId: number;
  customerName?: string;
  amount: string;
  termDays: number;
  beginDate?: string;
  endDate?: string;
  expectSignDate?: string;
  expectReceiveDate?: string;
  status: 1 | 2 | 3; // 1未授信~3已结束
  approval: ApprovalStatus;
}

/** §7 back_log 统一待办 */
export interface BackLog {
  backLogId: number;
  businessType: number; // 10跟进 20合同 30审批 40工单 50掉保客户 51掉保线索 60回款 70商机超时
  businessId: number;
  businessName?: string;
  userId: number;
  status: 0 | 1; // 0待办 1完成
  deadlineDate?: string;
  deadlineType: 1 | 2 | 3; // 1今天 2七天 3过期
  tipMsg?: string;
}

export interface Product {
  productId: number;
  code: string;
  name: string;
  categoryId: number;
  categoryName?: string;
  spec?: string;
  unit?: string;
  timeLimits?: number; // 服务周期
  kind: 1 | 2; // 1数据 2产品
  deliveryType?: 1 | 2 | 3 | 4; // 1 API 2 离线数据包 3 账号 4 订阅
  active: boolean;
  freePricing: boolean;
  price: string;
  cost: string;
  minDiscount: string;
  maxDiscount: string;
}

export interface ProductTier {
  tierId: number;
  productId: number;
  minQty: number;
  maxQty?: number | null;
  unitPrice: string;
}

export interface Target {
  targetId: number;
  userId?: number;
  depId?: number;
  year: number;
  month?: number;
  category: 1 | 2; // 1合同额 2回款额
  targetAmount: string;
  finishedAmount: string;
  newSignAmount: string;
  renewAmount: string;
}

/** §8 AI */
export interface AiReport {
  reportId: number;
  businessType: 0 | 1 | 2 | 3; // 0线索1客户2合同3商机
  businessId: number;
  stageId?: number;
  status: 0 | 1 | 2 | 3; // 待发送/处理中/成功/失败
  content?: AiReportContent;
  createDate: string;
}

// ---- 协同模块 ----
export interface Sign {
  signId: number;
  userId: number;
  userName?: string;
  type: 1 | 2; // 1上下班 2外勤拜访
  customerId?: number;
  customerName?: string;
  address?: string;
  longitude?: number;
  latitude?: number;
  remark?: string;
  photoUrl?: string;
  createDate: string;
}

export interface Ticket {
  ticketId: number;
  code: string;
  title: string;
  typeTerm?: number;
  customerId?: number;
  customerName?: string;
  priority: 1 | 2 | 3;
  status: 1 | 2 | 3 | 4; // 待处理/处理中/已解决/已关闭
  assigneeId?: number;
  assigneeName?: string;
  creatorId?: number;
  description?: string;
  createDate: string;
  updateDate?: string;
}

export interface TicketComment {
  id: number;
  ticketId: number;
  userId: number;
  userName?: string;
  content: string;
  createDate: string;
}

export interface ApprovalRoute {
  routeId: number;
  businessType: number;
  name: string;
  nodes: { name: string; approverIds: number[] }[];
}

export interface ApprovalTask {
  taskId: number;
  businessType: number;
  businessId: number;
  businessName?: string;
  routeId?: number;
  applicantId: number;
  applicantName?: string;
  status: 2 | 3 | 11; // 进行中/驳回/通过
  currentNode: number;
  nodeName?: string;
  createDate: string;
  nodes?: ApprovalTaskNode[];
  /** 「已审」列表：我的处理动作与时间 */
  myAction?: 0 | 11 | 3;
  myActedAt?: string;
  myComment?: string;
}

export interface ApprovalTaskNode {
  nodeIndex: number;
  name: string;
  approverIds: number[];
  action: 0 | 11 | 3;
  actedBy?: number;
  actedByName?: string;
  comment?: string;
  actedAt?: string;
}

export interface QywxMessage {
  msgId: number;
  toUserId?: number;
  toUserName?: string;
  businessType?: number;
  businessId?: number;
  content: string;
  channel: string;
  status: number;
  createDate: string;
}

export interface AiReportContent {
  summary: string;
  points: string[];
  risks: string[];
  suggestions: string[];
  actionItems: { id: string; text: string; done?: boolean }[];
}
