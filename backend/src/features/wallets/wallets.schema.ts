import { z } from 'zod';
import { MFS_PROVIDERS, ACCOUNT_TYPES } from '../../db/schema';

// Bangladeshi mobile number: 01[3-9] followed by 8 digits (standard) or 9 digits (Rocket 12-digit format)
const bangladeshiPhoneRegex = /^01[3-9]\d{8,9}$/;

export const createWalletSchema = z.object({
  provider: z.enum(MFS_PROVIDERS, {
    errorMap: () => ({ message: 'Invalid MFS provider. Must be BKASH, NAGAD, ROCKET, UPAY, or CELLFIN' }),
  }),
  walletNumber: z
    .string()
    .trim()
    .regex(bangladeshiPhoneRegex, 'Must be a valid 11 or 12-digit Bangladeshi mobile number starting with 01'),
  accountType: z.enum(ACCOUNT_TYPES).default('PERSONAL'),
  label: z.string().trim().max(60).optional().nullable(),
  deviceId: z.string().trim().max(64).optional().nullable(),
  simSlotIndex: z.number().int().min(1).max(4).optional().nullable(),
  safeVolumeLimit: z.number().positive().default(250000),
  monthlyVolumeLimit: z.number().positive().default(300000),
  isPrimary: z.boolean().default(false),
  priorityOrder: z.number().int().default(0),
});

export const updateWalletSchema = z.object({
  walletNumber: z.string().trim().regex(bangladeshiPhoneRegex).optional(),
  accountType: z.enum(ACCOUNT_TYPES).optional(),
  label: z.string().trim().max(60).optional().nullable(),
  deviceId: z.string().trim().max(64).optional().nullable(),
  simSlotIndex: z.number().int().min(1).max(4).optional().nullable(),
  safeVolumeLimit: z.number().positive().optional(),
  monthlyVolumeLimit: z.number().positive().optional(),
  currentMonthVolume: z.number().min(0).optional(),
  isPrimary: z.boolean().optional(),
  isActive: z.boolean().optional(),
  priorityOrder: z.number().int().optional(),
});

export const syncWalletsSchema = z.object({
  wallets: z
    .array(
      z.object({
        provider: z.enum(MFS_PROVIDERS),
        walletNumber: z.string().trim().min(10),
        accountType: z.enum(ACCOUNT_TYPES).default('PERSONAL'),
        label: z.string().trim().max(60).optional().nullable(),
        deviceId: z.string().trim().max(64).optional().nullable(),
        simSlotIndex: z.number().int().min(1).max(4).optional().nullable(),
        isActive: z.boolean().default(true),
        isPrimary: z.boolean().optional(),
        safeVolumeLimit: z.number().positive().optional(),
        monthlyVolumeLimit: z.number().positive().optional(),
        priorityOrder: z.number().int().optional(),
      })
    )
    .max(40),
  replacePlaceholders: z.boolean().default(true),
  pruneMissing: z.boolean().default(false),
});

export type CreateWalletInput = z.infer<typeof createWalletSchema>;
export type UpdateWalletInput = z.infer<typeof updateWalletSchema>;
export type SyncWalletsInput = z.infer<typeof syncWalletsSchema>;
