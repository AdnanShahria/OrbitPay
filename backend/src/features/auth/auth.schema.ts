import { z } from 'zod';
import { DEVICE_TYPES } from '../../db/schema';

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email('Valid email address is required')
    .transform((v) => v.toLowerCase()),
  password: z.string().min(1, 'Password is required'),
  deviceType: z.enum(DEVICE_TYPES).default('WEB'),
  deviceName: z.string().trim().max(120).optional(),
  fcmToken: z.string().trim().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
