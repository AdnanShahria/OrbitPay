package com.orbitsaas.payment.service

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.orbitsaas.payment.OrbitApplication
import com.orbitsaas.payment.R
import com.orbitsaas.payment.data.local.OrbitDatabase
import com.orbitsaas.payment.data.local.PreferencesManager
import com.orbitsaas.payment.ui.MainActivity
import com.orbitsaas.payment.update.AppUpdateManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Handles Firebase Cloud Messaging data-only and notification payloads sent from ORBIT Central Hub.
 * Triggers instant two-way status updates for MFS payment verification and store order alerts.
 */
class FcmService : FirebaseMessagingService() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.i(TAG, "New FCM Token received.")
        val prefs = PreferencesManager(applicationContext)
        prefs.fcmToken = token

        // Enqueue sync to report new token to backend
        SyncWorker.enqueueImmediateSync(applicationContext)
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        Log.d(TAG, "FCM Message received from: ${remoteMessage.from}")

        val data = remoteMessage.data
        val eventType = data["event"] ?: data["eventType"] ?: data["type"]
        val notifTitle = remoteMessage.notification?.title ?: data["title"]?.takeIf { it.isNotBlank() }
        val notifBody = remoteMessage.notification?.body ?: data["body"]?.takeIf { it.isNotBlank() }

        when {
            eventType == "app.update_available" -> {
                Log.i(TAG, "Received app.update_available via FCM; triggering background update check.")
                serviceScope.launch {
                    AppUpdateManager.checkForUpdates(
                        context = applicationContext,
                        userInitiated = false,
                        autoDownload = true,
                        forceCheck = true
                    )
                }
            }

            eventType == "order.created" || eventType == "order.action_required" -> {
                val orderId = data["externalOrderId"] ?: data["orderId"] ?: ""
                val paymentMethod = (data["paymentMethod"] ?: data["method"] ?: "COD").uppercase()
                val amount = data["amount"] ?: data["baseAmount"] ?: ""
                val customerName = data["customerName"] ?: ""

                val prefix = if (eventType == "order.action_required") {
                    getString(R.string.core_notif_action_required_prefix, paymentMethod)
                } else {
                    getString(R.string.core_notif_new_order_prefix, paymentMethod)
                }

                val title = notifTitle ?: buildString {
                    append(prefix)
                    if (orderId.isNotBlank()) append(" #$orderId")
                    if (amount.isNotBlank()) append(" • ৳$amount")
                }

                val body = notifBody ?: buildString {
                    append(getString(R.string.core_notif_order_tap_review))
                    if (orderId.isNotBlank()) append(" #$orderId")
                    if (customerName.isNotBlank()) append(" ($customerName)")
                    append(".")
                }

                if (orderId.isNotBlank()) {
                    PreferencesManager(applicationContext).markOrderSeen(orderId)
                }

                showOrderNotification(
                    notificationKey = orderId.ifBlank { System.currentTimeMillis().toString() },
                    title = title,
                    body = body
                )
            }

            eventType == "payment.verified" || data.containsKey("trxId") -> {
                val trxId = data["trxId"] ?: ""
                val orderId = data["orderId"] ?: data["externalOrderId"] ?: ""
                val amount = data["amount"] ?: ""
                val provider = data["provider"] ?: "MFS"

                if (trxId.isNotBlank()) {
                    serviceScope.launch {
                        try {
                            val database = OrbitDatabase.getDatabase(applicationContext)
                            val updatedRows = database.smsDao().markVerifiedByTrxId(
                                trxId = trxId,
                                externalOrderId = orderId
                            )
                            Log.i(TAG, "Marked transaction $trxId as VERIFIED in Room DB ($updatedRows rows updated)")

                            showVerifiedNotification(
                                trxId = trxId,
                                orderId = orderId,
                                amount = amount,
                                provider = provider,
                                titleOverride = notifTitle,
                                bodyOverride = notifBody
                            )
                        } catch (e: Exception) {
                            Log.e(TAG, "Error updating verified transaction: ${e.message}", e)
                        }
                    }
                } else if (!notifTitle.isNullOrBlank() || !notifBody.isNullOrBlank()) {
                    showOrderNotification(
                        notificationKey = System.currentTimeMillis().toString(),
                        title = notifTitle ?: getString(R.string.app_name),
                        body = notifBody.orEmpty()
                    )
                }
            }

            !notifTitle.isNullOrBlank() || !notifBody.isNullOrBlank() -> {
                showOrderNotification(
                    notificationKey = data["id"] ?: System.currentTimeMillis().toString(),
                    title = notifTitle ?: getString(R.string.app_name),
                    body = notifBody.orEmpty()
                )
            }
        }
    }

    private fun showOrderNotification(notificationKey: String, title: String, body: String) {
        val openAppIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }

        val requestCode = ("order_$notificationKey").hashCode()
        val pendingIntent = PendingIntent.getActivity(
            this,
            requestCode,
            openAppIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
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
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.notify(requestCode, notification)
        } catch (se: SecurityException) {
            Log.w(TAG, "Notification permission missing: ${se.message}")
        }
    }

    private fun showVerifiedNotification(
        trxId: String,
        orderId: String,
        amount: String,
        provider: String,
        titleOverride: String? = null,
        bodyOverride: String? = null
    ) {
        val openAppIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            trxId.hashCode(),
            openAppIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val title = titleOverride ?: getString(R.string.core_notif_verified_title, provider)
        val summary = bodyOverride ?: "TrxID: $trxId • Order: $orderId ${if (amount.isNotBlank()) "• ৳$amount" else ""}".trim()
        val expanded = bodyOverride ?: getString(
            R.string.core_notif_verified_body,
            orderId.ifBlank { "-" },
            provider,
            trxId,
            amount.ifBlank { "0" }
        )

        val notification = NotificationCompat.Builder(this, OrbitApplication.ORBIT_ALERT_CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_orbit)
            .setContentTitle(title)
            .setContentText(summary)
            .setStyle(NotificationCompat.BigTextStyle().bigText(expanded))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        try {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.notify(trxId.hashCode(), notification)
        } catch (se: SecurityException) {
            Log.w(TAG, "Notification permission missing: ${se.message}")
        }
    }

    companion object {
        private const val TAG = "FcmService"
    }
}
