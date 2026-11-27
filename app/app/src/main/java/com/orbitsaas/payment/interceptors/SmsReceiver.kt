package com.orbitsaas.payment.interceptors

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import com.orbitsaas.payment.data.local.BlockedMessageEntity
import com.orbitsaas.payment.data.local.OrbitDatabase
import com.orbitsaas.payment.data.local.PreferencesManager
import com.orbitsaas.payment.data.local.SmsEntity
import com.orbitsaas.payment.interceptors.parsers.MfsParser
import com.orbitsaas.payment.interceptors.parsers.ParseOutcome
import com.orbitsaas.payment.service.SyncWorker
import com.orbitsaas.payment.util.SimSlotReader
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * High-priority SMS BroadcastReceiver intercepting bKash, Nagad, Rocket, Upay, and Cellfin
 * telecom transaction messages with anti-spoofing enforcement.
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
                val extraSenders = prefs.extraTrustedSenders
                val (resolvedSimSlotIndex, resolvedReceiverNumber) = resolveSimTelemetry(context, intent, prefs)

                // Group multi-part SMS messages by originating address
                val messagesBySender = messages.groupBy {
                    it.displayOriginatingAddress ?: it.originatingAddress ?: "Unknown"
                }

                for ((sender, partList) in messagesBySender) {
                    val fullBody = partList.joinToString(separator = "") {
                        it.displayMessageBody ?: it.messageBody ?: ""
                    }

                    when (val outcome = MfsParser.parse(fullBody, sender, SmsEntity.SOURCE_SMS, extraSenders)) {
                        is ParseOutcome.Accepted -> {
                            val parsed = outcome.transaction
                            Log.i(TAG, "MFS Payment Detected! Provider=${parsed.provider}, TrxID=${parsed.trxId}, Amount=${parsed.amount}, SIM=$resolvedSimSlotIndex")

                            val entity = SmsEntity(
                                merchantId = prefs.merchantId,
                                provider = parsed.provider,
                                trxId = parsed.trxId,
                                amount = parsed.amount,
                                senderNumber = parsed.senderNumber,
                                rawSms = fullBody,
                                status = SmsEntity.STATUS_PENDING_UPLOAD,
                                receivedAt = System.currentTimeMillis(),
                                smsSender = parsed.smsSender,
                                source = parsed.source,
                                simSlotIndex = resolvedSimSlotIndex,
                                receiverNumber = resolvedReceiverNumber
                            )

                            val rowId = database.smsDao().insertSms(entity)
                            if (rowId > 0) {
                                Log.d(TAG, "Saved transaction to Room DB (rowId=$rowId). Triggering immediate sync.")
                                SyncWorker.enqueueImmediateSync(context)
                            } else {
                                Log.w(TAG, "Duplicate or ignored transaction TrxID=${parsed.trxId}")
                            }
                        }

                        is ParseOutcome.Rejected -> {
                            Log.w(TAG, "Blocked SMS from [$sender]: ${outcome.reason}")
                            database.blockedMessageDao().insert(
                                BlockedMessageEntity(
                                    sender = sender,
                                    body = fullBody.take(MAX_BLOCKED_BODY_LEN),
                                    reason = outcome.reason,
                                    source = SmsEntity.SOURCE_SMS,
                                    receivedAt = System.currentTimeMillis()
                                )
                            )
                        }

                        is ParseOutcome.NotPayment -> Unit
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error processing incoming SMS: ${e.message}", e)
            } finally {
                pendingResult.finish()
            }
        }
    }

    private fun resolveSimTelemetry(
        context: Context,
        intent: Intent,
        prefs: PreferencesManager
    ): Pair<Int?, String?> {
        val extras = intent.extras
        val subId = listOf(
            "subscription",
            "android.telephony.extra.SUBSCRIPTION_INDEX"
        ).firstNotNullOfOrNull { key ->
            val raw = extras?.get(key)
            when (raw) {
                is Int -> raw.takeIf { it >= 0 }
                is Long -> raw.toInt().takeIf { it >= 0 }
                else -> null
            }
        }

        val rawSlot = listOf(
            "android.telephony.extra.SLOT_INDEX",
            "simSlot",
            "slot"
        ).firstNotNullOfOrNull { key ->
            val raw = extras?.get(key)
            when (raw) {
                is Int -> raw.takeIf { it >= 0 }
                is Long -> raw.toInt().takeIf { it >= 0 }
                else -> null
            }
        }

        val simSlots = runCatching { SimSlotReader.readSimSlots(context, prefs) }.getOrDefault(emptyList())
        val matchedBySub = subId?.let { id -> simSlots.firstOrNull { it.subscriptionId == id } }
        if (matchedBySub != null) {
            return matchedBySub.slotIndex to matchedBySub.phoneNumber
        }

        if (rawSlot != null) {
            val oneBasedSlot = rawSlot + 1
            val matchedBySlot = simSlots.firstOrNull { it.slotIndex == oneBasedSlot }
            if (matchedBySlot != null) {
                return matchedBySlot.slotIndex to matchedBySlot.phoneNumber
            }
            if (oneBasedSlot in 1..4) {
                return oneBasedSlot to null
            }
        }

        return null to null
    }

    companion object {
        private const val TAG = "SmsReceiver"
        private const val MAX_BLOCKED_BODY_LEN = 500
    }
}
