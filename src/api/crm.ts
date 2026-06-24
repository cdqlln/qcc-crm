// 数据访问入口（dispatcher）：
//   设置了 VITE_API_BASE → 走真实后端（Express + Postgres，见 server/）
//   未设置                → 走内存 Mock（前端可独立运行/演示）
import * as mock from './mock';
import * as backend from './backend';
import * as mockCollab from './mockCollab';
import * as mockRoles from './mockRoles';

// VITE_API_BASE 已定义（含空串=同源 /api，配合 nginx 反代）即启用后端
const USE_API = import.meta.env.VITE_API_BASE !== undefined;

export const termsApi = USE_API ? backend.termsApi : mock.termsApi;
export const leadsApi = USE_API ? backend.leadsApi : mock.leadsApi;
export const customersApi = USE_API ? backend.customersApi : mock.customersApi;
export const opportunitiesApi = USE_API ? backend.opportunitiesApi : mock.opportunitiesApi;
export const quotationsApi = USE_API ? backend.quotationsApi : mock.quotationsApi;
export const contractsApi = USE_API ? backend.contractsApi : mock.contractsApi;
export const paymentsApi = USE_API ? backend.paymentsApi : mock.paymentsApi;
export const invoicesApi = USE_API ? backend.invoicesApi : mock.invoicesApi;
export const preCreditsApi = USE_API ? backend.preCreditsApi : mock.preCreditsApi;
export const productsApi = USE_API ? backend.productsApi : mock.productsApi;
export const tasksApi = USE_API ? backend.tasksApi : mock.tasksApi;
export const targetsApi = USE_API ? backend.targetsApi : mock.targetsApi;
export const aiApi = USE_API ? backend.aiApi : mock.aiApi;
export const searchApi = USE_API ? backend.searchApi : mock.searchApi;

// 协同模块
export const signApi = USE_API ? backend.signApi : mockCollab.signApi;
export const ticketsApi = USE_API ? backend.ticketsApi : mockCollab.ticketsApi;
export const approvalsApi = (USE_API ? backend.approvalsApi : mockCollab.approvalsApi) as typeof backend.approvalsApi;
export const qywxApi = USE_API ? backend.qywxApi : mockCollab.qywxApi;
export const rolesApi = USE_API ? backend.rolesApi : mockRoles.rolesApi;

// 分析页/弹窗就地聚合使用的内存数据集（始终来自 mock；接入后端后分析页可改为聚合接口）
export {
  customers,
  opportunities,
  contracts,
  quotations,
  payments,
  invoices,
  preCredits,
  backLogs,
  targets,
} from './mock';
export type { SearchHit } from './mock';
