package com.orbitsaas.payment.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import android.view.View
import android.widget.RemoteViews
import com.orbitsaas.payment.R
import com.orbitsaas.payment.data.local.PreferencesManager
import com.orbitsaas.payment.data.remote.OrbitApiClient
import com.orbitsaas.payment.data.remote.PaymentIntentDto
import com.orbitsaas.payment.service.DynamicPushDispatcher
import com.orbitsaas.payment.ui.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.text.NumberFormat
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.abs

@Serializable
data class PendingWidgetItem(
    val id: String = "",
    val externalRefId: String = "",
    val title: String = "",
    val meta: String = "",
    val amountText: String = ""
)

@Serializable
data class PendingWidgetSnapshot(
    val storeName: String = "",
    val pendingCount: Int = 0,
    val updatedAtMs: Long = 0L,
    val items: List<PendingWidgetItem> = emptyList()
)

/**
 * Home screen AppWidget showing live payments waiting for verification.
 * Merchants can pin it to their Android home screen to see pending count,
 * latest transactions, refresh in 1 tap, or tap any row to open and verify.
 */
class PendingPaymentsWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            renderWidget(context, appWidgetManager, appWidgetId)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH_WIDGET) {
            if (!isRefreshingWidget.compareAndSet(false, true)) return
            val pendingResult = goAsync()
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val prefs = PreferencesManager(context)
                    if (prefs.isLoggedIn()) {
                        OrbitApiClient(prefs).listPaymentIntents(limit = 50).onSuccess { data ->
                            saveSnapshotFromIntents(context, data.items, prefs.storeName)
                        }
                    }
                    updateAllWidgets(context)
                } catch (err: Exception) {
                    Log.w(TAG, "Widget refresh failed: ${err.message}")
                } finally {
                    isRefreshingWidget.set(false)
                    pendingResult.finish()
                }
            }
        }
    }

    companion object {
        private const val TAG = "PendingWidgetProvider"
        private val isRefreshingWidget = AtomicBoolean(false)
        const val ACTION_REFRESH_WIDGET = "com.orbitsaas.payment.action.REFRESH_PENDING_WIDGET"
        private const val PREF_WIDGET_SNAPSHOT = "pending_widget_snapshot_json"
        private const val PREFS_NAME = "orbit_payment_preferences"

        private val PENDING_STATUSES = setOf(
            "OPEN",
            "WAITING_FOR_SMS",
            "MANUAL_REVIEW_REQUIRED"
        )

        private val json = Json {
            ignoreUnknownKeys = true
            encodeDefaults = true
        }

        fun saveAndRefresh(
            context: Context,
            intents: List<PaymentIntentDto>,
            storeName: String
        ) {
            saveSnapshotFromIntents(context, intents, storeName)
            updateAllWidgets(context)
        }

        fun saveSnapshotFromIntents(
            context: Context,
            intents: List<PaymentIntentDto>,
            storeName: String
        ) {
            val pending = intents.filter {
                it.status.uppercase(Locale.US) in PENDING_STATUSES
            }
            val mappedItems = pending.take(2).map { intent ->
                val title = intent.display.title?.takeIf { it.isNotBlank() }
                    ?: "#${intent.externalRefId}"
                val providerText = intent.provider?.takeIf { it.isNotBlank() } ?: "MFS"
                val statusLabel = when (intent.status.uppercase(Locale.US)) {
                    "MANUAL_REVIEW_REQUIRED" -> context.getString(R.string.intent_status_manual_review)
                    "WAITING_FOR_SMS" -> context.getString(R.string.intent_status_waiting_sms)
                    else -> context.getString(R.string.intent_status_open)
                }
                val metaParts = buildList {
                    add(providerText)
                    add(statusLabel)
                    intent.senderNumber?.takeIf { it.isNotBlank() }?.let { add(it) }
                }
                val amount = intent.paidAmount ?: intent.uniqueAmount
                PendingWidgetItem(
                    id = intent.id,
                    externalRefId = intent.externalRefId,
                    title = title,
                    meta = metaParts.joinToString(" · "),
                    amountText = formatWidgetAmount(amount)
                )
            }

            val snapshot = PendingWidgetSnapshot(
                storeName = storeName,
                pendingCount = pending.size,
                updatedAtMs = System.currentTimeMillis(),
                items = mappedItems
            )

            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(PREF_WIDGET_SNAPSHOT, json.encodeToString(snapshot))
                .apply()
        }

        fun updateAllWidgets(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val componentName = ComponentName(context, PendingPaymentsWidgetProvider::class.java)
            val ids = manager.getAppWidgetIds(componentName)
            for (id in ids) {
                renderWidget(context, manager, id)
            }
        }

        fun canRequestPin(context: Context): Boolean {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
            val manager = AppWidgetManager.getInstance(context)
            return manager.isRequestPinAppWidgetSupported
        }

        fun requestPinWidget(context: Context): Boolean {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
            val manager = AppWidgetManager.getInstance(context)
            if (!manager.isRequestPinAppWidgetSupported) return false
            val component = ComponentName(context, PendingPaymentsWidgetProvider::class.java)
            return runCatching {
                manager.requestPinAppWidget(component, null, null)
            }.getOrDefault(false)
        }

        private fun loadSnapshot(context: Context): PendingWidgetSnapshot {
            val prefs = PreferencesManager(context)
            val raw = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getString(PREF_WIDGET_SNAPSHOT, null)
                .orEmpty()
            val decoded = if (raw.isNotBlank()) {
                runCatching { json.decodeFromString<PendingWidgetSnapshot>(raw) }.getOrNull()
            } else {
                null
            }
            return decoded ?: PendingWidgetSnapshot(
                storeName = prefs.storeName,
                pendingCount = 0
            )
        }

        private fun renderWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            val snapshot = loadSnapshot(context)
            val views = RemoteViews(context.packageName, R.layout.widget_pending_payments)

            val subtitleText = snapshot.storeName.ifBlank { context.getString(R.string.app_name) }
            views.setTextViewText(R.id.widget_title, context.getString(R.string.widget_pending_title))
            views.setTextViewText(R.id.widget_subtitle, subtitleText)
            views.setTextViewText(
                R.id.widget_count_badge,
                context.getString(R.string.widget_pending_count_badge, snapshot.pendingCount)
            )
            views.setInt(
                R.id.widget_count_badge,
                "setBackgroundResource",
                if (snapshot.pendingCount > 0) R.drawable.widget_badge_amber else R.drawable.widget_badge_green
            )

            // Root click opens MainActivity directly
            views.setOnClickPendingIntent(
                R.id.widget_root,
                createOpenAppPendingIntent(context, requestCode = 100 + appWidgetId, intentId = null, externalRefId = null)
            )

            // Refresh click triggers background refresh
            val refreshIntent = Intent(context, PendingPaymentsWidgetProvider::class.java).apply {
                action = ACTION_REFRESH_WIDGET
            }
            val refreshPi = PendingIntent.getBroadcast(
                context,
                200 + appWidgetId,
                refreshIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_btn_refresh, refreshPi)

            val items = snapshot.items
            if (items.isEmpty()) {
                views.setViewVisibility(R.id.widget_empty_container, View.VISIBLE)
                views.setViewVisibility(R.id.widget_item_1, View.GONE)
                views.setViewVisibility(R.id.widget_item_2, View.GONE)
            } else {
                views.setViewVisibility(R.id.widget_empty_container, View.GONE)

                val first = items[0]
                views.setViewVisibility(R.id.widget_item_1, View.VISIBLE)
                views.setTextViewText(R.id.widget_item_1_title, first.title)
                views.setTextViewText(R.id.widget_item_1_meta, first.meta)
                views.setTextViewText(R.id.widget_item_1_amount, first.amountText)
                views.setOnClickPendingIntent(
                    R.id.widget_item_1,
                    createOpenAppPendingIntent(
                        context,
                        requestCode = 300 + appWidgetId,
                        intentId = first.id,
                        externalRefId = first.externalRefId
                    )
                )

                if (items.size > 1) {
                    val second = items[1]
                    views.setViewVisibility(R.id.widget_item_2, View.VISIBLE)
                    views.setTextViewText(R.id.widget_item_2_title, second.title)
                    views.setTextViewText(R.id.widget_item_2_meta, second.meta)
                    views.setTextViewText(R.id.widget_item_2_amount, second.amountText)
                    views.setOnClickPendingIntent(
                        R.id.widget_item_2,
                        createOpenAppPendingIntent(
                            context,
                            requestCode = 400 + appWidgetId,
                            intentId = second.id,
                            externalRefId = second.externalRefId
                        )
                    )
                } else {
                    views.setViewVisibility(R.id.widget_item_2, View.GONE)
                }
            }

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }

        private fun createOpenAppPendingIntent(
            context: Context,
            requestCode: Int,
            intentId: String?,
            externalRefId: String?
        ): PendingIntent {
            val launchIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                if (!intentId.isNullOrBlank()) {
                    putExtra(DynamicPushDispatcher.EXTRA_PAYMENT_INTENT_ID, intentId)
                }
                if (!externalRefId.isNullOrBlank()) {
                    putExtra(DynamicPushDispatcher.EXTRA_EXTERNAL_REF_ID, externalRefId)
                }
                putExtra(DynamicPushDispatcher.EXTRA_OPEN_TAB, "payments")
            }
            return PendingIntent.getActivity(
                context,
                requestCode,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        private fun formatWidgetAmount(amount: Double): String {
            val hasFraction = abs(amount - amount.toLong().toDouble()) >= 0.005
            val formatter = NumberFormat.getNumberInstance(Locale.US).apply {
                minimumFractionDigits = if (hasFraction) 2 else 0
                maximumFractionDigits = if (hasFraction) 2 else 0
            }
            return "৳ ${formatter.format(amount)}"
        }
    }
}
