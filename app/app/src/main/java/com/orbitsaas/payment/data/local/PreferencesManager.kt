package com.orbitsaas.payment.data.local

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class PreferencesManager(context: Context) {

    private val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

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

    var isDarkTheme: Boolean
        get() = prefs.getBoolean(KEY_IS_DARK_THEME, false)
        set(value) {
            prefs.edit().putBoolean(KEY_IS_DARK_THEME, value).apply()
            _isDarkThemeFlow.value = value
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
        private const val KEY_IS_DARK_THEME = "is_dark_theme"
    }
}
