package com.orbitsaas.payment.service

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationCompat
import com.orbitsaas.payment.OrbitApplication
import com.orbitsaas.payment.R
import com.orbitsaas.payment.data.local.OrbitDatabase
import com.orbitsaas.payment.data.local.PreferencesManager
import com.orbitsaas.payment.ui.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.TimeUnit

enum class WsPushState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    UNAUTHORIZED
}

/**
 * Self-hosted Cloudflare Durable Object WebSocket push client.
 * Connects to GET /api/v1/device/ws, sends 45s "ping" keepalives (auto-answered with "pong"
 * without waking the hibernatable DO), processes instant push frames, and reconnects with
 * exponential backoff on transient failures.
 */
class PushWebSocketClient(
    context: Context,
    private val preferencesManager: PreferencesManager,
    private val scope: CoroutineScope,
    private val onConnected: () -> Unit = {},
    private val onUnauthorized: () -> Unit = {}
) {

    private val appContext: Context = context.applicationContext

    private val okHttpClient: OkHttpClient = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .connectTimeout(15, TimeUnit.SECONDS)
        .build()

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
    }

    private val stateLock = Any()
    private var activeSocket: WebSocket? = null
    private var socketGeneration: Long = 0L
    private var reconnectJob: Job? = null
    private var pingJob: Job? = null
    private var reconnectAttempt: Int = 0
    private var manuallyDisconnected: Boolean = false

    fun connectIfReady() {
        synchronized(stateLock) {
            if (!preferencesManager.isLoggedIn()) {
                Log.d(TAG, "Skipping WebSocket connect: merchant session not configured.")
                closeSocketLocked(code = 1000, reason = "Not logged in")
                _connectionState.value = WsPushState.DISCONNECTED
                return
            }

            if (activeSocket != null && (
                    _connectionState.value == WsPushState.CONNECTING ||
                        _connectionState.value == WsPushState.CONNECTED
                    )
            ) {
                return
            }

            manuallyDisconnected = false
            reconnectJob?.cancel()
            reconnectJob = null
            openWebSocketLocked()
        }
    }

    fun reconnectNow() {
        synchronized(stateLock) {
            manuallyDisconnected = false
            reconnectAttempt = 0
            reconnectJob?.cancel()
            reconnectJob = null
            closeSocketLocked(code = 1000, reason = "Manual reconnect")

            if (!preferencesManager.isLoggedIn()) {
                _connectionState.value = WsPushState.DISCONNECTED
                return
            }

            openWebSocketLocked()
        }
    }

    fun disconnect() {
        val socketToClose: WebSocket?
        synchronized(stateLock) {
            manuallyDisconnected = true
            socketGeneration++
            reconnectAttempt = 0
            reconnectJob?.cancel()
            reconnectJob = null
            pingJob?.cancel()
            pingJob = null
            socketToClose = activeSocket
            activeSocket = null
            _connectionState.value = WsPushState.DISCONNECTED
        }
        socketToClose?.close(1000, "Client disconnect")
    }

    private fun closeSocketLocked(code: Int, reason: String) {
        socketGeneration++
        pingJob?.cancel()
        pingJob = null
        val old = activeSocket
        activeSocket = null
        old?.close(code, reason)
    }

    private fun openWebSocketLocked() {
        val generation = ++socketGeneration
        _connectionState.value = WsPushState.CONNECTING

        val wsUrl = buildWebSocketUrl()
        val requestBuilder = Request.Builder()
            .url(wsUrl)
            .header("User-Agent", USER_AGENT)

        val authToken = preferencesManager.authToken.trim()
        if (authToken.isNotBlank()) {
            requestBuilder.header("Authorization", "Bearer $authToken")
        }
        val deviceKey = preferencesManager.deviceKey.trim()
        if (deviceKey.isNotBlank()) {
            requestBuilder.header("X-Device-Key", deviceKey)
        }
        val merchantId = preferencesManager.merchantId.trim()
        if (merchantId.isNotBlank()) {
            requestBuilder.header("X-Merchant-Id", merchantId)
        }

        val request = requestBuilder.build()
        Log.d(TAG, "Opening WebSocket push stream to $wsUrl (gen=$generation)")
        activeSocket = okHttpClient.newWebSocket(request, createListener(generation))
    }

    private fun buildWebSocketUrl(): String {
        val normalized = PreferencesManager.normalizeServerUrl(preferencesManager.serverUrl)
        val wsBase = when {
            normalized.startsWith("https://", ignoreCase = true) ->
                "wss://" + normalized.substring("https://".length)
            normalized.startsWith("http://", ignoreCase = true) ->
                "ws://" + normalized.substring("http://".length)
            else -> "wss://$normalized"
        }
        return "$wsBase/api/v1/device/ws"
    }

    private fun createListener(generation: Long): WebSocketListener {
        return object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                synchronized(stateLock) {
                    if (generation != socketGeneration || manuallyDisconnected) {
                        webSocket.close(1000, "Stale socket")
                        return
                    }
                    startPingLoopLocked(generation, webSocket)
                }
                Log.d(TAG, "WebSocket transport opened (gen=$generation), awaiting welcome frame.")
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                synchronized(stateLock) {
                    if (generation != socketGeneration || manuallyDisconnected) return
                }

                if (text.trim() == "pong") {
                    return
                }

                val root = runCatching { json.parseToJsonElement(text) as? JsonObject }.getOrNull()
                if (root == null) {
                    Log.w(TAG, "Ignoring non-JSON WebSocket frame.")
                    return
                }

                val frameType = (root["type"] as? JsonPrimitive)?.contentOrNull.orEmpty()
                when (frameType) {
                    "connected" -> {
                        val shouldInvokeCallback = synchronized(stateLock) {
                            if (generation != socketGeneration || manuallyDisconnected) {
                                false
                            } else {
                                reconnectAttempt = 0
                                _connectionState.value = WsPushState.CONNECTED
                                true
                            }
                        }
                        if (shouldInvokeCallback) {
                            Log.i(TAG, "Self-hosted WebSocket push connected.")
                            scope.launch { onConnected() }
                        }
                    }

                    "push" -> {
                        _lastPushReceivedAt.value = System.currentTimeMillis()
                        val id = (root["id"] as? JsonPrimitive)?.contentOrNull.orEmpty()
                        val event = (root["event"] as? JsonPrimitive)?.contentOrNull.orEmpty()
                        val title = (root["title"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }
                        val body = (root["body"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }
                        val dataMap = (root["data"] as? JsonObject)
                            ?.mapNotNull { (key, value) ->
                                val strVal = (value as? JsonPrimitive)?.contentOrNull
                                if (strVal != null) key to strVal else null
                            }
                            ?.toMap()
                            ?: emptyMap()

                        scope.launch {
                            handlePushEvent(
                                id = id,
                                event = event,
                                title = title,
                                body = body,
                                data = dataMap
                            )
                        }
                    }

                    else -> {
                        Log.d(TAG, "Unhandled WebSocket frame type: $frameType")
                    }
                }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(code, reason)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                synchronized(stateLock) {
                    if (generation != socketGeneration) return
                    pingJob?.cancel()
                    pingJob = null
                    activeSocket = null
                    _connectionState.value = WsPushState.DISCONNECTED
                    if (!manuallyDisconnected) {
                        scheduleReconnectLocked()
                    }
                }
                Log.i(TAG, "WebSocket closed (code=$code, reason=$reason)")
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                val httpCode = response?.code
                var triggerUnauthorized = false
                synchronized(stateLock) {
                    if (generation != socketGeneration) return
                    pingJob?.cancel()
                    pingJob = null
                    activeSocket = null

                    if (manuallyDisconnected) {
                        _connectionState.value = WsPushState.DISCONNECTED
                        return
                    }

                    if (httpCode == 401) {
                        _connectionState.value = WsPushState.UNAUTHORIZED
                        reconnectJob?.cancel()
                        reconnectJob = null
                        triggerUnauthorized = true
                    } else {
                        _connectionState.value = WsPushState.DISCONNECTED
                        scheduleReconnectLocked()
                    }
                }

                if (triggerUnauthorized) {
                    Log.w(TAG, "WebSocket handshake rejected with HTTP 401 Unauthorized.")
                    scope.launch { onUnauthorized() }
                } else {
                    Log.w(TAG, "WebSocket failure (http=$httpCode): ${t.message}")
                }
            }
        }
    }

    private fun startPingLoopLocked(generation: Long, webSocket: WebSocket) {
        pingJob?.cancel()
        pingJob = scope.launch {
            while (isActive) {
                delay(PING_INTERVAL_MS)
                val shouldSend = synchronized(stateLock) {
                    generation == socketGeneration && !manuallyDisconnected && activeSocket === webSocket
                }
                if (!shouldSend) break
                val sent = runCatching { webSocket.send("ping") }.getOrDefault(false)
                if (!sent) break
            }
        }
    }

    private fun scheduleReconnectLocked() {
        if (manuallyDisconnected || !preferencesManager.isLoggedIn()) return
        if (_connectionState.value == WsPushState.UNAUTHORIZED) return

        val delayMs = BACKOFF_DELAYS_MS[reconnectAttempt.coerceAtMost(BACKOFF_DELAYS_MS.lastIndex)]
        reconnectAttempt++
        reconnectJob?.cancel()
        reconnectJob = scope.launch {
            Log.d(TAG, "Scheduling WebSocket reconnect in ${delayMs}ms (attempt=$reconnectAttempt)")
            delay(delayMs)
            synchronized(stateLock) {
                if (!manuallyDisconnected &&
                    preferencesManager.isLoggedIn() &&
                    activeSocket == null &&
                    _connectionState.value != WsPushState.UNAUTHORIZED
                ) {
                    openWebSocketLocked()
                }
            }
        }
    }

    private suspend fun handlePushEvent(
        id: String,
        event: String,
        title: String?,
        body: String?,
        data: Map<String, String>
    ) {
        val trxIdFromData = data["trxId"]?.trim().orEmpty()
        when {
            event == "payment.verified" || trxIdFromData.isNotBlank() -> {
                val orderId = (data["orderId"] ?: data["externalOrderId"]).orEmpty().trim()
                val amount = data["amount"].orEmpty().trim()
                val provider = data["provider"]?.trim()?.takeIf { it.isNotBlank() } ?: "MFS"

                if (trxIdFromData.isNotBlank()) {
                    try {
                        val updatedRows = OrbitDatabase.getDatabase(appContext)
                            .smsDao()
                            .markVerifiedByTrxId(
                                trxId = trxIdFromData,
                                externalOrderId = orderId
                            )
                        Log.i(
                            TAG,
                            "WS verified TrxID $trxIdFromData in Room DB ($updatedRows rows updated)"
                        )
                    } catch (e: Exception) {
                        Log.e(TAG, "Error updating verified transaction from WS: ${e.message}", e)
                    }

                    val notifTitle = title ?: appContext.getString(R.string.core_notif_verified_title, provider)
                    val summary = body ?: "TrxID: $trxIdFromData • Order: $orderId ${if (amount.isNotBlank()) "• ৳$amount" else ""}".trim()
                    val expanded = body ?: appContext.getString(
                        R.string.core_notif_verified_body,
                        orderId.ifBlank { "-" },
                        provider,
                        trxIdFromData,
                        amount.ifBlank { "0" }
                    )
                    postAlertNotification(
                        requestCode = trxIdFromData.hashCode(),
                        title = notifTitle,
                        summary = summary,
                        expanded = expanded
                    )
                } else if (!title.isNullOrBlank() || !body.isNullOrBlank()) {
                    val key = id.ifBlank { System.currentTimeMillis().toString() }
                    postAlertNotification(
                        requestCode = ("push_$key").hashCode(),
                        title = title ?: appContext.getString(R.string.app_name),
                        summary = body.orEmpty(),
                        expanded = body.orEmpty()
                    )
                }
            }

            event == "order.created" || event == "order.action_required" -> {
                val orderId = (data["externalOrderId"] ?: data["orderId"]).orEmpty().trim()
                val shouldNotify = if (orderId.isNotBlank()) {
                    preferencesManager.markOrderSeen(orderId)
                } else {
                    true
                }
                if (!shouldNotify) {
                    Log.d(TAG, "Skipping duplicate WS order alert for #$orderId")
                    return
                }

                val paymentMethod = (data["paymentMethod"] ?: data["method"] ?: "COD").uppercase()
                val amount = (data["amount"] ?: data["baseAmount"]).orEmpty().trim()
                val customerName = data["customerName"].orEmpty().trim()

                val prefix = if (event == "order.action_required") {
                    appContext.getString(R.string.core_notif_action_required_prefix, paymentMethod)
                } else {
                    appContext.getString(R.string.core_notif_new_order_prefix, paymentMethod)
                }

                val notifTitle = title ?: buildString {
                    append(prefix)
                    if (orderId.isNotBlank()) append(" #$orderId")
                    if (amount.isNotBlank()) append(" • ৳$amount")
                }

                val notifBody = body ?: buildString {
                    append(appContext.getString(R.string.core_notif_order_tap_review))
                    if (orderId.isNotBlank()) append(" #$orderId")
                    if (customerName.isNotBlank()) append(" ($customerName)")
                    append(".")
                }

                val key = orderId.ifBlank { id.ifBlank { System.currentTimeMillis().toString() } }
                postAlertNotification(
                    requestCode = ("order_$key").hashCode(),
                    title = notifTitle,
                    summary = notifBody,
                    expanded = notifBody
                )
            }

            !title.isNullOrBlank() || !body.isNullOrBlank() -> {
                val key = id.ifBlank { System.currentTimeMillis().toString() }
                postAlertNotification(
                    requestCode = ("push_$key").hashCode(),
                    title = title ?: appContext.getString(R.string.app_name),
                    summary = body.orEmpty(),
                    expanded = body.orEmpty()
                )
            }
        }
    }

    private fun postAlertNotification(
        requestCode: Int,
        title: String,
        summary: String,
        expanded: String
    ) {
        val openAppIntent = Intent(appContext, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            appContext,
            requestCode,
            openAppIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val notification = NotificationCompat.Builder(appContext, OrbitApplication.ORBIT_ALERT_CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_orbit)
            .setContentTitle(title)
            .setContentText(summary)
            .setStyle(NotificationCompat.BigTextStyle().bigText(expanded))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        try {
            val nm = appContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(requestCode, notification)
        } catch (se: SecurityException) {
            Log.w(TAG, "Notification permission missing: ${se.message}")
        }
    }

    companion object {
        private const val TAG = "PushWebSocketClient"
        private const val USER_AGENT = "OrbitPay-Android/1.0.0"
        private const val PING_INTERVAL_MS = 45_000L
        private val BACKOFF_DELAYS_MS = longArrayOf(2_000L, 4_000L, 8_000L, 16_000L, 30_000L, 60_000L)

        private val _connectionState = MutableStateFlow(WsPushState.DISCONNECTED)
        val connectionState: StateFlow<WsPushState> = _connectionState.asStateFlow()

        private val _lastPushReceivedAt = MutableStateFlow(0L)
        val lastPushReceivedAt: StateFlow<Long> = _lastPushReceivedAt.asStateFlow()
    }
}
