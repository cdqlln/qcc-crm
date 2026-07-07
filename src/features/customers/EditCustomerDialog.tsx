import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { customersApi } from '@/api/crm';
import { useUI } from '@/store/ui';
import { useTerm } from '@/hooks/useTerms';
import { TERMS_BIZ } from '@/mock/terms';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/primitives';
import { Field, Select, TextInput } from '@/components/ui/form';
import { CompanyNameInput } from '@/components/ui/CompanyNameInput';
import { RegionSelect } from '@/components/ui/RegionSelect';
import { parseRegion } from '@/lib/regions';
import type { Customer } from '@/types';

// 编辑口径 = 创建表单去掉负责人（负责人变更走「移交」审批流）
const editSchema = z.object({
  name: z.string().min(2, '客户名称至少 2 个字'),
  level: z.coerce.number({ invalid_type_error: '请选择分级' }).int().positive('请选择客户分级'),
  source: z.coerce.number().int().positive('请选择来源'),
  industry: z.string().optional(),
  province: z.string().optional(),
  city: z.string().optional(),
  phoneName: z.string().optional(),
  phone: z.string().optional().refine((v) => !v || /^1[3-9]\d{9}$/.test(v), '手机号格式不正确'),
  email: z.string().optional().refine((v) => !v || /.+@.+\..+/.test(v), '邮箱格式不正确'),
  refCompanyId: z.string().optional(),
});
type EditForm = z.infer<typeof editSchema>;

/** 客户信息编辑：名称支持工商联想重选（重选后按真实工商关系重新归集集团） */
export function EditCustomerDialog({ cust, onClose }: { cust: Customer; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useUI((s) => s.toast);
  const term = useTerm();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: cust.name,
      level: cust.level,
      source: cust.source,
      industry: cust.industry ?? '',
      province: cust.province ?? '',
      city: cust.city ?? '',
      phoneName: cust.phoneName ?? '',
      phone: cust.phone ?? '',
      email: cust.email ?? '',
      refCompanyId: cust.refCompanyId ?? '',
    },
  });
  const nameVal = watch('name') ?? '';

  const onSubmit = async (data: EditForm) => {
    try {
      const updated = await customersApi.update(cust.customerId, data);
      qc.invalidateQueries({ queryKey: ['customer', cust.customerId] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast(
        `客户信息已更新${data.name !== cust.name ? (updated.groupName ? `，已重新归集到「${updated.groupName}」` : '，已重新核对集团归属') : ''}`,
        'success',
      );
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : '保存失败', 'error');
    }
  };

  return (
    <Dialog open title={`编辑客户「${cust.name}」`} onClose={onClose}
      footer={<>
        <Button onClick={onClose}>取消</Button>
        <Button variant="primary" onClick={handleSubmit(onSubmit)} disabled={isSubmitting}>{isSubmitting ? '保存中…' : '保存'}</Button>
      </>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="客户名称" required error={errors.name?.message} hint="改名后按真实工商关系重新归集集团；从联想中重选可关联工商主体并带入注册地区" className="col-span-2">
          <CompanyNameInput
            value={nameVal}
            invalid={!!errors.name}
            onChange={(v) => setValue('name', v, { shouldValidate: !!errors.name })}
            onPick={(c) => {
              setValue('name', c.name, { shouldValidate: true });
              setValue('refCompanyId', c.keyNo);
              const region = parseRegion(c.address);
              if (region.province) { setValue('province', region.province); setValue('city', region.city); }
            }}
          />
        </Field>
        <Field label="客户分级" required error={errors.level?.message}>
          <Select invalid={!!errors.level} {...register('level')}>
            {term.options(TERMS_BIZ.level).map((t) => (
              <option key={t.termId} value={t.termId}>{t.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="客户来源" required error={errors.source?.message}>
          <Select invalid={!!errors.source} {...register('source')}>
            {term.options(TERMS_BIZ.source).map((t) => (
              <option key={t.termId} value={t.termId}>{t.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="行业" error={errors.industry?.message}><TextInput {...register('industry')} /></Field>
        <Field label="所在地区" className="col-span-2" hint="省市联动，也可直接输入">
          <RegionSelect
            province={watch('province') ?? ''}
            city={watch('city') ?? ''}
            onChange={(p, c) => { setValue('province', p); setValue('city', c); }}
          />
        </Field>
        <Field label="联系人" error={errors.phoneName?.message}><TextInput {...register('phoneName')} /></Field>
        <Field label="联系电话" error={errors.phone?.message}><TextInput {...register('phone')} /></Field>
        <Field label="邮箱" error={errors.email?.message}><TextInput {...register('email')} /></Field>
      </div>
    </Dialog>
  );
}
