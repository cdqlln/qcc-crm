import {
  BarChart3,
  Briefcase,
  Building2,
  Calculator,
  CalendarCheck,
  CheckSquare,
  ClipboardList,
  Coins,
  CreditCard,
  FileText,
  FolderKanban,
  Handshake,
  LayoutDashboard,
  Radar,
  Receipt,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}
export interface NavGroup {
  group: string;
  items: NavItem[];
  defaultCollapsed?: boolean;
}

// §3.1 按「用户一天的工作流」分 5 组（+协同）
export const NAV_GROUPS: NavGroup[] = [
  {
    group: '工作',
    items: [
      { label: '工作台', path: '/dashboard', icon: LayoutDashboard },
      { label: '待办中心', path: '/tasks', icon: CheckSquare },
    ],
  },
  {
    group: '销售',
    items: [
      { label: '线索', path: '/leads', icon: UserPlus },
      { label: '商机开拓', path: '/prospecting', icon: Radar },
      { label: '客户', path: '/customers', icon: Users },
      { label: '商机', path: '/opportunities', icon: Briefcase },
      { label: '报价单', path: '/quotations', icon: Calculator },
    ],
  },
  {
    group: '资金',
    items: [
      { label: '合同订单', path: '/contracts', icon: Handshake },
      { label: '回款', path: '/payments', icon: Wallet },
      { label: '开票', path: '/invoices', icon: Receipt },
      { label: '预授信', path: '/pre-credits', icon: CreditCard },
    ],
  },
  {
    group: '分析',
    items: [
      { label: '目标管理', path: '/targets', icon: Target },
      { label: '商机分析', path: '/analytics/opportunity', icon: BarChart3 },
      { label: '线索分析', path: '/analytics/leads', icon: TrendingUp },
      { label: '过程量', path: '/analytics/activity', icon: ClipboardList },
    ],
  },
  {
    group: '协同',
    defaultCollapsed: true,
    items: [
      { label: '外勤签到', path: '/sign', icon: CalendarCheck },
      { label: '工单', path: '/tickets', icon: FileText },
      { label: '审批', path: '/approvals', icon: FolderKanban },
      { label: '企微协同', path: '/qywx', icon: Sparkles },
    ],
  },
  {
    group: '设置',
    items: [
      { label: '产品管理', path: '/settings/products', icon: Coins },
      { label: '组织 / 字典 / 审批流', path: '/settings', icon: Settings },
      { label: '企业工商', path: '/settings/company', icon: Building2 },
    ],
  },
];

// 快捷新建（§3.2 QuickCreate）
// entity → 打开统一新建弹窗；path → 直接跳转（报价走实时编辑器）
import type { CreatableEntity } from '@/store/create';
export interface QuickCreateItem {
  label: string;
  icon: LucideIcon;
  entity?: CreatableEntity;
  path?: string;
}
export const QUICK_CREATE: QuickCreateItem[] = [
  { label: '新建线索', icon: UserPlus, entity: 'lead' },
  { label: '新建客户', icon: Users, entity: 'customer' },
  { label: '新建商机', icon: Briefcase, entity: 'opportunity' },
  { label: '新建报价', icon: Calculator, path: '/quotations/new' },
  { label: '新建合同', icon: Handshake, entity: 'contract' },
];
