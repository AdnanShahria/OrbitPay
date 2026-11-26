package com.orbitsaas.payment.service

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.orbitsaas.payment.OrbitApplication
import com.orbitsaas.payment.R
import com.orbitsaas.payment.data.local.OrbitDatabase
import com.orbitsaas.payment.data.local.PreferencesManager
import com.orbitsaas.payment.data.remote.MerchantOrderDto
import com.orbitsaas.payment.data.remote.OrbitApiClient
import com.orbitsaas.payment.data.remote.UnauthorizedException
import com.orbitsaas.payment.ui.MainActivity
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Sticky Foreground Service ensuring persistent background execution,
 * self-hosted WebSocket instant push, and adaptive incremental /sync polling fallback.
 */
class StickyForegroundService : Service() {

    private var wakeLock: PowerManager.WakeLock? = null
    private lateinit var preferencesManager: PreferencesManager
    private lateinit var apiClient: OrbitApiClient
    private lateinit var pushWebSocketClient: PushWebSocketClient

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var pollingJob: Job? = null
    private var wsObserverJob: Job? = null
    private val syncMutex = Mutex()
    private val stoppingUnauthorized = AtomicBoolean(false)

    override fun onCreate() {
        super.onCreate()
        preferencesManager = PreferencesManager(this)
        apiClient = OrbitApiClient(preferencesManager)
        pushWebSocketClient = PushWebSocketClient(
            context = this,
            preferencesManager = preferencesManager,
            scope = serviceScope,
            onConnected = { triggerCatchUpSync() },
            onUnauthorized = { handleUnauthorizedAndStop() }
        )
        acquireWakeLock()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP_SERVICE) {
            pollingJob?.cancel()
            wsObserverJob?.cancel()
            pushWebSocketClient.disconnect()
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }

        stoppingUnauthorized.set(false)
        val notification = createForegroundNotification()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        if (intent?.action == ACTION_RECONNECT_WS) {
            pushWebSocketClient.reconnectNow()
        } else {
            pushWebSocketClient.connectIfReady()
        }

        observeWebSocketState()
        startPollingLoopIfNeeded()
        Log.i(TAG, "StickyForegroundService started in foreground.")
        return START_STICKY
    }

    override fun onDestroy() {
        pollingJob?.cancel()
        wsObserverJob?.cancel()
        pushWebSocketClient.disconnect()
        serviceScope.cancel()
        releaseWakeLock()
        super.onDestroy()
        Log.i(TAG, "StickyForegroundService destroyed.")
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun observeWebSocketState() {
        if (wsObserverJob?.isActive == true) return
        wsObserverJob = serviceScope.launch {
            PushWebSocketClient.connectionState
                .drop(1)
                .collect {
                    updateForegroundNotification()
                }
        }
    }

    private fun triggerCatchUpSync() {
        serviceScope.launch {
            try {
                performIncrementalSync()
            } catch (ce: CancellationException) {
                throw ce
            } catch (e: Exception) {
                Log.w(TAG, "Catch-up sync after WebSocket connect failed: ${e.message}")
            }
        }
    }

    private fun startPollingLoopIfNeeded() {
        if (pollingJob?.isActive == true) return
        pollingJob = serviceScope.launch {
            while (isActive) {
                try {
                    performIncrementalSync()
                } catch (ce: CancellationException) {
                    throw ce
                } catch (e: Exception) {
                    Log.w(TAG, "Error in polling fallback loop: ${e.message}")
                }

                val intervalMs = if (
                    PushWebSocketClient.connectionState.value != WsPushState.CONNECTED &&
                    !FcmTokenRegistrar.isFirebaseAvailable(this@StickyForegroundService)
                ) {
                    POLL_INTERVAL_NO_FCM_MS
                } else {
                    POLL_INTERVAL_WITH_FCM_MS
                }

                delay(intervalMs)
            }
        }
    }

    private suspend fun performIncrementalSync() {
        if (!preferencesManager.isLoggedIn()) return
        syncMutex.withLock {
            if (!preferencesManager.isLoggedIn()) return
            val since = preferencesManager.lastSyncAt.takeIf { it > 0L }
            val result = apiClient.syncSince(since)
            result.onSuccess { syncData ->
                val db = OrbitDatabase.getDatabase(this@StickyForegroundService)
                for (event in syncData.verified) {
                    if (event.trxId.isNotBlank()) {
                        db.smsDao().markVerifiedByTrxId(
                            trxId = event.trxId,
                            externalOrderId = event.externalOrderId
                        )
                    }
                }

                for (order in syncData.orders) {
                    if (order.externalOrderId.isNotBlank() &&
                        preferencesManager.markOrderSeen(order.externalOrderId)
                    ) {
                        notifyUnseenOrder(order)
                    }
                }

                if (syncData.serverTime > 0L) {
                    preferencesManager.lastSyncAt = syncData.serverTime
                }
            }.onFailure { err ->
                if (err is UnauthorizedException) {
                    handleUnauthorizedAndStop()
                } else {
                    Log.d(TAG, "Incremental sync failed: ${err.message}")
                }
            }
        }
    }

    private fun handleUnauthorizedAndStop() {
        if (!stoppingUnauthorized.compareAndSet(false, true)) return
        Log.w(TAG, "Received 401 Unauthorized; clearing auth session and stopping.")
        pollingJob?.cancel()
        wsObserverJob?.cancel()
        preferencesManager.clearAuthSession()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun notifyUnseenOrder(order: MerchantOrderDto) {
        val openAppIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val requestCode = ("sync_order_${order.externalOrderId}").hashCode()
        val pendingIntent = PendingIntent.getActivity(
            this,
            requestCode,
            openAppIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val title = getString(
            R.string.core_notif_new_order_title,
            order.paymentMethod.uppercase(),
            order.externalOrderId
        )
        val body = getString(
            R.string.core_notif_new_order_body,
            String.format("%.0f", order.baseAmount)
        )

        val notification = NotificationCompat.Builder(this, OrbitApplication.ORBIT_ALERT_CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_orbit)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        try {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(requestCode, notification)
        } catch (se: SecurityException) {
            Log.w(TAG, "Notification permission missing: ${se.message}")
        }
    }

    private fun acquireWakeLock() {
        try {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "OrbitPay::StickySyncWakeLock"
            ).apply {
                setReferenceCounted(false)
                acquire(10 * 60 * 1000L) // 10 minutes rolling timeout
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to acquire WakeLock: ${e.message}")
        }
    }

    private fun releaseWakeLock() {
        try {
            wakeLock?.let {
                if (it.isHeld) it.release()
            }
            wakeLock = null
        } catch (e: Exception) {
            Log.w(TAG, "Error releasing WakeLock: ${e.message}")
        }
    }

    private fun updateForegroundNotification() {
        try {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(NOTIFICATION_ID, createForegroundNotification())
        } catch (se: SecurityException) {
            Log.w(TAG, "Notification permission missing: ${se.message}")
        } catch (e: Exception) {
            Log.w(TAG, "Unable to update foreground notification: ${e.message}")
        }
    }

    private fun createForegroundNotification(): Notification {
        val openAppIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            openAppIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val merchantName = preferencesManager.merchantId.ifBlank {
            getString(R.string.core_fg_merchant_fallback)
        }
        val statusText = if (PushWebSocketClient.connectionState.value == WsPushState.CONNECTED) {
            getString(R.string.core_fg_instant_push_active, merchantName)
        } else {
            getString(R.string.core_fg_polling_fallback, merchantName)
        }

        return NotificationCompat.Builder(this, OrbitApplication.ORBIT_SYNC_CHANNEL)
            .setContentTitle(getString(R.string.foreground_service_title))
            .setContentText(statusText)
            .setSmallIcon(R.drawable.ic_stat_orbit)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    companion object {
        private const val TAG = "StickyForegroundService"
        private const val NOTIFICATION_ID = 1001
        private const val POLL_INTERVAL_NO_FCM_MS = 60_000L
        private const val POLL_INTERVAL_WITH_FCM_MS = 300_000L

        const val ACTION_START_SERVICE = "com.orbitsaas.payment.action.START_SERVICE"
        const val ACTION_STOP_SERVICE = "com.orbitsaas.payment.action.STOP_SERVICE"
        const val ACTION_RECONNECT_WS = "com.orbitsaas.payment.action.RECONNECT_WS"

        fun startService(context: Context) {
            val intent = Intent(context, StickyForegroundService::class.java).apply {
                action = ACTION_START_SERVICE
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun reconnectWebSocket(context: Context) {
            val intent = Intent(context, StickyForegroundService::class.java).apply {
                action = ACTION_RECONNECT_WS
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stopService(context: Context) {
            val intent = Intent(context, StickyForegroundService::class.java).apply {
                action = ACTION_STOP_SERVICE
            }
            context.startService(intent)
        }
    }
}
