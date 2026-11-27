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
    val source: String = "SMS"
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
data class DeviceStatsResponse(
    val merchantId: String = "",
    val storeName: String = "",
    val isOnline: Boolean = false,
    val lastSeenAt: String? = null,
    val totalVerifiedVolume: Double = 0.0,
    val verifiedCount: Int = 0,
    val unclaimedCount: Int = 0,
    val pendingQueueCount: Int = 0,
    val recentTransactions: List<RecentTransactionDto> = emptyList()
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
    val fcmEnabled: Boolean = false,
    val smsPermission: Boolean = false,
    val listenerEnabled: Boolean = false
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
