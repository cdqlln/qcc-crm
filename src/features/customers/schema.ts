import { z } from 'zod';

export const customerSchema = z.object({
  name: z.string().min(2, '客户名称至少 2 个字'),
  level: z.coerce.number({ invalid_type_error: '请选择分级' }).int().positive('请选择客户分级'),
  source: z.coerce.number().int().positive('请选择来源'),
  industry: z.string().optional(),
  province: z.string().optional(),
  city: z.string().optional(),
  phoneName: z.string().optional(),
  phone: z
    .string()
    .optional()
    .refine((v) => !v || /^1[3-9]\d{9}$/.test(v), '手机号格式不正确'),
  email: z.string().optional().refine((v) => !v || /.+@.+\..+/.test(v), '邮箱格式不正确'),
  refCompanyId: z.string().optional(),
  leaderId: z.coerce.number().int().positive('请指定负责人'),
});

export type CustomerForm = z.infer<typeof customerSchema>;
