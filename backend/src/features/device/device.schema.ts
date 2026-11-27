import { z } from 'zod';
import { MFS_PROVIDERS, SMS_SOURCES } from '../../db/schema';

export const ingestMessageSchema = z.object({
  provider: z.enum(MFS_PROVIDERS),
  trxId: z.string().trim().min(2),
  amount: z.number().positive(),
  senderNumber: z.string().trim().min(8),
  rawSms: z.string(),
  receivedAt: z.number().optional(), // epoch ms timestamp from phone
  smsSender: z.string().trim().optional().nullable(),
  source: z.enum(SMS_SOURCES).optional().default('SMS'),
  simSlotIndex: z.number().int().min(1).max(4).optional().nullable(),
  receiverNumber: z.string().trim().optional().nullable(),
});

export const ingestSmsBatchSchema = z.object({
  messages: z.array(ingestMessageSchema).min(1, 'At least one transaction message is required'),
});

export const preflightSimSlotSchema = z.object({
  slotIndex: z.number().int().min(0).max(3).optional(),
  carrierName: z.string().trim().max(80).optional(),
  phoneNumber: z.string().trim().optional().default(''),
  source: z
    .enum(['HARDWARE', 'CONFIRMED', 'SIM_SUBSCRIPTION', 'MANUAL_CONFIRM', 'HIDDEN'])
    .optional()
    .default('HARDWARE'),
});

export const heartbeatSchema = z.object({
  fcmToken: z.string().optional(),
  batteryLevel: z.number().min(0).max(100).optional(),
  appVersion: z.string().optional(),
  networkType: z.string().optional(), // WIFI, MOBILE, etc.
  fcmEnabled: z.boolean().optional(),
  smsPermission: z.boolean().optional(),
  listenerEnabled: z.boolean().optional(),
  simSlots: z.array(preflightSimSlotSchema).optional(),
});

export const deviceSyncQuerySchema = z.object({
  since: z.preprocess(
    (val) => (val === '' || val === undefined || val === null ? undefined : val),
    z.coerce.number().int().nonnegative().optional()
  ),
});

export const preflightCheckSchema = z.object({
  deviceSimNumbers: z.array(preflightSimSlotSchema).optional().default([]),
  smsPermission: z.boolean().optional(),
  listenerEnabled: z.boolean().optional(),
  batteryOptimizationIgnored: z.boolean().optional(),
  fcmEnabled: z.boolean().optional(),
});

export type IngestMessageDTO = z.infer<typeof ingestMessageSchema>;
export type IngestSmsBatchDTO = z.infer<typeof ingestSmsBatchSchema>;
export type HeartbeatDTO = z.infer<typeof heartbeatSchema>;
export type DeviceSyncQueryDTO = z.infer<typeof deviceSyncQuerySchema>;
export type PreflightSimSlotDTO = z.infer<typeof preflightSimSlotSchema>;
export type PreflightCheckDTO = z.infer<typeof preflightCheckSchema>;
