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
    val receivedAt: Long
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
    val autoVerifiedCount: Int = 0
)

@Serializable
data class IngestResponse(
    val success: Boolean = true,
    val ingestedCount: Int = 0,
    val autoVerifiedCount: Int = 0,
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
data class HeartbeatRequest(
    val merchantId: String,
    val batteryLevel: Int,
    val isCharging: Boolean,
    val fcmToken: String? = null,
    val appVersion: String = "1.0.0"
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
