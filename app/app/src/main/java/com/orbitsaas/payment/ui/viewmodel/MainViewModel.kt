package com.orbitsaas.payment.ui.viewmodel

import android.app.Application
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import com.orbitsaas.payment.data.local.LocalStats
import com.orbitsaas.payment.data.local.OrbitDatabase
import com.orbitsaas.payment.data.local.PreferencesManager
import com.orbitsaas.payment.data.local.SmsEntity
import com.orbitsaas.payment.data.remote.IngestSmsItem
import com.orbitsaas.payment.data.remote.MerchantOrderDto
import com.orbitsaas.payment.data.remote.OrbitApiClient
import com.orbitsaas.payment.data.remote.PaymentIntentDto
import com.orbitsaas.payment.data.remote.UnauthorizedException
import com.orbitsaas.payment.interceptors.InboxScanner
import com.orbitsaas.payment.service.DynamicPushDispatcher
import com.orbitsaas.payment.service.FcmTokenRegistrar
import com.orbitsaas.payment.service.StickyForegroundService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class DashboardUiState(
    val isOnline: Boolean = true,
    val isSyncing: Boolean = false,
    val isDarkTheme: Boolean = false,
    val totalVerifiedVolume: Double = 0.0,
    val verifiedCount: Int = 0,
    val unclaimedCount: Int = 0,
    val pendingUploadCount: Int = 0,
    val transactions: List<SmsEntity> = emptyList(),
    val orders: List<MerchantOrderDto> = emptyList(),
    val pendingOrderCount: Int = 0,
    val isOrdersLoading: Boolean = false,
    val actionInProgressOrderId: String? = null,
    val paymentIntents: List<PaymentIntentDto> = emptyList(),
    val isIntentsLoading: Boolean = false,
    val actionInProgressIntentId: String? = null,
    val focusedPaymentIntentId: String? = null,
    val merchantId: String = "",
    val serverUrl: String = "",
    val deviceKey: String = "",
    val isLoggedIn: Boolean = false,
    val storeName: String = "",
    val userEmail: String = "",
    val isLoggingIn: Boolean = false,
    val loginError: String? = null,
    val isForegroundEnabled: Boolean = true,
    val isOnboardingCompleted: Boolean = false,
    val feedbackMessage: String? = null
)

private data class CoreStatusBundle(
    val isOnline: Boolean,
    val isSyncing: Boolean,
    val feedbackMessage: String?,
    val isDarkTheme: Boolean
)

private data class OrdersBundle(
    val orders: List<MerchantOrderDto>,
    val pendingOrderCount: Int,
    val isOrdersLoading: Boolean,
    val actionInProgressOrderId: String?
)

private data class IntentsBundle(
    val paymentIntents: List<PaymentIntentDto>,
    val isIntentsLoading: Boolean,
    val actionInProgressIntentId: String?,
    val focusedPaymentIntentId: String?
)

private data class AuthBundle(
    val authToken: String,
    val userEmail: String,
    val storeName: String,
    val merchantId: String,
    val deviceKey: String
)

private data class LoginProgressBundle(
    val isLoggingIn: Boolean,
    val loginError: String?,
    val serverUrl: String,
    val isForegroundEnabled: Boolean
)

class MainViewModel(application: Application) : AndroidViewModel(application) {

    private val database = OrbitDatabase.getDatabase(application)
    private val preferences = PreferencesManager(application)
    private val apiClient = OrbitApiClient(preferences)

    private val _isOnline = MutableStateFlow(checkInitialNetworkState())
    private val _isSyncing = MutableStateFlow(false)
    private val _feedbackMessage = MutableStateFlow<String?>(null)

    private val _orders = MutableStateFlow<List<MerchantOrderDto>>(emptyList())
    private val _pendingOrderCount = MutableStateFlow(0)
    private val _isOrdersLoading = MutableStateFlow(false)
    private val _actionInProgressOrderId = MutableStateFlow<String?>(null)

    private val _paymentIntents = MutableStateFlow<List<PaymentIntentDto>>(emptyList())
    private val _isIntentsLoading = MutableStateFlow(false)
    private val _actionInProgressIntentId = MutableStateFlow<String?>(null)
    private val _focusedPaymentIntentId = MutableStateFlow<String?>(null)

    private val _isLoggingIn = MutableStateFlow(false)
    private val _loginError = MutableStateFlow<String?>(null)

    // Flow of recent 50 transactions
    val recentTransactions: StateFlow<List<SmsEntity>> = database.smsDao()
        .getRecentTransactions(50)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // Flow of local aggregated stats
    private val statsFlow = database.smsDao()
        .getStatsSummaryFlow()
        .stateIn(
            viewModelScope,
            SharingStarted.WhileSubscribed(5000),
            LocalStats(0.0, 0, 0, 0)
        )

    private val coreBundleFlow = combine(
        _isOnline,
        _isSyncing,
        _feedbackMessage,
        preferences.isDarkThemeFlow
    ) { isOnline, isSyncing, feedback, isDarkTheme ->
        CoreStatusBundle(isOnline, isSyncing, feedback, isDarkTheme)
    }

    private val ordersBundleFlow = combine(
        _orders,
        _pendingOrderCount,
        _isOrdersLoading,
        _actionInProgressOrderId
    ) { orders, pendingCount, isLoading, actionOrderId ->
        OrdersBundle(orders, pendingCount, isLoading, actionOrderId)
    }

    private val intentsBundleFlow = combine(
        _paymentIntents,
        _isIntentsLoading,
        _actionInProgressIntentId,
        _focusedPaymentIntentId
    ) { intents, isLoading, actionIntentId, focusedIntentId ->
        IntentsBundle(intents, isLoading, actionIntentId, focusedIntentId)
    }

    private val authBundleFlow = combine(
        preferences.authTokenFlow,
        preferences.userEmailFlow,
        preferences.storeNameFlow,
        preferences.merchantIdFlow,
        preferences.deviceKeyFlow
    ) { authToken, userEmail, storeName, merchantId, deviceKey ->
        AuthBundle(authToken, userEmail, storeName, merchantId, deviceKey)
    }

    private val loginProgressBundleFlow = combine(
        _isLoggingIn,
        _loginError,
        preferences.serverUrlFlow,
        preferences.isForegroundServiceEnabledFlow
    ) { isLoggingIn, loginError, serverUrl, isFgEnabled ->
        LoginProgressBundle(isLoggingIn, loginError, serverUrl, isFgEnabled)
    }

    // Combined UI State
    val uiState: StateFlow<DashboardUiState> = combine(
        combine(coreBundleFlow, ordersBundleFlow, intentsBundleFlow) { core, orders, intents ->
            Triple(core, orders, intents)
        },
        combine(authBundleFlow, loginProgressBundleFlow) { auth, loginProg ->
            auth to loginProg
        },
        recentTransactions,
        statsFlow
    ) { (core, ordersBundle, intentsBundle), (auth, loginProg), transactions, stats ->
        val loggedIn = auth.authToken.isNotBlank() || (auth.merchantId.isNotBlank() && auth.deviceKey.isNotBlank())

        DashboardUiState(
            isOnline = core.isOnline,
            isSyncing = core.isSyncing,
            isDarkTheme = core.isDarkTheme,
            totalVerifiedVolume = stats.totalVerifiedVolume,
            verifiedCount = stats.verifiedCount,
            unclaimedCount = stats.unclaimedCount,
            pendingUploadCount = stats.pendingCount,
            transactions = transactions,
            orders = ordersBundle.orders,
            pendingOrderCount = ordersBundle.pendingOrderCount,
            isOrdersLoading = ordersBundle.isOrdersLoading,
            actionInProgressOrderId = ordersBundle.actionInProgressOrderId,
            paymentIntents = intentsBundle.paymentIntents,
            isIntentsLoading = intentsBundle.isIntentsLoading,
            actionInProgressIntentId = intentsBundle.actionInProgressIntentId,
            focusedPaymentIntentId = intentsBundle.focusedPaymentIntentId,
            merchantId = auth.merchantId,
            serverUrl = loginProg.serverUrl,
            deviceKey = auth.deviceKey,
            isLoggedIn = loggedIn,
            storeName = auth.storeName,
            userEmail = auth.userEmail,
            isLoggingIn = loginProg.isLoggingIn,
            loginError = loginProg.loginError,
            isForegroundEnabled = loginProg.isForegroundEnabled,
            isOnboardingCompleted = preferences.isOnboardingCompleted,
            feedbackMessage = core.feedbackMessage
        )
    }.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5000),
        DashboardUiState(
            isDarkTheme = preferences.isDarkTheme,
            merchantId = preferences.merchantId,
            serverUrl = preferences.serverUrl,
            deviceKey = preferences.deviceKey,
            isLoggedIn = preferences.isLoggedIn(),
            storeName = preferences.storeName,
            userEmail = preferences.userEmail,
            isForegroundEnabled = preferences.isForegroundServiceEnabled,
            isOnboardingCompleted = preferences.isOnboardingCompleted
        )
    )

    init {
        registerNetworkCallback()
        refreshStatsFromServer()
        refreshOrders()
        refreshPaymentIntents()
        observePushRefreshEvents()
    }

    private fun observePushRefreshEvents() {
        viewModelScope.launch {
            DynamicPushDispatcher.refreshEvents.collect {
                refreshPaymentIntents()
                refreshOrders()
                refreshStatsFromServer()
            }
        }
    }

    private fun checkInitialNetworkState(): Boolean {
        val connectivityManager = getApplication<Application>().getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        val network = connectivityManager?.activeNetwork ?: return false
        val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun registerNetworkCallback() {
        val connectivityManager = getApplication<Application>().getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()

        connectivityManager?.registerNetworkCallback(request, object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                _isOnline.value = true
                viewModelScope.launch {
                    syncNow()
                }
            }

            override fun onLost(network: Network) {
                _isOnline.value = false
            }
        })
    }

    /**
     * Authenticates merchant credentials with ORBIT Hub and persists session + device credentials.
     */
    fun loginMerchant(
        serverUrl: String,
        email: String,
        password: String,
        onSuccess: () -> Unit = {}
    ) {
        if (_isLoggingIn.value) return

        val trimmedEmail = email.trim()
        if (trimmedEmail.isBlank() || password.isBlank()) {
            _loginError.value = "Please enter your merchant email and password."
            return
        }

        val sanitizedUrl = PreferencesManager.normalizeServerUrl(serverUrl)
        preferences.serverUrl = sanitizedUrl

        viewModelScope.launch {
            _isLoggingIn.value = true
            _loginError.value = null

            val deviceName = "${Build.MANUFACTURER} ${Build.MODEL}".trim().ifBlank { "Android Device" }
            val result = withContext(Dispatchers.IO) {
                apiClient.login(trimmedEmail, password, deviceName)
            }

            result.onSuccess { data ->
                preferences.authToken = data.accessToken
                preferences.sessionId = data.sessionId
                preferences.userEmail = data.user.email.ifBlank { trimmedEmail }
                preferences.storeName = data.merchant.storeName
                preferences.merchantId = data.merchant.id.ifBlank { data.user.merchantId }
                data.deviceApiKey?.takeIf { it.isNotBlank() }?.let { key ->
                    preferences.deviceKey = key
                }

                if (preferences.isForegroundServiceEnabled && preferences.isConfigured()) {
                    try {
                        StickyForegroundService.startService(getApplication())
                    } catch (e: Exception) {
                        Log.w(TAG, "Unable to start foreground service after login: ${e.message}")
                    }
                }

                viewModelScope.launch(Dispatchers.IO) {
                    runCatching { FcmTokenRegistrar.refreshToken(getApplication()) }
                    runCatching { InboxScanner.scheduleNow(getApplication()) }
                }

                _isLoggingIn.value = false
                refreshStatsFromServer()
                refreshOrders()
                refreshPaymentIntents()
                onSuccess()
            }.onFailure { err ->
                _isLoggingIn.value = false
                _loginError.value = err.message ?: "Unable to sign in. Please verify your credentials."
            }
        }
    }

    fun clearLoginError() {
        _loginError.value = null
    }

    /**
     * Signs out from ORBIT Hub, clears local session tokens immediately, stops foreground sync,
     * and revokes the server-side session & paired device key in the background.
     */
    fun logoutMerchant(onComplete: () -> Unit = {}) {
        val tokenToRevoke = preferences.authToken
        val deviceKeyToRevoke = preferences.deviceKey

        preferences.clearAuthSession()
        StickyForegroundService.stopService(getApplication())
        WorkManager.getInstance(getApplication()).cancelAllWork()
        _orders.value = emptyList()
        _pendingOrderCount.value = 0
        _paymentIntents.value = emptyList()
        _focusedPaymentIntentId.value = null
        _loginError.value = null
        _feedbackMessage.value = "Signed out of ORBIT Hub."
        onComplete()

        if (tokenToRevoke.isNotBlank()) {
            viewModelScope.launch(Dispatchers.IO) {
                runCatching { apiClient.logout(tokenToRevoke, deviceKeyToRevoke) }
            }
        }
    }

    private fun handleUnauthorized(message: String?) {
        if (!preferences.isLoggedIn()) return
        preferences.clearAuthSession()
        StickyForegroundService.stopService(getApplication())
        WorkManager.getInstance(getApplication()).cancelAllWork()
        _orders.value = emptyList()
        _pendingOrderCount.value = 0
        _paymentIntents.value = emptyList()
        _focusedPaymentIntentId.value = null
        _loginError.value = message?.takeIf { it.isNotBlank() }
            ?: "Session expired or revoked. Please sign in again."
    }

    /**
     * Fetches universal multi-vertical payment intents from ORBIT Hub.
     */
    fun refreshPaymentIntents(statusFilter: String? = null) {
        if (!preferences.isLoggedIn()) return

        viewModelScope.launch {
            _isIntentsLoading.value = true
            val result = withContext(Dispatchers.IO) {
                apiClient.listPaymentIntents(status = statusFilter, limit = 50)
            }
            result.onSuccess { data ->
                _paymentIntents.value = data.items
            }.onFailure { err ->
                if (err is UnauthorizedException) {
                    handleUnauthorized(err.message)
                } else {
                    Log.w(TAG, "Failed to refresh payment intents: ${err.message}")
                }
            }
            _isIntentsLoading.value = false
        }
    }

    /**
     * Atomically approves or rejects a universal payment intent with CAS stateVersion.
     */
    fun resolvePaymentIntent(
        intentId: String,
        decision: String,
        expectedStateVersion: Int? = null,
        reason: String? = null
    ) {
        if (_actionInProgressIntentId.value != null) return

        viewModelScope.launch {
            _actionInProgressIntentId.value = intentId
            val result = withContext(Dispatchers.IO) {
                apiClient.resolvePaymentIntent(
                    intentId = intentId,
                    decision = decision,
                    expectedStateVersion = expectedStateVersion,
                    reason = reason
                )
            }

            result.onSuccess { data ->
                data.paymentIntent?.let { updated ->
                    _paymentIntents.value = _paymentIntents.value.map { existing ->
                        if (existing.id == updated.id) updated else existing
                    }
                }
                val verb = if (decision.equals("APPROVE", ignoreCase = true)) "approved" else "rejected"
                val ref = data.paymentIntent?.externalRefId ?: intentId
                _feedbackMessage.value = "Payment $ref $verb"
                refreshPaymentIntents()
                refreshOrders()
            }.onFailure { err ->
                if (err is UnauthorizedException) {
                    handleUnauthorized(err.message)
                } else {
                    _feedbackMessage.value = "Resolve failed: ${err.message ?: "Unknown error"}"
                }
            }

            _actionInProgressIntentId.value = null
        }
    }

    /**
     * Triggers a server-declared dynamic webhook action on a universal payment intent.
     */
    fun triggerPaymentIntentAction(
        intentId: String,
        actionId: String,
        actionLabel: String,
        note: String? = null
    ) {
        if (_actionInProgressIntentId.value != null) return

        viewModelScope.launch {
            _actionInProgressIntentId.value = intentId
            val result = withContext(Dispatchers.IO) {
                apiClient.triggerPaymentAction(intentId, actionId, note)
            }

            result.onSuccess { data ->
                val syncSuffix = if (data.webhookDispatched) " · Webhook dispatched" else ""
                _feedbackMessage.value = "$actionLabel (${data.externalRefId})$syncSuffix"
                refreshPaymentIntents()
            }.onFailure { err ->
                if (err is UnauthorizedException) {
                    handleUnauthorized(err.message)
                } else {
                    _feedbackMessage.value = "$actionLabel failed: ${err.message ?: "Unknown error"}"
                }
            }

            _actionInProgressIntentId.value = null
        }
    }

    fun handleDeepLinkNotification(paymentIntentId: String?, externalRefId: String?) {
        val target = paymentIntentId?.takeIf { it.isNotBlank() }
            ?: externalRefId?.takeIf { it.isNotBlank() }
            ?: return
        _focusedPaymentIntentId.value = target
        refreshPaymentIntents()
    }

    fun clearFocusedPaymentIntent() {
        _focusedPaymentIntentId.value = null
    }

    /**
     * Fetches merchant orders and pending confirmation count from ORBIT Hub.
     */
    fun refreshOrders(statusFilter: String? = null) {
        if (!preferences.isLoggedIn()) return

        viewModelScope.launch {
            _isOrdersLoading.value = true
            val result = withContext(Dispatchers.IO) {
                apiClient.fetchOrders(statusFilter)
            }
            result.onSuccess { data ->
                _orders.value = data.items
                _pendingOrderCount.value = data.pendingConfirmationCount
            }.onFailure { err ->
                if (err is UnauthorizedException) {
                    handleUnauthorized(err.message)
                } else {
                    Log.w(TAG, "Failed to refresh orders: ${err.message}")
                }
            }
            _isOrdersLoading.value = false
        }
    }

    /**
     * Executes a 1-tap bi-directional order status action (CONFIRM, READY_TO_SHIP, SHIP, MARK_PAID, CANCEL).
     */
    fun performOrderAction(externalOrderId: String, action: String, note: String? = null) {
        if (_actionInProgressOrderId.value != null) return

        viewModelScope.launch {
            _actionInProgressOrderId.value = externalOrderId
            val result = withContext(Dispatchers.IO) {
                apiClient.performOrderAction(externalOrderId, action, note)
            }

            result.onSuccess { data ->
                data.order?.let { updatedOrder ->
                    _orders.value = _orders.value.map { existing ->
                        if (existing.externalOrderId == updatedOrder.externalOrderId) updatedOrder else existing
                    }
                }
                val actionLabel = when (action.uppercase()) {
                    "CONFIRM" -> "confirmed"
                    "READY_TO_SHIP" -> "marked Ready to Ship"
                    "SHIP" -> "marked Shipped"
                    "MARK_PAID" -> "marked Paid"
                    "CANCEL" -> "cancelled"
                    else -> action.lowercase()
                }
                val syncSuffix = if (data.webhookDispatched) " · Storefront updated" else ""
                _feedbackMessage.value = "Order #$externalOrderId $actionLabel$syncSuffix"
                refreshOrders()
            }.onFailure { err ->
                if (err is UnauthorizedException) {
                    handleUnauthorized(err.message)
                } else {
                    _feedbackMessage.value = "Order update failed: ${err.message ?: "Unknown error"}"
                }
            }

            _actionInProgressOrderId.value = null
        }
    }

    /**
     * Executes an immediate full sync of pending SMS records, stats, and orders with ORBIT Central Hub.
     */
    fun syncNow() {
        if (_isSyncing.value) return

        viewModelScope.launch {
            _isSyncing.value = true
            _feedbackMessage.value = "Syncing with ORBIT Hub..."

            try {
                withContext(Dispatchers.IO) {
                    val pending = database.smsDao().getPendingUploads()
                    if (pending.isNotEmpty() && preferences.isConfigured()) {
                        val items = pending.map {
                            IngestSmsItem(
                                provider = it.provider,
                                trxId = it.trxId,
                                amount = it.amount,
                                senderNumber = it.senderNumber,
                                rawSms = it.rawSms,
                                receivedAt = it.receivedAt,
                                smsSender = it.smsSender.ifBlank { null },
                                source = it.source
                            )
                        }

                        val result = apiClient.ingestBatch(items)
                        if (result.isSuccess) {
                            val res = result.getOrThrow()
                            database.smsDao().markUploaded(pending.map { it.id })
                            _feedbackMessage.value = "Synced ${items.size} SMS (Verified: ${res.autoVerifiedCount})"
                        } else {
                            val err = result.exceptionOrNull()
                            if (err is UnauthorizedException) {
                                withContext(Dispatchers.Main) { handleUnauthorized(err.message) }
                                return@withContext
                            }
                            _feedbackMessage.value = "Sync error: ${err?.message}"
                        }
                    } else if (pending.isEmpty()) {
                        _feedbackMessage.value = "Everything up to date."
                    } else if (!preferences.isLoggedIn()) {
                        _feedbackMessage.value = "Please sign in or configure Device Key."
                    } else {
                        _feedbackMessage.value = "Refreshed orders & telemetry."
                    }

                    if (preferences.isLoggedIn()) {
                        apiClient.fetchStats().onSuccess { stats ->
                            if (stats.storeName.isNotBlank() && preferences.storeName.isBlank()) {
                                preferences.storeName = stats.storeName
                            }
                            Log.d(TAG, "Backend stats refreshed: verified=${stats.verifiedCount}, vol=${stats.totalVerifiedVolume}")
                        }.onFailure { err ->
                            if (err is UnauthorizedException) {
                                withContext(Dispatchers.Main) { handleUnauthorized(err.message) }
                                return@withContext
                            }
                        }

                        apiClient.fetchOrders().onSuccess { ordersData ->
                            _orders.value = ordersData.items
                            _pendingOrderCount.value = ordersData.pendingConfirmationCount
                        }.onFailure { err ->
                            if (err is UnauthorizedException) {
                                withContext(Dispatchers.Main) { handleUnauthorized(err.message) }
                                return@withContext
                            }
                        }

                        apiClient.listPaymentIntents(limit = 50).onSuccess { intentsData ->
                            _paymentIntents.value = intentsData.items
                        }.onFailure { err ->
                            if (err is UnauthorizedException) {
                                withContext(Dispatchers.Main) { handleUnauthorized(err.message) }
                                return@withContext
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                _feedbackMessage.value = "Sync failed: ${e.message}"
            } finally {
                _isSyncing.value = false
            }
        }
    }

    fun refreshStatsFromServer() {
        if (!preferences.isLoggedIn()) return

        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                apiClient.fetchStats()
            }
            result.onSuccess { stats ->
                if (stats.storeName.isNotBlank() && preferences.storeName.isBlank()) {
                    preferences.storeName = stats.storeName
                }
            }.onFailure { err ->
                if (err is UnauthorizedException) {
                    handleUnauthorized(err.message)
                } else {
                    Log.w(TAG, "Failed to refresh stats: ${err.message}")
                }
            }
        }
    }

    fun saveSettings(serverUrl: String, merchantId: String, deviceKey: String, enableForeground: Boolean) {
        val trimmedMerchantId = merchantId.trim()
        val trimmedDeviceKey = deviceKey.trim()
        if (preferences.merchantId.isNotBlank() &&
            trimmedMerchantId.isNotBlank() &&
            preferences.merchantId != trimmedMerchantId
        ) {
            preferences.clearAuthSession()
        }

        preferences.serverUrl = PreferencesManager.normalizeServerUrl(serverUrl)
        preferences.merchantId = trimmedMerchantId
        preferences.deviceKey = trimmedDeviceKey
        preferences.isForegroundServiceEnabled = enableForeground
        _loginError.value = null

        if (enableForeground && preferences.isConfigured()) {
            StickyForegroundService.startService(getApplication())
        } else {
            StickyForegroundService.stopService(getApplication())
        }

        _feedbackMessage.value = "Settings saved successfully."
        refreshStatsFromServer()
        refreshOrders()
        refreshPaymentIntents()
    }

    fun testConnection(
        serverUrl: String? = null,
        merchantId: String? = null,
        deviceKey: String? = null,
        onResult: (Boolean, String) -> Unit
    ) {
        viewModelScope.launch {
            try {
                val result = withContext(Dispatchers.IO) {
                    apiClient.testConnection(serverUrl, merchantId, deviceKey)
                }
                if (result.isSuccess && result.getOrThrow()) {
                    onResult(true, "Connection successful! ORBIT Central Hub reachable.")
                } else {
                    val err = result.exceptionOrNull()?.message ?: "Handshake error"
                    onResult(false, "Connection failed: $err")
                }
            } catch (e: Exception) {
                onResult(false, "Connection error: ${e.message}")
            }
        }
    }

    fun completeOnboarding() {
        preferences.isOnboardingCompleted = true
        if (preferences.isForegroundServiceEnabled && preferences.isConfigured()) {
            StickyForegroundService.startService(getApplication())
        }
    }

    fun clearFeedbackMessage() {
        _feedbackMessage.value = null
    }

    fun setDarkTheme(enabled: Boolean) {
        preferences.isDarkTheme = enabled
    }

    fun toggleTheme() {
        preferences.isDarkTheme = !preferences.isDarkTheme
    }

    companion object {
        private const val TAG = "MainViewModel"
    }
}
