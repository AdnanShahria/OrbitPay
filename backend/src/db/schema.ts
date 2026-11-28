import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real, uniqueIndex, index, primaryKey } from 'drizzle-orm/sqlite-core';

export const MFS_PROVIDERS = ['BKASH', 'NAGAD', 'ROCKET', 'UPAY', 'CELLFIN'] as const;
export type MfsProvider = (typeof MFS_PROVIDERS)[number];

export const ACCOUNT_TYPES = ['PERSONAL', 'PRA', 'MERCHANT'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const LEDGER_STATUSES = ['UNCLAIMED', 'VERIFIED', 'MANUAL_VERIFIED', 'PENDING_LATE_SMS'] as const;
export type LedgerStatus = (typeof LEDGER_STATUSES)[number];

export const SMS_SOURCES = ['SMS', 'NOTIFICATION', 'INBOX_SCAN'] as const;
export type SmsSource = (typeof SMS_SOURCES)[number];

export const MATCH_TYPES = ['EXACT_UNIQUE', 'BASE_AMOUNT_FALLBACK', 'OVERPAID', 'MANUAL_VERIFIED'] as const;
export type MatchType = (typeof MATCH_TYPES)[number];

export const QUEUE_STATUSES = [
  'WAITING_FOR_SMS',
  'MATCHED',
  'EXPIRED',
  'MANUAL_REVIEW_REQUIRED',
  'MANUALLY_APPROVED',
  'MANUALLY_REJECTED',
] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

export const CHECKOUT_SESSION_STATUSES = [
  'OPEN',
  'SUBMITTED',
  'VERIFIED',
  'EXPIRED',
  'ESCALATED',
  'REJECTED',
] as const;
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

export const VERIFICATION_MODES = ['AUTO', 'PURE_MANUAL'] as const;
export type VerificationMode = (typeof VERIFICATION_MODES)[number];

export const ACCOUNT_MODES = ['STANDALONE', 'WEBHOOK_CONNECTED'] as const;
export type AccountMode = (typeof ACCOUNT_MODES)[number];

export const WALLET_SOURCES = ['PERSONAL', 'STOREFRONT_SYNC'] as const;
export type WalletSource = (typeof WALLET_SOURCES)[number];

export const WALLET_SELECTION_MODES = ['COMMON', 'SPECIFIC'] as const;
export type WalletSelectionMode = (typeof WALLET_SELECTION_MODES)[number];

export const VERTICAL_PROFILES = [
  'ecommerce',
  'saas_subscription',
  'lms_course',
  'booking_appointment',
  'invoice_b2b',
  'donation',
  'digital_topup',
  'custom',
] as const;
export type VerticalProfile = (typeof VERTICAL_PROFILES)[number];

export const PAYMENT_INTENT_STATUSES = [
  'OPEN',
  'WAITING_FOR_SMS',
  'MANUAL_REVIEW_REQUIRED',
  'VERIFIED',
  'REJECTED',
  'EXPIRED',
  'REFUNDED',
] as const;
export type PaymentIntentStatus = (typeof PAYMENT_INTENT_STATUSES)[number];

export const ESCALATION_REASONS = [
  'GRACE_PERIOD_EXCEEDED',
  'PURE_MANUAL_MODE',
  'TRUST_FLAG_ANOMALY',
  'UNDERPAID_AMOUNT',
  'OVERPAID_AMOUNT_MISMATCH',
  'SENDER_MISMATCH',
  'STALE_SMS_TIMESTAMP',
  'DEVICE_OFFLINE_IMMEDIATE',
] as const;
export type EscalationReason = (typeof ESCALATION_REASONS)[number];

export const RESOLUTION_SOURCES = [
  'AUTO_SMS',
  'LATE_SMS_AUTO',
  'CLIENT_ADMIN',
  'ORBIT_DASHBOARD',
  'ORBIT_ANDROID',
] as const;
export type ResolutionSource = (typeof RESOLUTION_SOURCES)[number];

export const RECEIPT_POLICIES = [
  'OFFLINE_OPTIONAL',
  'ALWAYS_OPTIONAL',
  'ALWAYS_REQUIRED',
  'DISABLED',
] as const;
export type ReceiptPolicy = (typeof RECEIPT_POLICIES)[number];

// 1. Merchants Table
export const merchants = sqliteTable('merchants', {
  id: text('id').primaryKey(), // mer_live_xxxx
  storeName: text('store_name').notNull(),
  slug: text('slug'), // URL-friendly merchant handle (e.g. aurelia-lifestyle-bd)
  webhookUrl: text('webhook_url').notNull(), // Third-party endpoint (e.g. https://aurelia.shop/payment/v1)
  webhookSecret: text('webhook_secret').notNull(), // Used for HMAC-SHA256 signature
  deviceApiKeyHash: text('device_api_key_hash').notNull(), // SHA-256 of the mobile device key
  gracePeriodMinutes: integer('grace_period_minutes').notNull().default(60),
  fcmToken: text('fcm_token'),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  accountMode: text('account_mode', { enum: ACCOUNT_MODES }).notNull().default('WEBHOOK_CONNECTED'),
  ignoreStorefrontSync: integer('ignore_storefront_sync', { mode: 'boolean' }).notNull().default(false),
  verificationMode: text('verification_mode', { enum: VERIFICATION_MODES }).notNull().default('AUTO'),
  allowBaseAmountFallback: integer('allow_base_amount_fallback', { mode: 'boolean' }).notNull().default(true),
  receiptPolicy: text('receipt_policy', { enum: RECEIPT_POLICIES }).notNull().default('OFFLINE_OPTIONAL'),
  lateSmsAutoApprove: integer('late_sms_auto_approve', { mode: 'boolean' }).notNull().default(false),
  enabledModulesJson: text('enabled_modules_json')
    .notNull()
    .default('{"ecommerce_fulfillment":true,"phone_otp":false,"telegram_alerts":false}'),
  allowedCallbackOriginsJson: text('allowed_callback_origins_json').notNull().default('[]'),
  apiKeyHash: text('api_key_hash'),
  apiKeyPrefix: text('api_key_prefix'),
  publishableKey: text('publishable_key'),
  telegramBotToken: text('telegram_bot_token'),
  telegramChatId: text('telegram_chat_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => ({
  apiKeyHashIdx: index('idx_merchants_api_key_hash').on(table.apiKeyHash),
  uniqueSlug: uniqueIndex('uq_merchants_slug').on(table.slug),
}));

// 2. Merchant Wallets (Multi-SIM Pooling & Intelligent 250k Safe / 300k Hard Limit Rotation)
export const merchantWallets = sqliteTable('merchant_wallets', {
  id: text('id').primaryKey(),
  merchantId: text('merchant_id').notNull().references(() => merchants.id),
  provider: text('provider', { enum: ['BKASH', 'NAGAD', 'ROCKET', 'UPAY', 'CELLFIN'] }).notNull(),
  accountType: text('account_type', { enum: ['PERSONAL', 'PRA', 'MERCHANT'] }).default('PERSONAL').notNull(),
  walletNumber: text('wallet_number').notNull(),
  label: text('label'),
  deviceId: text('device_id'),
  simSlotIndex: integer('sim_slot_index'),
  safeVolumeLimit: real('safe_volume_limit').default(250000).notNull(),
  monthlyVolumeLimit: real('monthly_volume_limit').default(300000).notNull(),
  currentMonthVolume: real('current_month_volume').default(0).notNull(),
  isPrimary: integer('is_primary', { mode: 'boolean' }).default(false).notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
  source: text('source', { enum: WALLET_SOURCES }).notNull().default('PERSONAL'),
  priorityOrder: integer('priority_order').default(0).notNull(),
  lastRotatedAt: integer('last_rotated_at', { mode: 'timestamp' }),
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
  status: text('status', { enum: LEDGER_STATUSES }).default('UNCLAIMED').notNull(),
  matchType: text('match_type', {
    enum: ['EXACT_UNIQUE', 'BASE_AMOUNT_FALLBACK', 'OVERPAID', 'MANUAL_VERIFIED'],
  }),
  externalOrderId: text('external_order_id'),
  paymentIntentId: text('payment_intent_id'),
  deviceId: text('device_id'),
  simSlotIndex: integer('sim_slot_index'),
  receiverNumber: text('receiver_number'),
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
  projectId: text('project_id'),
  paymentIntentId: text('payment_intent_id'),
  provider: text('provider', { enum: ['BKASH', 'NAGAD', 'ROCKET', 'UPAY', 'CELLFIN'] }).notNull(),
  externalOrderId: text('external_order_id').notNull(),
  customerEmail: text('customer_email').notNull(),
  expectedAmount: real('expected_amount').notNull(),
  baseAmount: real('base_amount'),
  uniqueAmount: real('unique_amount'),
  submittedAmount: real('submitted_amount'),
  submittedTrxId: text('submitted_trx_id').notNull(), // Normalized uppercase
  submittedSender: text('submitted_sender').notNull(), // Normalized digits
  receiptAssetId: text('receipt_asset_id'),
  receiptUrl: text('receipt_url'),
  escalationReason: text('escalation_reason', { enum: ESCALATION_REASONS }),
  escalatedAt: integer('escalated_at', { mode: 'timestamp' }),
  resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
  status: text('status', { enum: QUEUE_STATUSES }).default('WAITING_FOR_SMS').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => ({
  queueLookupIdx: index('idx_queue_lookup').on(table.merchantId, table.submittedTrxId, table.status),
  queueIntentIdx: index('idx_queue_intent').on(table.paymentIntentId),
}));

// 5. Webhook Deliveries Table (Retry Engine)
export const webhookDeliveries = sqliteTable('webhook_deliveries', {
  id: text('id').primaryKey(),
  merchantId: text('merchant_id').notNull().references(() => merchants.id),
  projectId: text('project_id'),
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
  projectId: text('project_id'),
  paymentIntentId: text('payment_intent_id'),
  vertical: text('vertical', { enum: VERTICAL_PROFILES }).default('ecommerce').notNull(),
  externalOrderId: text('external_order_id').notNull(),
  customerEmail: text('customer_email').notNull(),
  baseAmount: real('base_amount').notNull(),
  uniqueAmount: real('unique_amount').notNull(),
  offsetCents: integer('offset_cents').notNull(),
  provider: text('provider', { enum: ['BKASH', 'NAGAD', 'ROCKET', 'UPAY', 'CELLFIN'] }),
  status: text('status', { enum: CHECKOUT_SESSION_STATUSES }).default('OPEN').notNull(),
  displayJson: text('display_json'),
  actionsJson: text('actions_json'),
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

// 12. Merchant Devices (Multi-Device Android Companion Keys, SIM Slots & Telemetry)
export const merchantDevices = sqliteTable('merchant_devices', {
  id: text('id').primaryKey(), // dev_xxxx
  merchantId: text('merchant_id').notNull().references(() => merchants.id),
  userId: text('user_id').references(() => merchantUsers.id),
  deviceName: text('device_name').notNull(),
  deviceKeyHash: text('device_key_hash').notNull(),
  fcmToken: text('fcm_token'),
  simSlotsJson: text('sim_slots_json'),
  batteryLevel: integer('battery_level'),
  networkType: text('network_type'),
  appVersion: text('app_version'),
  smsPermission: integer('sms_permission', { mode: 'boolean' }),
  listenerEnabled: integer('listener_enabled', { mode: 'boolean' }),
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
  projectId: text('project_id'),
  paymentIntentId: text('payment_intent_id'),
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

// 15. App Releases (Self-Hosted Android APK Distribution & Auto-Update Manifest)
export const appReleases = sqliteTable('app_releases', {
  id: text('id').primaryKey(), // rel_xxxx
  platform: text('platform').default('ANDROID').notNull(),
  versionCode: integer('version_code').notNull(),
  versionName: text('version_name').notNull(),
  minSupportedVersionCode: integer('min_supported_version_code').default(1).notNull(),
  mandatory: integer('mandatory', { mode: 'boolean' }).default(false).notNull(),
  releaseNotes: text('release_notes').default('').notNull(),
  fileName: text('file_name').notNull(),
  r2Key: text('r2_key').notNull(),
  sha256: text('sha256').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => ({
  uniquePlatformVersion: uniqueIndex('unique_app_release_version').on(table.platform, table.versionCode),
  latestLookupIdx: index('idx_app_releases_latest').on(table.platform, table.isActive, table.versionCode),
}));

export type AppReleaseRecord = typeof appReleases.$inferSelect;
export type NewAppRelease = typeof appReleases.$inferInsert;

// 16. Universal Payment Intents (Multi-Vertical Payment Ledger)
export const paymentIntents = sqliteTable('payment_intents', {
  id: text('id').primaryKey(), // pay_xxxx
  merchantId: text('merchant_id').notNull().references(() => merchants.id),
  projectId: text('project_id'),
  vertical: text('vertical', { enum: VERTICAL_PROFILES }).notNull().default('ecommerce'),
  externalRefId: text('external_ref_id').notNull(),
  verificationMode: text('verification_mode', { enum: VERIFICATION_MODES }).notNull().default('AUTO'),
  status: text('status', { enum: PAYMENT_INTENT_STATUSES }).notNull().default('OPEN'),
  baseAmount: real('base_amount').notNull(),
  uniqueAmount: real('unique_amount').notNull(),
  paidAmount: real('paid_amount'),
  provider: text('provider', { enum: MFS_PROVIDERS }),
  trxId: text('trx_id'),
  senderNumber: text('sender_number'),
  receiptAssetId: text('receipt_asset_id'),
  receiptUrl: text('receipt_url'),
  matchType: text('match_type', { enum: MATCH_TYPES }),
  trustFlag: text('trust_flag'),
  deviceOnlineAtSubmit: integer('device_online_at_submit', { mode: 'boolean' }),
  smsLedgerId: text('sms_ledger_id'),
  smsReconciliationState: text('sms_reconciliation_state'),
  escalationReason: text('escalation_reason', { enum: ESCALATION_REASONS }),
  resolutionSource: text('resolution_source', { enum: RESOLUTION_SOURCES }),
  resolvedByJson: text('resolved_by_json'),
  rejectionReason: text('rejection_reason'),
  callbackUrl: text('callback_url'),
  returnUrl: text('return_url'),
  cancelUrl: text('cancel_url'),
  customerJson: text('customer_json'),
  displayJson: text('display_json'),
  actionsJson: text('actions_json'),
  metadataJson: text('metadata_json'),
  stateVersion: integer('state_version').notNull().default(1),
  submitAttempts: integer('submit_attempts').notNull().default(0),
  graceExpiresAt: integer('grace_expires_at', { mode: 'timestamp' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  verifiedAt: integer('verified_at', { mode: 'timestamp' }),
  resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => ({
  uniqueMerchantExternalRef: uniqueIndex('uq_payment_intent_merchant_ref').on(table.merchantId, table.externalRefId),
  statusIdx: index('idx_payment_intents_status').on(table.merchantId, table.status, table.createdAt),
  trxIdx: index('idx_payment_intents_trx').on(table.merchantId, table.trxId),
  graceIdx: index('idx_payment_intents_grace').on(table.status, table.graceExpiresAt),
}));

export type PaymentIntentRecord = typeof paymentIntents.$inferSelect;
export type NewPaymentIntent = typeof paymentIntents.$inferInsert;

// 17. Payment Links (Zero-Code Hosted Checkout Links)
export const paymentLinks = sqliteTable('payment_links', {
  id: text('id').primaryKey(), // lnk_xxxx
  merchantId: text('merchant_id').notNull().references(() => merchants.id),
  projectId: text('project_id'),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  vertical: text('vertical', { enum: VERTICAL_PROFILES }).notNull().default('custom'),
  amountType: text('amount_type', { enum: ['FIXED', 'OPEN'] }).notNull().default('FIXED'),
  fixedAmount: real('fixed_amount'),
  minAmount: real('min_amount'),
  maxAmount: real('max_amount'),
  currency: text('currency').notNull().default('BDT'),
  verificationMode: text('verification_mode', { enum: VERIFICATION_MODES }),
  displayJson: text('display_json'),
  actionsJson: text('actions_json'),
  metadataJson: text('metadata_json'),
  returnUrl: text('return_url'),
  cancelUrl: text('cancel_url'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  maxUses: integer('max_uses'),
  usedCount: integer('used_count').notNull().default(0),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => ({
  uniqueMerchantSlug: uniqueIndex('uq_payment_links_merchant_slug').on(table.merchantId, table.slug),
  merchantIdx: index('idx_payment_links_merchant').on(table.merchantId, table.isActive),
}));

export type PaymentLinkRecord = typeof paymentLinks.$inferSelect;
export type NewPaymentLink = typeof paymentLinks.$inferInsert;

// 18. Consumed TrxIDs (Global Cross-Mode Single-Use TrxID Tombstone)
export const consumedTrxIds = sqliteTable('consumed_trx_ids', {
  merchantId: text('merchant_id').notNull().references(() => merchants.id),
  trxId: text('trx_id').notNull(),
  provider: text('provider', { enum: MFS_PROVIDERS }).notNull(),
  paymentIntentId: text('payment_intent_id'),
  externalRefId: text('external_ref_id'),
  resolutionSource: text('resolution_source', { enum: RESOLUTION_SOURCES }).notNull(),
  consumedAt: integer('consumed_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.merchantId, table.trxId] }),
}));

export type ConsumedTrxIdRecord = typeof consumedTrxIds.$inferSelect;
export type NewConsumedTrxId = typeof consumedTrxIds.$inferInsert;

// 19. Master Admin Users, Sessions & Audit Logs
export const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN_OPERATOR'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_AUTH_METHODS = ['PASSWORD', 'MASTER_KEY'] as const;
export type AdminAuthMethod = (typeof ADMIN_AUTH_METHODS)[number];

export const adminUsers = sqliteTable('admin_users', {
  id: text('id').primaryKey(), // adm_xxxx
  email: text('email').notNull(),
  fullName: text('full_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ADMIN_ROLES }).default('ADMIN_OPERATOR').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => ({
  uniqueAdminEmail: uniqueIndex('unique_admin_user_email').on(table.email),
}));

export const adminSessions = sqliteTable('admin_sessions', {
  id: text('id').primaryKey(), // ases_xxxx
  adminUserId: text('admin_user_id'),
  adminEmail: text('admin_email'),
  authMethod: text('auth_method', { enum: ADMIN_AUTH_METHODS }).notNull(),
  role: text('role', { enum: ADMIN_ROLES }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => ({
  activeIdx: index('idx_admin_sessions_active').on(table.revokedAt, table.expiresAt),
  userIdx: index('idx_admin_sessions_user').on(table.adminUserId),
}));

export const adminAuditLogs = sqliteTable('admin_audit_logs', {
  id: text('id').primaryKey(), // aud_xxxx
  adminUserId: text('admin_user_id'),
  adminEmail: text('admin_email'),
  sessionId: text('session_id'),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  metadataJson: text('metadata_json'),
  ipAddress: text('ip_address'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => ({
  createdIdx: index('idx_admin_audit_created').on(table.createdAt),
  actionIdx: index('idx_admin_audit_action').on(table.action),
}));

export type AdminUserRecord = typeof adminUsers.$inferSelect;
export type NewAdminUser = typeof adminUsers.$inferInsert;

export type AdminSessionRecord = typeof adminSessions.$inferSelect;
export type NewAdminSession = typeof adminSessions.$inferInsert;

export type AdminAuditLogRecord = typeof adminAuditLogs.$inferSelect;
export type NewAdminAuditLog = typeof adminAuditLogs.$inferInsert;

// 20. Platform-Wide Public & Admin-Managed Settings (WhatsApp Support, Marketing CTA)
export const platformSettings = sqliteTable('platform_settings', {
  key: text('key').primaryKey(),
  valueJson: text('value_json').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
});

export type PlatformSettingRecord = typeof platformSettings.$inferSelect;

// 21. Merchant Sub-Projects (Admin-Provisioned Projects under 1 Merchant ID)
export const merchantProjects = sqliteTable('merchant_projects', {
  id: text('id').primaryKey(), // prj_xxxx
  merchantId: text('merchant_id').notNull().references(() => merchants.id),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  accountMode: text('account_mode', { enum: ACCOUNT_MODES }).notNull().default('WEBHOOK_CONNECTED'),
  verificationMode: text('verification_mode', { enum: VERIFICATION_MODES }).notNull().default('AUTO'),
  walletSelectionMode: text('wallet_selection_mode', { enum: WALLET_SELECTION_MODES })
    .notNull()
    .default('COMMON'),
  ignoreStorefrontSync: integer('ignore_storefront_sync', { mode: 'boolean' }).notNull().default(false),
  webhookUrl: text('webhook_url').notNull().default(''),
  webhookSecret: text('webhook_secret').notNull(),
  apiKeyHash: text('api_key_hash'),
  apiKeyPrefix: text('api_key_prefix'),
  publishableKey: text('publishable_key'),
  allowedCallbackOriginsJson: text('allowed_callback_origins_json').notNull().default('[]'),
  telegramBotToken: text('telegram_bot_token'),
  telegramChatId: text('telegram_chat_id'),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => ({
  merchantIdx: index('idx_merchant_projects_merchant').on(table.merchantId, table.isActive),
  uniqueSlug: uniqueIndex('uq_merchant_projects_slug').on(table.merchantId, table.slug),
  apiKeyIdx: index('idx_merchant_projects_api_key').on(table.apiKeyHash),
}));

// 22. Sub-Project Wallet Assignments (Specific SIM numbers bound to a sub-project)
export const merchantProjectWallets = sqliteTable('merchant_project_wallets', {
  projectId: text('project_id').notNull().references(() => merchantProjects.id),
  walletId: text('wallet_id').notNull().references(() => merchantWallets.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.projectId, table.walletId] }),
}));

export type MerchantProjectRecord = typeof merchantProjects.$inferSelect;
export type NewMerchantProject = typeof merchantProjects.$inferInsert;
export type MerchantProjectWalletRecord = typeof merchantProjectWallets.$inferSelect;
