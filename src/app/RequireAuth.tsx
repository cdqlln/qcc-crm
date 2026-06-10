import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/store/auth';

// 全局路由守卫：未登录跳转 /login，并记忆来源路径
export function RequireAuth() {
  const isAuthed = useAuth((s) => s.isAuthed);
  const loc = useLocation();
  if (!isAuthed) {
    return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  }
  return <Outlet />;
}
