import { z } from 'zod';

// §10.3 字段表 → Zod schema（复用后端字段约束）
export const leadSchema = z.object({
  name: z.string().min(2, '线索名称至少 2 个字'),
  source: z.coerce.number({ invalid_type_error: '请选择来源' }).int().positive('请选择来源'),
  poolGroup: z.coerce.number().int().optional(),
  industry: z.string().optional(),
  province: z.string().optional(),
  city: z.string().optional(),
  phoneName: z.string().optional(),
  phone: z
    .string()
    .optional()
    .refine((v) => !v || /^1[3-9]\d{9}$/.test(v), '手机号格式不正确'),
  toPool: z.boolean().optional(), // 进入线索池（免负责人，由销售管理分配）
  leaderId: z.coerce.number().int().positive().optional(),
});

export type LeadForm = z.infer<typeof leadSchema>;
