package com.orbitsaas.payment.data.remote

import android.util.Log
import com.orbitsaas.payment.data.local.PreferencesManager
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.android.Android
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.logging.LogLevel
import io.ktor.client.plugins.logging.Logger
import io.ktor.client.plugins.logging.Logging
import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.http.encodeURLPathPart
import io.ktor.http.isSuccess
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class UnauthorizedException(message: String) : Exception(message)

class OrbitApiClient(
    private val preferencesManager: PreferencesManager
) {

    private val json = Json {
        prettyPrint = false
        isLenient = true
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private val client: HttpClient = HttpClient(Android) {
        install(ContentNegotiation) {
            json(json)
        }

        install(HttpTimeout) {
            requestTimeoutMillis = 15_000L
            connectTimeoutMillis = 15_000L
            socketTimeoutMillis = 15_000L
        }

        install(Logging) {
            logger = object : Logger {
                override fun log(message: String) {
                    Log.d(TAG, message)
                }
            }
            level = LogLevel.INFO
        }
    }

    private val baseUrl: String
        get() = preferencesManager.serverUrl.removeSuffix("/")

    private val deviceKey: String
        get() = preferencesManager.deviceKey

    private val merchantId: String
        get() = preferencesManager.merchantId

    private val authToken: String
        get() = preferencesManager.authToken

    private fun HttpRequestBuilder.applyAuthHeaders() {
        header(HttpHeaders.UserAgent, USER_AGENT)
        if (authToken.isNotBlank()) {
            header(HttpHeaders.Authorization, "Bearer $authToken")
        }
        if (deviceKey.isNotBlank()) {
            header("X-Device-Key", deviceKey)
        }
        if (merchantId.isNotBlank()) {
            header("X-Merchant-Id", merchantId)
        }
    }

    private suspend fun extractErrorMessage(response: HttpResponse): String {
        val raw = runCatching { response.bodyAsText() }.getOrNull().orEmpty()
        if (raw.isNotBlank()) {
            runCatching {
                val obj = json.parseToJsonElement(raw).jsonObject
                val errorEl = obj["error"]
                val nestedMsg = runCatching {
                    errorEl?.jsonObject?.get("message")?.jsonPrimitive?.contentOrNull
                }.getOrNull()
                val err = nestedMsg
                    ?: runCatching { errorEl?.jsonPrimitive?.contentOrNull }.getOrNull()
                    ?: runCatching { obj["message"]?.jsonPrimitive?.contentOrNull }.getOrNull()
                if (!err.isNullOrBlank()) return err
            }
        }
        return "HTTP ${response.status.value}: ${response.status.description}"
    }

    private suspend fun throwHttpException(response: HttpResponse): Nothing {
        val message = extractErrorMessage(response)
        if (response.status == HttpStatusCode.Unauthorized) {
            throw UnauthorizedException(message)
        }
        throw Exception(message)
    }

    /**
     * Authenticates a merchant user against ORBIT Central Hub and returns session + device info.
     */
    suspend fun login(email: String, password: String, deviceName: String): Result<LoginData> {
        return runCatching {
            val resolvedBaseUrl = PreferencesManager.normalizeServerUrl(baseUrl)
            val url = "$resolvedBaseUrl/api/v1/auth/login"
            val payload = LoginRequest(
                email = email.trim(),
                password = password,
                deviceType = "ANDROID",
                deviceName = deviceName,
                fcmToken = preferencesManager.fcmToken.ifBlank { null }
            )

            val response: HttpResponse = client.post(url) {
                contentType(ContentType.Application.Json)
                header(HttpHeaders.UserAgent, USER_AGENT)
                setBody(payload)
            }

            if (response.status.isSuccess()) {
                val body = response.body<LoginResponse>()
                if (body.success && body.data != null) {
                    body.data
                } else {
                    throw Exception(body.error ?: body.message ?: "Authentication failed")
                }
            } else {
                throw Exception(extractErrorMessage(response))
            }
        }
    }

    /**
     * Revokes the current merchant session on ORBIT Central Hub.
     */
    suspend fun logout(): Result<Unit> {
        return runCatching {
            if (authToken.isBlank()) return@runCatching
            val url = "$baseUrl/api/v1/auth/logout"
            val response: HttpResponse = client.post(url) {
                contentType(ContentType.Application.Json)
                header(HttpHeaders.UserAgent, USER_AGENT)
                header(HttpHeaders.Authorization, "Bearer $authToken")
            }

            if (!response.status.isSuccess() && response.status != HttpStatusCode.Unauthorized) {
                throw Exception(extractErrorMessage(response))
            }
        }
    }

    /**
     * Fetches merchant orders and pending confirmation counts from ORBIT Central Hub.
     */
    suspend fun fetchOrders(statusFilter: String? = null): Result<OrdersListData> {
        return runCatching {
            val url = "$baseUrl/api/v1/device/orders"
            val response: HttpResponse = client.get(url) {
                applyAuthHeaders()
                if (!statusFilter.isNullOrBlank()) {
                    parameter("orderStatus", statusFilter.trim())
                }
            }

            if (response.status.isSuccess()) {
                val body = response.body<OrdersListResponse>()
                if (body.success && body.data != null) {
                    body.data
                } else {
                    throw Exception(body.error ?: body.message ?: "Failed to load orders")
                }
            } else {
                throwHttpException(response)
            }
        }
    }

    /**
     * Sends a bi-directional order status action (CONFIRM, READY_TO_SHIP, SHIP, MARK_PAID, CANCEL).
     */
    suspend fun performOrderAction(
        externalOrderId: String,
        action: String,
        note: String? = null
    ): Result<OrderActionData> {
        return runCatching {
            val encodedId = externalOrderId.encodeURLPathPart()
            val url = "$baseUrl/api/v1/device/orders/$encodedId/action"
            val payload = OrderActionRequest(
                action = action,
                note = note?.trim()?.ifBlank { null }
            )

            val response: HttpResponse = client.post(url) {
                contentType(ContentType.Application.Json)
                applyAuthHeaders()
                setBody(payload)
            }

            if (response.status.isSuccess()) {
                val body = response.body<OrderActionResponse>()
                if (body.success && body.data != null) {
                    body.data
                } else {
                    throw Exception(body.error ?: body.message ?: "Order action failed")
                }
            } else {
                throwHttpException(response)
            }
        }
    }

    /**
     * Ingests a batch of captured SMS records into ORBIT Central Hub.
     */
    suspend fun ingestBatch(items: List<IngestSmsItem>): Result<IngestResponse> {
        if (items.isEmpty()) {
            return Result.success(IngestResponse(success = true, message = "Empty batch"))
        }

        return runCatching {
            val url = "$baseUrl/api/v1/device/ingest"
            val payload = IngestSmsBatchRequest(
                merchantId = merchantId,
                deviceKey = deviceKey,
                messages = items
            )

            val response: HttpResponse = client.post(url) {
                contentType(ContentType.Application.Json)
                applyAuthHeaders()
                setBody(payload)
            }

            if (response.status.isSuccess()) {
                val envelope = response.body<ApiEnvelope<IngestData>>()
                if (envelope.success) {
                    val data = envelope.data
                    IngestResponse(
                        success = true,
                        ingestedCount = data?.ingestedCount ?: 0,
                        autoVerifiedCount = data?.autoVerifiedCount ?: 0,
                        message = envelope.message.orEmpty()
                    )
                } else {
                    throw Exception(envelope.error ?: envelope.message ?: "Ingest rejected")
                }
            } else {
                throwHttpException(response)
            }
        }
    }

    /**
     * Fetches real-time transaction stats from the central server.
     */
    suspend fun fetchStats(): Result<DeviceStatsResponse> {
        return runCatching {
            val url = "$baseUrl/api/v1/device/stats"
            val response: HttpResponse = client.get(url) {
                applyAuthHeaders()
            }

            if (response.status.isSuccess()) {
                val envelope = response.body<ApiEnvelope<DeviceStatsResponse>>()
                if (envelope.success && envelope.data != null) {
                    envelope.data
                } else {
                    throw Exception(envelope.error ?: envelope.message ?: "Invalid stats response")
                }
            } else {
                throwHttpException(response)
            }
        }
    }

    /**
     * Sends device telemetry heartbeat including battery level and charging state.
     */
    suspend fun sendHeartbeat(batteryLevel: Int, isCharging: Boolean): Result<HeartbeatResponse> {
        return runCatching {
            val url = "$baseUrl/api/v1/device/heartbeat"
            val payload = HeartbeatRequest(
                merchantId = merchantId,
                batteryLevel = batteryLevel,
                isCharging = isCharging,
                fcmToken = preferencesManager.fcmToken.ifBlank { null }
            )

            val response: HttpResponse = client.post(url) {
                contentType(ContentType.Application.Json)
                applyAuthHeaders()
                setBody(payload)
            }

            if (response.status.isSuccess()) {
                val result = response.body<HeartbeatResponse>()
                preferencesManager.lastHeartbeatTime = System.currentTimeMillis()
                result
            } else {
                throwHttpException(response)
            }
        }
    }

    /**
     * Verifies server reachability and credential validity using either overrides or saved preferences.
     */
    suspend fun testConnection(
        serverUrlOverride: String? = null,
        merchantIdOverride: String? = null,
        deviceKeyOverride: String? = null
    ): Result<Boolean> {
        return runCatching {
            val targetUrl = PreferencesManager.normalizeServerUrl(serverUrlOverride ?: baseUrl)
            val targetMerchantId = (merchantIdOverride ?: merchantId).trim()
            val targetDeviceKey = (deviceKeyOverride ?: deviceKey).trim()

            val url = "$targetUrl/api/v1/device/stats"
            val response: HttpResponse = client.get(url) {
                header(HttpHeaders.UserAgent, USER_AGENT)
                if (targetDeviceKey.isBlank() && authToken.isNotBlank()) {
                    header(HttpHeaders.Authorization, "Bearer $authToken")
                }
                if (targetDeviceKey.isNotBlank()) {
                    header("X-Device-Key", targetDeviceKey)
                }
                if (targetMerchantId.isNotBlank()) {
                    header("X-Merchant-Id", targetMerchantId)
                }
            }

            if (response.status.isSuccess()) {
                val envelope = response.body<ApiEnvelope<DeviceStatsResponse>>()
                if (envelope.success && envelope.data != null) {
                    true
                } else {
                    throw Exception(envelope.error ?: envelope.message ?: "Invalid stats response")
                }
            } else {
                throwHttpException(response)
            }
        }
    }

    companion object {
        private const val TAG = "OrbitApiClient"
        private const val USER_AGENT = "OrbitPay-Android/1.0.0"
    }
}
