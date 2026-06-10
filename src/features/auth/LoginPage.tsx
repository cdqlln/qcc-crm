import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LogIn, ScanLine, ShieldCheck } from 'lucide-react';
import { authApi, IS_API_MODE } from '@/api/auth';
import { useAuth } from '@/store/auth';
import { Button } from '@/components/ui/primitives';
import { Field, TextInput } from '@/components/ui/form';

export function LoginPage() {
  const setSession = useAuth((s) => s.setSession);
  const isAuthed = useAuth((s) => s.isAuthed);
  const navigate = useNavigate();
  const loc = useLocation();
  const redirect = (loc.state as any)?.from ?? '/dashboard';

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('crm123456');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [wecomLoading, setWecomLoading] = useState(false);
  const popupRef = useRef<Window | null>(null);

  useEffect(() => {
    if (isAuthed) navigate(redirect, { replace: true });
  }, [isAuthed, navigate, redirect]);

  const onLogin = async () => {
    setErr('');
    setLoading(true);
    try {
      const s = await authApi.login(username, password);
      setSession(s);
      navigate(redirect, { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : '登录失败');
    } finally {
      setLoading(false);
    }
  };

  // 企业微信扫码：API 模式开弹窗 + 监听 postMessage；Mock 模式直接模拟
  const onWecom = async () => {
    setErr('');
    setWecomLoading(true);
    try {
      if (!IS_API_MODE) {
        const s = await (authApi as any).mockWecomLogin();
        setSession(s);
        navigate(redirect, { replace: true });
        return;
      }
      const { url } = await authApi.wecomUrl('WECOM_admin');
      popupRef.current = window.open(url, 'wecom-login', 'width=480,height=560');
      const handler = (ev: MessageEvent) => {
        const d = ev.data;
        if (!d || d.source !== 'nextcrm-wecom') return;
        window.removeEventListener('message', handler);
        setWecomLoading(false);
        if (d.ok) {
          setSession({ accessToken: d.accessToken, refreshToken: d.refreshToken, user: d.user });
          navigate(redirect, { replace: true });
        } else {
          setErr(d.msg || '企业微信登录失败');
        }
      };
      window.addEventListener('message', handler);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '企业微信登录失败');
      setWecomLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-surface shadow-card md:grid-cols-2">
        {/* 品牌侧 */}
        <div className="hidden flex-col justify-between bg-gradient-to-br from-primary to-[#1b4fb0] p-8 text-white md:flex">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
              <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
                <path d="M9 16.5 14 21 23 11" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="text-xl font-semibold">NextCRM</span>
          </div>
          <div>
            <h2 className="text-2xl font-semibold leading-relaxed">企查查 CRM<br />L2C 全链路销售管理</h2>
            <p className="mt-3 text-sm text-white/80">线索 · 客户 · 商机 · 报价 · 合同 · 回款 · 开票</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-white/70">
            <ShieldCheck size={16} /> 账号登录 + 企业微信单点登录
          </div>
        </div>

        {/* 表单侧 */}
        <div className="p-8">
          <h1 className="text-xl font-semibold text-text">登录</h1>
          <p className="mt-1 text-sm text-text-weak">欢迎回来，请登录你的账号</p>

          <div className="mt-6 space-y-4">
            <Field label="账号">
              <TextInput
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="用户名 / 邮箱"
                onKeyDown={(e) => e.key === 'Enter' && onLogin()}
              />
            </Field>
            <Field label="密码">
              <TextInput
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="密码"
                onKeyDown={(e) => e.key === 'Enter' && onLogin()}
              />
            </Field>

            {err && <div className="rounded-md bg-[#FDECEC] px-3 py-2 text-sm text-danger">{err}</div>}

            <Button variant="primary" className="w-full" onClick={onLogin} disabled={loading}>
              <LogIn size={15} />
              {loading ? '登录中…' : '登录'}
            </Button>

            <div className="flex items-center gap-3 py-1 text-xs text-text-faint">
              <span className="h-px flex-1 bg-border" />或<span className="h-px flex-1 bg-border" />
            </div>

            <Button className="w-full" onClick={onWecom} disabled={wecomLoading}>
              <ScanLine size={15} className="text-[#07C160]" />
              {wecomLoading ? '等待企业微信授权…' : '企业微信登录'}
            </Button>

            <p className="pt-2 text-center text-xs text-text-faint">
              演示账号：admin / crm123456（更多：lina、wangfang…）
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
