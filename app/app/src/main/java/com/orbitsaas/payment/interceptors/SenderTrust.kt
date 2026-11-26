package com.orbitsaas.payment.interceptors

import com.orbitsaas.payment.data.local.SmsEntity

data class TrustResult(
    val trusted: Boolean,
    val provider: String?,
    val reason: String?
)

/**
 * Enforces anti-spoofing sender and notification package trust rules.
 */
object SenderTrust {

    private val PERSONAL_PHONE_REGEX = Regex("""^\+?(88)?01\d{9}$""")
    private val LONG_NUMERIC_REGEX = Regex("""^\+?\d{7,}$""")

    val DEFAULT_TRUSTED_SENDERS: Map<String, List<String>> = mapOf(
        SmsEntity.PROVIDER_BKASH to listOf("bKash"),
        SmsEntity.PROVIDER_NAGAD to listOf("NAGAD"),
        SmsEntity.PROVIDER_ROCKET to listOf("16216", "Rocket"),
        SmsEntity.PROVIDER_UPAY to listOf("upay"),
        SmsEntity.PROVIDER_CELLFIN to listOf("CellFin", "IBBL")
    )

    val DEFAULT_TRUSTED_PACKAGES: Map<String, List<String>> = mapOf(
        SmsEntity.PROVIDER_BKASH to listOf("com.bkash.customerapp", "com.bkash.merchantapp"),
        SmsEntity.PROVIDER_NAGAD to listOf("com.konasl.nagad", "com.konasl.nagad.merchant"),
        SmsEntity.PROVIDER_ROCKET to listOf("com.dbbl.mbb.rocket"),
        SmsEntity.PROVIDER_UPAY to listOf("bd.com.upay.customer"),
        SmsEntity.PROVIDER_CELLFIN to listOf("com.ibbl.cellfin")
    )

    private val VALID_PROVIDERS = setOf(
        SmsEntity.PROVIDER_BKASH,
        SmsEntity.PROVIDER_NAGAD,
        SmsEntity.PROVIDER_ROCKET,
        SmsEntity.PROVIDER_UPAY,
        SmsEntity.PROVIDER_CELLFIN
    )

    fun isPersonalPhone(sender: String?): Boolean {
        val trimmed = sender?.trim() ?: return false
        return PERSONAL_PHONE_REGEX.matches(trimmed)
    }

    fun isTrustedPackage(packageName: String?): Boolean {
        return providerForPackage(packageName) != null
    }

    fun providerForPackage(packageName: String?): String? {
        val trimmed = packageName?.trim() ?: return null
        if (trimmed.isEmpty()) return null
        for ((provider, packages) in DEFAULT_TRUSTED_PACKAGES) {
            if (packages.any { it.equals(trimmed, ignoreCase = true) }) {
                return provider
            }
        }
        return null
    }

    /**
     * Parses `PROVIDER:Sender` comma-separated entries, ignoring blank, malformed,
     * or personal-phone entries.
     */
    fun parseExtraTrustedSenders(extraTrustedSenders: String): Map<String, List<String>> {
        if (extraTrustedSenders.isBlank()) return emptyMap()
        val result = mutableMapOf<String, MutableList<String>>()
        for (rawEntry in extraTrustedSenders.split(",")) {
            val entry = rawEntry.trim()
            if (entry.isEmpty()) continue
            val colonIdx = entry.indexOf(':')
            if (colonIdx <= 0 || colonIdx >= entry.length - 1) continue

            val provider = entry.substring(0, colonIdx).trim().uppercase()
            val sender = entry.substring(colonIdx + 1).trim()
            if (provider !in VALID_PROVIDERS || sender.isEmpty()) continue
            if (PERSONAL_PHONE_REGEX.matches(sender)) continue

            result.getOrPut(provider) { mutableListOf() }.add(sender)
        }
        return result
    }

    fun evaluate(
        sender: String?,
        source: String = SmsEntity.SOURCE_SMS,
        extraTrustedSenders: String = ""
    ): TrustResult {
        val trimmed = sender?.trim().orEmpty()
        if (trimmed.isEmpty()) {
            return TrustResult(
                trusted = false,
                provider = null,
                reason = "Missing or blank sender"
            )
        }

        if (source.equals(SmsEntity.SOURCE_NOTIFICATION, ignoreCase = true)) {
            val pkgProvider = providerForPackage(trimmed)
            return if (pkgProvider != null) {
                TrustResult(trusted = true, provider = pkgProvider, reason = null)
            } else {
                TrustResult(
                    trusted = false,
                    provider = null,
                    reason = "Untrusted notification package: $trimmed"
                )
            }
        }

        // Personal BD mobile numbers are ALWAYS rejected, even if configured as extras.
        if (PERSONAL_PHONE_REGEX.matches(trimmed)) {
            return TrustResult(
                trusted = false,
                provider = null,
                reason = "Personal phone sender rejected: $trimmed"
            )
        }

        val extras = parseExtraTrustedSenders(extraTrustedSenders)
        for (provider in VALID_PROVIDERS) {
            val allowed = DEFAULT_TRUSTED_SENDERS[provider].orEmpty() + extras[provider].orEmpty()
            if (allowed.any { it.equals(trimmed, ignoreCase = true) }) {
                return TrustResult(trusted = true, provider = provider, reason = null)
            }
        }

        if (LONG_NUMERIC_REGEX.matches(trimmed)) {
            return TrustResult(
                trusted = false,
                provider = null,
                reason = "Untrusted numeric sender (>6 digits): $trimmed"
            )
        }

        return TrustResult(
            trusted = false,
            provider = null,
            reason = "Untrusted SMS sender: $trimmed"
        )
    }

    fun verifyProviderConsistency(trust: TrustResult, parsedProvider: String): TrustResult {
        if (!trust.trusted) return trust
        val expected = trust.provider ?: return trust
        return if (expected.equals(parsedProvider, ignoreCase = true)) {
            trust
        } else {
            TrustResult(
                trusted = false,
                provider = expected,
                reason = "Provider mismatch: sender expects $expected, parsed $parsedProvider"
            )
        }
    }
}
