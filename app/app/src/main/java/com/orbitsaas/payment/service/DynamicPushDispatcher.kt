package com.orbitsaas.payment.service

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.core.app.NotificationCompat
import com.orbitsaas.payment.OrbitApplication
import com.orbitsaas.payment.R
import com.orbitsaas.payment.data.local.OrbitDatabase
import com.orbitsaas.payment.data.local.PreferencesManager
import com.orbitsaas.payment.data.remote.DynamicPaymentActionDto
import com.orbitsaas.payment.ui.MainActivity
import com.orbitsaas.payment.update.AppUpdateManager
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.serialization.json.Json

/**
 * Unified server-driven push dispatcher shared by [FcmService] and [PushWebSocketClient].
 * Routes events across the 3 notification channels (`orbit_payments_urgent`,
 * `orbit_payments_verified`, `orbit_payments_status`), parses dynamic `actionsJson`,
 * validates `https://` admin deep-links, and updates local Room ledger state.
 */
object DynamicPushDispatcher {

    private const val TAG = "DynamicPushDispatcher"
    private const val DEDUP_TTL_MS = 15_000L
    private const val MAX_DEDUP_ENTRIES = 100

    const val EXTRA_PAYMENT_INTENT_ID = "extra_payment_intent_id"
    const val EXTRA_EXTERNAL_REF_ID = "extra_external_ref_id"
    const val EXTRA_ADMIN_DEEP_LINK = "extra_admin_deep_link"
    const val EXTRA_OPEN_TAB = "extra_open_tab"

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
    }

    private val dedupLock = Any()
    private val recentEvents = object : LinkedHashMap<String, Long>(MAX_DEDUP_ENTRIES, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Long>?): Boolean {
            return size > MAX_DEDUP_ENTRIES
        }
    }

    private val _refreshEvents = MutableSharedFlow<String>(extraBufferCapacity = 16)
    val refreshEvents: SharedFlow<String> = _refreshEvents.asSharedFlow()

    fun notifyRefreshNeeded(reason: String = "push") {
        _refreshEvents.tryEmit(reason)
    }

    fun isValidHttpsUrl(url: String?): Boolean {
        val trimmed = url?.trim().orEmpty()
        if (!trimmed.startsWith("https://", ignoreCase = true)) return false
        val parsed = runCatching { Uri.parse(trimmed) }.getOrNull() ?: return false
        return !parsed.host.isNullOrBlank()
    }

    fun parseActionsJson(rawJson: String?): List<DynamicPaymentActionDto> {
        val trimmed = rawJson?.trim().orEmpty()
        if (trimmed.isBlank()) return emptyList()
        return runCatching {
            json.decodeFromString<List<DynamicPaymentActionDto>>(trimmed)
                .filter { it.id.isNotBlank() && it.label.isNotBlank() }
        }.getOrElse { err ->
            Log.w(TAG, "Failed to parse actionsJson: ${err.message}")
            emptyList()
        }
    }

    suspend fun handlePush(
        context: Context,
        id: String = "",
        event: String? = null,
        title: String? = null,
        body: String? = null,
        data: Map<String, String> = emptyMap()
    ) {
        val appContext = context.applicationContext
        val resolvedEvent = (event?.takeIf { it.isNotBlank() }
            ?: data["event"]
            ?: data["eventType"]
            ?: data["type"]).orEmpty().trim()

        if (resolvedEvent == "app.update_available") {
            Log.i(TAG, "Received app.update_available push; checking for APK updates.")
            AppUpdateManager.checkForUpdates(
                context = appContext,
                userInitiated = false,
                autoDownload = true,
                forceCheck = true
            )
            return
        }

        val paymentIntentId = data["paymentIntentId"]?.trim().orEmpty()
        val externalRefId = (data["externalRefId"] ?: data["externalOrderId"] ?: data["orderId"])
            .orEmpty()
            .trim()
        val appName = data["appName"]?.trim().orEmpty()
        val referenceLabel = data["referenceLabel"]?.trim().orEmpty()
        val payloadTitle = data["title"]?.trim()?.takeIf { it.isNotBlank() }
        val subtitle = data["subtitle"]?.trim().orEmpty()
        val amountFormatted = data["amountFormatted"]?.trim().orEmpty()
        val provider = data["provider"]?.trim().orEmpty()
        val paymentStatus = data["paymentStatus"]?.trim()?.uppercase().orEmpty()
        val adminDeepLink = data["adminDeepLink"]?.trim().orEmpty()
        val actions = parseActionsJson(data["actionsJson"])
        val trxId = data["trxId"]?.trim().orEmpty()

        val effectiveEvent = when {
            resolvedEvent.isNotBlank() -> resolvedEvent
            trxId.isNotBlank() -> "payment.verified"
            else -> "notification"
        }

        val entityKey = paymentIntentId.ifBlank { externalRefId }.ifBlank { trxId }.ifBlank { id }
        val dedupKey = "$effectiveEvent:$entityKey:$paymentStatus"
        if (entityKey.isNotBlank() && isDuplicateRecentEvent(dedupKey)) {
            Log.d(TAG, "Skipping duplicate push event [$dedupKey]")
            return
        }

        if (effectiveEvent == "order.created" || effectiveEvent == "order.action_required") {
            if (externalRefId.isNotBlank()) {
                PreferencesManager(appContext).markOrderSeen(externalRefId)
            }
        }

        // Keep local Room SMS ledger synchronized when a verification event arrives
        if (trxId.isNotBlank() && (effectiveEvent == "payment.verified" || effectiveEvent == "payment.approved" || paymentStatus == "VERIFIED")) {
            try {
                val updatedRows = OrbitDatabase.getDatabase(appContext)
                    .smsDao()
                    .markVerifiedByTrxId(
                        trxId = trxId,
                        externalOrderId = externalRefId
                    )
                Log.i(TAG, "Marked TrxID $trxId as VERIFIED in Room DB ($updatedRows rows updated)")
            } catch (e: Exception) {
                Log.e(TAG, "Error updating verified transaction in Room DB: ${e.message}", e)
            }
        }

        notifyRefreshNeeded(effectiveEvent)

        val resolvedTitle = buildDynamicTitle(
            appContext = appContext,
            appName = appName,
            payloadTitle = payloadTitle,
            fallbackTitle = title,
            effectiveEvent = effectiveEvent,
            provider = provider,
            externalRefId = externalRefId,
            data = data
        )
        val resolvedBody = buildDynamicBody(
            appContext = appContext,
            amountFormatted = amountFormatted,
            provider = provider,
            referenceLabel = referenceLabel,
            externalRefId = externalRefId,
            subtitle = subtitle,
            trxId = trxId,
            fallbackBody = body,
            data = data
        )

        if (resolvedTitle.isBlank() && resolvedBody.isBlank()) {
            return
        }

        val (channelId, priority) = resolveChannelAndPriority(effectiveEvent, paymentStatus)
        val notificationId = ("orbit_push_${entityKey.ifBlank { System.currentTimeMillis().toString() }}_$effectiveEvent").hashCode()

        val openAppIntent = Intent(appContext, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (paymentIntentId.isNotBlank()) putExtra(EXTRA_PAYMENT_INTENT_ID, paymentIntentId)
            if (externalRefId.isNotBlank()) putExtra(EXTRA_EXTERNAL_REF_ID, externalRefId)
            if (isValidHttpsUrl(adminDeepLink)) putExtra(EXTRA_ADMIN_DEEP_LINK, adminDeepLink)
            putExtra(EXTRA_OPEN_TAB, "payments")
        }

        val contentPendingIntent = PendingIntent.getActivity(
            appContext,
            notificationId,
            openAppIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val builder = NotificationCompat.Builder(appContext, channelId)
            .setSmallIcon(R.drawable.ic_stat_orbit)
            .setContentTitle(resolvedTitle.ifBlank { appContext.getString(R.string.app_name) })
            .setContentText(resolvedBody)
            .setStyle(NotificationCompat.BigTextStyle().bigText(resolvedBody))
            .setPriority(priority)
            .setAutoCancel(true)
            .setContentIntent(contentPendingIntent)

        attachNotificationActions(
            appContext = appContext,
            builder = builder,
            notificationId = notificationId,
            paymentIntentId = paymentIntentId,
            externalRefId = externalRefId,
            paymentStatus = paymentStatus,
            effectiveEvent = effectiveEvent,
            actions = actions,
            adminDeepLink = adminDeepLink
        )

        try {
            val nm = appContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(notificationId, builder.build())
        } catch (se: SecurityException) {
            Log.w(TAG, "Notification permission missing: ${se.message}")
        }
    }

    private fun attachNotificationActions(
        appContext: Context,
        builder: NotificationCompat.Builder,
        notificationId: Int,
        paymentIntentId: String,
        externalRefId: String,
        paymentStatus: String,
        effectiveEvent: String,
        actions: List<DynamicPaymentActionDto>,
        adminDeepLink: String
    ) {
        val targetId = paymentIntentId.ifBlank { externalRefId }
        val hasValidDeepLink = isValidHttpsUrl(adminDeepLink)
        var actionCount = 0

        val needsReviewResolution = paymentStatus == "MANUAL_REVIEW_REQUIRED" ||
            effectiveEvent == "payment.escalated_manual"

        if (targetId.isNotBlank()) {
            if (actions.isNotEmpty()) {
                val maxDynamicActions = if (hasValidDeepLink) 2 else 3
                actions.take(maxDynamicActions).forEachIndexed { index, action ->
                    val pi = PaymentActionReceiver.createTriggerActionPendingIntent(
                        context = appContext,
                        requestCode = notificationId + index + 1,
                        notificationId = notificationId,
                        intentId = targetId,
                        externalRefId = externalRefId,
                        actionId = action.id,
                        actionLabel = action.label
                    )
                    builder.addAction(0, action.label, pi)
                    actionCount++
                }
            } else if (needsReviewResolution) {
                val approvePi = PaymentActionReceiver.createResolvePendingIntent(
                    context = appContext,
                    requestCode = notificationId + 1,
                    notificationId = notificationId,
                    intentId = targetId,
                    externalRefId = externalRefId,
                    decision = "APPROVE"
                )
                builder.addAction(0, appContext.getString(R.string.notif_action_approve), approvePi)
                actionCount++

                val rejectPi = PaymentActionReceiver.createResolvePendingIntent(
                    context = appContext,
                    requestCode = notificationId + 2,
                    notificationId = notificationId,
                    intentId = targetId,
                    externalRefId = externalRefId,
                    decision = "REJECT"
                )
                builder.addAction(0, appContext.getString(R.string.notif_action_reject), rejectPi)
                actionCount++
            }
        }

        if (hasValidDeepLink && actionCount < 3) {
            val viewIntent = Intent(Intent.ACTION_VIEW, Uri.parse(adminDeepLink)).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            val viewPi = PendingIntent.getActivity(
                appContext,
                notificationId + 99,
                viewIntent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            builder.addAction(0, appContext.getString(R.string.notif_action_open_admin), viewPi)
        }
    }

    private fun resolveChannelAndPriority(event: String, paymentStatus: String): Pair<String, Int> {
        val isUrgent = event in setOf(
            "payment.escalated_manual",
            "payment.submitted",
            "order.created",
            "order.action_required"
        ) || paymentStatus == "MANUAL_REVIEW_REQUIRED"

        if (isUrgent) {
            return OrbitApplication.ORBIT_PAYMENTS_URGENT_CHANNEL to NotificationCompat.PRIORITY_HIGH
        }

        val isVerified = event in setOf(
            "payment.verified",
            "payment.approved"
        ) || paymentStatus == "VERIFIED"

        if (isVerified) {
            return OrbitApplication.ORBIT_PAYMENTS_VERIFIED_CHANNEL to NotificationCompat.PRIORITY_DEFAULT
        }

        return OrbitApplication.ORBIT_PAYMENTS_STATUS_CHANNEL to NotificationCompat.PRIORITY_LOW
    }

    private fun buildDynamicTitle(
        appContext: Context,
        appName: String,
        payloadTitle: String?,
        fallbackTitle: String?,
        effectiveEvent: String,
        provider: String,
        externalRefId: String,
        data: Map<String, String>
    ): String {
        if (appName.isNotBlank() && !payloadTitle.isNullOrBlank()) {
            return if (payloadTitle.startsWith(appName, ignoreCase = true)) {
                payloadTitle
            } else {
                "$appName: $payloadTitle"
            }
        }
        if (!payloadTitle.isNullOrBlank()) return payloadTitle
        if (!fallbackTitle.isNullOrBlank()) return fallbackTitle

        if (effectiveEvent == "order.created" || effectiveEvent == "order.action_required") {
            val paymentMethod = (data["paymentMethod"] ?: data["method"] ?: "COD").uppercase()
            val amount = (data["amount"] ?: data["baseAmount"]).orEmpty().trim()
            val prefix = if (effectiveEvent == "order.action_required") {
                appContext.getString(R.string.core_notif_action_required_prefix, paymentMethod)
            } else {
                appContext.getString(R.string.core_notif_new_order_prefix, paymentMethod)
            }
            return buildString {
                append(prefix)
                if (externalRefId.isNotBlank()) append(" #$externalRefId")
                if (amount.isNotBlank()) append(" • ৳$amount")
            }
        }

        if (effectiveEvent == "payment.verified") {
            return appContext.getString(
                R.string.core_notif_verified_title,
                provider.ifBlank { "MFS" }
            )
        }

        return appName.ifBlank { appContext.getString(R.string.app_name) }
    }

    private fun buildDynamicBody(
        appContext: Context,
        amountFormatted: String,
        provider: String,
        referenceLabel: String,
        externalRefId: String,
        subtitle: String,
        trxId: String,
        fallbackBody: String?,
        data: Map<String, String>
    ): String {
        val parts = mutableListOf<String>()
        val resolvedAmount = amountFormatted.ifBlank {
            data["amount"]?.trim()?.takeIf { it.isNotBlank() }?.let { "৳$it" }
                ?: data["baseAmount"]?.trim()?.takeIf { it.isNotBlank() }?.let { "৳$it" }
                ?: ""
        }
        if (resolvedAmount.isNotBlank()) parts.add(resolvedAmount)
        if (provider.isNotBlank()) parts.add(provider)
        if (externalRefId.isNotBlank()) {
            val labelPrefix = referenceLabel.takeIf { it.isNotBlank() }?.let { "$it " } ?: "#"
            parts.add("$labelPrefix$externalRefId")
        }
        if (trxId.isNotBlank()) parts.add("TrxID $trxId")
        if (subtitle.isNotBlank()) parts.add(subtitle)

        if (parts.isNotEmpty()) {
            return parts.joinToString(" • ")
        }
        if (!fallbackBody.isNullOrBlank()) {
            return fallbackBody
        }
        val customerName = data["customerName"]?.trim().orEmpty()
        return if (customerName.isNotBlank()) customerName else appContext.getString(R.string.core_notif_order_tap_review)
    }

    private fun isDuplicateRecentEvent(key: String): Boolean {
        val now = System.currentTimeMillis()
        synchronized(dedupLock) {
            val prev = recentEvents[key]
            if (prev != null && now - prev < DEDUP_TTL_MS) {
                return true
            }
            recentEvents[key] = now
            return false
        }
    }
}
