package com.orbitsaas.payment.interceptors.parsers

import com.orbitsaas.payment.data.local.SmsEntity
import java.util.regex.Pattern

/**
 * High-performance deterministic regex extraction engine for Bangladeshi MFS providers:
 * - bKash (Personal Send Money & PRA Payment)
 * - Nagad (Personal & Merchant)
 * - Rocket (DBBL 12-digit wallet)
 * - Upay (UCB MFS)
 * - Cellfin (Islami Bank Bangladesh PLC)
 */
object MfsParser {

    // 1. bKash Patterns
    private val BKASH_PERSONAL_REGEX = Pattern.compile(
        """You have received Tk\s+([0-9,.]+)\s+from\s+([0-9+]+).*?TrxID\s+([A-Za-z0-9]+)""",
        Pattern.CASE_INSENSITIVE or Pattern.DOTALL
    )

    private val BKASH_PRA_REGEX = Pattern.compile(
        """Payment received Tk\s+([0-9,.]+)\s+from\s+([0-9+]+).*?TrxID\s+([A-Za-z0-9]+)""",
        Pattern.CASE_INSENSITIVE or Pattern.DOTALL
    )

    private val BKASH_FALLBACK_REGEX = Pattern.compile(
        """(?:received|Payment)\s+(?:Tk|BDT)?\s*([0-9,.]+)\s+from\s+([0-9+]+).*?TrxID:?\s*([A-Za-z0-9]+)""",
        Pattern.CASE_INSENSITIVE or Pattern.DOTALL
    )

    // 2. Nagad Patterns
    private val NAGAD_STANDARD_REGEX = Pattern.compile(
        """(?:received|credited)\s+(?:BDT|Tk)\s*([0-9,.]+)\s+from\s+([0-9+]+).*?TxnID:?\s*([A-Za-z0-9]+)""",
        Pattern.CASE_INSENSITIVE or Pattern.DOTALL
    )

    private val NAGAD_ALT_REGEX = Pattern.compile(
        """(?:Tk|BDT)\s*([0-9,.]+).*?from\s+([0-9+]+).*?TxnID:?\s*([A-Za-z0-9]+)""",
        Pattern.CASE_INSENSITIVE or Pattern.DOTALL
    )

    private val NAGAD_KEYVALUE_REGEX = Pattern.compile(
        """Amount:\s*(?:Tk|BDT)?\s*([0-9,.]+).*?Sender:\s*([0-9+]+).*?TxnID:\s*([A-Za-z0-9]+)""",
        Pattern.CASE_INSENSITIVE or Pattern.DOTALL
    )

    // 3. Rocket Patterns (Supports 12-digit DBBL numbers)
    private val ROCKET_STANDARD_REGEX = Pattern.compile(
        """(?:You have received|Payment)\s+Tk\s*([0-9,.]+)\s+from\s+([0-9+]{11,13}).*?TrxID:?\s*([A-Za-z0-9]+)""",
        Pattern.CASE_INSENSITIVE or Pattern.DOTALL
    )

    // 4. Upay Patterns
    private val UPAY_STANDARD_REGEX = Pattern.compile(
        """(?:You have received|Received)\s+Tk\s*([0-9,.]+)\s+from\s+([0-9+]+).*?TrxID:?\s*([A-Za-z0-9]+)""",
        Pattern.CASE_INSENSITIVE or Pattern.DOTALL
    )

    // 5. Cellfin Patterns
    private val CELLFIN_STANDARD_REGEX = Pattern.compile(
        """(?:received|credited)\s+Tk\s*([0-9,.]+)\s+from\s+([0-9+]+).*?TrxID:?\s*([A-Za-z0-9]+)""",
        Pattern.CASE_INSENSITIVE or Pattern.DOTALL
    )

    /**
     * Parses an incoming SMS text or Push Notification payload.
     *
     * @param rawText The raw text message.
     * @param sender The sender address, shortcode, or app package name.
     * @return [ParsedTransaction] or null if the message does not match an incoming payment.
     */
    fun parse(rawText: String, sender: String? = null): ParsedTransaction? {
        val cleanText = rawText.trim()
        val normalizedSender = sender?.trim()?.lowercase() ?: ""

        // Check provider hint from sender shortcode or package name
        val providerHint = resolveProviderHint(normalizedSender, cleanText)

        // 1. Try matching bKash
        if (providerHint == null || providerHint == SmsEntity.PROVIDER_BKASH) {
            parseWithPattern(cleanText, BKASH_PERSONAL_REGEX, SmsEntity.PROVIDER_BKASH)?.let { return it }
            parseWithPattern(cleanText, BKASH_PRA_REGEX, SmsEntity.PROVIDER_BKASH)?.let { return it }
            parseWithPattern(cleanText, BKASH_FALLBACK_REGEX, SmsEntity.PROVIDER_BKASH)?.let { return it }
        }

        // 2. Try matching Nagad
        if (providerHint == null || providerHint == SmsEntity.PROVIDER_NAGAD) {
            parseWithPattern(cleanText, NAGAD_STANDARD_REGEX, SmsEntity.PROVIDER_NAGAD)?.let { return it }
            parseWithPattern(cleanText, NAGAD_ALT_REGEX, SmsEntity.PROVIDER_NAGAD)?.let { return it }
            parseWithPattern(cleanText, NAGAD_KEYVALUE_REGEX, SmsEntity.PROVIDER_NAGAD)?.let { return it }
        }

        // 3. Try matching Rocket
        if (providerHint == null || providerHint == SmsEntity.PROVIDER_ROCKET) {
            parseWithPattern(cleanText, ROCKET_STANDARD_REGEX, SmsEntity.PROVIDER_ROCKET)?.let { return it }
        }

        // 4. Try matching Upay
        if (providerHint == null || providerHint == SmsEntity.PROVIDER_UPAY) {
            parseWithPattern(cleanText, UPAY_STANDARD_REGEX, SmsEntity.PROVIDER_UPAY)?.let { return it }
        }

        // 5. Try matching Cellfin
        if (providerHint == null || providerHint == SmsEntity.PROVIDER_CELLFIN) {
            parseWithPattern(cleanText, CELLFIN_STANDARD_REGEX, SmsEntity.PROVIDER_CELLFIN)?.let { return it }
        }

        // Final exhaustive fallback if hint was restrictive
        if (providerHint != null) {
            return parse(rawText, null)
        }

        return null
    }

    private fun parseWithPattern(text: String, pattern: Pattern, provider: String): ParsedTransaction? {
        val matcher = pattern.matcher(text)
        if (matcher.find()) {
            val amountStr = matcher.group(1)?.replace(",", "") ?: return null
            val senderStr = matcher.group(2) ?: return null
            val trxIdStr = matcher.group(3) ?: return null

            val amount = amountStr.toDoubleOrNull() ?: return null
            val normalizedSender = sanitizePhoneNumber(senderStr)
            val normalizedTrxId = trxIdStr.trim().uppercase()

            if (normalizedTrxId.length < 5) return null

            return ParsedTransaction(
                provider = provider,
                trxId = normalizedTrxId,
                amount = amount,
                senderNumber = normalizedSender,
                rawText = text
            )
        }
        return null
    }

    /**
     * Identifies provider from sender shortcode, package name, or text markers.
     */
    private fun resolveProviderHint(sender: String, text: String): String? {
        val lowerText = text.lowercase()

        return when {
            sender.contains("bkash") || sender == "16247" || sender.contains("com.bkash.customerapp") -> SmsEntity.PROVIDER_BKASH
            sender.contains("nagad") || sender == "16167" || sender.contains("com.konasl.nagad") -> SmsEntity.PROVIDER_NAGAD
            sender.contains("rocket") || sender == "16216" || sender.contains("dbbl") || sender.contains("com.dbbl.mbb.rocket") -> SmsEntity.PROVIDER_ROCKET
            sender.contains("upay") || sender == "16268" || sender.contains("bd.com.upay.customer") -> SmsEntity.PROVIDER_UPAY
            sender.contains("cellfin") || sender == "16259" || sender.contains("ibbl") || sender.contains("com.ibbl.cellfin") -> SmsEntity.PROVIDER_CELLFIN
            lowerText.contains("bkash") && lowerText.contains("trxid") -> SmsEntity.PROVIDER_BKASH
            (lowerText.contains("nagad") || lowerText.contains("txnid")) && lowerText.contains("bdt") -> SmsEntity.PROVIDER_NAGAD
            lowerText.contains("rocket") -> SmsEntity.PROVIDER_ROCKET
            lowerText.contains("upay") -> SmsEntity.PROVIDER_UPAY
            lowerText.contains("cellfin") -> SmsEntity.PROVIDER_CELLFIN
            else -> null
        }
    }

    /**
     * Sanitizes Bangladeshi mobile numbers:
     * - Strips +88 / 88 international dial code.
     * - Strips non-digit formatting characters (spaces, dashes, parentheses).
     * - Preserves 11-digit numbers (or 12-digit for DBBL Rocket).
     */
    fun sanitizePhoneNumber(rawNumber: String): String {
        var cleaned = rawNumber.replace(Regex("[^0-9+]"), "")

        if (cleaned.startsWith("+880")) {
            cleaned = cleaned.substring(3)
        } else if (cleaned.startsWith("880")) {
            cleaned = cleaned.substring(2)
        } else if (cleaned.startsWith("+88")) {
            cleaned = cleaned.substring(3)
        } else if (cleaned.startsWith("88")) {
            cleaned = cleaned.substring(2)
        }

        if (!cleaned.startsWith("0") && cleaned.length in 10..11) {
            cleaned = "0$cleaned"
        }

        return cleaned
    }
}
