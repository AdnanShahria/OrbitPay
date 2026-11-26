import { sqliteTable, text, integer, real, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const MFS_PROVIDERS = ['BKASH', 'NAGAD', 'ROCKET', 'UPAY', 'CELLFIN'] as const;
export type MfsProvider = (typeof MFS_PROVIDERS)[number];

export const ACCOUNT_TYPES = ['PERSONAL', 'PRA', 'MERCHANT'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const LEDGER_STATUSES = ['UNCLAIMED', 'VERIFIED', 'MANUAL_VERIFIED'] as const;
export type LedgerStatus = (typeof LEDGER_STATUSES)[number];

export const SMS_SOURCES = ['SMS', 'NOTIFICATION', 'INBOX_SCAN'] as const;
export type SmsSource = (typeof SMS_SOURCES)[number];

export const MATCH_TYPES = ['EXACT_UNIQUE', 'BASE_AMOUNT_FALLBACK', 'OVERPAID', 'MANUAL_VERIFIED'] as const;
export type MatchType = (typeof MATCH_TYPES)[number];

export const QUEUE_STATUSES = ['WAITING_FOR_SMS', 'MATCHED', 'EXPIRED'] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

export const CHECKOUT_SESSION_STATUSES = ['OPEN', 'SUBMITTED', 'VERIFIED', 'EXPIRED'] as const;
export type CheckoutSessionStatus = (typeof CHECKOUT_SESSION_STATUSES)[number];

export const USER_ROLES = ['MERCHANT_OWNER', 'MERCHANT_STAFF'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const DEVICE_TYPES = ['WEB', 'ANDROID'] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export const ORDER_PAYMENT_METHODS = ['ORBIT_MFS', 'COD', 'CARD', 'BANK_TRANSFER', 'OTHER'] as const;
export type OrderPaymentMethod = (typeof ORDER_PAYMENT_METHODS)[number];

export const ORDER_PAYMENT_STATUSES = ['UNPAID', 'PENDING_VERIFICATION', 'PAID', 'COD_COLLECTIBLE', 'FAILED'] as const;
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUSES)[number];

export const ORDER_STATUSES = [
  'NEW',
  'AWAITING_CONFIRMATION',
  'CONFIRMED',
  'READY_TO_SHIP',
  'SHIPPED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const WEBHOOK_STATUSES = ['DELIVERED', 'FAILED', 'RETRYING'] as const;
export type WebhookStatus = (typeof WEBHOOK_STATUSES)[number];

// 1. Merchants Table
export const merchants = sqliteTable('merchants', {
  id: text('id').primaryKey(), // mer_live_xxxx
  storeName: text('store_name').notNull(),
  webhookUrl: text('webhook_url').notNull(), // Third-party endpoint (e.g. https://aurelia.shop/payment/v1)
  webhookSecret: text('webhook_secret').notNull(), // Used for HMAC-SHA256 signature
  deviceApiKeyHash: text('device_api_key_hash').notNull(), // SHA-256 of the mobile device key
  gracePeriodMinutes: integer('grace_period_minutes').notNull().default(60),
  fcmToken: text('fcm_token'),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
});

// 2. Merchant Wallets (Multi-SIM Pooling & Limit Rotation)
export const merchantWallets = sqliteTable('merchant_wallets', {
  id: text('id').primaryKey(),
  merchantId: text('merchant_id').notNull().references(() => merchants.id),
  provider: text('provider', { enum: ['BKASH', 'NAGAD', 'ROCKET', 'UPAY', 'CELLFIN'] }).notNull(),
  accountType: text('account_type', { enum: ['PERSONAL', 'PRA', 'MERCHANT'] }).default('PERSONAL').notNull(),
  walletNumber: text('wallet_number').notNull(),
  monthlyVolumeLimit: real('monthly_volume_limit').default(300000).notNull(),
  currentMonthVolume: real('current_month_volume').default(0).notNull(),
  isPrimary: integer('is_primary', { mode: 'boolean' }).default(false).notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
  priorityOrder: integer('priority_order').default(0).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => ({
  walletLookupIdx: index('idx_wallets_lookup').on(table.merchantId, table.provider, table.isActive),
}));

// 3. SMS Ledger Table
export const smsLedger = sqliteTable('sms_ledger', {
  id: text('id').primaryKey(),
  merchantId: text('merchant_id').notNull().references(() => merchants.id),
  provider: text('provider', { enum: ['BKASH', 'NAGAD', 'ROCKET', 'UPAY', 'CELLFIN'] }).notNull(),
  trxId: text('trx_id').notNull(), // Normalized uppercase
  amount: real('amount').notNull(),
  senderNumber: text('sender_number').notNull(), // Normalized digits
  rawSms: text('raw_sms').notNull(),
  status: text('status', { enum: ['UNCLAIMED', 'VERIFIED', 'MANUAL_VERIFIED'] }).default('UNCLAIMED').notNull(),
  matchType: text('match_type', {
    enum: ['EXACT_UNIQUE', 'BASE_AMOUNT_FALLBACK', 'OVERPAID', 'MANUAL_VERIFIED'],
  }),
  externalOrderId: text('external_order_id'),
  smsReceivedAt: integer('sms_received_at', { mode: 'timestamp' }).notNull(),
  verifiedAt: integer('verified_at', { mode: 'timestamp' }),
  smsSender: text('sms_sender'),
  source: text('source', { enum: ['SMS', 'NOTIFICATION', 'INBOX_SCAN'] }).default('SMS').notNull(),
  trustFlag: text('trust_flag'),
}, (table) => ({
  uniqueMerchantTrx: uniqueIndex('unique_merchant_trx').on(table.merchantId, table.trxId),
  statusLookupIdx: index('idx_ledger_status').on(table.merchantId, table.status),
}));

// 4. Verification Queue Table
export const verificationQueue = sqliteTable('verification_queue', {
  id: text('id').primaryKey(),
  merchantId: text('merchant_id').notNull().references(() => merchants.id),
  provider: text('provider', { enum: ['BKASH', 'NAGAD', 'ROCKET', 'UPAY', 'CELLFIN'] }).notNull(),
  externalOrderId: text('external_order_id').notNull(),
  customerEmail: text('customer_email').notNull(),
  expectedAmount: real('expected_amount').notNull(),
  baseAmount: real('base_amount'),
  uniqueAmount: real('unique_amount'),
  submittedAmount: real('submitted_amount'),
  submittedTrxId: text('submitted_trx_id').notNull(), // Normalized uppercase
  submittedSender: text('submitted_sender').notNull(), // Normalized digits
  status: text('status', { enum: ['WAITING_FOR_SMS', 'MATCHED', 'EXPIRED'] }).default('WAITING_FOR_SMS').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => ({
  queueLookupIdx: index('idx_queue_lookup').on(table.merchantId, table.submittedTrxId, table.status),
}));

// 5. Webhook Deliveries Table (Retry Engine)
export const webhookDeliveries = sqliteTable('webhook_deliveries', {
  id: text('id').primaryKey(),
  merchantId: text('merchant_id').notNull().references(() => merchants.id),
  eventType: text('event_type').default('payment.verified').notNull(),
  externalOrderId: text('external_order_id').notNull(),
  payloadJson: text('payload_json').notNull(),
  signature: text('signature').notNull(),
  attemptCount: integer('attempt_count').default(1).notNull(),
  status: text('status', { enum: ['DELIVERED', 'FAILED', 'RETRYING'] }).default('RETRYING').notNull(),
  nextRetryAt: integer('next_retry_at', { mode: 'timestamp' }),
  deliveredAt: integer('delivered_at', { mode: 'timestamp' }),
  lastAttemptAt: integer('last_attempt_at', { mode: 'timestamp' }),
  responseStatus: integer('response_status'),
  responseBody: text('response_body'),
});

export type MerchantRecord = typeof merchants.$inferSelect;
export type NewMerchant = typeof merchants.$inferInsert;

export type MerchantWalletRecord = typeof merchantWallets.$inferSelect;
export type NewMerchantWallet = typeof merchantWallets.$inferInsert;

export type SmsLedgerRecord = typeof smsLedger.$inferSelect;
export type NewSmsLedger = typeof smsLedger.$inferInsert;

export type VerificationQueueRecord = typeof verificationQueue.$inferSelect;
export type NewVerificationQueue = typeof verificationQueue.$inferInsert;

export type WebhookDeliveryRecord = typeof webhookDeliveries.$inferSelect;
export type NewWebhookDelivery = typeof webhookDeliveries.$inferInsert;

// 6. Media Assets Registry (Unified Image Router Metadata + D1 Blob Fallback)
export const mediaAssets = sqliteTable('media_assets', {
  id: text('id').primaryKey(), // img_xxxx
  merchantId: text('merchant_id'),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  sha256: text('sha256').notNull(),
  primaryProvider: text('primary_provider').notNull(), // r2 | imgbb | supabase | mongodb | d1
  storageKey: text('storage_key').notNull(),
  publicUrl: text('public_url'),
  fallbackLocationsJson: text('fallback_locations_json'),
  dataBase64: text('data_base64'), // Populated when stored in D1 fallback
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => ({
  mediaMerchantIdx: index('idx_media_merchant').on(table.merchantId, table.createdAt),
}));

// 7. Router Key-Value Store (D1 Fallback when Cloudflare KV is not bound)
export const routerKvStore = sqliteTable('router_kv_store', {
  key: text('key').primaryKey(),
  valueJson: text('value_json').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
});

// 8. Router Provider Audit Logs (Tracks automatic fallbacks across email/sms/image/database)
export const routerProviderLogs = sqliteTable('router_provider_logs', {
  id: text('id').primaryKey(),
  channel: text('channel').notNull(), // email | sms | image | database
  selectedProvider: text('selected_provider'),
  status: text('status').notNull(), // SUCCESS | FALLBACK_SUCCESS | FAILED
  fallbackTriggered: integer('fallback_triggered', { mode: 'boolean' }).default(false).notNull(),
  attemptsJson: text('attempts_json').notNull(),
  latencyMs: integer('latency_ms').notNull(),
  callerId: text('caller_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => ({
  routerLogChannelIdx: index('idx_router_logs_channel').on(table.channel, table.createdAt),
}));

export type MediaAssetRecord = typeof mediaAssets.$inferSelect;
export type NewMediaAsset = typeof mediaAssets.$inferInsert;

export type RouterKvRecord = typeof routerKvStore.$inferSelect;
export type RouterProviderLogRecord = typeof routerProviderLogs.$inferSelect;

// 9. Checkout Sessions (Positive 2-Decimal Poisha Unique Amount Allocation)
export const checkoutSessions = sqliteTable('checkout_sessions', {
  id: text('id').primaryKey(), // chk_xxxx
  merchantId: text('merchant_id').notNull().references(() => merchants.id),
  externalOrderId: text('external_order_id').notNull(),
  customerEmail: text('customer_email').notNull(),
  baseAmount: real('base_amount').notNull(),
  uniqueAmount: real('unique_amount').notNull(),
  offsetCents: integer('offset_cents').notNull(),
  provider: text('provider', { enum: ['BKASH', 'NAGAD', 'ROCKET', 'UPAY', 'CELLFIN'] }),
  status: text('status', { enum: ['OPEN', 'SUBMITTED', 'VERIFIED', 'EXPIRED'] }).default('OPEN').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => ({
  checkoutActiveIdx: index('idx_checkout_active').on(table.merchantId, table.baseAmount, table.status, table.expiresAt),
  checkoutOrderIdx: index('idx_checkout_order').on(table.merchantId, table.externalOrderId),
}));

// 10. Merchant Users (Admin-Provisioned Client Accounts)
export const merchantUsers = sqliteTable('merchant_users', {
  id: text('id').primaryKey(), // usr_xxxx
  merchantId: text('merchant_id').notNull().references(() => merchants.id),
  email: text('email').notNull(),
  fullName: text('full_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['MERCHANT_OWNER', 'MERCHANT_STAFF'] }).default('MERCHANT_OWNER').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => ({
  uniqueUserEmail: uniqueIndex('unique_merchant_user_email').on(table.email),
  userMerchantIdx: index('idx_merchant_users_merchant').on(table.merchantId),
}));

// 11. Auth Sessions (JWT Session ID Tracking & Revocation)
export const authSessions = sqliteTable('auth_sessions', {
  id: text('id').primaryKey(), // ses_xxxx
  userId: text('user_id').notNull().references(() => merchantUsers.id),
  merchantId: text('merchant_id').notNull().references(() => merchants.id),
  deviceType: text('device_type', { enum: ['WEB', 'ANDROID'] }).notNull(),
  deviceName: text('device_name'),
  ipAddress: text('ip_address'),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => ({
  sessionUserIdx: index('idx_auth_sessions_user').on(table.userId),
  sessionMerchantIdx: index('idx_auth_sessions_merchant').on(table.merchantId, table.revokedAt),
}));

// 12. Merchant Devices (Per-Login Android Companion Keys & FCM Tokens)
export const merchantDevices = sqliteTable('merchant_devices', {
  id: text('id').primaryKey(), // dev_xxxx
  merchantId: text('merchant_id').notNull().references(() => merchants.id),
  userId: text('user_id').references(() => merchantUsers.id),
  deviceName: text('device_name').notNull(),
  deviceKeyHash: text('device_key_hash').notNull(),
  fcmToken: text('fcm_token'),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }),
  isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => ({
  deviceKeyHashIdx: index('idx_merchant_devices_key').on(table.deviceKeyHash),
  deviceMerchantIdx: index('idx_merchant_devices_merchant').on(table.merchantId, table.isActive),
}));

// 13. Merchant Orders (Bi-Directional E-Commerce Order Sync Engine)
export const merchantOrders = sqliteTable('merchant_orders', {
  id: text('id').primaryKey(), // ord_xxxx
  merchantId: text('merchant_id').notNull().references(() => merchants.id),
  externalOrderId: text('external_order_id').notNull(),
  customerName: text('customer_name'),
  customerPhone: text('customer_phone'),
  customerEmail: text('customer_email'),
  shippingAddress: text('shipping_address'),
  itemsSummary: text('items_summary'),
  paymentMethod: text('payment_method', {
    enum: ['ORBIT_MFS', 'COD', 'CARD', 'BANK_TRANSFER', 'OTHER'],
  }).default('ORBIT_MFS').notNull(),
  paymentStatus: text('payment_status', {
    enum: ['UNPAID', 'PENDING_VERIFICATION', 'PAID', 'COD_COLLECTIBLE', 'FAILED'],
  }).default('UNPAID').notNull(),
  orderStatus: text('order_status', {
    enum: ['NEW', 'AWAITING_CONFIRMATION', 'CONFIRMED', 'READY_TO_SHIP', 'SHIPPED', 'CANCELLED'],
  }).default('NEW').notNull(),
  baseAmount: real('base_amount').notNull(),
  uniqueAmount: real('unique_amount'),
  paidAmount: real('paid_amount'),
  trxId: text('trx_id'),
  matchType: text('match_type'),
  storeCallbackUrl: text('store_callback_url'),
  metadataJson: text('metadata_json'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => ({
  uniqueMerchantOrder: uniqueIndex('unique_merchant_order').on(table.merchantId, table.externalOrderId),
  orderStatusIdx: index('idx_merchant_orders_status').on(table.merchantId, table.orderStatus, table.createdAt),
}));

export type CheckoutSessionRecord = typeof checkoutSessions.$inferSelect;
export type NewCheckoutSession = typeof checkoutSessions.$inferInsert;

export type MerchantUserRecord = typeof merchantUsers.$inferSelect;
export type NewMerchantUser = typeof merchantUsers.$inferInsert;

export type AuthSessionRecord = typeof authSessions.$inferSelect;
export type NewAuthSession = typeof authSessions.$inferInsert;

export type MerchantDeviceRecord = typeof merchantDevices.$inferSelect;
export type NewMerchantDevice = typeof merchantDevices.$inferInsert;

export type MerchantOrderRecord = typeof merchantOrders.$inferSelect;
export type NewMerchantOrder = typeof merchantOrders.$inferInsert;

// 14. OTP Verification Codes
export const otpCodes = sqliteTable('otp_codes', {
  id: text('id').primaryKey(),
  merchantId: text('merchant_id').references(() => merchants.id),
  purpose: text('purpose').notNull(),
  phone: text('phone').notNull(),
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  provider: text('provider'),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  consumedAt: integer('consumed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  phoneIdx: index('idx_otp_phone').on(t.phone, t.purpose, t.createdAt),
}));

export type OtpCodeRecord = typeof otpCodes.$inferSelect;
export type NewOtpCode = typeof otpCodes.$inferInsert;
