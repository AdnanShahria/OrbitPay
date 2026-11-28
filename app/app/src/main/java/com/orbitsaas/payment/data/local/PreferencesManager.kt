package com.orbitsaas.payment.data.local

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@Serializable
data class ConfirmedSimSlot(
    val slotIndex: Int,
    val carrierName: String = "",
    val phoneNumber: String = ""
)

class PreferencesManager(context: Context) {

    private val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val simJson = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private val _serverUrlFlow = MutableStateFlow(serverUrl)
    val serverUrlFlow: StateFlow<String> = _serverUrlFlow.asStateFlow()

    private val _merchantIdFlow = MutableStateFlow(merchantId)
    val merchantIdFlow: StateFlow<String> = _merchantIdFlow.asStateFlow()

    private val _deviceKeyFlow = MutableStateFlow(deviceKey)
    val deviceKeyFlow: StateFlow<String> = _deviceKeyFlow.asStateFlow()

    private val _isDarkThemeFlow = MutableStateFlow(isDarkTheme)
    val isDarkThemeFlow: StateFlow<Boolean> = _isDarkThemeFlow.asStateFlow()

    private val _authTokenFlow = MutableStateFlow(authToken)
    val authTokenFlow: StateFlow<String> = _authTokenFlow.asStateFlow()

    private val _userEmailFlow = MutableStateFlow(userEmail)
    val userEmailFlow: StateFlow<String> = _userEmailFlow.asStateFlow()

    private val _storeNameFlow = MutableStateFlow(storeName)
    val storeNameFlow: StateFlow<String> = _storeNameFlow.asStateFlow()

    private val _isForegroundServiceEnabledFlow = MutableStateFlow(isForegroundServiceEnabled)
    val isForegroundServiceEnabledFlow: StateFlow<Boolean> = _isForegroundServiceEnabledFlow.asStateFlow()

    private val _extraTrustedSendersFlow = MutableStateFlow(extraTrustedSenders)
    val extraTrustedSendersFlow: StateFlow<String> = _extraTrustedSendersFlow.asStateFlow()

    private val _appLanguageFlow = MutableStateFlow(appLanguage)
    val appLanguageFlow: StateFlow<String> = _appLanguageFlow.asStateFlow()

    var serverUrl: String
        get() = prefs.getString(KEY_SERVER_URL, DEFAULT_SERVER_URL) ?: DEFAULT_SERVER_URL
        set(value) {
            val sanitized = normalizeServerUrl(value)
            prefs.edit().putString(KEY_SERVER_URL, sanitized).apply()
            _serverUrlFlow.value = sanitized
        }

    var merchantId: String
        get() = prefs.getString(KEY_MERCHANT_ID, "") ?: ""
        set(value) {
            val sanitized = value.trim()
            prefs.edit().putString(KEY_MERCHANT_ID, sanitized).apply()
            _merchantIdFlow.value = sanitized
        }

    var deviceKey: String
        get() = prefs.getString(KEY_DEVICE_KEY, "") ?: ""
        set(value) {
            val sanitized = value.trim()
            prefs.edit().putString(KEY_DEVICE_KEY, sanitized).apply()
            _deviceKeyFlow.value = sanitized
        }

    var authToken: String
        get() = prefs.getString(KEY_AUTH_TOKEN, "") ?: ""
        set(value) {
            val sanitized = value.trim()
            prefs.edit().putString(KEY_AUTH_TOKEN, sanitized).apply()
            _authTokenFlow.value = sanitized
        }

    var sessionId: String
        get() = prefs.getString(KEY_SESSION_ID, "") ?: ""
        set(value) {
            prefs.edit().putString(KEY_SESSION_ID, value.trim()).apply()
        }

    var userEmail: String
        get() = prefs.getString(KEY_USER_EMAIL, "") ?: ""
        set(value) {
            val sanitized = value.trim()
            prefs.edit().putString(KEY_USER_EMAIL, sanitized).apply()
            _userEmailFlow.value = sanitized
        }

    var storeName: String
        get() = prefs.getString(KEY_STORE_NAME, "") ?: ""
        set(value) {
            val sanitized = value.trim()
            prefs.edit().putString(KEY_STORE_NAME, sanitized).apply()
            _storeNameFlow.value = sanitized
        }

    var fcmToken: String
        get() = prefs.getString(KEY_FCM_TOKEN, "") ?: ""
        set(value) {
            prefs.edit().putString(KEY_FCM_TOKEN, value).apply()
        }

    var isOnboardingCompleted: Boolean
        get() = prefs.getBoolean(KEY_ONBOARDING_COMPLETED, false)
        set(value) {
            prefs.edit().putBoolean(KEY_ONBOARDING_COMPLETED, value).apply()
        }

    var isForegroundServiceEnabled: Boolean
        get() = prefs.getBoolean(KEY_FG_SERVICE_ENABLED, true)
        set(value) {
            prefs.edit().putBoolean(KEY_FG_SERVICE_ENABLED, value).apply()
            _isForegroundServiceEnabledFlow.value = value
        }

    var lastHeartbeatTime: Long
        get() = prefs.getLong(KEY_LAST_HEARTBEAT, 0L)
        set(value) {
            prefs.edit().putLong(KEY_LAST_HEARTBEAT, value).apply()
        }

    var lastHeartbeatAt: Long
        get() = prefs.getLong(KEY_LAST_HEARTBEAT_AT, 0L)
        set(value) {
            prefs.edit().putLong(KEY_LAST_HEARTBEAT_AT, value).apply()
        }

    var lastUpdateCheckAt: Long
        get() = prefs.getLong(KEY_LAST_UPDATE_CHECK_AT, 0L)
        set(value) {
            prefs.edit().putLong(KEY_LAST_UPDATE_CHECK_AT, value).apply()
        }

    var isDarkTheme: Boolean
        get() = prefs.getBoolean(KEY_IS_DARK_THEME, false)
        set(value) {
            prefs.edit().putBoolean(KEY_IS_DARK_THEME, value).apply()
            _isDarkThemeFlow.value = value
        }

    var extraTrustedSenders: String
        get() = prefs.getString(KEY_EXTRA_TRUSTED_SENDERS, "") ?: ""
        set(value) {
            val sanitized = value.trim()
            prefs.edit().putString(KEY_EXTRA_TRUSTED_SENDERS, sanitized).apply()
            _extraTrustedSendersFlow.value = sanitized
        }

    var lastInboxScanAt: Long
        get() = prefs.getLong(KEY_LAST_INBOX_SCAN_AT, 0L)
        set(value) {
            prefs.edit().putLong(KEY_LAST_INBOX_SCAN_AT, value).apply()
        }

    var lastSyncAt: Long
        get() = prefs.getLong(KEY_LAST_SYNC_AT, 0L)
        set(value) {
            prefs.edit().putLong(KEY_LAST_SYNC_AT, value).apply()
        }

    var seenOrderIds: Set<String>
        get() {
            val raw = prefs.getString(KEY_SEEN_ORDER_IDS, "") ?: ""
            if (raw.isBlank()) return emptySet()
            return raw.split("\n")
                .map { it.trim() }
                .filter { it.isNotEmpty() }
                .toCollection(LinkedHashSet())
        }
        set(value) {
            val capped = value
                .map { it.trim() }
                .filter { it.isNotEmpty() }
                .takeLast(MAX_SEEN_ORDER_IDS)
            prefs.edit().putString(KEY_SEEN_ORDER_IDS, capped.joinToString("\n")).apply()
        }

    /**
     * Records [orderId] in the bounded seen-order ring buffer (max 200).
     * Returns true if [orderId] was NOT previously seen.
     */
    fun markOrderSeen(orderId: String): Boolean {
        val trimmed = orderId.trim()
        if (trimmed.isEmpty()) return false
        val current = seenOrderIds.toMutableList()
        if (current.contains(trimmed)) return false
        current.add(trimmed)
        val capped = if (current.size > MAX_SEEN_ORDER_IDS) {
            current.takeLast(MAX_SEEN_ORDER_IDS)
        } else {
            current
        }
        prefs.edit().putString(KEY_SEEN_ORDER_IDS, capped.joinToString("\n")).apply()
        return true
    }

    var appLanguage: String
        get() {
            val stored = prefs.getString(KEY_APP_LANGUAGE, LANG_SYSTEM) ?: LANG_SYSTEM
            return if (stored in VALID_LANGUAGES) stored else LANG_SYSTEM
        }
        set(value) {
            val normalized = value.trim().lowercase().let { if (it in VALID_LANGUAGES) it else LANG_SYSTEM }
            prefs.edit().putString(KEY_APP_LANGUAGE, normalized).apply()
            _appLanguageFlow.value = normalized
        }

    var confirmedSimNumbersJson: String
        get() = prefs.getString(KEY_CONFIRMED_SIM_NUMBERS, "[]") ?: "[]"
        set(value) {
            prefs.edit().putString(KEY_CONFIRMED_SIM_NUMBERS, value).apply()
        }

    fun getConfirmedSimSlots(): List<ConfirmedSimSlot> {
        val raw = confirmedSimNumbersJson
        if (raw.isBlank()) return emptyList()
        return runCatching {
            simJson.decodeFromString<List<ConfirmedSimSlot>>(raw)
        }.getOrDefault(emptyList())
    }

    fun saveConfirmedSimSlot(slotIndex: Int, number: String, carrierName: String = "") {
        val trimmedNumber = number.trim()
        val updated = getConfirmedSimSlots()
            .filterNot { it.slotIndex == slotIndex }
            .toMutableList()
        if (trimmedNumber.isNotBlank()) {
            updated.add(
                ConfirmedSimSlot(
                    slotIndex = slotIndex,
                    carrierName = carrierName.trim(),
                    phoneNumber = trimmedNumber
                )
            )
        }
        updated.sortBy { it.slotIndex }
        confirmedSimNumbersJson = simJson.encodeToString(updated)
    }

    fun clearConfirmedSimSlots() {
        confirmedSimNumbersJson = "[]"
    }

    fun isConfigured(): Boolean {
        return merchantId.isNotBlank() && deviceKey.isNotBlank()
    }

    fun isLoggedIn(): Boolean {
        return authToken.isNotBlank() || isConfigured()
    }

    fun clearAuthSession() {
        prefs.edit()
            .remove(KEY_AUTH_TOKEN)
            .remove(KEY_SESSION_ID)
            .remove(KEY_USER_EMAIL)
            .remove(KEY_STORE_NAME)
            .remove(KEY_MERCHANT_ID)
            .remove(KEY_DEVICE_KEY)
            .remove(KEY_LAST_INBOX_SCAN_AT)
            .remove(KEY_LAST_SYNC_AT)
            .remove(KEY_SEEN_ORDER_IDS)
            .apply()
        _authTokenFlow.value = ""
        _userEmailFlow.value = ""
        _storeNameFlow.value = ""
        _merchantIdFlow.value = ""
        _deviceKeyFlow.value = ""
    }

    companion object {
        private const val PREFS_NAME = "orbit_payment_preferences"
        private const val DEFAULT_SERVER_URL = "https://payment.orbitsaas.cloud"
        private const val MAX_SEEN_ORDER_IDS = 200

        const val LANG_SYSTEM = "system"
        const val LANG_EN = "en"
        const val LANG_BN = "bn"
        private val VALID_LANGUAGES = setOf(LANG_SYSTEM, LANG_EN, LANG_BN)

        fun normalizeServerUrl(raw: String): String {
            val trimmed = raw.trim().removeSuffix("/")
            if (trimmed.isBlank()) return DEFAULT_SERVER_URL
            return if (trimmed.startsWith("http://", ignoreCase = true) ||
                trimmed.startsWith("https://", ignoreCase = true)
            ) {
                trimmed
            } else {
                "https://$trimmed"
            }
        }

        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_MERCHANT_ID = "merchant_id"
        private const val KEY_DEVICE_KEY = "device_key"
        private const val KEY_AUTH_TOKEN = "auth_token"
        private const val KEY_SESSION_ID = "session_id"
        private const val KEY_USER_EMAIL = "user_email"
        private const val KEY_STORE_NAME = "store_name"
        private const val KEY_FCM_TOKEN = "fcm_token"
        private const val KEY_ONBOARDING_COMPLETED = "onboarding_completed"
        private const val KEY_FG_SERVICE_ENABLED = "fg_service_enabled"
        private const val KEY_LAST_HEARTBEAT = "last_heartbeat"
        private const val KEY_LAST_HEARTBEAT_AT = "last_heartbeat_at"
        private const val KEY_LAST_UPDATE_CHECK_AT = "last_update_check_at"
        private const val KEY_IS_DARK_THEME = "is_dark_theme"
        private const val KEY_EXTRA_TRUSTED_SENDERS = "extra_trusted_senders"
        private const val KEY_LAST_INBOX_SCAN_AT = "last_inbox_scan_at"
        private const val KEY_LAST_SYNC_AT = "last_sync_at"
        private const val KEY_SEEN_ORDER_IDS = "seen_order_ids"
        private const val KEY_APP_LANGUAGE = "app_language"
        private const val KEY_CONFIRMED_SIM_NUMBERS = "confirmed_sim_numbers"
    }
}
