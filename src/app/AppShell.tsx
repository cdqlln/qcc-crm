import { useEffect } from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { authApi } from '@/api/auth';
import { useAuth } from '@/store/auth';
import { TopBar } from './TopBar';
import { SideNav } from './SideNav';
import { CommandPalette } from './CommandPalette';
import { Toasts } from './Toasts';
import { CreateDialog } from '@/components/create/CreateDialog';
import { NAV_GROUPS } from './nav';

const PATH_LABELS: Record<string, string> = {
  dashboard: '工作台',
  tasks: '待办中心',
  leads: '线索',
  customers: '客户',
  opportunities: '商机',
  quotations: '报价单',
  contracts: '合同订单',
  payments: '回款',
  invoices: '开票',
  'pre-credits': '预授信',
  targets: '目标管理',
  analytics: '分析',
  opportunity: '商机分析',
  activity: '过程量',
  settings: '设置',
  products: '产品管理',
};

function Breadcrumb() {
  const { pathname } = useLocation();
  const segs = pathname.split('/').filter(Boolean);
  if (segs.length === 0) return null;
  const allItems = NAV_GROUPS.flatMap((g) => g.items);
  return (
    <div className="flex items-center gap-1 px-6 pt-4 text-sm text-text-faint">
      <Link to="/dashboard" className="hover:text-text">
        首页
      </Link>
      {segs.map((s, i) => {
        const path = '/' + segs.slice(0, i + 1).join('/');
        const match = allItems.find((it) => it.path === path);
        const label = match?.label ?? PATH_LABELS[s] ?? (/^\d+$/.test(s) ? '详情' : s);
        return (
          <span key={path} className="flex items-center gap-1">
            <ChevronRight size={13} />
            <span className={i === segs.length - 1 ? 'text-text-weak' : 'hover:text-text'}>{label}</span>
          </span>
        );
      })}
    </div>
  );
}

// §3.2 AppShell 全局壳层
export function AppShell() {
  const setUser = useAuth((s) => s.setUser);
  // 启动刷新当前用户的权限/数据范围（角色变更后即时生效）
  useEffect(() => {
    authApi.me().then((u) => setUser(u as any)).catch(() => {});
  }, [setUser]);

  return (
    <div className="flex h-screen flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <SideNav />
        <main className="flex min-w-0 flex-1 flex-col overflow-auto">
          <Breadcrumb />
          <div className="flex-1 p-6 pt-3">
            <Outlet />
          </div>
        </main>
      </div>
      <CommandPalette />
      <CreateDialog />
      <Toasts />
    </div>
  );
}
