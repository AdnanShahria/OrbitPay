package com.orbitsaas.payment.data.local

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Local Room DB Entity representing captured telecom SMS or app notifications.
 */
@Entity(
    tableName = "local_sms",
    indices = [
        Index(value = ["trxId"], unique = true),
        Index(value = ["status"]),
        Index(value = ["receivedAt"])
    ]
)
data class SmsEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0L,

    @ColumnInfo(name = "merchantId")
    val merchantId: String,

    @ColumnInfo(name = "provider")
    val provider: String, // BKASH, NAGAD, ROCKET, UPAY, CELLFIN

    @ColumnInfo(name = "trxId")
    val trxId: String, // Normalized uppercase transaction ID

    @ColumnInfo(name = "amount")
    val amount: Double,

    @ColumnInfo(name = "senderNumber")
    val senderNumber: String, // Normalized 11-digit mobile number

    @ColumnInfo(name = "rawSms")
    val rawSms: String,

    @ColumnInfo(name = "status")
    val status: String = STATUS_PENDING_UPLOAD, // PENDING_UPLOAD, UPLOADED, VERIFIED

    @ColumnInfo(name = "externalOrderId")
    val externalOrderId: String? = null,

    @ColumnInfo(name = "receivedAt")
    val receivedAt: Long = System.currentTimeMillis(),

    @ColumnInfo(name = "syncedAt")
    val syncedAt: Long? = null,

    @ColumnInfo(name = "smsSender", defaultValue = "")
    val smsSender: String = "",

    @ColumnInfo(name = "source", defaultValue = "SMS")
    val source: String = SOURCE_SMS,

    @ColumnInfo(name = "simSlotIndex")
    val simSlotIndex: Int? = null,

    @ColumnInfo(name = "receiverNumber")
    val receiverNumber: String? = null
) {
    companion object {
        const val STATUS_PENDING_UPLOAD = "PENDING_UPLOAD"
        const val STATUS_UPLOADED = "UPLOADED"
        const val STATUS_VERIFIED = "VERIFIED"

        const val PROVIDER_BKASH = "BKASH"
        const val PROVIDER_NAGAD = "NAGAD"
        const val PROVIDER_ROCKET = "ROCKET"
        const val PROVIDER_UPAY = "UPAY"
        const val PROVIDER_CELLFIN = "CELLFIN"

        const val SOURCE_SMS = "SMS"
        const val SOURCE_NOTIFICATION = "NOTIFICATION"
        const val SOURCE_INBOX_SCAN = "INBOX_SCAN"
    }
}
