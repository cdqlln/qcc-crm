import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, type UseFormRegister, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { contractsApi, customersApi, leadsApi, opportunitiesApi, productsApi, uploadApi } from '@/api/crm';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/primitives';
import { Field, Select, TextArea, TextInput } from '@/components/ui/form';
import { CompanyNameInput } from '@/components/ui/CompanyNameInput';
import { EntitySearchSelect } from '@/components/ui/EntitySearchSelect';
import { UserSearchSelect } from '@/components/ui/UserSearchSelect';
import { RegionSelect } from '@/components/ui/RegionSelect';
import { AttachmentDrafts } from '@/components/ui/Attachments';
import { Paperclip } from 'lucide-react';
import { useCreate, type CreatableEntity } from '@/store/create';
import { useUI } from '@/store/ui';
import { useAuth } from '@/store/auth';
import { useTerm } from '@/hooks/useTerms';
import { TERMS_BIZ } from '@/mock/terms';
import { cn } from '@/lib/cn';
import { parseRegion } from '@/lib/regions';
import { leadSchema, type LeadForm } from '@/features/leads/schema';
import { customerSchema, type CustomerForm } from '@/features/customers/schema';
import { opportunitySchema, type OpportunityForm } from '@/features/opportunities/schema';
import { contractSchema, type ContractForm } from '@/features/contracts/schema';

const TITLE: Record<CreatableEntity, string> = {
  lead: '新建线索',
  customer: '新建客户',
  opportunity: '新建商机',
  contract: '新建合同',
};

// 统一新建弹窗：根据 useCreate.entity 渲染对应 RHF + Zod 表单（§10.3）
export function CreateDialog() {
  const { entity, preset, close } = useCreate();
  if (!entity) return null;
  return (
    <Dialog open onClose={close} title={TITLE[entity]} width="w-[600px]">
      {entity === 'lead' && <LeadFormView preset={preset} />}
      {entity === 'customer' && <CustomerFormView preset={preset} />}
      {entity === 'opportunity' && <OpportunityFormView preset={preset} />}
      {entity === 'contract' && <ContractFormView preset={preset} />}
    </Dialog>
  );
}

function useShared() {
  const term = useTerm();
  const close = useCreate((s) => s.close);
  const toast = useUI((s) => s.toast);
  const qc = useQueryClient();
  const navigate = useNavigate();
  return { term, close, toast, qc, navigate };
}

function Footer({ onCancel, submitting }: { onCancel: () => void; submitting?: boolean }) {
  return (
    <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
      <Button type="button" onClick={onCancel}>
        取消
      </Button>
      <Button type="submit" variant="primary" disabled={submitting}>
        {submitting ? '保存中…' : '保存'}
      </Button>
    </div>
  );
}

// 负责人：默认当前用户，支持搜索组织成员选择（全模块通用口径）
function OwnerField({ value, valueName, onChange, error }: {
  value?: number; valueName?: string; onChange: (id: number | undefined, name?: string) => void; error?: string;
}) {
  return (
    <Field label="负责人" required error={error} hint="默认本人，可搜索成员更换">
      <UserSearchSelect value={value} valueName={valueName} onChange={onChange} invalid={!!error} />
    </Field>
  );
}

/** 各表单共用：leaderId 受控接线（默认当前用户） */
function useOwner(watch: (n: any) => any, setValue: (n: any, v: any, o?: any) => void) {
  const user = useAuth((s) => s.user);
  const [leaderName, setLeaderName] = useState<string | undefined>(user?.name);
  const raw = watch('leaderId');
  return {
    defaultLeaderId: user?.userId,
    ownerProps: {
      value: raw ? Number(raw) : undefined,
      valueName: leaderName,
      onChange: (id: number | undefined, name?: string) => {
        setValue('leaderId', (id ?? '') as any, { shouldValidate: true });
        setLeaderName(name);
      },
    },
  };
}


// ---------------- 线索 ----------------
function LeadFormView({ preset }: { preset?: Record<string, unknown> }) {
  const { term, close, toast, qc } = useShared();
  const me = useAuth((s) => s.user);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LeadForm>({ resolver: zodResolver(leadSchema), defaultValues: { leaderId: me?.userId as any, ...(preset as any) } });
  const { ownerProps } = useOwner(watch, setValue);
  const toPool = !!watch('toPool');

  const onSubmit = async (data: LeadForm) => {
    if (!data.toPool && !data.leaderId) return toast('请指定负责人，或勾选「进入线索池」', 'error');
    await leadsApi.create(data.toPool ? { ...data, leaderId: undefined } : data);
    qc.invalidateQueries({ queryKey: ['leads'] });
    toast(data.toPool ? `线索「${data.name}」已进入线索池，等待销售管理分配` : `线索「${data.name}」已创建`, 'success');
    close();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="线索名称" required error={errors.name?.message} className="col-span-2">
          <TextInput invalid={!!errors.name} placeholder="如：苏州某某科技有限公司" {...register('name')} />
        </Field>
        <Field label="线索来源" required error={errors.source?.message}>
          <Select invalid={!!errors.source} defaultValue="" {...register('source')}>
            <option value="" disabled>
              请选择
            </option>
            {term.options(TERMS_BIZ.source).map((t) => (
              <option key={t.termId} value={t.termId}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="线索分组" error={errors.poolGroup?.message}>
          <Select defaultValue="" {...register('poolGroup')}>
            <option value="">不分组</option>
            {term.options(TERMS_BIZ.poolGroup).map((t) => (
              <option key={t.termId} value={t.termId}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="行业" error={errors.industry?.message}>
          <TextInput placeholder="如：软件和信息技术服务" {...register('industry')} />
        </Field>
        <Field label="联系人" error={errors.phoneName?.message}>
          <TextInput placeholder="如：王经理" {...register('phoneName')} />
        </Field>
        <Field label="所在地区" error={(errors.province?.message ?? errors.city?.message) as string} className="col-span-2" hint="省市联动，也可直接输入">
          <RegionSelect
            province={watch('province') ?? ''}
            city={watch('city') ?? ''}
            onChange={(p, c) => { setValue('province', p); setValue('city', c); }}
          />
        </Field>
        <Field label="联系电话" error={errors.phone?.message}>
          <TextInput placeholder="手机号" {...register('phone')} />
        </Field>
        <Field label="归属方式" hint="进池后由销售管理人员统一分配并跟踪进展">
          <label className="flex h-9 cursor-pointer items-center gap-2 text-sm text-text-weak">
            <input type="checkbox" checked={toPool} onChange={(e) => setValue('toPool', e.target.checked)} />
            进入线索池（不指定负责人）
          </label>
        </Field>
        {!toPool && <OwnerField {...ownerProps} error={errors.leaderId?.message as string} />}
      </div>
      <Footer onCancel={close} submitting={isSubmitting} />
    </form>
  );
}

// ---------------- 客户 ----------------
function CustomerFormView({ preset }: { preset?: Record<string, unknown> }) {
  const { term, close, toast, qc } = useShared();
  const me = useAuth((s) => s.user);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CustomerForm>({ resolver: zodResolver(customerSchema), defaultValues: { leaderId: me?.userId as any, ...(preset as any) } });
  const { ownerProps } = useOwner(watch, setValue);
  const nameVal = watch('name') ?? '';

  const onSubmit = async (data: CustomerForm) => {
    const created = await customersApi.create(data);
    qc.invalidateQueries({ queryKey: ['customers'] });
    toast(
      created.groupName
        ? `客户「${data.name}」已创建，并按工商关系自动归集到「${created.groupName}」（可在客户详情取消归集）`
        : `客户「${data.name}」已创建`,
      'success',
    );
    close();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="客户名称" required error={errors.name?.message} hint="工商联想选中后自动带入企查查ID并归属集团" className="col-span-2">
          <CompanyNameInput
            value={nameVal}
            invalid={!!errors.name}
            onChange={(v) => setValue('name', v, { shouldValidate: !!errors.name })}
            onPick={(c) => {
              setValue('name', c.name, { shouldValidate: true });
              setValue('refCompanyId', c.keyNo);
              // 自动带入工商注册地址所在省市（可人工修改）
              const region = parseRegion(c.address);
              if (region.province) { setValue('province', region.province); setValue('city', region.city); }
            }}
          />
        </Field>
        <Field label="客户分级" required error={errors.level?.message}>
          <Select invalid={!!errors.level} defaultValue="" {...register('level')}>
            <option value="" disabled>
              请选择
            </option>
            {term.options(TERMS_BIZ.level).map((t) => (
              <option key={t.termId} value={t.termId}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="客户来源" required error={errors.source?.message}>
          <Select invalid={!!errors.source} defaultValue="" {...register('source')}>
            <option value="" disabled>
              请选择
            </option>
            {term.options(TERMS_BIZ.source).map((t) => (
              <option key={t.termId} value={t.termId}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="行业" error={errors.industry?.message}>
          <TextInput {...register('industry')} />
        </Field>
        <Field label="联系人" error={errors.phoneName?.message}>
          <TextInput {...register('phoneName')} />
        </Field>
        <Field label="联系电话" error={errors.phone?.message}>
          <TextInput {...register('phone')} />
        </Field>
        <Field label="邮箱" error={errors.email?.message}>
          <TextInput {...register('email')} />
        </Field>
        <Field label="所在地区" className="col-span-2" hint="从工商联想选中后自动带入注册地址省市，可修改">
          <RegionSelect
            province={watch('province') ?? ''}
            city={watch('city') ?? ''}
            onChange={(p, c) => { setValue('province', p); setValue('city', c); }}
          />
        </Field>
        <Field label="工商主体" hint="从名称联想选中真实企业即完成关联，并自动归集集团">
          <div className="flex h-9 items-center">
            {watch('refCompanyId')
              ? <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">✓ 已关联工商主体</span>
              : <span className="rounded-full bg-bg px-2.5 py-1 text-xs text-text-faint">未关联工商主体</span>}
          </div>
        </Field>
        <OwnerField {...ownerProps} error={errors.leaderId?.message as string} />
      </div>
      <Footer onCancel={close} submitting={isSubmitting} />
    </form>
  );
}

// ---------------- 商机 ----------------
function OpportunityFormView({ preset }: { preset?: Record<string, unknown> }) {
  const { term, close, toast, qc } = useShared();
  const me = useAuth((s) => s.user);
  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<OpportunityForm>({
    resolver: zodResolver(opportunitySchema),
    defaultValues: { leaderId: me?.userId as any, ...(preset as any) },
  });
  const { ownerProps } = useOwner(watch, setValue);
  const custId = watch('customerId');
  const [custName, setCustName] = useState<string | undefined>(undefined);

  // 涉及产品（多选 chips）
  const { data: allProducts = [] } = useQuery({ queryKey: ['products-all'], queryFn: () => productsApi.all(), staleTime: 60_000 });
  const [productIds, setProductIds] = useState<number[]>([]);

  // 选择客户/集团后自动生成商机名称（可改）：仅在名称为空或仍是上次自动值时覆盖
  const autoNameRef = useRef('');
  const buildAutoName = (cname?: string, pids: number[] = productIds) => {
    if (!cname) return '';
    const pnames = allProducts.filter((p) => pids.includes(p.productId)).map((p) => p.name);
    return `${cname}·${pnames[0] ?? '合作'}${pnames.length > 1 ? `等${pnames.length}项` : ''}商机`;
  };
  const maybeAutoName = (cname?: string, pids?: number[]) => {
    const current = (getValues('name') ?? '').trim();
    if (current && current !== autoNameRef.current) return; // 用户已手改，不覆盖
    const auto = buildAutoName(cname, pids);
    if (auto) {
      autoNameRef.current = auto;
      setValue('name', auto, { shouldValidate: true });
    }
  };

  const toggleProduct = (pid: number) => {
    setProductIds((cur) => {
      const next = cur.includes(pid) ? cur.filter((x) => x !== pid) : [...cur, pid];
      maybeAutoName(custName, next);
      return next;
    });
  };

  const onSubmit = async (data: OpportunityForm) => {
    await opportunitiesApi.create({ ...data, productIds } as any);
    qc.invalidateQueries({ queryKey: ['opportunities'] });
    qc.invalidateQueries({ queryKey: ['opportunities-all'] });
    toast(`商机「${data.name}」已创建`, 'success');
    close();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="grid grid-cols-2 gap-4">
        {/* 1. 先描述客户需求 */}
        <Field label="客户需求" required error={errors.requirement?.message} className="col-span-2">
          <TextArea rows={3} placeholder="客户想解决什么问题？预算/时间/关键诉求…" {...register('requirement')} />
        </Field>

        {/* 2. 涉及产品（多选） */}
        <Field label="涉及产品（多选）" className="col-span-2" hint="影响自动命名与后续报价">
          <div className="flex flex-wrap gap-2">
            {allProducts.map((p) => (
              <button
                key={p.productId}
                type="button"
                onClick={() => toggleProduct(p.productId)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs transition-colors',
                  productIds.includes(p.productId)
                    ? 'border-primary bg-primary-weak text-primary'
                    : 'border-border text-text-weak hover:border-primary/50',
                )}
              >
                {p.name}
              </button>
            ))}
            {allProducts.length === 0 && <span className="text-xs text-text-faint">暂无产品目录</span>}
          </div>
        </Field>

        {/* 3. 客户/集团 → 自动生成名称 */}
        <Field label="客户 / 集团主体" required error={errors.customerId?.message as string} hint="选择后自动生成商机名称（可修改）">
          <EntitySearchSelect
            value={custId ? Number(custId) : undefined}
            valueName={custName}
            invalid={!!errors.customerId}
            onChange={(id, name) => {
              setValue('customerId', (id ?? '') as any, { shouldValidate: true });
              setCustName(name);
              maybeAutoName(name);
            }}
          />
        </Field>
        <Field label="商机名称" required error={errors.name?.message} hint="按「客户·产品」自动生成，可直接修改">
          <TextInput invalid={!!errors.name} placeholder="选择客户后自动生成" {...register('name')} />
        </Field>

        <Field label="预计成交金额" required error={errors.estimatedAmount?.message}>
          <TextInput invalid={!!errors.estimatedAmount} inputMode="decimal" placeholder="0.00" {...register('estimatedAmount')} />
        </Field>
        <Field label="当前阶段" required error={errors.status?.message}>
          <Select invalid={!!errors.status} defaultValue="" {...register('status')}>
            <option value="" disabled>
              请选择
            </option>
            {term.options(TERMS_BIZ.oppStage).map((t) => (
              <option key={t.termId} value={t.termId}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="预计成交日期" required error={errors.expiryDate?.message}>
          <TextInput invalid={!!errors.expiryDate} type="date" {...register('expiryDate')} />
        </Field>
        <Field label="竞争对手" error={errors.competitor?.message}>
          <TextInput placeholder="可选" {...register('competitor')} />
        </Field>
        <OwnerField {...ownerProps} error={errors.leaderId?.message as string} />
      </div>
      <Footer onCancel={close} submitting={isSubmitting} />
    </form>
  );
}

// ---------------- 合同 ----------------
function ContractFormView({ preset }: { preset?: Record<string, unknown> }) {
  const { close, toast, qc, navigate } = useShared();
  const me = useAuth((s) => s.user);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ContractForm>({
    resolver: zodResolver(contractSchema),
    defaultValues: { contractType: 1, renewType: 1, leaderId: me?.userId as any, ...(preset as any) },
  });
  const { ownerProps } = useOwner(watch, setValue);
  const custId = watch('customerId');
  const [custName, setCustName] = useState<string | undefined>(undefined);
  // 创建方式：byCustomer 直接按客户 / byOpportunity 关联商机（列表接口按数据范围过滤：销售=自己的，部门负责人=本部门的）
  const [mode, setMode] = useState<'byCustomer' | 'byOpportunity'>(preset?.opportunityId ? 'byOpportunity' : 'byCustomer');
  const [oppKw, setOppKw] = useState('');
  const oppId = watch('opportunityId');
  const { data: oppPage } = useQuery({
    queryKey: ['contract-opps', oppKw],
    queryFn: () => opportunitiesApi.list({ page: 1, pageSize: 50, keyword: oppKw || undefined }),
    enabled: mode === 'byOpportunity',
  });
  const pickOpp = (o: import('@/types').Opportunity) => {
    setValue('opportunityId', o.opportunityId as any, { shouldValidate: true });
    setValue('customerId', o.customerId as any, { shouldValidate: true });
    setCustName(o.customerName);
    const cur = (watch('name') ?? '').trim();
    if (!cur) setValue('name', `${o.customerName ?? ''} 服务合同`);
    if (!watch('amount')) setValue('amount', o.estimatedAmount as any);
  };
  // 到期日快捷：开始日期 + 一年/二年
  const setExpiryQuick = (years: number) => {
    const base = watch('beginDate') || new Date().toISOString().slice(0, 10);
    const dte = new Date(base);
    dte.setFullYear(dte.getFullYear() + years);
    setValue('expiredDate', dte.toISOString().slice(0, 10), { shouldValidate: true });
  };
  // 合同文件（合同文本/扫描件）：随合同保存，供法务审核查阅
  const [files, setFiles] = useState<import('@/types').Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!picked.length) return;
    setUploading(true);
    try {
      const up = await uploadApi.upload(picked);
      setFiles((f) => [...f, ...up]);
    } catch (err) { toast(err instanceof Error ? err.message : '上传失败', 'error'); }
    finally { setUploading(false); }
  };

  const onSubmit = async (data: ContractForm) => {
    const row = await contractsApi.create({ ...data, attachments: files } as Record<string, unknown>);
    qc.invalidateQueries({ queryKey: ['contracts'] });
    toast(files.length ? `合同「${data.name}」已创建（含 ${files.length} 个合同文件，可提交法务审核）` : `合同「${data.name}」已创建`, 'success');
    close();
    if (row) navigate(`/contracts/${row.contractId}`);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="合同名称" required error={errors.name?.message} className="col-span-2">
          <TextInput invalid={!!errors.name} placeholder="如：某某客户·服务合同" {...register('name')} />
        </Field>
        <Field label="创建方式" className="col-span-2">
          <div className="inline-flex overflow-hidden rounded-md border border-border">
            {([['byCustomer', '按客户直接创建'], ['byOpportunity', '关联商机创建']] as const).map(([m, label]) => (
              <button key={m} type="button" onClick={() => { setMode(m); if (m === 'byCustomer') setValue('opportunityId', undefined as any); }}
                className={cn('px-3 py-1.5 text-sm', mode === m ? 'bg-primary text-white' : 'text-text-weak hover:text-text')}>
                {label}
              </button>
            ))}
          </div>
        </Field>
        {mode === 'byOpportunity' ? (
          <Field label="关联商机" required error={errors.customerId?.message as string} className="col-span-2"
            hint="销售可选自己的商机；部门负责人可选本部门全部商机（按数据范围）">
            <div className="space-y-1.5">
              <TextInput placeholder="搜索商机名称 / 编号 / 客户…" value={oppKw} onChange={(e) => setOppKw(e.target.value)} />
              <div className="max-h-40 overflow-y-auto rounded-md border border-border">
                {(oppPage?.list ?? []).map((o) => (
                  <button key={o.opportunityId} type="button" onClick={() => pickOpp(o)}
                    className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-bg', Number(oppId) === o.opportunityId && 'bg-primary-weak text-primary')}>
                    <span className="font-mono text-xs text-text-faint">{o.code}</span>
                    <span className="min-w-0 flex-1 truncate">{o.name}</span>
                    <span className="shrink-0 text-xs text-text-faint">{o.customerName} · ¥{Number(o.estimatedAmount).toLocaleString()}</span>
                  </button>
                ))}
                {(oppPage?.list ?? []).length === 0 && <div className="px-3 py-3 text-center text-xs text-text-faint">无可选商机</div>}
              </div>
              {oppId && custName && <div className="text-xs text-success">已关联商机，客户：{custName}</div>}
            </div>
          </Field>
        ) : (
          <Field label="客户" required error={errors.customerId?.message as string} hint="可直接输入公司名称搜索，找出需要出合同的客户">
            <EntitySearchSelect
              value={custId ? Number(custId) : undefined}
              valueName={custName}
              invalid={!!errors.customerId}
              onChange={(id, name) => {
                setValue('customerId', (id ?? '') as any, { shouldValidate: true });
                setCustName(name);
              }}
            />
          </Field>
        )}
        <Field label="合同金额" required error={errors.amount?.message}>
          <TextInput invalid={!!errors.amount} inputMode="decimal" placeholder="0.00" {...register('amount')} />
        </Field>
        <Field label="合同类型" error={errors.contractType?.message}>
          <Select {...register('contractType')}>
            <option value={1}>常规</option>
            <option value={2}>框架主</option>
            <option value={3}>框架子</option>
          </Select>
        </Field>
        <Field label="续约类型" error={errors.renewType?.message}>
          <Select {...register('renewType')}>
            <option value={1}>一次性</option>
            <option value={2}>到期续约</option>
          </Select>
        </Field>
        <Field label="开始日期" required error={errors.beginDate?.message}>
          <TextInput invalid={!!errors.beginDate} type="date" {...register('beginDate')} />
        </Field>
        <Field label="到期日期" required error={errors.expiredDate?.message} hint="快捷：自开始日期起一年/二年">
          <div className="space-y-1">
            <TextInput invalid={!!errors.expiredDate} type="date" {...register('expiredDate')} />
            <div className="flex gap-1">
              <button type="button" onClick={() => setExpiryQuick(1)} className="rounded border border-border px-1.5 py-0.5 text-[11px] text-text-weak hover:border-primary/50 hover:text-primary">一年</button>
              <button type="button" onClick={() => setExpiryQuick(2)} className="rounded border border-border px-1.5 py-0.5 text-[11px] text-text-weak hover:border-primary/50 hover:text-primary">二年</button>
            </div>
          </div>
        </Field>
        <OwnerField {...ownerProps} error={errors.leaderId?.message as string} />
        <Field label="合同文件" className="col-span-2" hint="上传合同文本/扫描件（PDF/Word/图片），供法务审核查阅">
          <div className="space-y-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-sm text-text-weak hover:border-primary hover:text-primary">
              <Paperclip size={14} />{uploading ? '上传中…' : '选择文件上传'}
              <input type="file" multiple className="hidden" onChange={onPickFiles} accept=".pdf,.doc,.docx,image/*,.zip" />
            </label>
            <AttachmentDrafts items={files} onRemove={(i) => setFiles((f) => f.filter((_, x) => x !== i))} />
          </div>
        </Field>
      </div>
      <Footer onCancel={close} submitting={isSubmitting} />
    </form>
  );
}
