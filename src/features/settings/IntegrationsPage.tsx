import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, KeyRound, PlugZap, Sparkles, Trash2, UserCheck2, UserX2 } from 'lucide-react';
import { integrationsApi, rolesApi } from '@/api/crm';
import { usePerm } from '@/store/auth';
import { useUI } from '@/store/ui';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button, Card, CardHeader } from '@/components/ui/primitives';
import { Field, TextInput } from '@/components/ui/form';
import { StatusTag } from '@/components/ui/StatusTag';
import { EmptyState, TableSkeleton } from '@/components/ui/states';

export function IntegrationsPage() {
  const { can } = usePerm();
  const qc = useQueryClient();
  const toast = useUI((s) => s.toast);
  const { data, isLoading } = useQuery({ queryKey: ['integration-qcc'], queryFn: () => integrationsApi.qcc(), enabled: can('system.integration') });

  const [key, setKey] = useState('');
  const [secret, setSecret] = useState('');
  const [base, setBase] = useState('');
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<string[] | null>(null);

  if (!can('system.integration'))
    return <div><PageHeader title="集成配置" /><Card><EmptyState title="无权限" description="需要「系统-集成配置」权限" /></Card></div>;

  const refresh = () => qc.invalidateQueries({ queryKey: ['integration-qcc'] });

  const save = async () => {
    if (key.trim().length < 8 || secret.trim().length < 8) return toast('请填写有效的 Key 与 SecretKey', 'error');
    setBusy(true);
    try {
      await integrationsApi.saveQcc({ key: key.trim(), secret: secret.trim(), base: base.trim() || undefined });
      toast('企查查凭据已保存（仅存数据库，不入代码仓库）', 'success');
      setKey(''); setSecret(''); setBase(''); setTestResult(null);
      refresh();
    } catch (e) { toast(e instanceof Error ? e.message : '保存失败', 'error'); }
    finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true); setTestResult(null);
    try {
      const r = await integrationsApi.testQcc();
      setTestResult(r.sample);
      toast('连通性测试成功', 'success');
    } catch (e) { toast(e instanceof Error ? e.message : '测试失败', 'error'); }
    finally { setBusy(false); }
  };

  const clear = async () => {
    await integrationsApi.clearQcc();
    toast('已清除数据库中的凭据', 'info');
    refresh();
  };

  return (
    <div>
      <PageHeader title="集成配置" description="外部数据/系统凭据由管理员在此维护，仅存数据库，不进入代码仓库" />
      <Card className="max-w-2xl">
        <CardHeader
          title={<span className="flex items-center gap-2"><PlugZap size={16} className="text-primary" />企查查工商数据</span>}
          extra={
            isLoading ? null : (
              <StatusTag
                kind={data?.enabled ? 'success' : 'neutral'}
                label={data?.enabled ? `已启用 · ${data.source === 'db' ? '系统配置' : '环境变量'}` : '未配置'}
              />
            )
          }
        />
        {isLoading ? <TableSkeleton rows={3} cols={2} /> : (
          <div className="space-y-4 p-4">
            {data?.enabled && (
              <div className="rounded-md bg-bg p-3 text-sm text-text-weak">
                当前凭据：Key <b className="text-text">{data.keyMasked}</b> · SecretKey <b className="text-text">{data.secretMasked}</b>
                <span className="ml-2 text-xs text-text-faint">{data.base}</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <Field label="AppKey" required><TextInput value={key} onChange={(e) => setKey(e.target.value)} placeholder={data?.enabled ? '重新填写以更换' : '企查查 AppKey'} /></Field>
              <Field label="SecretKey" required><TextInput type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="SecretKey" /></Field>
              <Field label="接口地址" hint="默认 https://api.qichacha.com" className="col-span-2"><TextInput value={base} onChange={(e) => setBase(e.target.value)} placeholder="https://api.qichacha.com" /></Field>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="primary" onClick={save} disabled={busy}>保存凭据</Button>
              <Button onClick={test} disabled={busy || !data?.enabled}><PlugZap size={14} />连通性测试</Button>
              {data?.source === 'db' && <Button variant="danger" onClick={clear} disabled={busy}><Trash2 size={14} />清除</Button>}
            </div>
            {testResult && (
              <div className="flex items-start gap-2 rounded-md bg-[#E7F7F0] px-3 py-2 text-sm text-success">
                <CheckCircle2 size={15} className="mt-0.5" />
                <span>测试通过，样例：{testResult.join('、')}</span>
              </div>
            )}
            <p className="text-xs text-text-faint">
              用途：客户名称工商联想（FuzzySearch）、企业集团归属自动归集（BelongGroup）。
              注意：企查查接口要求服务器出口 IP 为境内。
            </p>
          </div>
        )}
      </Card>

      <div className="mt-4" />
      <AiModelCard />
      <div className="mt-4" />
      <SsoCard />
    </div>
  );
}

// SSO 单点登录（OIDC）：管理员配置 IdP、同步账号开通与默认角色；登录审计见 设置→日志审计
function SsoCard() {
  const qc = useQueryClient();
  const toast = useUI((s) => s.toast);
  const { data, isLoading } = useQuery({ queryKey: ['integration-sso'], queryFn: () => integrationsApi.sso() });
  const { data: roles = [] } = useQuery({ queryKey: ['roles'], queryFn: () => rolesApi.list() });
  const { data: ssoUsers = [] } = useQuery({ queryKey: ['sso-users'], queryFn: () => integrationsApi.ssoUsers() });

  const [f, setF] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState(false);
  const [autoProvision, setAutoProvision] = useState(true);
  const [defaultRoleId, setDefaultRoleId] = useState('');
  const [busy, setBusy] = useState(false);
  const [seeded, setSeeded] = useState(false);
  if (data && !seeded) {
    setF({
      name: data.name, authorizeUrl: data.authorizeUrl, tokenUrl: data.tokenUrl, userinfoUrl: data.userinfoUrl,
      clientId: data.clientId, clientSecret: '', scope: data.scope, callbackUrl: data.callbackUrl, frontendUrl: data.frontendUrl,
    });
    setEnabled(data.enabled); setAutoProvision(data.autoProvision);
    setDefaultRoleId(data.defaultRoleId ? String(data.defaultRoleId) : '');
    setSeeded(true);
  }
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));

  const save = async () => {
    if (!f.authorizeUrl || !f.tokenUrl || !f.userinfoUrl || !f.clientId || !f.callbackUrl)
      return toast('请完整填写 授权/令牌/用户信息地址、ClientID 与回调地址', 'error');
    setBusy(true);
    try {
      await integrationsApi.saveSso({
        enabled, name: f.name, authorizeUrl: f.authorizeUrl, tokenUrl: f.tokenUrl, userinfoUrl: f.userinfoUrl,
        clientId: f.clientId, clientSecret: f.clientSecret || undefined, scope: f.scope,
        callbackUrl: f.callbackUrl, frontendUrl: f.frontendUrl, autoProvision,
        defaultRoleId: defaultRoleId ? Number(defaultRoleId) : null,
      });
      toast('SSO 配置已保存（凭据仅存数据库）', 'success');
      set('clientSecret', '');
      qc.invalidateQueries({ queryKey: ['integration-sso'] });
    } catch (e) { toast(e instanceof Error ? e.message : '保存失败', 'error'); }
    finally { setBusy(false); }
  };

  const toggleUser = async (userId: number, status: 0 | 1) => {
    await integrationsApi.setSsoUserStatus(userId, status);
    toast(status === 1 ? '已开通 CRM 使用权限' : '已停用（旧会话即时失效）', 'success');
    qc.invalidateQueries({ queryKey: ['sso-users'] });
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader
        title={<span className="flex items-center gap-2"><KeyRound size={16} className="text-primary" />SSO 单点登录（OIDC）</span>}
        extra={isLoading ? null : <StatusTag kind={data?.enabled ? 'success' : 'neutral'} label={data?.enabled ? '已启用' : '未启用'} />}
      />
      {isLoading ? <TableSkeleton rows={4} cols={2} /> : (
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="显示名称"><TextInput value={f.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="如：集团统一登录" /></Field>
            <Field label="Scope"><TextInput value={f.scope ?? ''} onChange={(e) => set('scope', e.target.value)} placeholder="openid profile email" /></Field>
            <Field label="授权地址 authorize" required className="col-span-2"><TextInput value={f.authorizeUrl ?? ''} onChange={(e) => set('authorizeUrl', e.target.value)} placeholder="https://idp.example.com/oauth2/authorize" /></Field>
            <Field label="令牌地址 token" required className="col-span-2"><TextInput value={f.tokenUrl ?? ''} onChange={(e) => set('tokenUrl', e.target.value)} placeholder="https://idp.example.com/oauth2/token" /></Field>
            <Field label="用户信息地址 userinfo" required className="col-span-2"><TextInput value={f.userinfoUrl ?? ''} onChange={(e) => set('userinfoUrl', e.target.value)} placeholder="https://idp.example.com/oauth2/userinfo" /></Field>
            <Field label="Client ID" required><TextInput value={f.clientId ?? ''} onChange={(e) => set('clientId', e.target.value)} /></Field>
            <Field label="Client Secret" hint={data?.clientSecretMasked ? `当前 ${data.clientSecretMasked}，留空不更换` : undefined}>
              <TextInput type="password" value={f.clientSecret ?? ''} onChange={(e) => set('clientSecret', e.target.value)} />
            </Field>
            <Field label="回调地址（配到 IdP）" required className="col-span-2" hint="本系统对外地址 + /api/auth/sso/callback">
              <TextInput value={f.callbackUrl ?? ''} onChange={(e) => set('callbackUrl', e.target.value)} placeholder="https://crm.example.com/api/auth/sso/callback" />
            </Field>
            <Field label="登录后跳回前端地址" className="col-span-2"><TextInput value={f.frontendUrl ?? ''} onChange={(e) => set('frontendUrl', e.target.value)} placeholder="https://crm.example.com" /></Field>
            <Field label="新账号默认角色" hint="SSO 首次同步建号时自动分配">
              <select value={defaultRoleId} onChange={(e) => setDefaultRoleId(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm outline-none focus:border-primary">
                <option value="">不分配</option>
                {roles.map((r) => <option key={r.roleId} value={r.roleId}>{r.name}</option>)}
              </select>
            </Field>
            <Field label="同步策略">
              <div className="flex h-9 flex-col justify-center gap-1 text-sm text-text-weak">
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={autoProvision} onChange={(e) => setAutoProvision(e.target.checked)} />
                  同步即开通（关闭则需管理员逐个开通）
                </label>
              </div>
            </Field>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-text">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              启用 SSO（登录页显示单点登录入口）
            </label>
            <Button variant="primary" onClick={save} disabled={busy}>保存配置</Button>
          </div>

          {/* SSO 同步账号：开通/停用 CRM 使用权限 */}
          <div>
            <div className="mb-1.5 text-sm font-medium text-text">SSO 同步账号（{ssoUsers.length}）</div>
            {ssoUsers.length === 0 ? (
              <p className="text-xs text-text-faint">员工首次 SSO 登录后自动同步到此；角色分配在 设置→角色/权限。</p>
            ) : (
              <div className="overflow-hidden rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-text-faint">
                      <th className="px-3 py-2 font-normal">姓名</th>
                      <th className="px-3 py-2 font-normal">账号/邮箱</th>
                      <th className="px-3 py-2 font-normal">角色</th>
                      <th className="px-3 py-2 font-normal">同步时间</th>
                      <th className="px-3 py-2 font-normal">状态</th>
                      <th className="px-3 py-2 font-normal">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ssoUsers.map((u) => (
                      <tr key={u.userId} className="border-b border-border/50 last:border-0">
                        <td className="px-3 py-2 font-medium text-text">{u.name}</td>
                        <td className="px-3 py-2 text-xs text-text-weak">{u.username}{u.email ? ` · ${u.email}` : ''}</td>
                        <td className="px-3 py-2 text-xs text-text-weak">{u.roles.join('、') || '未分配'}</td>
                        <td className="px-3 py-2 text-xs text-text-faint">{u.syncedAt?.slice(0, 10) ?? '—'}</td>
                        <td className="px-3 py-2"><StatusTag kind={u.status === 1 ? 'success' : 'warning'} label={u.status === 1 ? '已开通' : '待开通'} /></td>
                        <td className="px-3 py-2">
                          {u.status === 1
                            ? <button onClick={() => toggleUser(u.userId, 0)} className="inline-flex items-center gap-1 text-xs text-danger"><UserX2 size={12} />停用</button>
                            : <button onClick={() => toggleUser(u.userId, 1)} className="inline-flex items-center gap-1 text-xs text-success"><UserCheck2 size={12} />开通</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="text-xs text-text-faint">登录/SSO 登录/账号同步均写入审计日志（设置→日志审计）。停用即时吊销旧会话。</p>
        </div>
      )}
    </Card>
  );
}

// AI 模型配置卡：客户洞察等 AI 能力的模型可配置（Anthropic 官方或任意 OpenAI 兼容服务）
function AiModelCard() {
  const qc = useQueryClient();
  const toast = useUI((s) => s.toast);
  const { data, isLoading } = useQuery({ queryKey: ['integration-ai'], queryFn: () => integrationsApi.ai() });

  const [provider, setProvider] = useState<'anthropic' | 'openai-compatible'>('anthropic');
  const [key, setKey] = useState('');
  const [model, setModel] = useState('');
  const [base, setBase] = useState('');
  const [busy, setBusy] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ['integration-ai'] });

  const save = async () => {
    if (key.trim().length < 8) return toast('请填写有效的 API Key', 'error');
    const m = model.trim() || (provider === 'anthropic' ? 'claude-opus-4-8' : '');
    if (!m) return toast('请填写模型名称', 'error');
    if (provider === 'openai-compatible' && !base.trim()) return toast('OpenAI 兼容服务必须填写接口地址', 'error');
    setBusy(true);
    try {
      await integrationsApi.saveAi({ provider, key: key.trim(), model: m, base: base.trim() || undefined });
      toast('AI 模型配置已保存（仅存数据库，不入代码仓库）', 'success');
      setKey(''); setTestMsg(null);
      refresh();
    } catch (e) { toast(e instanceof Error ? e.message : '保存失败', 'error'); }
    finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true); setTestMsg(null);
    try {
      const r = await integrationsApi.testAi();
      setTestMsg(`${r.model}：${r.sample}`);
      toast('模型连通性测试成功', 'success');
    } catch (e) { toast(e instanceof Error ? e.message : '测试失败', 'error'); }
    finally { setBusy(false); }
  };

  const clear = async () => {
    await integrationsApi.clearAi();
    toast('已清除 AI 模型配置', 'info');
    setTestMsg(null);
    refresh();
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader
        title={<span className="flex items-center gap-2"><Sparkles size={16} className="text-primary" />AI 模型（客户洞察）</span>}
        extra={
          isLoading ? null : (
            <StatusTag
              kind={data?.enabled ? 'success' : 'neutral'}
              label={data?.enabled ? `已启用 · ${data.source === 'db' ? '系统配置' : '环境变量'}` : '未配置'}
            />
          )
        }
      />
      {isLoading ? <TableSkeleton rows={3} cols={2} /> : (
        <div className="space-y-4 p-4">
          {data?.enabled && (
            <div className="rounded-md bg-bg p-3 text-sm text-text-weak">
              当前：<b className="text-text">{data.provider === 'anthropic' ? 'Anthropic 官方' : 'OpenAI 兼容'}</b>
              · 模型 <b className="text-text">{data.model}</b> · Key <b className="text-text">{data.keyMasked}</b>
              {data.base && <span className="ml-2 text-xs text-text-faint">{data.base}</span>}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Field label="服务类型" required>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as 'anthropic' | 'openai-compatible')}
                className="h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm outline-none focus:border-primary"
              >
                <option value="anthropic">Anthropic 官方（Claude）</option>
                <option value="openai-compatible">OpenAI 兼容（DeepSeek/通义/Kimi 等）</option>
              </select>
            </Field>
            <Field label="模型名称" required hint={provider === 'anthropic' ? '默认 claude-opus-4-8' : '如 deepseek-chat / qwen-max'}>
              <TextInput value={model} onChange={(e) => setModel(e.target.value)} placeholder={provider === 'anthropic' ? 'claude-opus-4-8' : 'deepseek-chat'} />
            </Field>
            <Field label="API Key" required>
              <TextInput type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={data?.enabled ? '重新填写以更换' : 'sk-...'} />
            </Field>
            <Field label="接口地址" hint={provider === 'anthropic' ? '留空走官方接口' : '必填，如 https://api.deepseek.com/v1'}>
              <TextInput value={base} onChange={(e) => setBase(e.target.value)} placeholder={provider === 'anthropic' ? '（可选）' : 'https://api.deepseek.com/v1'} />
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={save} disabled={busy}>保存配置</Button>
            <Button onClick={test} disabled={busy || !data?.enabled}><PlugZap size={14} />连通性测试</Button>
            {data?.source === 'db' && <Button variant="danger" onClick={clear} disabled={busy}><Trash2 size={14} />清除</Button>}
          </div>
          {testMsg && (
            <div className="flex items-start gap-2 rounded-md bg-[#E7F7F0] px-3 py-2 text-sm text-success">
              <CheckCircle2 size={15} className="mt-0.5" />
              <span>{testMsg}</span>
            </div>
          )}
          <p className="text-xs text-text-faint">
            用途：客户详情「客户洞察」——AI 分析当前项目负责人、跟进进展、过往订单与回款。
            未配置模型时洞察退化为规则版（会明确标注）。凭据仅存数据库。
          </p>
        </div>
      )}
    </Card>
  );
}
