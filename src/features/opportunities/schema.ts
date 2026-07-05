import { z } from 'zod';

export const opportunitySchema = z.object({
  requirement: z.string().min(5, '请先描述客户需求（至少 5 个字）'),
  name: z.string().min(2, '商机名称至少 2 个字'),
  customerId: z.coerce.number({ invalid_type_error: '请选择客户' }).int().positive('请选择客户'),
  estimatedAmount: z
    .string()
    .min(1, '请输入预计成交金额')
    .refine((v) => Number(v) > 0, '金额需大于 0'),
  status: z.coerce.number().int().positive('请选择阶段'),
  expiryDate: z.string().min(1, '请选择预计成交日期'),
  leaderId: z.coerce.number().int().positive('请指定跟进人'),
  competitor: z.string().optional(),
});

export type OpportunityForm = z.infer<typeof opportunitySchema>;
