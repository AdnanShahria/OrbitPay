package com.orbitsaas.payment.service

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.orbitsaas.payment.data.local.OrbitDatabase
import com.orbitsaas.payment.data.local.PreferencesManager
import com.orbitsaas.payment.data.remote.IngestSmsItem
import com.orbitsaas.payment.data.remote.OrbitApiClient
import com.orbitsaas.payment.data.remote.UnauthorizedException
import com.orbitsaas.payment.interceptors.InboxScanner
import com.orbitsaas.payment.update.AppUpdateManager
import com.orbitsaas.payment.util.SimSlotReader
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Robust background sync worker for recovering missed inbox SMS, ingesting offline MFS
 * transactions to the ORBIT SaaS Central Hub, and reporting device capability telemetry.
 */
class SyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    private val database = OrbitDatabase.getDatabase(appContext)
    private val preferencesManager = PreferencesManager(appContext)
    private val apiClient = OrbitApiClient(preferencesManager)

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        if (!preferencesManager.isLoggedIn()) {
            Log.w(TAG, "Device not signed in or configured. Skipping sync.")
            return@withContext Result.success()
        }

        try {
            // Recover any missed MFS SMS from device Inbox before uploading pending queue
            InboxScanner.scan(applicationContext)

            val pendingUploads = database.smsDao().getPendingUploads()
            Log.d(TAG, "Pending SMS uploads to ingest: ${pendingUploads.size}")

            if (pendingUploads.isNotEmpty()) {
                val ingestItems = pendingUploads.map { entity ->
                    IngestSmsItem(
                        provider = entity.provider,
                        trxId = entity.trxId,
                        amount = entity.amount,
                        senderNumber = entity.senderNumber,
                        rawSms = entity.rawSms,
                        receivedAt = entity.receivedAt,
                        smsSender = entity.smsSender.ifBlank { null },
                        source = entity.source,
                        simSlotIndex = entity.simSlotIndex,
                        receiverNumber = entity.receiverNumber
                    )
                }

                val result = apiClient.ingestBatch(ingestItems)
                if (result.isSuccess) {
                    val response = result.getOrThrow()
                    val uploadedIds = pendingUploads.map { it.id }
                    database.smsDao().markUploaded(uploadedIds)
                    Log.i(
                        TAG,
                        "Successfully ingested ${ingestItems.size} transactions. Auto-verified: ${response.autoVerifiedCount}, Flagged: ${response.flaggedCount}"
                    )
                } else {
                    val err = result.exceptionOrNull()
                    if (err is UnauthorizedException) {
                        Log.w(TAG, "Background ingest returned 401 Unauthorized; clearing stale session.")
                        preferencesManager.clearAuthSession()
                        StickyForegroundService.stopService(applicationContext)
                        return@withContext Result.failure()
                    }
                    Log.e(TAG, "Ingest failed: ${err?.message}")
                    if (runAttemptCount < 5) {
                        return@withContext Result.retry()
                    }
                }
            }

            // Sync stats & heartbeat
            val statsRes = apiClient.fetchStats()
            if (statsRes.exceptionOrNull() is UnauthorizedException) {
                Log.w(TAG, "Background stats returned 401 Unauthorized; clearing stale session.")
                preferencesManager.clearAuthSession()
                StickyForegroundService.stopService(applicationContext)
                return@withContext Result.failure()
            }

            val hbRes = sendDeviceHeartbeat()
            if (hbRes.exceptionOrNull() is UnauthorizedException) {
                Log.w(TAG, "Background heartbeat returned 401 Unauthorized; clearing stale session.")
                preferencesManager.clearAuthSession()
                StickyForegroundService.stopService(applicationContext)
                return@withContext Result.failure()
            }

            runCatching {
                AppUpdateManager.checkForUpdates(
                    context = applicationContext,
                    userInitiated = false,
                    autoDownload = true,
                    forceCheck = false
                )
            }

            Result.success()
        } catch (e: Exception) {
            Log.e(TAG, "SyncWorker error: ${e.message}", e)
            if (runAttemptCount < 3) Result.retry() else Result.failure()
        }
    }

    private suspend fun sendDeviceHeartbeat() = run {
        val batteryStatus = applicationContext.registerReceiver(
            null,
            IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        )
        val level = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val batteryPct = if (level >= 0 && scale > 0) (level * 100 / scale) else 100

        val status = batteryStatus?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
            status == BatteryManager.BATTERY_STATUS_FULL

        val fcmEnabled = FcmTokenRegistrar.isFirebaseAvailable(applicationContext) &&
            preferencesManager.fcmToken.isNotBlank()
        val smsPermission = ContextCompat.checkSelfPermission(
            applicationContext,
            Manifest.permission.RECEIVE_SMS
        ) == PackageManager.PERMISSION_GRANTED
        val listenerEnabled = NotificationManagerCompat
            .getEnabledListenerPackages(applicationContext)
            .contains(applicationContext.packageName)
        val networkType = detectNetworkType()
        val simSlots = runCatching {
            SimSlotReader.toPreflightSimSlots(
                SimSlotReader.readSimSlots(applicationContext, preferencesManager)
            )
        }.getOrNull()

        apiClient.sendHeartbeat(
            batteryLevel = batteryPct,
            isCharging = isCharging,
            fcmEnabled = fcmEnabled,
            smsPermission = smsPermission,
            listenerEnabled = listenerEnabled,
            networkType = networkType,
            simSlots = simSlots
        )
    }

    private fun detectNetworkType(): String? {
        val cm = applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return null
        val activeNetwork = cm.activeNetwork ?: return null
        val caps = cm.getNetworkCapabilities(activeNetwork) ?: return null
        return when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "WIFI"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "CELLULAR"
            else -> null
        }
    }

    companion object {
        private const val TAG = "SyncWorker"
        const val UNIQUE_WORK_NAME = "orbit_sync_worker"

        /**
         * Enqueues an immediate one-time sync with network constraint.
         */
        fun enqueueImmediateSync(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val syncRequest = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(constraints)
                .build()

            WorkManager.getInstance(context).enqueueUniqueWork(
                "${UNIQUE_WORK_NAME}_immediate",
                ExistingWorkPolicy.REPLACE,
                syncRequest
            )
        }
    }
}
