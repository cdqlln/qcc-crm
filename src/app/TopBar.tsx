import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, ChevronDown, HelpCircle, LogOut, Menu, Plus, Search } from 'lucide-react';
import { QUICK_CREATE } from './nav';
import { useUI } from '@/store/ui';
import { useCreate } from '@/store/create';
import { useAuth } from '@/store/auth';
import { tasksApi } from '@/api/crm';
import { Avatar, CountBadge } from '@/components/ui/primitives';

// §3.2 TopBar：Logo / CommandPalette 触发 / QuickCreate / 通知 / 帮助 / 用户
// ♻️ 不再有任何常驻营销组件
export function TopBar() {
  const toggleNav = useUI((s) => s.toggleNav);
  const setCommandOpen = useUI((s) => s.setCommandOpen);
  const navigate = useNavigate();
  const openCreate = useCreate((s) => s.open);
  const user = useAuth((s) => s.user);
  const clearAuth = useAuth((s) => s.clear);
  const [quickOpen, setQuickOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  const logout = () => {
    clearAuth();
    navigate('/login', { replace: true });
  };

  const runQuick = (item: (typeof QUICK_CREATE)[number]) => {
    if (item.entity) openCreate(item.entity);
    else if (item.path) navigate(item.path);
  };

  const { data: counts } = useQuery({ queryKey: ['task-counts'], queryFn: () => tasksApi.counts() });
  const todoTotal = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
      <button onClick={toggleNav} className="rounded-md p-1.5 text-text-weak hover:bg-bg" title="折叠导航">
        <Menu size={18} />
      </button>

      <div className="flex items-center gap-2 pr-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-white">
          <svg width="16" height="16" viewBox="0 0 32 32" fill="none">
            <path d="M9 16.5 14 21 23 11" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="text-lg font-semibold text-text">NextCRM</span>
      </div>

      {/* 命令面板触发 ⌘K */}
      <button
        onClick={() => setCommandOpen(true)}
        className="flex h-9 w-[360px] max-w-[40vw] items-center gap-2 rounded-lg border border-border bg-bg px-3 text-sm text-text-faint hover:border-primary/40"
      >
        <Search size={15} />
        <span className="flex-1 text-left">搜索客户 / 商机 / 合同…</span>
        <kbd className="rounded border border-border bg-surface px-1.5 text-xs">⌘K</kbd>
      </button>

      <div className="ml-auto flex items-center gap-1">
        {/* QuickCreate */}
        <div className="relative">
          <button
            onClick={() => setQuickOpen((v) => !v)}
            onBlur={() => setTimeout(() => setQuickOpen(false), 150)}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:brightness-110"
          >
            <Plus size={15} /> 新建 <ChevronDown size={13} />
          </button>
          {quickOpen && (
            <div className="absolute right-0 top-10 z-30 w-40 rounded-lg border border-border bg-surface py-1 shadow-card animate-fade">
              {QUICK_CREATE.map((q) => (
                <button
                  key={q.label}
                  onMouseDown={() => runQuick(q)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text hover:bg-bg"
                >
                  <q.icon size={15} className="text-text-weak" />
                  {q.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => navigate('/tasks')}
          className="relative rounded-md p-2 text-text-weak hover:bg-bg"
          title="待办通知"
        >
          <Bell size={18} />
          <span className="absolute right-1 top-1">
            <CountBadge count={todoTotal} />
          </span>
        </button>
        <button className="rounded-md p-2 text-text-weak hover:bg-bg" title="帮助">
          <HelpCircle size={18} />
        </button>
        <div className="relative">
          <button
            onClick={() => setUserOpen((v) => !v)}
            onBlur={() => setTimeout(() => setUserOpen(false), 150)}
            className="ml-1 flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-bg"
          >
            <Avatar name={user?.name ?? '用户'} size={28} />
            <span className="text-sm text-text">{user?.name ?? '未登录'}</span>
            <ChevronDown size={13} className="text-text-faint" />
          </button>
          {userOpen && (
            <div className="absolute right-0 top-11 z-30 w-48 rounded-lg border border-border bg-surface py-1.5 shadow-card animate-fade">
              <div className="border-b border-border px-3 pb-2 pt-1">
                <div className="text-sm font-medium text-text">{user?.name}</div>
                <div className="text-xs text-text-faint">
                  {user?.depName ?? ''}{user?.username ? ` · ${user.username}` : ''}
                </div>
              </div>
              <button
                onMouseDown={logout}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-bg"
              >
                <LogOut size={15} /> 退出登录
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
