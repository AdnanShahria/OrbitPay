package com.orbitsaas.payment

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.util.Log
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.orbitsaas.payment.data.local.OrbitDatabase
import com.orbitsaas.payment.data.local.PreferencesManager
import com.orbitsaas.payment.data.remote.OrbitApiClient
import com.orbitsaas.payment.service.FcmTokenRegistrar
import com.orbitsaas.payment.service.StickyForegroundService
import com.orbitsaas.payment.service.SyncWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.util.concurrent.TimeUnit

class OrbitApplication : Application() {

    val database: OrbitDatabase by lazy { OrbitDatabase.getDatabase(this) }
    val preferencesManager: PreferencesManager by lazy { PreferencesManager(this) }
    val apiClient: OrbitApiClient by lazy { OrbitApiClient(preferencesManager) }

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()
        instance = this

        createNotificationChannels()
        setupPeriodicSyncWorker()

        appScope.launch {
            FcmTokenRegistrar.refreshToken(this@OrbitApplication)
        }

        // Auto-start sticky foreground service if merchant has configured the device
        if (preferencesManager.isForegroundServiceEnabled && preferencesManager.isConfigured()) {
            try {
                StickyForegroundService.startService(this)
            } catch (e: Exception) {
                Log.w(TAG, "Unable to auto-start foreground service on app launch: ${e.message}")
            }
        }
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            // 1. Sync Channel (Low importance, persistent foreground notification)
            val syncChannel = NotificationChannel(
                ORBIT_SYNC_CHANNEL,
                getString(R.string.sync_channel_name),
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = getString(R.string.sync_channel_desc)
                setShowBadge(false)
            }

            // 2. Alert Channel (High importance, payment verified heads-up notification)
            val alertChannel = NotificationChannel(
                ORBIT_ALERT_CHANNEL,
                getString(R.string.alert_channel_name),
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = getString(R.string.alert_channel_desc)
                enableVibration(true)
                setShowBadge(true)
            }

            notificationManager.createNotificationChannels(listOf(syncChannel, alertChannel))
            Log.d(TAG, "Notification channels registered successfully.")
        }
    }

    private fun setupPeriodicSyncWorker() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val periodicSyncRequest = PeriodicWorkRequestBuilder<SyncWorker>(
            15, TimeUnit.MINUTES,
            5, TimeUnit.MINUTES // Flex interval
        )
            .setConstraints(constraints)
            .build()

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            SyncWorker.UNIQUE_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            periodicSyncRequest
        )
        Log.d(TAG, "Periodic WorkManager sync configured (15m interval).")
    }

    companion object {
        private const val TAG = "OrbitApplication"

        const val ORBIT_SYNC_CHANNEL = "orbit_sync_channel"
        const val ORBIT_ALERT_CHANNEL = "orbit_alert_channel"

        lateinit var instance: OrbitApplication
            private set
    }
}
