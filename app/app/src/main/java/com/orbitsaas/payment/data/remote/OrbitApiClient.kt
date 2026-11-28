package com.orbitsaas.payment.data.remote

import android.util.Log
import com.orbitsaas.payment.BuildConfig
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
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.patch
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
        coerceInputValues = true
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
    suspend fun logout(
        tokenOverride: String? = null,
        deviceKeyOverride: String? = null
    ): Result<Unit> {
        return runCatching {
            val token = (tokenOverride ?: authToken).trim()
            val devKey = (deviceKeyOverride ?: deviceKey).trim()
            if (token.isBlank()) return@runCatching
            val url = "$baseUrl/api/v1/auth/logout"
            val response: HttpResponse = client.post(url) {
                contentType(ContentType.Application.Json)
                header(HttpHeaders.UserAgent, USER_AGENT)
                header(HttpHeaders.Authorization, "Bearer $token")
                if (devKey.isNotBlank()) {
                    header("X-Device-Key", devKey)
                }
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
                        flaggedCount = data?.flaggedCount ?: 0,
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
     * Fetches paginated server ledger transactions with optional search and filters.
     */
    suspend fun fetchTransactions(
        limit: Int = 50,
        offset: Int = 0,
        search: String? = null,
        status: String? = null,
        provider: String? = null
    ): Result<TransactionsPageDto> {
        return runCatching {
            val url = "$baseUrl/api/v1/device/transactions"
            val response: HttpResponse = client.get(url) {
                applyAuthHeaders()
                parameter("limit", limit)
                parameter("offset", offset)
                if (!search.isNullOrBlank()) parameter("search", search.trim())
                if (!status.isNullOrBlank()) parameter("status", status.trim())
                if (!provider.isNullOrBlank()) parameter("provider", provider.trim())
            }

            if (response.status.isSuccess()) {
                val envelope = response.body<ApiEnvelope<TransactionsPageDto>>()
                if (envelope.success && envelope.data != null) {
                    envelope.data
                } else {
                    throw Exception(envelope.error ?: envelope.message ?: "Failed to load transactions")
                }
            } else {
                throwHttpException(response)
            }
        }
    }

    /**
     * Fetches pending payment verification queue candidates from ORBIT Central Hub.
     */
    suspend fun fetchQueue(): Result<QueueListDto> {
        return runCatching {
            val url = "$baseUrl/api/v1/device/queue"
            val response: HttpResponse = client.get(url) {
                applyAuthHeaders()
            }

            if (response.status.isSuccess()) {
                val envelope = response.body<ApiEnvelope<QueueListDto>>()
                if (envelope.success && envelope.data != null) {
                    envelope.data
                } else {
                    throw Exception(envelope.error ?: envelope.message ?: "Failed to load queue")
                }
            } else {
                throwHttpException(response)
            }
        }
    }

    /**
     * Manually links an unclaimed SMS ledger entry to a storefront order ID.
     */
    suspend fun manualMatch(
        smsLedgerId: String,
        externalOrderId: String,
        customerEmail: String? = null
    ): Result<LedgerDto> {
        return runCatching {
            val url = "$baseUrl/api/v1/device/manual-match"
            val payload = ManualMatchRequest(
                smsLedgerId = smsLedgerId.trim(),
                externalOrderId = externalOrderId.trim(),
                customerEmail = customerEmail?.trim()?.ifBlank { null }
            )
            val response: HttpResponse = client.post(url) {
                contentType(ContentType.Application.Json)
                applyAuthHeaders()
                setBody(payload)
            }

            if (response.status.isSuccess()) {
                val envelope = response.body<ApiEnvelope<LedgerDto>>()
                if (envelope.success && envelope.data != null) {
                    envelope.data
                } else {
                    throw Exception(envelope.error ?: envelope.message ?: "Manual match failed")
                }
            } else {
                throwHttpException(response)
            }
        }
    }

    /**
     * Polls incremental verified events and updated orders since [sinceMs].
     */
    suspend fun syncSince(sinceMs: Long? = null): Result<DeviceSyncDto> {
        return runCatching {
            val url = "$baseUrl/api/v1/device/sync"
            val response: HttpResponse = client.get(url) {
                applyAuthHeaders()
                if (sinceMs != null && sinceMs > 0L) {
                    parameter("since", sinceMs)
                }
            }

            if (response.status.isSuccess()) {
                val envelope = response.body<ApiEnvelope<DeviceSyncDto>>()
                if (envelope.success && envelope.data != null) {
                    envelope.data
                } else {
                    throw Exception(envelope.error ?: envelope.message ?: "Sync failed")
                }
            } else {
                throwHttpException(response)
            }
        }
    }

    /**
     * Sends device telemetry heartbeat including battery level, charging state, and capability flags.
     */
    suspend fun sendHeartbeat(
        batteryLevel: Int,
        isCharging: Boolean,
        fcmEnabled: Boolean = false,
        smsPermission: Boolean = false,
        listenerEnabled: Boolean = false,
        networkType: String? = null,
        simSlots: List<PreflightSimSlotDto>? = null
    ): Result<HeartbeatResponse> {
        return runCatching {
            val url = "$baseUrl/api/v1/device/heartbeat"
            val payload = HeartbeatRequest(
                merchantId = merchantId,
                batteryLevel = batteryLevel,
                isCharging = isCharging,
                fcmToken = preferencesManager.fcmToken.ifBlank { null },
                appVersion = BuildConfig.VERSION_NAME,
                networkType = networkType,
                fcmEnabled = fcmEnabled,
                smsPermission = smsPermission,
                listenerEnabled = listenerEnabled,
                simSlots = simSlots
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

    /**
     * Checks ORBIT Central Hub for the latest published Android APK release.
     */
    suspend fun fetchLatestRelease(currentVersionCode: Int): Result<LatestReleaseData> {
        return runCatching {
            val resolvedBaseUrl = PreferencesManager.normalizeServerUrl(baseUrl)
            val url = "$resolvedBaseUrl/api/v1/app/latest"
            val response: HttpResponse = client.get(url) {
                header(HttpHeaders.UserAgent, USER_AGENT)
                parameter("currentVersionCode", currentVersionCode)
                parameter("platform", "ANDROID")
            }

            if (response.status.isSuccess()) {
                val envelope = response.body<ApiEnvelope<LatestReleaseData>>()
                if (envelope.success && envelope.data != null) {
                    envelope.data
                } else {
                    throw Exception(envelope.error ?: envelope.message ?: "Failed to check app updates")
                }
            } else {
                throwHttpException(response)
            }
        }
    }

    /**
     * Lists universal multi-vertical payment intents with optional status/search filters.
     */
    suspend fun listPaymentIntents(
        status: String? = null,
        limit: Int = 50,
        offset: Int = 0,
        search: String? = null
    ): Result<PaymentIntentsListData> {
        return runCatching {
            val resolvedBaseUrl = PreferencesManager.normalizeServerUrl(baseUrl)
            val url = "$resolvedBaseUrl/api/v1/payment-intents"
            val response: HttpResponse = client.get(url) {
                applyAuthHeaders()
                parameter("limit", limit)
                parameter("offset", offset)
                if (!status.isNullOrBlank()) {
                    parameter("status", status.trim())
                }
                if (!search.isNullOrBlank()) {
                    parameter("search", search.trim())
                }
            }

            if (response.status.isSuccess()) {
                val envelope = response.body<ApiEnvelope<PaymentIntentsListData>>()
                if (envelope.success && envelope.data != null) {
                    envelope.data
                } else {
                    throw Exception(envelope.error ?: envelope.message ?: "Failed to load payment intents")
                }
            } else {
                throwHttpException(response)
            }
        }
    }

    /**
     * Atomically resolves (APPROVE or REJECT) a payment intent with optimistic CAS stateVersion.
     */
    suspend fun resolvePaymentIntent(
        intentId: String,
        decision: String,
        expectedStateVersion: Int? = null,
        reason: String? = null,
        trxId: String? = null
    ): Result<ResolvePaymentData> {
        return runCatching {
            val resolvedBaseUrl = PreferencesManager.normalizeServerUrl(baseUrl)
            val encodedId = intentId.trim().encodeURLPathPart()
            val url = "$resolvedBaseUrl/api/v1/payments/$encodedId/resolve"
            val payload = ResolvePaymentRequest(
                decision = decision.trim().uppercase(),
                expectedStateVersion = expectedStateVersion,
                resolutionSource = "ORBIT_ANDROID",
                reason = reason?.trim()?.ifBlank { null },
                trxId = trxId?.trim()?.ifBlank { null }
            )

            val response: HttpResponse = client.post(url) {
                contentType(ContentType.Application.Json)
                applyAuthHeaders()
                setBody(payload)
            }

            if (response.status.isSuccess()) {
                val envelope = response.body<ApiEnvelope<ResolvePaymentData>>()
                if (envelope.success && envelope.data != null) {
                    envelope.data
                } else {
                    throw Exception(envelope.error ?: envelope.message ?: "Failed to resolve payment intent")
                }
            } else {
                throwHttpException(response)
            }
        }
    }

    /**
     * Triggers a server-declared dynamic client action webhook on a payment intent.
     */
    suspend fun triggerPaymentAction(
        intentId: String,
        actionId: String,
        note: String? = null
    ): Result<TriggerActionData> {
        return runCatching {
            val resolvedBaseUrl = PreferencesManager.normalizeServerUrl(baseUrl)
            val encodedId = intentId.trim().encodeURLPathPart()
            val url = "$resolvedBaseUrl/api/v1/payments/$encodedId/action"
            val payload = TriggerActionRequest(
                actionId = actionId.trim(),
                note = note?.trim()?.ifBlank { null }
            )

            val response: HttpResponse = client.post(url) {
                contentType(ContentType.Application.Json)
                applyAuthHeaders()
                setBody(payload)
            }

            if (response.status.isSuccess()) {
                val envelope = response.body<ApiEnvelope<TriggerActionData>>()
                if (envelope.success && envelope.data != null) {
                    envelope.data
                } else {
                    throw Exception(envelope.error ?: envelope.message ?: "Payment action failed")
                }
            } else {
                throwHttpException(response)
            }
        }
    }

    /**
     * Runs an active device preflight check comparing detected/confirmed SIM numbers and local
     * capture permissions against ORBIT Hub merchant wallets and storefront settings.
     */
    suspend fun runPreflightCheck(request: PreflightCheckRequest): Result<DevicePreflightData> {
        return runCatching {
            val url = "$baseUrl/api/v1/device/preflight/check"
            val response: HttpResponse = client.post(url) {
                contentType(ContentType.Application.Json)
                applyAuthHeaders()
                setBody(request)
            }

            if (response.status.isSuccess()) {
                val envelope = response.body<ApiEnvelope<DevicePreflightData>>()
                if (envelope.success && envelope.data != null) {
                    envelope.data
                } else {
                    throw Exception(envelope.error ?: envelope.message ?: "Preflight check failed")
                }
            } else {
                throwHttpException(response)
            }
        }
    }

    /**
     * Lists shareable merchant Payment Links.
     */
    suspend fun listPaymentLinks(): Result<List<PaymentLinkDto>> {
        return runCatching {
            val resolvedBaseUrl = PreferencesManager.normalizeServerUrl(baseUrl)
            val url = "$resolvedBaseUrl/api/v1/payment-links"
            val response: HttpResponse = client.get(url) {
                applyAuthHeaders()
            }
            if (response.status.isSuccess()) {
                val envelope = response.body<ApiEnvelope<List<PaymentLinkDto>>>()
                if (envelope.success && envelope.data != null) {
                    envelope.data
                } else {
                    throw Exception(envelope.error ?: envelope.message ?: "Failed to load payment links")
                }
            } else {
                throwHttpException(response)
            }
        }
    }

    /**
     * Creates a new shareable merchant Payment Link.
     */
    suspend fun createPaymentLink(request: CreatePaymentLinkRequest): Result<PaymentLinkDto> {
        return runCatching {
            val resolvedBaseUrl = PreferencesManager.normalizeServerUrl(baseUrl)
            val url = "$resolvedBaseUrl/api/v1/payment-links"
            val response: HttpResponse = client.post(url) {
                contentType(ContentType.Application.Json)
                applyAuthHeaders()
                setBody(request)
            }
            if (response.status.isSuccess()) {
                val envelope = response.body<ApiEnvelope<PaymentLinkDto>>()
                if (envelope.success && envelope.data != null) {
                    envelope.data
                } else {
                    throw Exception(envelope.error ?: envelope.message ?: "Failed to create payment link")
                }
            } else {
                throwHttpException(response)
            }
        }
    }

    /**
     * Updates a Payment Link (e.g., toggle active/paused).
     */
    suspend fun updatePaymentLink(id: String, request: UpdatePaymentLinkRequest): Result<PaymentLinkDto> {
        return runCatching {
            val resolvedBaseUrl = PreferencesManager.normalizeServerUrl(baseUrl)
            val encodedId = id.trim().encodeURLPathPart()
            val url = "$resolvedBaseUrl/api/v1/payment-links/$encodedId"
            val response: HttpResponse = client.patch(url) {
                contentType(ContentType.Application.Json)
                applyAuthHeaders()
                setBody(request)
            }
            if (response.status.isSuccess()) {
                val envelope = response.body<ApiEnvelope<PaymentLinkDto>>()
                if (envelope.success && envelope.data != null) {
                    envelope.data
                } else {
                    throw Exception(envelope.error ?: envelope.message ?: "Failed to update payment link")
                }
            } else {
                throwHttpException(response)
            }
        }
    }

    /**
     * Deletes a Payment Link.
     */
    suspend fun deletePaymentLink(id: String): Result<Unit> {
        return runCatching {
            val resolvedBaseUrl = PreferencesManager.normalizeServerUrl(baseUrl)
            val encodedId = id.trim().encodeURLPathPart()
            val url = "$resolvedBaseUrl/api/v1/payment-links/$encodedId"
            val response: HttpResponse = client.delete(url) {
                applyAuthHeaders()
            }
            if (!response.status.isSuccess()) {
                throwHttpException(response)
            }
        }
    }

    /**
     * Fetches SIM Pool & Limits overview including connected phones and monthly limits.
     */
    suspend fun fetchWalletsOverview(): Result<WalletsOverviewDto> {
        return runCatching {
            val resolvedBaseUrl = PreferencesManager.normalizeServerUrl(baseUrl)
            val url = "$resolvedBaseUrl/api/v1/wallets/overview"
            val response: HttpResponse = client.get(url) {
                applyAuthHeaders()
            }
            if (response.status.isSuccess()) {
                val envelope = response.body<ApiEnvelope<WalletsOverviewDto>>()
                if (envelope.success && envelope.data != null) {
                    envelope.data
                } else {
                    throw Exception(envelope.error ?: envelope.message ?: "Failed to load SIM pool")
                }
            } else {
                throwHttpException(response)
            }
        }
    }

    /**
     * Adds a new MFS SIM number to the merchant's SIM Pool.
     */
    suspend fun createWallet(request: CreateWalletRequest): Result<WalletRotationDto> {
        return runCatching {
            val resolvedBaseUrl = PreferencesManager.normalizeServerUrl(baseUrl)
            val url = "$resolvedBaseUrl/api/v1/wallets"
            val response: HttpResponse = client.post(url) {
                contentType(ContentType.Application.Json)
                applyAuthHeaders()
                setBody(request)
            }
            if (response.status.isSuccess()) {
                val envelope = response.body<ApiEnvelope<WalletRotationDto>>()
                if (envelope.success && envelope.data != null) {
                    envelope.data
                } else {
                    throw Exception(envelope.error ?: envelope.message ?: "Failed to add SIM number")
                }
            } else {
                throwHttpException(response)
            }
        }
    }

    /**
     * Updates a SIM wallet (pause/resume, set primary, update limits).
     */
    suspend fun updateWallet(id: String, request: UpdateWalletRequest): Result<WalletRotationDto> {
        return runCatching {
            val resolvedBaseUrl = PreferencesManager.normalizeServerUrl(baseUrl)
            val encodedId = id.trim().encodeURLPathPart()
            val url = "$resolvedBaseUrl/api/v1/wallets/$encodedId"
            val response: HttpResponse = client.patch(url) {
                contentType(ContentType.Application.Json)
                applyAuthHeaders()
                setBody(request)
            }
            if (response.status.isSuccess()) {
                val envelope = response.body<ApiEnvelope<WalletRotationDto>>()
                if (envelope.success && envelope.data != null) {
                    envelope.data
                } else {
                    throw Exception(envelope.error ?: envelope.message ?: "Failed to update SIM wallet")
                }
            } else {
                throwHttpException(response)
            }
        }
    }

    /**
     * Removes a SIM wallet from the merchant's SIM Pool.
     */
    suspend fun deleteWallet(id: String): Result<Unit> {
        return runCatching {
            val resolvedBaseUrl = PreferencesManager.normalizeServerUrl(baseUrl)
            val encodedId = id.trim().encodeURLPathPart()
            val url = "$resolvedBaseUrl/api/v1/wallets/$encodedId"
            val response: HttpResponse = client.delete(url) {
                applyAuthHeaders()
            }
            if (!response.status.isSuccess()) {
                throwHttpException(response)
            }
        }
    }

    companion object {
        private const val TAG = "OrbitApiClient"
        private val USER_AGENT = "OrbitPay-Android/${BuildConfig.VERSION_NAME}"
    }
}
