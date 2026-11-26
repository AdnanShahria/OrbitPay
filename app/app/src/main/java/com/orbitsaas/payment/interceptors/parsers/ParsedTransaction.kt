package com.orbitsaas.payment.interceptors.parsers

/**
 * Clean data model representing an MFS transaction parsed from SMS or Push Notification.
 */
data class ParsedTransaction(
    val provider: String, // "BKASH", "NAGAD", "ROCKET", "UPAY", "CELLFIN"
    val trxId: String, // Normalized uppercase transaction ID (e.g., 9GB7XQ21)
    val amount: Double, // Parsed transaction amount in BDT
    val senderNumber: String, // Normalized 11-digit mobile number (e.g., 01711111111)
    val rawText: String, // Original SMS or Push body
    val smsSender: String = "",
    val source: String = "SMS",
    val timestamp: Long = System.currentTimeMillis()
)

sealed class ParseOutcome {
    data class Accepted(val transaction: ParsedTransaction) : ParseOutcome()
    data class Rejected(val reason: String, val provider: String? = null) : ParseOutcome()
    data object NotPayment : ParseOutcome()
}
