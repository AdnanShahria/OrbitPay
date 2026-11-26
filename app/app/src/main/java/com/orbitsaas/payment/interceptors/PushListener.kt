package com.orbitsaas.payment.interceptors

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.orbitsaas.payment.data.local.BlockedMessageEntity
import com.orbitsaas.payment.data.local.OrbitDatabase
import com.orbitsaas.payment.data.local.PreferencesManager
import com.orbitsaas.payment.data.local.SmsEntity
import com.orbitsaas.payment.interceptors.parsers.MfsParser
import com.orbitsaas.payment.interceptors.parsers.ParseOutcome
import com.orbitsaas.payment.service.SyncWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Secondary ingestion listener capturing notifications from exact trusted MFS app packages
 * (bKash, Nagad, Rocket, Upay, CellFin) to bypass telecom SMS delays over Wi-Fi / LTE.
 */
class PushListener : NotificationListenerService() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        super.onNotificationPosted(sbn)
        if (sbn == null) return

        val packageName = sbn.packageName ?: return
        if (!SenderTrust.isTrustedPackage(packageName)) return

        val extras = sbn.notification?.extras ?: return
        val title = extras.getString(Notification.EXTRA_TITLE) ?: ""
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString() ?: ""

        val combinedContent = listOf(title, text, bigText)
            .filter { it.isNotBlank() }
            .distinct()
            .joinToString(" ")
            .trim()
        if (combinedContent.isEmpty()) return

        Log.d(TAG, "Notification received from [$packageName]: $combinedContent")

        serviceScope.launch {
            try {
                val prefs = PreferencesManager(applicationContext)
                if (!prefs.isLoggedIn()) {
                    Log.d(TAG, "Ignoring MFS notification while signed out.")
                    return@launch
                }

                val database = OrbitDatabase.getDatabase(applicationContext)
                when (
                    val outcome = MfsParser.parse(
                        rawText = combinedContent,
                        sender = packageName,
                        source = SmsEntity.SOURCE_NOTIFICATION,
                        extraTrustedSenders = prefs.extraTrustedSenders
                    )
                ) {
                    is ParseOutcome.Accepted -> {
                        val parsed = outcome.transaction
                        Log.i(TAG, "Push parsed: Provider=${parsed.provider}, TrxID=${parsed.trxId}, Amount=${parsed.amount}")

                        val entity = SmsEntity(
                            merchantId = prefs.merchantId,
                            provider = parsed.provider,
                            trxId = parsed.trxId,
                            amount = parsed.amount,
                            senderNumber = parsed.senderNumber,
                            rawSms = combinedContent,
                            status = SmsEntity.STATUS_PENDING_UPLOAD,
                            receivedAt = System.currentTimeMillis(),
                            smsSender = packageName,
                            source = SmsEntity.SOURCE_NOTIFICATION
                        )

                        val rowId = database.smsDao().insertSms(entity)
                        if (rowId > 0) {
                            Log.d(TAG, "Push notification saved to Room DB. Enqueuing sync worker.")
                            SyncWorker.enqueueImmediateSync(applicationContext)
                        }
                    }

                    is ParseOutcome.Rejected -> {
                        Log.w(TAG, "Blocked push notification from [$packageName]: ${outcome.reason}")
                        database.blockedMessageDao().insert(
                            BlockedMessageEntity(
                                sender = packageName,
                                body = combinedContent.take(MAX_BLOCKED_BODY_LEN),
                                reason = outcome.reason,
                                source = SmsEntity.SOURCE_NOTIFICATION,
                                receivedAt = System.currentTimeMillis()
                            )
                        )
                    }

                    is ParseOutcome.NotPayment -> Unit
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error saving push transaction: ${e.message}", e)
            }
        }
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        Log.i(TAG, "ORBIT Notification Listener Connected and active.")
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        Log.w(TAG, "ORBIT Notification Listener Disconnected.")
    }

    companion object {
        private const val TAG = "PushListener"
        private const val MAX_BLOCKED_BODY_LEN = 500
    }
}
