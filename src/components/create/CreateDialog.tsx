import { useNavigate } from 'react-router-dom';
import { useForm, type UseFormRegister, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { contractsApi, customers as customerStore, customersApi, leadsApi, opportunitiesApi } from '@/api/crm';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/primitives';
import { Field, Select, TextInput } from '@/components/ui/form';
import { useCreate, type CreatableEntity } from '@/store/create';
import { useUI } from '@/store/ui';
import { useTerm } from '@/hooks/useTerms';
import { TERMS_BIZ } from '@/mock/terms';
import { MOCK_USERS } from '@/mock/org';
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

function UserSelect({ register, name, errors }: { register: UseFormRegister<any>; name: string; errors: FieldErrors }) {
  return (
    <Field label="负责人" required error={errors[name]?.message as string}>
      <Select invalid={!!errors[name]} defaultValue="" {...register(name)}>
        <option value="" disabled>
          请选择
        </option>
        {MOCK_USERS.map((u) => (
          <option key={u.userId} value={u.userId}>
            {u.name}（{u.depName}）
          </option>
        ))}
      </Select>
    </Field>
  );
}

function CustomerSelect({
  register,
  errors,
  defaultValue,
}: {
  register: UseFormRegister<any>;
  errors: FieldErrors;
  defaultValue?: number;
}) {
  const options = customerStore.filter((c) => c.category >= 3).slice(0, 200);
  return (
    <Field label="客户" required error={errors.customerId?.message as string}>
      <Select invalid={!!errors.customerId} defaultValue={defaultValue ?? ''} {...register('customerId')}>
        <option value="" disabled>
          请选择客户
        </option>
        {options.map((c) => (
          <option key={c.customerId} value={c.customerId}>
            {c.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

// ---------------- 线索 ----------------
function LeadFormView({ preset }: { preset?: Record<string, unknown> }) {
  const { term, close, toast, qc } = useShared();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LeadForm>({ resolver: zodResolver(leadSchema), defaultValues: preset as any });

  const onSubmit = async (data: LeadForm) => {
    await leadsApi.create(data);
    qc.invalidateQueries({ queryKey: ['leads'] });
    toast(`线索「${data.name}」已创建`, 'success');
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
        <Field label="省份" error={errors.province?.message}>
          <TextInput placeholder="如：江苏省" {...register('province')} />
        </Field>
        <Field label="城市" error={errors.city?.message}>
          <TextInput placeholder="如：苏州市" {...register('city')} />
        </Field>
        <Field label="联系电话" error={errors.phone?.message}>
          <TextInput placeholder="手机号" {...register('phone')} />
        </Field>
        <UserSelect register={register} name="leaderId" errors={errors} />
      </div>
      <Footer onCancel={close} submitting={isSubmitting} />
    </form>
  );
}

// ---------------- 客户 ----------------
function CustomerFormView({ preset }: { preset?: Record<string, unknown> }) {
  const { term, close, toast, qc } = useShared();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CustomerForm>({ resolver: zodResolver(customerSchema), defaultValues: preset as any });

  const onSubmit = async (data: CustomerForm) => {
    await customersApi.create(data);
    qc.invalidateQueries({ queryKey: ['customers'] });
    toast(`客户「${data.name}」已创建`, 'success');
    close();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="客户名称" required error={errors.name?.message} className="col-span-2">
          <TextInput invalid={!!errors.name} placeholder="企业全称" {...register('name')} />
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
        <Field label="企查查ID" hint="填写后按工商关系自动归集集团">
          <TextInput placeholder="如 QCCDEMO_A1" {...register('refCompanyId')} />
        </Field>
        <UserSelect register={register} name="leaderId" errors={errors} />
      </div>
      <Footer onCancel={close} submitting={isSubmitting} />
    </form>
  );
}

// ---------------- 商机 ----------------
function OpportunityFormView({ preset }: { preset?: Record<string, unknown> }) {
  const { term, close, toast, qc } = useShared();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OpportunityForm>({ resolver: zodResolver(opportunitySchema), defaultValues: preset as any });

  const onSubmit = async (data: OpportunityForm) => {
    await opportunitiesApi.create(data);
    qc.invalidateQueries({ queryKey: ['opportunities'] });
    qc.invalidateQueries({ queryKey: ['opportunities-all'] });
    toast(`商机「${data.name}」已创建`, 'success');
    close();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="商机名称" required error={errors.name?.message} className="col-span-2">
          <TextInput invalid={!!errors.name} placeholder="如：某某客户·专业版采购" {...register('name')} />
        </Field>
        <CustomerSelect register={register} errors={errors} defaultValue={preset?.customerId as number} />
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
        <UserSelect register={register} name="leaderId" errors={errors} />
      </div>
      <Footer onCancel={close} submitting={isSubmitting} />
    </form>
  );
}

// ---------------- 合同 ----------------
function ContractFormView({ preset }: { preset?: Record<string, unknown> }) {
  const { close, toast, qc, navigate } = useShared();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ContractForm>({
    resolver: zodResolver(contractSchema),
    defaultValues: { contractType: 1, renewType: 1, ...(preset as any) },
  });

  const onSubmit = async (data: ContractForm) => {
    const row = await contractsApi.create(data as Record<string, unknown>);
    qc.invalidateQueries({ queryKey: ['contracts'] });
    toast(`合同「${data.name}」已创建`, 'success');
    close();
    if (row) navigate(`/contracts/${row.contractId}`);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="合同名称" required error={errors.name?.message} className="col-span-2">
          <TextInput invalid={!!errors.name} placeholder="如：某某客户·服务合同" {...register('name')} />
        </Field>
        <CustomerSelect register={register} errors={errors} defaultValue={preset?.customerId as number} />
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
        <Field label="到期日期" required error={errors.expiredDate?.message}>
          <TextInput invalid={!!errors.expiredDate} type="date" {...register('expiredDate')} />
        </Field>
        <UserSelect register={register} name="leaderId" errors={errors} />
      </div>
      <Footer onCancel={close} submitting={isSubmitting} />
    </form>
  );
}
