package com.orbitsaas.payment.ui.viewmodel

import android.Manifest
import android.app.ActivityManager
import android.app.Application
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.PowerManager
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.orbitsaas.payment.R
import com.orbitsaas.payment.data.local.BlockedMessageEntity
import com.orbitsaas.payment.data.local.OrbitDatabase
import com.orbitsaas.payment.data.local.PreferencesManager
import com.orbitsaas.payment.data.remote.DevicePreflightData
import com.orbitsaas.payment.data.remote.OrbitApiClient
import com.orbitsaas.payment.interceptors.InboxScanner
import com.orbitsaas.payment.interceptors.parsers.MfsParser
import com.orbitsaas.payment.interceptors.parsers.ParseOutcome
import com.orbitsaas.payment.service.FcmTokenRegistrar
import com.orbitsaas.payment.service.PushWebSocketClient
import com.orbitsaas.payment.service.StickyForegroundService
import com.orbitsaas.payment.service.WsPushState
import com.orbitsaas.payment.util.SimSlotInfo
import com.orbitsaas.payment.util.SimSlotReader
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class DiagnosticsUiState(
    val phonePermissionGranted: Boolean = false,
    val detectedSimSlots: List<SimSlotInfo> = emptyList(),
    val preflight: DevicePreflightData? = null,
    val isCheckingPreflight: Boolean = false,
    val preflightError: String? = null,
    val smsPermissionsGranted: Boolean = false,
    val postNotificationsGranted: Boolean = false,
    val notificationListenerEnabled: Boolean = false,
    val batteryOptimizationIgnored: Boolean = false,
    val foregroundServiceRunning: Boolean = false,
    val foregroundServiceEnabled: Boolean = true,
    val isConfigured: Boolean = false,
    val wsPushState: WsPushState = WsPushState.DISCONNECTED,
    val lastPushReceivedAt: Long = 0L,
    val firebaseAvailable: Boolean = false,
    val fcmTokenPresent: Boolean = false,
    val lastHeartbeatAt: Long = 0L,
    val lastSyncAt: Long = 0L,
    val lastInboxScanAt: Long = 0L,
    val pendingUploadCount: Int = 0,
    val blockedCount: Int = 0,
    val blockedMessages: List<BlockedMessageEntity> = emptyList(),
    val isRescanning: Boolean = false,
    val isRefreshingToken: Boolean = false,
    val feedbackMessage: String? = null,
    val testSenderInput: String = "",
    val testSmsInput: String = "",
    val testParseOutcome: ParseOutcome? = null
)

class DiagnosticsViewModel(application: Application) : AndroidViewModel(application) {

    private val database = OrbitDatabase.getDatabase(application)
    private val preferences = PreferencesManager(application)
    private val apiClient = OrbitApiClient(preferences)

    private val _systemChecks = MutableStateFlow(readSystemChecks())
    private val _isRescanning = MutableStateFlow(false)
    private val _isRefreshingToken = MutableStateFlow(false)
    private val _feedbackMessage = MutableStateFlow<String?>(null)
    private val _testSenderInput = MutableStateFlow("")
    private val _testSmsInput = MutableStateFlow("")
    private val _testParseOutcome = MutableStateFlow<ParseOutcome?>(null)

    private val _preflight = MutableStateFlow<DevicePreflightData?>(null)
    private val _isCheckingPreflight = MutableStateFlow(false)
    private val _preflightError = MutableStateFlow<String?>(null)

    private val pendingCountFlow = database.smsDao().getPendingUploadCountFlow()
    private val blockedCountFlow = database.blockedMessageDao().countFlow()
    private val blockedMessagesFlow = database.blockedMessageDao().recent(100)

    private val wsPushFlow = combine(
        PushWebSocketClient.connectionState,
        PushWebSocketClient.lastPushReceivedAt,
        ::Pair
    )

    private val opsBundleFlow = combine(
        _systemChecks,
        _isRescanning,
        _isRefreshingToken,
        _feedbackMessage,
        wsPushFlow
    ) { checks, rescanning, refreshingToken, feedback, wsPush ->
        OpsBundle(
            checks = checks,
            isRescanning = rescanning,
            isRefreshingToken = refreshingToken,
            feedbackMessage = feedback,
            wsPushState = wsPush.first,
            lastPushReceivedAt = wsPush.second
        )
    }

    private val parserTestFlow = combine(
        _testSenderInput,
        _testSmsInput,
        _testParseOutcome
    ) { sender, sms, outcome ->
        Triple(sender, sms, outcome)
    }

    private val preflightBundleFlow = combine(
        _preflight,
        _isCheckingPreflight,
        _preflightError,
        ::Triple
    )

    private val logsCountsFlow = combine(
        pendingCountFlow,
        blockedCountFlow,
        blockedMessagesFlow,
        ::Triple
    )

    val uiState: StateFlow<DiagnosticsUiState> = combine(
        opsBundleFlow,
        logsCountsFlow,
        parserTestFlow,
        preflightBundleFlow
    ) { ops, counts, parserTest, preflightBundle ->
        val checks = ops.checks
        DiagnosticsUiState(
            phonePermissionGranted = checks.phonePermissionGranted,
            detectedSimSlots = checks.detectedSimSlots,
            preflight = preflightBundle.first,
            isCheckingPreflight = preflightBundle.second,
            preflightError = preflightBundle.third,
            smsPermissionsGranted = checks.smsPermissionsGranted,
            postNotificationsGranted = checks.postNotificationsGranted,
            notificationListenerEnabled = checks.notificationListenerEnabled,
            batteryOptimizationIgnored = checks.batteryOptimizationIgnored,
            foregroundServiceRunning = checks.foregroundServiceRunning,
            foregroundServiceEnabled = checks.foregroundServiceEnabled,
            isConfigured = checks.isConfigured,
            wsPushState = ops.wsPushState,
            lastPushReceivedAt = ops.lastPushReceivedAt,
            firebaseAvailable = checks.firebaseAvailable,
            fcmTokenPresent = checks.fcmTokenPresent,
            lastHeartbeatAt = checks.lastHeartbeatAt,
            lastSyncAt = checks.lastSyncAt,
            lastInboxScanAt = checks.lastInboxScanAt,
            pendingUploadCount = counts.first,
            blockedCount = counts.second,
            blockedMessages = counts.third,
            isRescanning = ops.isRescanning,
            isRefreshingToken = ops.isRefreshingToken,
            feedbackMessage = ops.feedbackMessage,
            testSenderInput = parserTest.first,
            testSmsInput = parserTest.second,
            testParseOutcome = parserTest.third
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = DiagnosticsUiState()
    )

    init {
        if (preferences.isLoggedIn()) {
            runFullSystemCheck()
        }
    }

    fun refreshStatus() {
        _systemChecks.value = readSystemChecks()
    }

    fun runFullSystemCheck() {
        refreshStatus()
        val ctx = getApplication<Application>()
        if (!preferences.isLoggedIn()) {
            _preflightError.value = ctx.getString(R.string.diag_preflight_not_logged_in)
            return
        }
        if (_isCheckingPreflight.value) return

        viewModelScope.launch {
            _isCheckingPreflight.value = true
            _preflightError.value = null
            val result = withContext(Dispatchers.IO) {
                val request = SimSlotReader.buildPreflightCheckRequest(ctx, preferences)
                apiClient.runPreflightCheck(request)
            }
            result.onSuccess { data ->
                _preflight.value = data
                _preflightError.value = null
            }.onFailure { err ->
                _preflightError.value = err.message ?: ctx.getString(R.string.diag_preflight_error_generic)
            }
            _isCheckingPreflight.value = false
        }
    }

    fun confirmSimNumber(slotIndex: Int, phoneNumber: String, carrierName: String) {
        val ctx = getApplication<Application>()
        val normalized = SimSlotReader.normalizeBdNumber(phoneNumber)
        if (normalized == null) {
            _feedbackMessage.value = ctx.getString(R.string.diag_sim_invalid_number)
            return
        }
        preferences.saveConfirmedSimSlot(slotIndex, normalized, carrierName)
        refreshStatus()
        _feedbackMessage.value = ctx.getString(R.string.diag_sim_number_saved, slotIndex, normalized)
        runFullSystemCheck()
    }

    fun startForegroundService() {
        val ctx = getApplication<Application>()
        if (preferences.isConfigured()) {
            runCatching {
                preferences.isForegroundServiceEnabled = true
                StickyForegroundService.startService(ctx)
            }
        }
        refreshStatus()
    }

    fun reconnectPushWebSocket() {
        val ctx = getApplication<Application>()
        if (!preferences.isLoggedIn()) {
            _feedbackMessage.value = ctx.getString(R.string.diag_ws_not_logged_in)
            return
        }
        runCatching {
            StickyForegroundService.reconnectWebSocket(ctx)
        }.onSuccess {
            _feedbackMessage.value = ctx.getString(R.string.diag_ws_reconnecting)
        }.onFailure { err ->
            _feedbackMessage.value = err.message ?: ctx.getString(R.string.history_detail_unknown)
        }
        refreshStatus()
    }

    fun refreshFcmToken() {
        if (_isRefreshingToken.value) return
        viewModelScope.launch {
            _isRefreshingToken.value = true
            val token = withContext(Dispatchers.IO) {
                runCatching { FcmTokenRegistrar.refreshToken(getApplication()) }.getOrNull()
            }
            _isRefreshingToken.value = false
            refreshStatus()
            _feedbackMessage.value = if (!token.isNullOrBlank()) {
                getApplication<Application>().getString(R.string.diag_fcm_refreshed)
            } else {
                getApplication<Application>().getString(R.string.diag_fcm_refresh_failed)
            }
        }
    }

    fun rescanInbox72h() {
        if (_isRescanning.value) return
        val ctx = getApplication<Application>()
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
            _feedbackMessage.value = ctx.getString(R.string.diag_rescan_permission_needed)
            return
        }

        viewModelScope.launch {
            _isRescanning.value = true
            val sinceMs = System.currentTimeMillis() - 72L * 3600L * 1000L
            val result = withContext(Dispatchers.IO) {
                runCatching { InboxScanner.scan(ctx, sinceMs) }
            }
            _isRescanning.value = false
            refreshStatus()

            result.onSuccess { scan ->
                _feedbackMessage.value = ctx.getString(
                    R.string.diag_rescan_result,
                    scan.scanned,
                    scan.imported,
                    scan.blocked
                )
            }.onFailure { err ->
                _feedbackMessage.value = err.message ?: ctx.getString(R.string.history_detail_unknown)
            }
        }
    }

    fun updateTestSender(sender: String) {
        _testSenderInput.value = sender
        recomputeParseOutcome()
    }

    fun updateTestSms(sms: String) {
        _testSmsInput.value = sms
        recomputeParseOutcome()
    }

    fun clearParserTest() {
        _testSenderInput.value = ""
        _testSmsInput.value = ""
        _testParseOutcome.value = null
    }

    fun clearFeedback() {
        _feedbackMessage.value = null
    }

    private fun recomputeParseOutcome() {
        val sms = _testSmsInput.value
        if (sms.isBlank()) {
            _testParseOutcome.value = null
            return
        }
        val sender = _testSenderInput.value.trim().ifBlank { null }
        _testParseOutcome.value = MfsParser.parse(
            sms,
            sender,
            "SMS",
            preferences.extraTrustedSenders
        )
    }

    private fun readSystemChecks(): SystemChecks {
        val ctx = getApplication<Application>()
        val smsGranted = ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED
        val notifGranted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
        val listenerEnabled = runCatching {
            NotificationManagerCompat.getEnabledListenerPackages(ctx).contains(ctx.packageName)
        }.getOrDefault(false)
        val batteryIgnored = runCatching {
            val pm = ctx.getSystemService(Context.POWER_SERVICE) as? PowerManager
            pm?.isIgnoringBatteryOptimizations(ctx.packageName) == true
        }.getOrDefault(false)
        val fgRunning = isStickyServiceRunning(ctx)
        val firebaseAvailable = runCatching { FcmTokenRegistrar.isFirebaseAvailable(ctx) }.getOrDefault(false)
        val phonePermissionGranted = SimSlotReader.hasPhonePermission(ctx)
        val detectedSimSlots = SimSlotReader.readSimSlots(ctx, preferences)

        return SystemChecks(
            phonePermissionGranted = phonePermissionGranted,
            detectedSimSlots = detectedSimSlots,
            smsPermissionsGranted = smsGranted,
            postNotificationsGranted = notifGranted,
            notificationListenerEnabled = listenerEnabled,
            batteryOptimizationIgnored = batteryIgnored,
            foregroundServiceRunning = fgRunning,
            foregroundServiceEnabled = preferences.isForegroundServiceEnabled,
            isConfigured = preferences.isConfigured(),
            firebaseAvailable = firebaseAvailable,
            fcmTokenPresent = preferences.fcmToken.isNotBlank(),
            lastHeartbeatAt = preferences.lastHeartbeatTime,
            lastSyncAt = preferences.lastSyncAt,
            lastInboxScanAt = preferences.lastInboxScanAt
        )
    }

    @Suppress("DEPRECATION")
    private fun isStickyServiceRunning(context: Context): Boolean {
        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager ?: return false
        return runCatching {
            am.getRunningServices(Int.MAX_VALUE).any {
                it.service.className == StickyForegroundService::class.java.name
            }
        }.getOrDefault(false)
    }

    private data class SystemChecks(
        val phonePermissionGranted: Boolean,
        val detectedSimSlots: List<SimSlotInfo>,
        val smsPermissionsGranted: Boolean,
        val postNotificationsGranted: Boolean,
        val notificationListenerEnabled: Boolean,
        val batteryOptimizationIgnored: Boolean,
        val foregroundServiceRunning: Boolean,
        val foregroundServiceEnabled: Boolean,
        val isConfigured: Boolean,
        val firebaseAvailable: Boolean,
        val fcmTokenPresent: Boolean,
        val lastHeartbeatAt: Long,
        val lastSyncAt: Long,
        val lastInboxScanAt: Long
    )

    private data class OpsBundle(
        val checks: SystemChecks,
        val isRescanning: Boolean,
        val isRefreshingToken: Boolean,
        val feedbackMessage: String?,
        val wsPushState: WsPushState,
        val lastPushReceivedAt: Long
    )
}
