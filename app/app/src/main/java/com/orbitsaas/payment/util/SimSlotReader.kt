package com.orbitsaas.payment.util

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.PowerManager
import android.telephony.SubscriptionManager
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.orbitsaas.payment.data.local.PreferencesManager
import com.orbitsaas.payment.data.remote.PreflightCheckRequest
import com.orbitsaas.payment.data.remote.PreflightSimSlotDto
import com.orbitsaas.payment.interceptors.parsers.MfsParser

enum class SimNumberSource {
    HARDWARE,
    CONFIRMED,
    HIDDEN
}

data class SimSlotInfo(
    val slotIndex: Int,
    val subscriptionId: Int = -1,
    val carrierName: String,
    val phoneNumber: String?,
    val source: SimNumberSource
)

object SimSlotReader {

    private val BD_PHONE_REGEX = Regex("^01[3-9]\\d{8}$")

    fun hasPhonePermission(context: Context): Boolean {
        val hasPhoneNumbers = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.READ_PHONE_NUMBERS
        ) == PackageManager.PERMISSION_GRANTED
        val hasPhoneState = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.READ_PHONE_STATE
        ) == PackageManager.PERMISSION_GRANTED
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            hasPhoneNumbers || hasPhoneState
        } else {
            hasPhoneState
        }
    }

    fun normalizeBdNumber(raw: String?): String? {
        val trimmed = raw?.trim()?.takeIf { it.isNotBlank() } ?: return null
        val sanitized = MfsParser.sanitizePhoneNumber(trimmed)
        return sanitized.takeIf { BD_PHONE_REGEX.matches(it) }
    }

    @SuppressLint("MissingPermission")
    fun readSimSlots(
        context: Context,
        preferencesManager: PreferencesManager
    ): List<SimSlotInfo> {
        val confirmedBySlot = preferencesManager.getConfirmedSimSlots()
            .associateBy { it.slotIndex }

        val slots = mutableListOf<SimSlotInfo>()
        val seenSlotIndices = mutableSetOf<Int>()

        if (hasPhonePermission(context)) {
            val subscriptionManager =
                context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as? SubscriptionManager
            val activeInfos = runCatching {
                subscriptionManager?.activeSubscriptionInfoList.orEmpty()
            }.getOrDefault(emptyList())

            activeInfos.forEachIndexed { idx, info ->
                val slotIndex = if (info.simSlotIndex >= 0) info.simSlotIndex + 1 else idx + 1
                seenSlotIndices.add(slotIndex)

                val carrierName = info.carrierName?.toString()?.trim()?.ifBlank { null }
                    ?: info.displayName?.toString()?.trim()?.ifBlank { null }
                    ?: "SIM $slotIndex"

                val rawHardwareNumber = runCatching {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        subscriptionManager?.getPhoneNumber(info.subscriptionId)
                            ?.takeIf { it.isNotBlank() }
                            ?: @Suppress("DEPRECATION") info.number
                    } else {
                        @Suppress("DEPRECATION")
                        info.number
                    }
                }.getOrNull()

                val hardwareNumber = normalizeBdNumber(rawHardwareNumber)
                val confirmedNumber = confirmedBySlot[slotIndex]?.let { normalizeBdNumber(it.phoneNumber) }

                val (resolvedNumber, source) = when {
                    hardwareNumber != null -> hardwareNumber to SimNumberSource.HARDWARE
                    confirmedNumber != null -> confirmedNumber to SimNumberSource.CONFIRMED
                    else -> null to SimNumberSource.HIDDEN
                }

                slots.add(
                    SimSlotInfo(
                        slotIndex = slotIndex,
                        subscriptionId = info.subscriptionId,
                        carrierName = carrierName,
                        phoneNumber = resolvedNumber,
                        source = source
                    )
                )
            }
        }

        confirmedBySlot.values.forEach { confirmed ->
            if (confirmed.slotIndex !in seenSlotIndices) {
                val normalized = normalizeBdNumber(confirmed.phoneNumber) ?: return@forEach
                slots.add(
                    SimSlotInfo(
                        slotIndex = confirmed.slotIndex,
                        subscriptionId = -1,
                        carrierName = confirmed.carrierName.ifBlank { "SIM ${confirmed.slotIndex}" },
                        phoneNumber = normalized,
                        source = SimNumberSource.CONFIRMED
                    )
                )
            }
        }

        return slots.sortedBy { it.slotIndex }
    }

    fun toPreflightSimSlots(slots: List<SimSlotInfo>): List<PreflightSimSlotDto> {
        return slots.mapNotNull { slot ->
            val number = slot.phoneNumber?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
            PreflightSimSlotDto(
                slotIndex = slot.slotIndex,
                carrierName = slot.carrierName,
                phoneNumber = number,
                source = slot.source.name
            )
        }
    }

    fun buildPreflightCheckRequest(
        context: Context,
        preferencesManager: PreferencesManager
    ): PreflightCheckRequest {
        val smsPermission = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECEIVE_SMS
        ) == PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.READ_SMS
            ) == PackageManager.PERMISSION_GRANTED

        val listenerEnabled = runCatching {
            NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)
        }.getOrDefault(false)

        val batteryOptimizationIgnored = runCatching {
            val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
            pm?.isIgnoringBatteryOptimizations(context.packageName) == true
        }.getOrDefault(false)

        val simSlots = readSimSlots(context, preferencesManager)

        return PreflightCheckRequest(
            deviceSimNumbers = toPreflightSimSlots(simSlots),
            smsPermission = smsPermission,
            listenerEnabled = listenerEnabled,
            batteryOptimizationIgnored = batteryOptimizationIgnored,
            fcmEnabled = preferencesManager.fcmToken.isNotBlank()
        )
    }
}
