package com.orbitsaas.payment.data.remote

import kotlinx.serialization.Serializable

@Serializable
data class ApiEnvelope<T>(
    val success: Boolean = false,
    val data: T? = null,
    val error: String? = null,
    val message: String? = null
)

@Serializable
data class IngestSmsItem(
    val provider: String,
    val trxId: String,
    val amount: Double,
    val senderNumber: String,
    val rawSms: String,
    val receivedAt: Long,
    val smsSender: String? = null,
    val source: String = "SMS",
    val simSlotIndex: Int? = null,
    val receiverNumber: String? = null
)

@Serializable
data class IngestSmsBatchRequest(
    val merchantId: String,
    val deviceKey: String,
    val messages: List<IngestSmsItem>
)

@Serializable
data class IngestData(
    val ingestedCount: Int = 0,
    val autoVerifiedCount: Int = 0,
    val flaggedCount: Int = 0
)

@Serializable
data class IngestResponse(
    val success: Boolean = true,
    val ingestedCount: Int = 0,
    val autoVerifiedCount: Int = 0,
    val flaggedCount: Int = 0,
    val message: String = ""
)

@Serializable
data class RecentTransactionDto(
    val id: String = "",
    val trxId: String = "",
    val amount: Double = 0.0,
    val provider: String = "",
    val status: String = "",
    val externalOrderId: String? = null,
    val timestamp: Long = 0L,
    val smsReceivedAt: String? = null
)

@Serializable
data class ConnectedDeviceDto(
    val id: String = "",
    val deviceName: String = "",
    val isOnline: Boolean = false,
    val isActive: Boolean = true,
    val lastSeenAt: String? = null,
    val batteryLevel: Int? = null,
    val networkType: String? = null,
    val appVersion: String? = null,
    val smsPermission: Boolean? = null,
    val listenerEnabled: Boolean? = null,
    val simSlots: List<PreflightSimSlotDto> = emptyList()
)

@Serializable
data class WalletRotationDto(
    val id: String = "",
    val provider: String = "",
    val accountType: String = "PERSONAL",
    val walletNumber: String = "",
    val label: String? = null,
    val deviceId: String? = null,
    val deviceName: String? = null,
    val simSlotIndex: Int? = null,
    val safeVolumeLimit: Double = 250000.0,
    val monthlyVolumeLimit: Double = 300000.0,
    val currentMonthVolume: Double = 0.0,
    val utilizationPct: Int = 0,
    val safeUtilizationPct: Int = 0,
    val rotationState: String = "HEALTHY_STANDBY",
    val deviceOnline: Boolean? = null,
    val isPrimary: Boolean = false,
    val isActive: Boolean = true,
    val isPlaceholder: Boolean = false
)

@Serializable
data class DeviceStatsResponse(
    val merchantId: String = "",
    val storeName: String = "",
    val isOnline: Boolean = false,
    val lastSeenAt: String? = null,
    val onlineDeviceCount: Int = 0,
    val totalDeviceCount: Int = 0,
    val totalVerifiedVolume: Double = 0.0,
    val verifiedCount: Int = 0,
    val unclaimedCount: Int = 0,
    val pendingQueueCount: Int = 0,
    val recentTransactions: List<RecentTransactionDto> = emptyList(),
    val devices: List<ConnectedDeviceDto> = emptyList(),
    val wallets: List<WalletRotationDto> = emptyList()
)

@Serializable
data class LedgerDto(
    val id: String = "",
    val merchantId: String = "",
    val provider: String = "",
    val trxId: String = "",
    val amount: Double = 0.0,
    val senderNumber: String = "",
    val rawSms: String = "",
    val status: String = "",
    val matchType: String? = null,
    val externalOrderId: String? = null,
    val smsReceivedAt: String? = null,
    val verifiedAt: String? = null,
    val smsSender: String? = null,
    val source: String = "SMS",
    val trustFlag: String? = null
)

@Serializable
data class TransactionsPageDto(
    val items: List<LedgerDto> = emptyList(),
    val total: Int = 0,
    val limit: Int = 50,
    val offset: Int = 0
)

@Serializable
data class QueueItemDto(
    val id: String = "",
    val paymentIntentId: String? = null,
    val provider: String = "",
    val externalOrderId: String = "",
    val customerEmail: String? = null,
    val expectedAmount: Double = 0.0,
    val baseAmount: Double? = null,
    val uniqueAmount: Double? = null,
    val submittedAmount: Double? = null,
    val submittedTrxId: String? = null,
    val submittedSender: String? = null,
    val escalationReason: String? = null,
    val status: String = "",
    val expiresAt: String? = null,
    val createdAt: String? = null
)

@Serializable
data class QueueListDto(
    val queue: List<QueueItemDto> = emptyList()
)

@Serializable
data class ManualMatchRequest(
    val smsLedgerId: String,
    val externalOrderId: String,
    val customerEmail: String? = null
)

@Serializable
data class VerifiedEventDto(
    val trxId: String = "",
    val externalOrderId: String = "",
    val verifiedAt: String? = null,
    val amount: Double = 0.0,
    val provider: String = ""
)

@Serializable
data class DeviceSyncDto(
    val serverTime: Long = 0L,
    val verified: List<VerifiedEventDto> = emptyList(),
    val orders: List<MerchantOrderDto> = emptyList(),
    val pendingConfirmationCount: Int = 0
)

@Serializable
data class HeartbeatRequest(
    val merchantId: String,
    val batteryLevel: Int,
    val isCharging: Boolean,
    val fcmToken: String? = null,
    val appVersion: String = "1.0.0",
    val networkType: String? = null,
    val fcmEnabled: Boolean = false,
    val smsPermission: Boolean = false,
    val listenerEnabled: Boolean = false,
    val simSlots: List<PreflightSimSlotDto>? = null
)

@Serializable
data class HeartbeatResponse(
    val success: Boolean = true,
    val serverTime: Long = 0L,
    val message: String? = null
)

@Serializable
data class LoginRequest(
    val email: String,
    val password: String,
    val deviceType: String = "ANDROID",
    val deviceName: String,
    val fcmToken: String? = null
)

@Serializable
data class AuthUserDto(
    val id: String = "",
    val merchantId: String = "",
    val email: String = "",
    val fullName: String = "",
    val role: String = "MERCHANT"
)

@Serializable
data class AuthMerchantDto(
    val id: String = "",
    val storeName: String = "",
    val webhookUrl: String = "",
    val gracePeriodMinutes: Int = 60,
    val isActive: Boolean = true
)

@Serializable
data class LoginData(
    val accessToken: String = "",
    val sessionId: String = "",
    val expiresAt: String = "",
    val user: AuthUserDto = AuthUserDto(),
    val merchant: AuthMerchantDto = AuthMerchantDto(),
    val deviceApiKey: String? = null
)

@Serializable
data class LoginResponse(
    val success: Boolean = false,
    val data: LoginData? = null,
    val error: String? = null,
    val message: String? = null
)

@Serializable
data class MerchantOrderDto(
    val id: String = "",
    val merchantId: String = "",
    val externalOrderId: String,
    val paymentMethod: String = "COD",
    val paymentStatus: String = "PENDING",
    val orderStatus: String = "PENDING",
    val baseAmount: Double = 0.0,
    val paidAmount: Double = 0.0,
    val dueAmount: Double? = null,
    val customerName: String? = null,
    val customerPhone: String? = null,
    val customerEmail: String? = null,
    val itemsSummary: String? = null,
    val shippingAddress: String? = null,
    val mfsProvider: String? = null,
    val trxId: String? = null,
    val note: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null
)

@Serializable
data class OrdersListData(
    val items: List<MerchantOrderDto> = emptyList(),
    val total: Int = 0,
    val pendingConfirmationCount: Int = 0
)

@Serializable
data class OrdersListResponse(
    val success: Boolean = false,
    val data: OrdersListData? = null,
    val error: String? = null,
    val message: String? = null
)

@Serializable
data class OrderActionRequest(
    val action: String,
    val note: String? = null
)

@Serializable
data class OrderActionData(
    val order: MerchantOrderDto? = null,
    val webhookDispatched: Boolean = false
)

@Serializable
data class OrderActionResponse(
    val success: Boolean = false,
    val data: OrderActionData? = null,
    val error: String? = null,
    val message: String? = null
)

@Serializable
data class DynamicPaymentActionDto(
    val id: String = "",
    val label: String = "",
    val style: String = "secondary",
    val webhookEvent: String? = null
)

@Serializable
data class DisplayHighlightDto(
    val label: String = "",
    val value: String = ""
)

@Serializable
data class PaymentDisplayDto(
    val appName: String? = null,
    val appDomain: String? = null,
    val category: String? = null,
    val referenceLabel: String? = null,
    val title: String? = null,
    val subtitle: String? = null,
    val highlights: List<DisplayHighlightDto> = emptyList(),
    val adminDeepLink: String? = null
)

@Serializable
data class PaymentCustomerDto(
    val name: String? = null,
    val email: String? = null,
    val phone: String? = null
)

@Serializable
data class PaymentIntentDto(
    val id: String = "",
    val merchantId: String = "",
    val vertical: String = "custom",
    val externalRefId: String = "",
    val verificationMode: String = "AUTO",
    val status: String = "OPEN",
    val baseAmount: Double = 0.0,
    val uniqueAmount: Double = 0.0,
    val paidAmount: Double? = null,
    val provider: String? = null,
    val trxId: String? = null,
    val senderNumber: String? = null,
    val receiptAssetId: String? = null,
    val receiptUrl: String? = null,
    val matchType: String? = null,
    val trustFlag: String? = null,
    val deviceOnlineAtSubmit: Boolean? = null,
    val smsLedgerId: String? = null,
    val smsReconciliationState: String? = null,
    val escalationReason: String? = null,
    val resolutionSource: String? = null,
    val rejectionReason: String? = null,
    val customer: PaymentCustomerDto? = null,
    val display: PaymentDisplayDto = PaymentDisplayDto(),
    val actions: List<DynamicPaymentActionDto> = emptyList(),
    val stateVersion: Int = 1,
    val submitAttempts: Int = 0,
    val graceExpiresAt: String? = null,
    val expiresAt: String? = null,
    val verifiedAt: String? = null,
    val resolvedAt: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null
)

@Serializable
data class PaymentIntentsListData(
    val items: List<PaymentIntentDto> = emptyList(),
    val total: Int = 0,
    val limit: Int = 50,
    val offset: Int = 0
)

@Serializable
data class ResolvePaymentRequest(
    val decision: String,
    val expectedStateVersion: Int? = null,
    val resolutionSource: String = "ORBIT_ANDROID",
    val reason: String? = null,
    val trxId: String? = null
)

@Serializable
data class ResolvePaymentData(
    val paymentIntent: PaymentIntentDto? = null,
    val alreadyResolved: Boolean = false
)

@Serializable
data class TriggerActionRequest(
    val actionId: String,
    val note: String? = null
)

@Serializable
data class TriggerActionData(
    val paymentIntentId: String = "",
    val externalRefId: String = "",
    val actionId: String = "",
    val event: String = "",
    val webhookDispatched: Boolean = false,
    val deliveryId: String? = null,
    val statusCode: Int? = null
)

@Serializable
data class PreflightSimSlotDto(
    val slotIndex: Int? = null,
    val carrierName: String? = null,
    val phoneNumber: String = "",
    val source: String = "HARDWARE"
)

@Serializable
data class PreflightCheckRequest(
    val deviceSimNumbers: List<PreflightSimSlotDto> = emptyList(),
    val smsPermission: Boolean? = null,
    val listenerEnabled: Boolean? = null,
    val batteryOptimizationIgnored: Boolean? = null,
    val fcmEnabled: Boolean? = null
)

@Serializable
data class PreflightMerchantDto(
    val id: String = "",
    val storeName: String = "",
    val verificationMode: String = "AUTO",
    val webhookConfigured: Boolean = false,
    val webhookUrl: String? = null
)

@Serializable
data class PreflightWalletSummaryDto(
    val totalCount: Int = 0,
    val activeCount: Int = 0,
    val placeholderOnly: Boolean = false,
    val hasPlaceholderWallets: Boolean = false
)

@Serializable
data class PreflightWalletDto(
    val id: String = "",
    val provider: String = "",
    val accountType: String = "PERSONAL",
    val walletNumber: String = "",
    val isPrimary: Boolean = false,
    val isActive: Boolean = true,
    val isPlaceholder: Boolean = false
)

@Serializable
data class PreflightProfileMatchDto(
    val walletId: String = "",
    val provider: String = "",
    val walletNumber: String = "",
    val status: String = "SIM_NUMBER_UNAVAILABLE",
    val matchedSimSlot: Int? = null,
    val matchedCarrier: String? = null,
    val message: String = ""
)

@Serializable
data class PreflightDeviceStatusDto(
    val online: Boolean = false,
    val lastSeenAt: String? = null,
    val activeSockets: Int = 0
)

@Serializable
data class DevicePreflightData(
    val overallStatus: String = "ACTION_REQUIRED",
    val checkedAt: String = "",
    val merchant: PreflightMerchantDto = PreflightMerchantDto(),
    val walletSummary: PreflightWalletSummaryDto = PreflightWalletSummaryDto(),
    val wallets: List<PreflightWalletDto> = emptyList(),
    val profileMatches: List<PreflightProfileMatchDto> = emptyList(),
    val deviceStatus: PreflightDeviceStatusDto = PreflightDeviceStatusDto(),
    val recommendations: List<String> = emptyList()
)

@Serializable
data class PaymentLinkDto(
    val id: String = "",
    val merchantId: String = "",
    val merchantSlug: String? = null,
    val slug: String = "",
    val sharePath: String = "",
    val shareUrl: String = "",
    val title: String = "",
    val description: String? = null,
    val vertical: String = "custom",
    val amountType: String = "FIXED",
    val fixedAmount: Double? = null,
    val minAmount: Double? = null,
    val maxAmount: Double? = null,
    val currency: String = "BDT",
    val isActive: Boolean = true,
    val maxUses: Int? = null,
    val usedCount: Int = 0,
    val expiresAt: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null
)

@Serializable
data class CreatePaymentLinkRequest(
    val title: String,
    val description: String? = null,
    val vertical: String = "custom",
    val amountType: String = "FIXED",
    val fixedAmount: Double? = null,
    val minAmount: Double? = null,
    val maxAmount: Double? = null
)

@Serializable
data class UpdatePaymentLinkRequest(
    val isActive: Boolean? = null,
    val title: String? = null,
    val description: String? = null,
    val fixedAmount: Double? = null
)

@Serializable
data class WalletsOverviewSummaryDto(
    val totalWallets: Int = 0,
    val activeWallets: Int = 0,
    val onlineDeviceCount: Int = 0,
    val totalDeviceCount: Int = 0,
    val overflowWarningCount: Int = 0,
    val hardLimitReachedCount: Int = 0
)

@Serializable
data class WalletsOverviewDto(
    val wallets: List<WalletRotationDto> = emptyList(),
    val devices: List<ConnectedDeviceDto> = emptyList(),
    val summary: WalletsOverviewSummaryDto = WalletsOverviewSummaryDto()
)

@Serializable
data class CreateWalletRequest(
    val provider: String,
    val walletNumber: String,
    val accountType: String = "PERSONAL",
    val label: String? = null,
    val simSlotIndex: Int? = null,
    val safeVolumeLimit: Double = 250000.0,
    val monthlyVolumeLimit: Double = 300000.0,
    val isPrimary: Boolean = false
)

@Serializable
data class UpdateWalletRequest(
    val isActive: Boolean? = null,
    val isPrimary: Boolean? = null,
    val label: String? = null,
    val safeVolumeLimit: Double? = null,
    val monthlyVolumeLimit: Double? = null,
    val simSlotIndex: Int? = null
)
