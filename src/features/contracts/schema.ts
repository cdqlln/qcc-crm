import { z } from 'zod';

export const contractSchema = z.object({
  name: z.string().min(2, '合同名称至少 2 个字'),
  customerId: z.coerce.number({ invalid_type_error: '请选择客户' }).int().positive('请选择客户'),
  amount: z
    .string()
    .min(1, '请输入合同金额')
    .refine((v) => Number(v) > 0, '金额需大于 0'),
  contractType: z.coerce.number().int().min(1).max(3),
  renewType: z.coerce.number().int().min(1).max(2),
  beginDate: z.string().min(1, '请选择开始日期'),
  expiredDate: z.string().min(1, '请选择到期日期'),
  leaderId: z.coerce.number().int().positive('请指定负责人'),
  opportunityId: z.coerce.number().int().positive().optional(), // 关联商机方式
});

export type ContractForm = z.infer<typeof contractSchema>;
