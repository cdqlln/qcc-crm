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
  claimAt?: string;
  assignAt?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  opportunityCount?: number;
  groupId?: number | null;
  groupName?: string;
  approval: ApprovalStatus;
  active: -1 | 0 | 1 | 2;
  createDate?: string;
  customFields?: Record<string, string | number>; // 个性客户信息（field_id → 值）
  convertedAt?: string; // 线索转化时间（有值=由线索转化而来）
  convertedBy?: number;
  leadSnapshot?: LeadSnapshot; // 转化那一刻的线索原貌
  riskTags?: RiskTag[]; // 工商风险标签（企查查真实核查缓存）
  riskCheckedAt?: string;
}

/** 工商风险标签（企查查核查结果） */
export interface RiskTag { label: string; kind: 'success' | 'warning' | 'danger' | 'neutral' }

/** 线索池进展总览（销售管理） */
export interface PoolOverview {
  pending: number;   // 待分配
  todayIn: number;   // 今日新进池
  assigned: number;  // 已分配（近200条）
  unfollowed: number;
  following: number;
  converted: number;
  list: {
    customerId: number; name: string; leaderId?: number; leaderName: string; sourceName: string;
    assignAt?: string; trackingNum: number; trackingUpdateDate?: string; convertedAt?: string;
    status: 'unfollowed' | 'following' | 'converted';
  }[];
}

/** 归属追溯：负责人变更记录 */
export interface OwnerLog {
  logId: number;
  entityType: 'lead' | 'customer' | 'opportunity';
  entityId: number;
  fromUserId?: number | null;
  fromName: string;
  toUserId?: number | null;
  toName: string;
  via: 'init' | 'claim' | 'assign' | 'pool' | 'transfer' | 'edit' | 'unlink';
  operatorId?: number | null;
  operatorName: string;
  remark: string;
  createDate: string;
}

/** 线索转化留痕快照 */
export interface LeadSnapshot {
  name: string;
  sourceName: string;
  poolGroupName: string;
  industry: string;
  region: string;
  phoneName: string;
  phone: string;
  leaderName: string;
  trackingNum: number;
  createdAt?: string;
  claimAt?: string;
  assignAt?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
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
  remark?: string;
  wecomExternalUserid?: string;
  isKp?: boolean; // KP 关键人标志
  orgNodeId?: number; // 所属客户组织节点
}

/** 客户内部组织结构节点（销售调研收集） */
export interface CustomerOrgNode {
  nodeId: number;
  customerId: number;
  parentId: number | null;
  name: string;
  order: number;
}

export interface Attachment {
  name: string;
  url: string;
  mime: string;
  size: number;
}
export interface TrackingInput {
  comment: string;
  trackingType?: number;
  nextTrackingDate?: string;
  priorityLevel?: number;
  attachments?: Attachment[];
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
  attachments?: Attachment[];
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
  requirement?: string; // 客户需求描述
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
  groupId?: number | null;
  groupName?: string;
  contactId?: number;
  opportunityId?: number;
  bidderId?: number;
  quoteDate?: string;
  expiredDate?: string;
  contractTerm?: number; // 合同限期（月）
  remark?: string; // 报价说明
  serviceYears?: number; // 服务年限（年）
  currency: string;
  status: 0 | 1 | 2 | 3; // 0初始 1报价中 2失效 3已生成合同
  quoteType?: 1 | 2 | 3 | 4; // 1询价 2报价 3标书 4框架协议
  total: string;
  comDiscountRate: string;
  orderDiscountRate: string;
  otherCharges: string;
  otherChargesItems?: { name: string; amount: number }[];
  discount: string;
  amount: string;
  cost: string;
  grossProfit: string;
  grossProfitRate: string;
  approval: ApprovalStatus;
  customerConfirmed?: boolean;
  confirmedAt?: string;
}

export interface DiscountPolicy {
  levelTermId: number;
  maxDiscount: string; // 该分级销售自主折扣下限
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
  discountPrice: string; // 售价/接口单价
  totalPrice: string; // 小计（按用量行为 0）
  cost: string;
  pricingMode?: 'qty' | 'usage'; // qty按数量 usage按用量(API接口单价,框架)
  apiItems?: ApiQuoteItem[]; // 数据API接口报价清单（选自价目表）
  apiMode?: 'calls' | 'recharge'; // 接口计费：calls=定量定价可算总价 recharge=只调价·售价=充值金额
  gift?: boolean; // 赠送项目（折扣 0、实际单价 0）
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
  reviewStatus?: 0 | 1 | 2 | 3; // 法务审核：0未送审 1待审核 2通过 3驳回
  archive: boolean;
  leaderId?: number;
}

/** 合同法务审核记录（送审/通过/驳回/协同留言） */
export interface ContractReview {
  reviewId: number;
  contractId: number;
  action: 1 | 2 | 3 | 4; // 1送审 2通过 3驳回 4协同留言
  comment: string;
  attachments: { name: string; url: string }[];
  createBy?: number;
  createByName: string;
  createDate: string;
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
  salesDiscount?: string; // 销售自主折扣下限（低于触发审批）
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

// ---- 集团客户 ----
export interface CustomerGroup {
  groupId: number;
  name: string;
  matchKey?: string;
  refCompanyId?: string;
  memberCount: number;
}

// ---- 字典配置 / 审计 ----
export interface BizType { businessType: number; label: string }
export interface DictItem {
  termId: number;
  businessType: number;
  name: string;
  kind?: string;
  order?: number;
  active: number;
  systemLevel: boolean;
}
export interface AuditLog {
  auditId: number;
  userId?: number;
  userName?: string;
  action: string;
  method: string;
  path: string;
  targetId?: string;
  detail?: string;
  ip?: string;
  status: number;
  createDate: string;
}

// ---- 组织/部门 ----
export interface OrgInfo {
  organizationId: number;
  name: string;
  refCompanyId?: string;
}
export interface DeptNode {
  depId: number;
  parentId: number | null;
  name: string;
  path: string;
  depth: number;
  memberCount: number;
  children?: DeptNode[];
}
export interface DeptMember {
  userId: number;
  name: string;
  position: number;
  status: number;
  username?: string;
}

// ---- RBAC ----
export interface PermissionItem {
  permissionId: number;
  code: string;
  name: string;
  module: string;
  type: number;
}
export interface Role {
  roleId: number;
  name: string;
  scope: number;
  scopeName?: string;
  permissions: string[];
  userCount: number;
}
export interface UserRoles {
  userId: number;
  name: string;
  depName?: string;
  roleIds: number[];
}

export interface AiReportContent {
  summary: string;
  points: string[];
  risks: string[];
  suggestions: string[];
  actionItems: { id: string; text: string; done?: boolean }[];
}

// ---- 客户洞察（AI 模型生成；见 server/src/routes/insight.ts） ----
export interface CustomerFacts {
  customer: {
    name: string; level: string; industry: string; groupName: string;
    leader: string; source: string; createdAt: string; trackingNum: number; lastTrackingAt: string | null;
  };
  contacts: { name: string; position: string; isKey: boolean }[];
  opportunities: {
    name: string; amount: number; stage: string; stayDays: number; leader: string;
    expectedDate: string | null; mainProduct: string; competitor: string;
  }[];
  trackings: { at: string; way: string; by: string; comment: string; nextAt: string | null }[];
  contracts: {
    name: string; amount: number; status: string; receivedAmount: number; outstandingAmount: number;
    receivedRate: number; invoiceAmount: number; leader: string; beginDate: string | null; expiredDate: string | null;
  }[];
  overduePayments: { contractName: string; planDate: string; outstanding: number }[];
  totals: {
    oppCount: number; oppAmount: number;
    contractCount: number; contractAmount: number;
    receivedAmount: number; outstandingAmount: number; invoiceAmount: number; receivedRate: number;
  };
}

export interface CustomerInsight {
  summary: string;
  healthScore: number;
  owners: { role: string; name: string; note: string }[];
  progress: { assessment: string; highlights: string[] };
  finance: { assessment: string; highlights: string[] };
  risks: string[];
  nextSteps: string[];
}

export interface CustomerInsightReport {
  reportId: number;
  createdAt: string;
  facts: CustomerFacts;
  insight: CustomerInsight;
  generatedBy: 'llm' | 'rules';
  model?: string;
}

/** SSO 配置（管理端） */
export interface SsoCfgView {
  enabled: boolean;
  name: string;
  authorizeUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  clientId: string;
  clientSecretMasked: string;
  scope: string;
  callbackUrl: string;
  frontendUrl: string;
  autoProvision: boolean;
  defaultRoleId: number | null;
}
/** SSO 同步账号 */
export interface SsoUser {
  userId: number;
  name: string;
  username: string;
  email: string;
  status: number; // 1开通 0待开通/停用
  provider: string;
  syncedAt?: string;
  lastLoginAt?: string;
  roles: string[];
}

export interface AiIntegrationCfg {
  enabled: boolean;
  source: string; // db | env | none
  provider: 'anthropic' | 'openai-compatible';
  base: string;
  model: string;
  keyMasked: string;
}

// ---- AI 对话助手（工具调用执行 CRM 操作；见 server/src/routes/aiChat.ts） ----
export interface AiChatAction {
  type: 'customer' | 'opportunity' | 'quotation' | 'tracking' | 'contact';
  label: string;
  link?: string;
}
export interface AiChatResponse {
  reply: string;
  actions: AiChatAction[];
  generatedBy: 'llm' | 'rules' | 'none';
  model?: string;
}

// ---- 工作台聚合（真实统计；见 server/src/routes/dashboard.ts） ----
export interface DashboardData {
  kpis: {
    newLeads: number; prevLeads: number;
    newCustomers: number; prevCustomers: number;
    oppCount: number;
    contractCount: number; contractAmount: number; receivedAmount: number; outstandingAmount: number;
  };
  funnel: { termId: number; count: number }[];
  conversion: { newLeads: number; converted: number; rate: number };
  pk: { name: string; amount: number }[];
  recentTrackings: { by: string; customerId: number; customerName: string; comment: string; priorityLevel: number; at: string }[];
}

// ---- 个性客户信息（租户自定义字段；见 server/src/routes/customFields.ts） ----
export interface CustomFieldDef {
  fieldId: number;
  businessType: number; // 1客户
  name: string;
  fieldType: 'text' | 'number' | 'date' | 'select';
  options: string[];
  required: boolean;
  order: number;
  active: boolean;
}
export type CustomFieldValues = Record<string, string | number>;

// ---- 开放平台·数据产品价目表（数据API套餐 接口级报价；见 server/src/routes/apiPrices.ts） ----
export interface ApiPrice {
  apiPriceId: number;
  category: string;
  apiCode: string;
  name: string;
  apiType: string;
  price: number;
  unit: string;
  remark: string;
  active: boolean;
  order: number;
}
/** 报价单按量行挂载的接口报价清单条目 */
export interface ApiQuoteItem {
  apiCode: string;
  name: string;
  price: number;      // 标准单价
  quotePrice: number; // 报价单价（可折）
  estCalls: number;   // 预估年调用量（框架可为 0）
  unit: string;
}

/** 价目表调价记录（手工改价/文件导入） */
export interface ApiPriceHistory {
  historyId: number;
  apiPriceId: number | null;
  apiCode: string;
  name: string;
  oldPrice: number | null; // null=新增条目
  newPrice: number;
  source: 'manual' | 'import';
  changedBy?: number;
  changedByName: string;
  createDate: string;
}
/** 价目表导入结果 */
export interface ApiPriceImportResult {
  total: number;
  inserted: number;
  priceChanged: number;
  unchanged: number;
  changes: { apiCode: string; name: string; oldPrice: number; newPrice: number }[];
  fileName: string;
}
