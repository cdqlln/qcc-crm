import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, PlugZap, Trash2 } from 'lucide-react';
import { integrationsApi } from '@/api/crm';
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
    </div>
  );
}
