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
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Handles Firebase Cloud Messaging push payloads sent from ORBIT Central Hub.
 * Triggers instant two-way status updates for MFS payment verification and store order alerts.
 */
class FcmService : FirebaseMessagingService() {

    private val serviceScope = CoroutineScope(Dispatchers.IO)

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.i(TAG, "New FCM Token received: $token")
        val prefs = PreferencesManager(applicationContext)
        prefs.fcmToken = token

        // Enqueue sync to report new token to backend
        SyncWorker.enqueueImmediateSync(applicationContext)
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        Log.d(TAG, "FCM Message received from: ${remoteMessage.from}")

        val data = remoteMessage.data
        val eventType = data["event"] ?: data["eventType"] ?: data["type"] ?: remoteMessage.notification?.title

        when {
            eventType == "order.created" || eventType == "order.action_required" -> {
                val orderId = data["externalOrderId"] ?: data["orderId"] ?: ""
                val paymentMethod = (data["paymentMethod"] ?: data["method"] ?: "COD").uppercase()
                val amount = data["amount"] ?: data["baseAmount"] ?: ""
                val customerName = data["customerName"] ?: ""

                val prefix = if (eventType == "order.action_required") {
                    "Action Required • $paymentMethod Order"
                } else {
                    "New $paymentMethod Order"
                }

                val title = remoteMessage.notification?.title ?: buildString {
                    append(prefix)
                    if (orderId.isNotBlank()) append(" #$orderId")
                    if (amount.isNotBlank()) append(" • ৳$amount")
                }

                val body = remoteMessage.notification?.body ?: buildString {
                    append("Tap to review and update order")
                    if (orderId.isNotBlank()) append(" #$orderId")
                    if (customerName.isNotBlank()) append(" from $customerName")
                    append(".")
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

                            showVerifiedNotification(trxId, orderId, amount, provider)
                        } catch (e: Exception) {
                            Log.e(TAG, "Error updating verified transaction: ${e.message}", e)
                        }
                    }
                }
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

        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(requestCode, notification)
    }

    private fun showVerifiedNotification(trxId: String, orderId: String, amount: String, provider: String) {
        val openAppIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            trxId.hashCode(),
            openAppIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val notification = NotificationCompat.Builder(this, OrbitApplication.ORBIT_ALERT_CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_orbit)
            .setContentTitle("Payment Verified! • $provider")
            .setContentText("TrxID: $trxId • Order: $orderId ${if (amount.isNotBlank()) "• ৳$amount" else ""}")
            .setStyle(
                NotificationCompat.BigTextStyle()
                    .bigText("Order #$orderId has been successfully matched with $provider transaction $trxId ($amount BDT). Invoice dispatched to buyer.")
            )
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(trxId.hashCode(), notification)
    }

    companion object {
        private const val TAG = "FcmService"
    }
}
