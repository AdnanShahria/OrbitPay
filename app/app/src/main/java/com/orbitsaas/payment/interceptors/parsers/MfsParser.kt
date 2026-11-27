package com.orbitsaas.payment.interceptors.parsers

import com.orbitsaas.payment.data.local.SmsEntity
import com.orbitsaas.payment.interceptors.SenderTrust
import java.util.regex.Pattern

/**
 * Deterministic regex extraction and anti-spoofing parser for Bangladeshi MFS providers:
 * - bKash (Personal Send Money, PRA Payment, Cash In)
 * - Nagad (Standard & Key-Value Multiline)
 * - Rocket (DBBL 16216 A/C format & Legacy 12-digit wallet)
 * - Upay (UCB MFS)
 * - Cellfin (Islami Bank Bangladesh PLC)
 */
object MfsParser {

    private const val AMT = """([0-9][0-9,]*(?:\.[0-9]{1,2})?)"""
    private const val TK = """(?:Tk\.?|BDT)"""
    private const val PHONE_CAPTURE = """((?:\+?88)?01[3-9]\d{8})"""
    private const val ROCKET_PHONE_CAPTURE = """((?:\+?88)?01[3-9]\d{8}[A-Za-z0-9]?)"""
    private const val TRX_CAPTURE = """(?:TrxID|TxnID|TxnId):?\s*([A-Za-z0-9]+)"""
    private val BD_PHONE_REGEX = Regex("""^01[3-9]\d{8}$""")

    private val OUTGOING_OR_OTP_REGEX = Pattern.compile(
        """(?:\b(?:verification code|otp|one[- ]time password|security code|pin reset|login code|pin is|do not share this code)\b|\b(?:you have sent|send money|cash out|mobile recharge|pay bill|bill pay)\b|\bpaid\s+$TK|\bpayment\s+(?:of\s+)?$TK\s*$AMT\s+to\b|^\s*(?:payment of|sent\s+$TK|transferred\s+$TK))""",
        Pattern.CASE_INSENSITIVE or Pattern.DOTALL
    )

    // 1. bKash Patterns
    private val BKASH_PERSONAL_REGEX = Pattern.compile(
        """You have received\s+(?:payment\s+)?$TK\s*$AMT\.?\s+from\s+$PHONE_CAPTURE(?!\d).*?$TRX_CAPTURE""",
        Pattern.CASE_INSENSITIVE or Pattern.DOTALL
    )

    private val BKASH_PRA_REGEX = Pattern.compile(
        """Payment received\s+$TK\s*$AMT\.?\s+from\s+$PHONE_CAPTURE(?!\d).*?$TRX_CAPTURE""",
        Pattern.CASE_INSENSITIVE or Pattern.DOTALL
    )

    private val BKASH_CASHIN_REGEX = Pattern.compile(
        """Cash\s+In\s+$TK\s*$AMT\.?\s+from\s+$PHONE_CAPTURE(?!\d).*?$TRX_CAPTURE""",
        Pattern.CASE_INSENSITIVE or Pattern.DOTALL
    )

    private val BKASH_FALLBACK_REGEX = Pattern.compile(
        """(?:received|Payment)\s+(?:$TK\s*)?$AMT\.?\s+from\s+$PHONE_CAPTURE(?!\d).*?$TRX_CAPTURE""",
        Pattern.CASE_INSENSITIVE or Pattern.DOTALL
    )

    // 2. Nagad Patterns
    private val NAGAD_STANDARD_REGEX = Pattern.compile(
        """(?:received|credited)\s+$TK\s*$AMT\.?\s+from\s+$PHONE_CAPTURE(?!\d).*?$TRX_CAPTURE""",
        Pattern.CASE_INSENSITIVE or Pattern.DOTALL
    )

    private val NAGAD_KEYVALUE_REGEX = Pattern.compile(
        """Amount:\s*(?:$TK\s*)?$AMT\.?.*?Sender:\s*$PHONE_CAPTURE(?!\d).*?$TRX_CAPTURE""",
        Pattern.CASE_INSENSITIVE or Pattern.DOTALL
    )

    private val NAGAD_ALT_REGEX = Pattern.compile(
        """$TK\s*$AMT\.?.*?from\s+$PHONE_CAPTURE(?!\d).*?$TRX_CAPTURE""",
        Pattern.CASE_INSENSITIVE or Pattern.DOTALL
    )

    // 3. Rocket Patterns (Supports 16216 A/C:01912345678X & legacy 12-digit DBBL numbers)
    private val ROCKET_AC_REGEX = Pattern.compile(
        """$TK\s*$AMT\.?\s+received\s+from\s+(?:A/C:?\s*)?$ROCKET_PHONE_CAPTURE(?!\d).*?$TRX_CAPTURE""",
        Pattern.CASE_INSENSITIVE or Pattern.DOTALL
    )

    private val ROCKET_STANDARD_REGEX = Pattern.compile(
        """(?:You have received|Payment(?:\s+received)?|received)\s+$TK\s*$AMT\.?\s+from\s+(?:A/C:?\s*)?$ROCKET_PHONE_CAPTURE(?!\d).*?$TRX_CAPTURE""",
        Pattern.CASE_INSENSITIVE or Pattern.DOTALL
    )

    // 4. Upay Patterns
    private val UPAY_STANDARD_REGEX = Pattern.compile(
        """(?:You have received|Received)\s+$TK\s*$AMT\.?\s+from\s+$PHONE_CAPTURE(?!\d).*?$TRX_CAPTURE""",
        Pattern.CASE_INSENSITIVE or Pattern.DOTALL
    )

    // 5. Cellfin Patterns
    private val CELLFIN_STANDARD_REGEX = Pattern.compile(
        """(?:You have received|received|credited)\s+$TK\s*$AMT\.?\s+from\s+$PHONE_CAPTURE(?!\d).*?$TRX_CAPTURE""",
        Pattern.CASE_INSENSITIVE or Pattern.DOTALL
    )

    private val PROVIDER_PATTERNS: List<Pair<String, List<Pattern>>> = listOf(
        SmsEntity.PROVIDER_BKASH to listOf(
            BKASH_PERSONAL_REGEX,
            BKASH_PRA_REGEX,
            BKASH_CASHIN_REGEX,
            BKASH_FALLBACK_REGEX
        ),
        SmsEntity.PROVIDER_NAGAD to listOf(
            NAGAD_STANDARD_REGEX,
            NAGAD_KEYVALUE_REGEX,
            NAGAD_ALT_REGEX
        ),
        SmsEntity.PROVIDER_ROCKET to listOf(
            ROCKET_AC_REGEX,
            ROCKET_STANDARD_REGEX
        ),
        SmsEntity.PROVIDER_UPAY to listOf(
            UPAY_STANDARD_REGEX
        ),
        SmsEntity.PROVIDER_CELLFIN to listOf(
            CELLFIN_STANDARD_REGEX
        )
    )

    /**
     * Parses an incoming SMS, notification, or inbox-scan payload and enforces sender trust
     * and provider consistency.
     */
    fun parse(
        rawText: String,
        sender: String?,
        source: String = SmsEntity.SOURCE_SMS,
        extraTrustedSenders: String = ""
    ): ParseOutcome {
        val cleanText = rawText.trim()
        if (cleanText.isEmpty()) return ParseOutcome.NotPayment

        if (OUTGOING_OR_OTP_REGEX.matcher(cleanText).find()) {
            return ParseOutcome.NotPayment
        }

        val cleanSender = sender?.trim().orEmpty()
        val trust = SenderTrust.evaluate(cleanSender, source, extraTrustedSenders)

        if (trust.trusted && trust.provider != null) {
            val matchedSameProvider = parseForProvider(cleanText, trust.provider, cleanSender, source)
            if (matchedSameProvider != null) {
                return ParseOutcome.Accepted(matchedSameProvider)
            }

            // Detect cross-provider spoofing (e.g., Nagad-formatted text from bKash sender)
            val matchedOther = parseAnyProvider(cleanText, cleanSender, source, excludeProvider = trust.provider)
            if (matchedOther != null) {
                return ParseOutcome.Rejected(
                    reason = "Provider mismatch: sender $cleanSender expects ${trust.provider}, parsed ${matchedOther.provider}",
                    provider = matchedOther.provider
                )
            }
            return ParseOutcome.NotPayment
        }

        // Untrusted or missing sender: only flag as Rejected if message actually parses as a payment
        val parsedAny = parseAnyProvider(cleanText, cleanSender, source)
        if (parsedAny != null) {
            return ParseOutcome.Rejected(
                reason = trust.reason ?: "Untrusted sender: ${cleanSender.ifBlank { "unknown" }}",
                provider = parsedAny.provider
            )
        }

        return ParseOutcome.NotPayment
    }

    fun parseOrNull(
        rawText: String,
        sender: String? = null,
        source: String = SmsEntity.SOURCE_SMS,
        extraTrustedSenders: String = ""
    ): ParsedTransaction? {
        return (parse(rawText, sender, source, extraTrustedSenders) as? ParseOutcome.Accepted)?.transaction
    }

    private fun parseAnyProvider(
        text: String,
        smsSender: String,
        source: String,
        excludeProvider: String? = null
    ): ParsedTransaction? {
        for ((provider, _) in PROVIDER_PATTERNS) {
            if (provider == excludeProvider) continue
            parseForProvider(text, provider, smsSender, source)?.let { return it }
        }
        return null
    }

    private fun parseForProvider(
        text: String,
        provider: String,
        smsSender: String,
        source: String
    ): ParsedTransaction? {
        val patterns = PROVIDER_PATTERNS.firstOrNull { it.first == provider }?.second ?: return null
        for (pattern in patterns) {
            parseWithPattern(text, pattern, provider, smsSender, source)?.let { return it }
        }
        return null
    }

    private fun parseWithPattern(
        text: String,
        pattern: Pattern,
        provider: String,
        smsSender: String,
        source: String
    ): ParsedTransaction? {
        val matcher = pattern.matcher(text)
        if (matcher.find()) {
            val amountStr = matcher.group(1)?.replace(",", "") ?: return null
            val senderStr = matcher.group(2) ?: return null
            val trxIdStr = matcher.group(3) ?: return null

            val amount = amountStr.toDoubleOrNull() ?: return null
            if (!amount.isFinite() || amount <= 0.0) return null

            val normalizedSender = sanitizePhoneNumber(senderStr, provider)
            if (!BD_PHONE_REGEX.matches(normalizedSender)) return null
            val normalizedTrxId = trxIdStr.trim().uppercase()

            if (normalizedTrxId.length < 5) return null

            return ParsedTransaction(
                provider = provider,
                trxId = normalizedTrxId,
                amount = amount,
                senderNumber = normalizedSender,
                rawText = text,
                smsSender = smsSender,
                source = source
            )
        }
        return null
    }

    /**
     * Sanitizes Bangladeshi mobile numbers:
     * - Strips trailing check letters (e.g. Rocket A/C:01912345678X -> 01912345678).
     * - Strips +88 / 88 international dial code.
     * - Strips non-digit formatting characters (spaces, dashes, parentheses).
     * - For ROCKET, normalizes 12-digit check-digit numbers to 11 digits.
     */
    fun sanitizePhoneNumber(rawNumber: String, provider: String? = null): String {
        val withoutTrailingLetters = rawNumber.trim().replace(Regex("[A-Za-z]+$"), "")
        var cleaned = withoutTrailingLetters.replace(Regex("[^0-9+]"), "")

        if (cleaned.startsWith("+880")) {
            cleaned = cleaned.substring(3)
        } else if (cleaned.startsWith("880")) {
            cleaned = cleaned.substring(2)
        } else if (cleaned.startsWith("+88")) {
            cleaned = cleaned.substring(3)
        } else if (cleaned.startsWith("88")) {
            cleaned = cleaned.substring(2)
        }

        cleaned = cleaned.replace("+", "")

        if (!cleaned.startsWith("0") && cleaned.length in 10..11) {
            cleaned = "0$cleaned"
        }

        if (provider == SmsEntity.PROVIDER_ROCKET && cleaned.length == 12 && cleaned.startsWith("01")) {
            cleaned = cleaned.substring(0, 11)
        }

        return cleaned
    }
}
