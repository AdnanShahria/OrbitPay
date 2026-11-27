package com.orbitsaas.payment.service

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationCompat
import com.orbitsaas.payment.OrbitApplication
import com.orbitsaas.payment.R
import com.orbitsaas.payment.data.local.PreferencesManager
import com.orbitsaas.payment.data.remote.OrbitApiClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Handles inline notification action button taps (`Approve`, `Reject`, or dynamic server-driven
 * webhook actions) in background coroutine work via [goAsync].
 */
class PaymentActionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action != ACTION_TRIGGER_DYNAMIC && action != ACTION_RESOLVE_PAYMENT) return

        val appContext = context.applicationContext
        val intentId = intent.getStringExtra(EXTRA_INTENT_ID)?.trim().orEmpty()
        val externalRefId = intent.getStringExtra(EXTRA_EXTERNAL_REF_ID)?.trim().orEmpty()
        val notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, 0)
        if (intentId.isBlank()) return

        val pendingResult = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                val prefs = PreferencesManager(appContext)
                if (!prefs.isLoggedIn()) {
                    Log.w(TAG, "Ignoring notification action while signed out.")
                    return@launch
                }

                val apiClient = OrbitApiClient(prefs)
                val refLabel = externalRefId.ifBlank { intentId }

                when (action) {
                    ACTION_TRIGGER_DYNAMIC -> {
                        val actionId = intent.getStringExtra(EXTRA_ACTION_ID)?.trim().orEmpty()
                        val actionLabel = intent.getStringExtra(EXTRA_ACTION_LABEL)?.trim().orEmpty()
                            .ifBlank { actionId }
                        if (actionId.isBlank()) return@launch

                        val res = apiClient.triggerPaymentAction(
                            intentId = intentId,
                            actionId = actionId
                        )
                        res.onSuccess { data ->
                            val suffix = if (data.webhookDispatched) " • Webhook dispatched" else ""
                            postOutcomeStatusNotification(
                                context = appContext,
                                notificationId = notificationId,
                                title = appContext.getString(R.string.notif_action_result_title),
                                body = "$actionLabel ($refLabel)$suffix"
                            )
                            DynamicPushDispatcher.notifyRefreshNeeded("action:$actionId")
                        }.onFailure { err ->
                            postOutcomeStatusNotification(
                                context = appContext,
                                notificationId = notificationId,
                                title = appContext.getString(R.string.notif_action_failed_title),
                                body = "$actionLabel ($refLabel): ${err.message ?: "Error"}"
                            )
                        }
                    }

                    ACTION_RESOLVE_PAYMENT -> {
                        val decision = intent.getStringExtra(EXTRA_DECISION)?.trim()?.uppercase().orEmpty()
                        if (decision !in setOf("APPROVE", "REJECT")) return@launch

                        val res = apiClient.resolvePaymentIntent(
                            intentId = intentId,
                            decision = decision
                        )
                        res.onSuccess {
                            val label = if (decision == "APPROVE") {
                                appContext.getString(R.string.notif_action_approve)
                            } else {
                                appContext.getString(R.string.notif_action_reject)
                            }
                            postOutcomeStatusNotification(
                                context = appContext,
                                notificationId = notificationId,
                                title = appContext.getString(R.string.notif_action_result_title),
                                body = "$label • $refLabel"
                            )
                            DynamicPushDispatcher.notifyRefreshNeeded("resolve:$decision")
                        }.onFailure { err ->
                            postOutcomeStatusNotification(
                                context = appContext,
                                notificationId = notificationId,
                                title = appContext.getString(R.string.notif_action_failed_title),
                                body = "$decision ($refLabel): ${err.message ?: "Error"}"
                            )
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error handling notification action: ${e.message}", e)
            } finally {
                pendingResult.finish()
            }
        }
    }

    private fun postOutcomeStatusNotification(
        context: Context,
        notificationId: Int,
        title: String,
        body: String
    ) {
        val targetId = if (notificationId != 0) notificationId else System.currentTimeMillis().toInt()
        val notification = NotificationCompat.Builder(context, OrbitApplication.ORBIT_PAYMENTS_STATUS_CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_orbit)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setAutoCancel(true)
            .build()

        try {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(targetId, notification)
        } catch (se: SecurityException) {
            Log.w(TAG, "Notification permission missing: ${se.message}")
        }
    }

    companion object {
        private const val TAG = "PaymentActionReceiver"
        const val ACTION_TRIGGER_DYNAMIC = "com.orbitsaas.payment.action.TRIGGER_DYNAMIC_PAYMENT_ACTION"
        const val ACTION_RESOLVE_PAYMENT = "com.orbitsaas.payment.action.RESOLVE_PAYMENT_INTENT"

        const val EXTRA_INTENT_ID = "extra_intent_id"
        const val EXTRA_EXTERNAL_REF_ID = "extra_external_ref_id"
        const val EXTRA_ACTION_ID = "extra_action_id"
        const val EXTRA_ACTION_LABEL = "extra_action_label"
        const val EXTRA_DECISION = "extra_decision"
        const val EXTRA_NOTIFICATION_ID = "extra_notification_id"

        fun createTriggerActionPendingIntent(
            context: Context,
            requestCode: Int,
            notificationId: Int,
            intentId: String,
            externalRefId: String,
            actionId: String,
            actionLabel: String
        ): PendingIntent {
            val intent = Intent(context, PaymentActionReceiver::class.java).apply {
                action = ACTION_TRIGGER_DYNAMIC
                putExtra(EXTRA_INTENT_ID, intentId)
                putExtra(EXTRA_EXTERNAL_REF_ID, externalRefId)
                putExtra(EXTRA_ACTION_ID, actionId)
                putExtra(EXTRA_ACTION_LABEL, actionLabel)
                putExtra(EXTRA_NOTIFICATION_ID, notificationId)
            }
            return PendingIntent.getBroadcast(
                context,
                requestCode,
                intent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
        }

        fun createResolvePendingIntent(
            context: Context,
            requestCode: Int,
            notificationId: Int,
            intentId: String,
            externalRefId: String,
            decision: String
        ): PendingIntent {
            val intent = Intent(context, PaymentActionReceiver::class.java).apply {
                action = ACTION_RESOLVE_PAYMENT
                putExtra(EXTRA_INTENT_ID, intentId)
                putExtra(EXTRA_EXTERNAL_REF_ID, externalRefId)
                putExtra(EXTRA_DECISION, decision)
                putExtra(EXTRA_NOTIFICATION_ID, notificationId)
            }
            return PendingIntent.getBroadcast(
                context,
                requestCode,
                intent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
        }
    }
}
