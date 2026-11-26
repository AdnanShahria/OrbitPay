import { z } from 'zod';

export const sendOtpSchema = z.object({
  phone: z.string().trim().min(10, 'Phone number is required').max(25),
  purpose: z
    .string()
    .trim()
    .min(1, 'Purpose must not be empty')
    .max(40, 'Purpose is too long')
    .regex(/^[A-Za-z0-9_:-]+$/, 'Invalid purpose format')
    .default('GENERIC'),
  template: z.string().trim().min(1).max(320).optional(),
  email: z.string().trim().email('Invalid email address').optional(),
});

export const verifyOtpSchema = z.object({
  otpId: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().min(10, 'Phone number is required').max(25),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'OTP code must be a 6-digit number'),
  purpose: z
    .string()
    .trim()
    .min(1, 'Purpose must not be empty')
    .max(40, 'Purpose is too long')
    .regex(/^[A-Za-z0-9_:-]+$/, 'Invalid purpose format')
    .default('GENERIC'),
});

export type SendOtpInput = z.infer<typeof sendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
