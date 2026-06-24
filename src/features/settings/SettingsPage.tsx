import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, FileCheck2, Languages, ListTree, Percent, Shield, SlidersHorizontal, Tags, Workflow } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button, Card, CardHeader } from '@/components/ui/primitives';
import { useTermsMap } from '@/hooks/useTerms';
import { quotationsApi } from '@/api/crm';
import { useUI } from '@/store/ui';
import { usePerm } from '@/store/auth';
import type { DiscountPolicy } from '@/types';

const ITEMS = [
  { icon: Building2, title: '组织 / 部门', desc: 'organization · department 部门树', path: '/settings', perm: 'system.org' },
  { icon: Shield, title: '角色 / 权限', desc: 'RBAC 权限点 + 数据范围 + 成员分配', path: '/settings/roles', perm: 'system.role' },
  { icon: SlidersHorizontal, title: '字段配置', desc: '列表列显隐 / 自定义字段', path: '/settings', perm: 'system.dict' },
  { icon: Workflow, title: '审批流', desc: 'work_flow_route / task / form', path: '/settings', perm: 'system.role' },
  { icon: Tags, title: '字典管理', desc: 'terms 来源/阶段/状态/分类', path: '/settings', perm: 'system.dict' },
  { icon: ListTree, title: '产品目录', desc: 'product / category / 多币种', path: '/settings/products' },
  { icon: FileCheck2, title: '公海 / 线索池规则', desc: 'pool_rule 领取上限/掉保', path: '/settings' },
  { icon: Languages, title: '国际化 / 币种', desc: 'i18next 中英 + currency_setting', path: '/settings' },
];

export function SettingsPage() {
  const terms = useTermsMap();
  const { can } = usePerm();
  return (
    <div>
      <PageHeader title="设置" description="组织 / 角色 / 字段 / 审批流 / 字典 / 产品 —— 多租户与权限基座（§9）" />
      <div className="grid grid-cols-3 gap-4">
        {ITEMS.filter((it) => !it.perm || can(it.perm)).map((it) => (
          <Link key={it.title} to={it.path}>
            <Card className="flex items-start gap-3 p-4 transition-colors hover:border-primary/40">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-weak text-primary">
                <it.icon size={20} />
              </span>
              <div>
                <div className="text-md font-medium text-text">{it.title}</div>
                <div className="mt-0.5 text-sm text-text-weak">{it.desc}</div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
      <DiscountPolicyCard />

      <Card className="mt-4 p-4">
        <div className="text-sm font-medium text-text">已加载字典（terms）</div>
        <div className="mt-1 text-sm text-text-weak">
          当前组织共缓存 {terms.length} 条字典项，所有状态/来源/阶段标签均由此翻译，支持企业自定义。
        </div>
      </Card>
    </div>
  );
}

const LEVEL_NAME: Record<number, string> = { 25: 'A 级客户', 26: 'B 级客户', 27: 'C 级客户' };

// 销售自主折扣上限（按客户分级）—— 询价单在此折扣内销售可自助出单，超出走审批
function DiscountPolicyCard() {
  const toast = useUI((s) => s.toast);
  const { data, refetch } = useQuery({ queryKey: ['discount-policy'], queryFn: () => quotationsApi.discountPolicy() });
  const [draft, setDraft] = useState<DiscountPolicy[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (data) setDraft(data); }, [data]);

  const setVal = (levelTermId: number, v: string) =>
    setDraft((d) => d.map((p) => (p.levelTermId === levelTermId ? { ...p, maxDiscount: v } : p)));

  const save = async () => {
    setSaving(true);
    try { await quotationsApi.updateDiscountPolicy(draft); await refetch(); toast('折扣政策已保存', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : '保存失败', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <Card className="mt-4">
      <CardHeader
        title={<span className="flex items-center gap-2"><Percent size={16} className="text-primary" />询价折扣权限（按客户分级）</span>}
        extra={<Button size="sm" variant="primary" onClick={save} disabled={saving}>保存</Button>}
      />
      <div className="p-4">
        <p className="mb-3 text-sm text-text-weak">设置各分级客户「销售可自助出询价单」的最低折扣率（越小=可让利越大）。低于此值的报价需走审批。</p>
        <div className="grid grid-cols-3 gap-4">
          {draft.map((p) => (
            <div key={p.levelTermId} className="rounded-lg border border-border p-3">
              <div className="text-sm font-medium text-text">{LEVEL_NAME[p.levelTermId] ?? `分级 ${p.levelTermId}`}</div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  value={p.maxDiscount}
                  onChange={(e) => setVal(p.levelTermId, e.target.value)}
                  className="h-8 w-20 rounded border border-border px-2 text-right text-sm tabular-nums outline-none focus:border-primary"
                />
                <span className="text-xs text-text-faint">
                  ≈ {(Number(p.maxDiscount) * 10).toFixed(1)} 折（{((1 - Number(p.maxDiscount)) * 100).toFixed(0)}% 让利内免审批）
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
