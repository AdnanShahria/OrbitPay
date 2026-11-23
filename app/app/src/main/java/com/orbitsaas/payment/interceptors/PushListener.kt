package com.orbitsaas.payment.interceptors

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.orbitsaas.payment.data.local.OrbitDatabase
import com.orbitsaas.payment.data.local.PreferencesManager
import com.orbitsaas.payment.data.local.SmsEntity
import com.orbitsaas.payment.interceptors.parsers.MfsParser
import com.orbitsaas.payment.service.SyncWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Secondary ingestion listener capturing notifications from official MFS apps
 * (bKash, Nagad, Rocket, Upay) to bypass telecom SMS delays over Wi-Fi / LTE.
 */
class PushListener : NotificationListenerService() {

    private val serviceScope = CoroutineScope(Dispatchers.IO)

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        super.onNotificationPosted(sbn)
        if (sbn == null) return

        val packageName = sbn.packageName ?: return

        // Target MFS official application packages
        val isMfsApp = packageName in SUPPORTED_MFS_PACKAGES ||
                packageName.contains("bkash", ignoreCase = true) ||
                packageName.contains("nagad", ignoreCase = true) ||
                packageName.contains("rocket", ignoreCase = true)

        if (!isMfsApp) return

        val extras = sbn.notification?.extras ?: return
        val title = extras.getString(Notification.EXTRA_TITLE) ?: ""
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString() ?: ""

        val combinedContent = "$title $text $bigText".trim()
        Log.d(TAG, "Notification received from [$packageName]: $combinedContent")

        val parsed = MfsParser.parse(combinedContent, packageName)
        if (parsed != null) {
            Log.i(TAG, "Push parsed: Provider=${parsed.provider}, TrxID=${parsed.trxId}, Amount=${parsed.amount}")

            serviceScope.launch {
                try {
                    val prefs = PreferencesManager(applicationContext)
                    if (!prefs.isLoggedIn()) {
                        Log.d(TAG, "Ignoring MFS notification while signed out.")
                        return@launch
                    }
                    val database = OrbitDatabase.getDatabase(applicationContext)

                    val entity = SmsEntity(
                        merchantId = prefs.merchantId,
                        provider = parsed.provider,
                        trxId = parsed.trxId,
                        amount = parsed.amount,
                        senderNumber = parsed.senderNumber,
                        rawSms = combinedContent,
                        status = SmsEntity.STATUS_PENDING_UPLOAD,
                        receivedAt = System.currentTimeMillis()
                    )

                    val rowId = database.smsDao().insertSms(entity)
                    if (rowId > 0) {
                        Log.d(TAG, "Push notification saved to Room DB. Enqueuing sync worker.")
                        SyncWorker.enqueueImmediateSync(applicationContext)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error saving push transaction: ${e.message}", e)
                }
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

        private val SUPPORTED_MFS_PACKAGES = setOf(
            "com.bkash.customerapp",
            "com.bkash.merchantapp",
            "com.konasl.nagad",
            "com.konasl.nagad.merchant",
            "com.dbbl.mbb.rocket",
            "bd.com.upay.customer",
            "com.ibbl.cellfin"
        )
    }
}
