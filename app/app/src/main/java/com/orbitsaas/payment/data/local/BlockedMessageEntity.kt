package com.orbitsaas.payment.data.local

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Local audit log of rejected / spoofed SMS or notification payloads blocked by SenderTrust or MfsParser.
 */
@Entity(
    tableName = "blocked_messages",
    indices = [
        Index(value = ["receivedAt"])
    ]
)
data class BlockedMessageEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0L,

    @ColumnInfo(name = "sender")
    val sender: String,

    @ColumnInfo(name = "body")
    val body: String,

    @ColumnInfo(name = "reason")
    val reason: String,

    @ColumnInfo(name = "source", defaultValue = "SMS")
    val source: String = SmsEntity.SOURCE_SMS,

    @ColumnInfo(name = "receivedAt")
    val receivedAt: Long = System.currentTimeMillis()
)
