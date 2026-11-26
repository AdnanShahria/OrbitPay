package com.orbitsaas.payment.interceptors

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.provider.Telephony
import android.util.Log
import androidx.core.content.ContextCompat
import com.orbitsaas.payment.data.local.BlockedMessageEntity
import com.orbitsaas.payment.data.local.OrbitDatabase
import com.orbitsaas.payment.data.local.PreferencesManager
import com.orbitsaas.payment.data.local.SmsEntity
import com.orbitsaas.payment.interceptors.parsers.MfsParser
import com.orbitsaas.payment.interceptors.parsers.ParseOutcome
import com.orbitsaas.payment.service.SyncWorker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class ScanResult(
    val scanned: Int,
    val imported: Int,
    val blocked: Int
)

/**
 * Recovers missed incoming MFS SMS from the device Inbox (e.g. while signed out or killed)
 * enforcing the exact same SenderTrust and MfsParser rules.
 */
object InboxScanner {

    private const val TAG = "InboxScanner"
    private const val DEFAULT_LOOKBACK_MS = 72L * 60L * 60L * 1000L
    private const val MAX_BLOCKED_BODY_LEN = 500

    suspend fun scan(context: Context, sinceMs: Long? = null): ScanResult = withContext(Dispatchers.IO) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            Log.d(TAG, "READ_SMS permission not granted; skipping inbox scan.")
            return@withContext ScanResult(0, 0, 0)
        }

        val prefs = PreferencesManager(context)
        if (!prefs.isLoggedIn()) {
            Log.d(TAG, "User not logged in; skipping inbox scan.")
            return@withContext ScanResult(0, 0, 0)
        }

        val now = System.currentTimeMillis()
        val effectiveSince = sinceMs ?: prefs.lastInboxScanAt.takeIf { it > 0L } ?: (now - DEFAULT_LOOKBACK_MS)
        val extraSenders = prefs.extraTrustedSenders
        val database = OrbitDatabase.getDatabase(context)
        val smsDao = database.smsDao()
        val blockedDao = database.blockedMessageDao()

        var scanned = 0
        var imported = 0
        var blocked = 0

        try {
            val projection = arrayOf(
                Telephony.Sms.ADDRESS,
                Telephony.Sms.BODY,
                Telephony.Sms.DATE
            )
            val selection = "${Telephony.Sms.DATE} > ?"
            val selectionArgs = arrayOf(effectiveSince.toString())
            val sortOrder = "${Telephony.Sms.DATE} ASC"

            context.contentResolver.query(
                Telephony.Sms.Inbox.CONTENT_URI,
                projection,
                selection,
                selectionArgs,
                sortOrder
            )?.use { cursor ->
                val addrIdx = cursor.getColumnIndex(Telephony.Sms.ADDRESS)
                val bodyIdx = cursor.getColumnIndex(Telephony.Sms.BODY)
                val dateIdx = cursor.getColumnIndex(Telephony.Sms.DATE)

                while (cursor.moveToNext()) {
                    scanned++
                    val sender = if (addrIdx >= 0) cursor.getString(addrIdx).orEmpty() else ""
                    val body = if (bodyIdx >= 0) cursor.getString(bodyIdx).orEmpty() else ""
                    val msgDate = if (dateIdx >= 0) cursor.getLong(dateIdx).takeIf { it > 0L } ?: now else now

                    if (body.isBlank()) continue

                    when (
                        val outcome = MfsParser.parse(
                            rawText = body,
                            sender = sender,
                            source = SmsEntity.SOURCE_INBOX_SCAN,
                            extraTrustedSenders = extraSenders
                        )
                    ) {
                        is ParseOutcome.Accepted -> {
                            val parsed = outcome.transaction
                            val entity = SmsEntity(
                                merchantId = prefs.merchantId,
                                provider = parsed.provider,
                                trxId = parsed.trxId,
                                amount = parsed.amount,
                                senderNumber = parsed.senderNumber,
                                rawSms = body,
                                status = SmsEntity.STATUS_PENDING_UPLOAD,
                                receivedAt = msgDate,
                                smsSender = parsed.smsSender,
                                source = SmsEntity.SOURCE_INBOX_SCAN
                            )
                            val rowId = smsDao.insertSms(entity)
                            if (rowId > 0L) {
                                imported++
                            }
                        }

                        is ParseOutcome.Rejected -> {
                            blockedDao.insert(
                                BlockedMessageEntity(
                                    sender = sender.ifBlank { "Unknown" },
                                    body = body.take(MAX_BLOCKED_BODY_LEN),
                                    reason = outcome.reason,
                                    source = SmsEntity.SOURCE_INBOX_SCAN,
                                    receivedAt = msgDate
                                )
                            )
                            blocked++
                        }

                        is ParseOutcome.NotPayment -> Unit
                    }
                }
            }

            prefs.lastInboxScanAt = now
            Log.i(TAG, "Inbox scan complete: scanned=$scanned, imported=$imported, blocked=$blocked")
        } catch (e: SecurityException) {
            Log.w(TAG, "SecurityException reading SMS inbox: ${e.message}")
        } catch (e: Exception) {
            Log.e(TAG, "Error scanning SMS inbox: ${e.message}", e)
        }

        ScanResult(scanned = scanned, imported = imported, blocked = blocked)
    }

    fun scheduleNow(context: Context) {
        SyncWorker.enqueueImmediateSync(context)
    }
}
