package com.orbitsaas.payment.service

import android.content.Context
import android.os.BatteryManager
import android.util.Log
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.orbitsaas.payment.OrbitApplication
import com.orbitsaas.payment.data.local.OrbitDatabase
import com.orbitsaas.payment.data.local.PreferencesManager
import com.orbitsaas.payment.data.remote.IngestSmsItem
import com.orbitsaas.payment.data.remote.OrbitApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Robust background sync worker for ingesting offline MFS transactions
 * to the ORBIT SaaS Central Hub.
 */
class SyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    private val database = OrbitDatabase.getDatabase(appContext)
    private val preferencesManager = PreferencesManager(appContext)
    private val apiClient = OrbitApiClient(preferencesManager)

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        if (!preferencesManager.isConfigured()) {
            Log.w(TAG, "Device not configured with merchantId & deviceKey. Skipping sync.")
            return@withContext Result.success()
        }

        try {
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
                        receivedAt = entity.receivedAt
                    )
                }

                val result = apiClient.ingestBatch(ingestItems)
                if (result.isSuccess) {
                    val response = result.getOrThrow()
                    val uploadedIds = pendingUploads.map { it.id }
                    database.smsDao().markUploaded(uploadedIds)
                    Log.i(TAG, "Successfully ingested ${ingestItems.size} transactions. Auto-verified: ${response.autoVerifiedCount}")
                } else {
                    Log.e(TAG, "Ingest failed: ${result.exceptionOrNull()?.message}")
                    if (runAttemptCount < 5) {
                        return@withContext Result.retry()
                    }
                }
            }

            // Sync stats & heartbeat
            try {
                apiClient.fetchStats()
                sendDeviceHeartbeat()
            } catch (e: Exception) {
                Log.w(TAG, "Stats / heartbeat update error: ${e.message}")
            }

            Result.success()
        } catch (e: Exception) {
            Log.e(TAG, "SyncWorker error: ${e.message}", e)
            if (runAttemptCount < 3) Result.retry() else Result.failure()
        }
    }

    private suspend fun sendDeviceHeartbeat() {
        val batteryStatus = applicationContext.registerReceiver(null, android.content.IntentFilter(android.content.Intent.ACTION_BATTERY_CHANGED))
        val level = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val batteryPct = if (level >= 0 && scale > 0) (level * 100 / scale) else 100

        val status = batteryStatus?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL

        apiClient.sendHeartbeat(batteryPct, isCharging)
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
