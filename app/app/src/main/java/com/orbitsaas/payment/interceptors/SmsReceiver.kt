package com.orbitsaas.payment.interceptors

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
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
 * High-priority SMS BroadcastReceiver intercepting bKash, Nagad, Rocket, Upay, and Cellfin
 * telecom transaction messages.
 */
class SmsReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        if (messages.isNullOrEmpty()) return

        val pendingResult = goAsync()

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val prefs = PreferencesManager(context)
                if (!prefs.isLoggedIn()) {
                    Log.d(TAG, "Ignoring incoming SMS while signed out.")
                    return@launch
                }
                val database = OrbitDatabase.getDatabase(context)

                // Group multi-part SMS messages by originating address
                val messagesBySender = messages.groupBy { it.displayOriginatingAddress ?: it.originatingAddress ?: "Unknown" }

                for ((sender, partList) in messagesBySender) {
                    val fullBody = partList.joinToString(separator = "") { it.displayMessageBody ?: it.messageBody ?: "" }
                    Log.d(TAG, "Incoming SMS from [$sender]: $fullBody")

                    val parsed = MfsParser.parse(fullBody, sender)
                    if (parsed != null) {
                        Log.i(TAG, "MFS Payment Detected! Provider=${parsed.provider}, TrxID=${parsed.trxId}, Amount=${parsed.amount}")

                        val entity = SmsEntity(
                            merchantId = prefs.merchantId,
                            provider = parsed.provider,
                            trxId = parsed.trxId,
                            amount = parsed.amount,
                            senderNumber = parsed.senderNumber,
                            rawSms = fullBody,
                            status = SmsEntity.STATUS_PENDING_UPLOAD,
                            receivedAt = System.currentTimeMillis()
                        )

                        val rowId = database.smsDao().insertSms(entity)
                        if (rowId > 0) {
                            Log.d(TAG, "Saved transaction to Room DB (rowId=$rowId). Triggering immediate sync.")
                            SyncWorker.enqueueImmediateSync(context)
                        } else {
                            Log.w(TAG, "Duplicate or ignored transaction TrxID=${parsed.trxId}")
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error processing incoming SMS: ${e.message}", e)
            } finally {
                pendingResult.finish()
            }
        }
    }

    companion object {
        private const val TAG = "SmsReceiver"
    }
}
