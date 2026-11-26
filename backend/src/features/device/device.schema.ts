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
});

export const ingestSmsBatchSchema = z.object({
  messages: z.array(ingestMessageSchema).min(1, 'At least one transaction message is required'),
});

export const heartbeatSchema = z.object({
  fcmToken: z.string().optional(),
  batteryLevel: z.number().min(0).max(100).optional(),
  appVersion: z.string().optional(),
  networkType: z.string().optional(), // WIFI, MOBILE, etc.
  fcmEnabled: z.boolean().optional(),
  smsPermission: z.boolean().optional(),
  listenerEnabled: z.boolean().optional(),
});

export const deviceSyncQuerySchema = z.object({
  since: z.preprocess(
    (val) => (val === '' || val === undefined || val === null ? undefined : val),
    z.coerce.number().int().nonnegative().optional()
  ),
});

export type IngestMessageDTO = z.infer<typeof ingestMessageSchema>;
export type IngestSmsBatchDTO = z.infer<typeof ingestSmsBatchSchema>;
export type HeartbeatDTO = z.infer<typeof heartbeatSchema>;
export type DeviceSyncQueryDTO = z.infer<typeof deviceSyncQuerySchema>;
