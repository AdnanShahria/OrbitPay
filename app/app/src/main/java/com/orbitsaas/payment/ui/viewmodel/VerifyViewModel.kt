package com.orbitsaas.payment.ui.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.orbitsaas.payment.R
import com.orbitsaas.payment.data.local.PreferencesManager
import com.orbitsaas.payment.data.remote.LedgerDto
import com.orbitsaas.payment.data.remote.MerchantOrderDto
import com.orbitsaas.payment.data.remote.OrbitApiClient
import com.orbitsaas.payment.data.remote.PaymentIntentDto
import com.orbitsaas.payment.service.DynamicPushDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Locale
import kotlin.math.abs
import kotlin.math.min

data class RankedQueueCandidate(
    val id: String,
    val provider: String,
    val externalOrderId: String,
    val customerEmail: String?,
    val expectedAmount: Double,
    val baseAmount: Double?,
    val uniqueAmount: Double?,
    val submittedAmount: Double?,
    val submittedTrxId: String,
    val submittedSender: String,
    val status: String,
    val expiresAt: String,
    val score: Int,
    val sameProvider: Boolean,
    val trxEditDistance: Int?,
    val amountWithinTolerance: Boolean,
    val sameSender: Boolean
)

enum class VerifyTab {
    REVIEW_QUEUE,
    UNCLAIMED_SMS,
    ORDER_PAY
}

data class VerifyUiState(
    val selectedTab: VerifyTab = VerifyTab.REVIEW_QUEUE,
    val serverUrl: String = "",
    val storeName: String = "",
    val reviewIntents: List<PaymentIntentDto> = emptyList(),
    val isLoadingReviewIntents: Boolean = false,
    val reviewIntentsError: String? = null,
    val actionInProgressIntentId: String? = null,
    val unpaidOrders: List<MerchantOrderDto> = emptyList(),
    val isLoadingUnpaidOrders: Boolean = false,
    val unpaidOrdersError: String? = null,
    val actionInProgressOrderId: String? = null,
    val unclaimedItems: List<LedgerDto> = emptyList(),
    val isLoadingUnclaimed: Boolean = false,
    val unclaimedError: String? = null,
    val selectedSms: LedgerDto? = null,
    val candidates: List<RankedQueueCandidate> = emptyList(),
    val isLoadingCandidates: Boolean = false,
    val candidatesError: String? = null,
    val isSubmittingMatch: Boolean = false,
    val feedbackMessage: String? = null
)

class VerifyViewModel(application: Application) : AndroidViewModel(application) {

    private val preferences = PreferencesManager(application)
    private val apiClient = OrbitApiClient(preferences)
    private var lastPushRefreshMs = 0L

    private val _uiState = MutableStateFlow(
        VerifyUiState(
            serverUrl = preferences.serverUrl,
            storeName = preferences.storeName
        )
    )
    val uiState: StateFlow<VerifyUiState> = _uiState.asStateFlow()

    init {
        loadReviewIntents()
        loadUnclaimed()
        loadUnpaidOrders()
        viewModelScope.launch {
            DynamicPushDispatcher.refreshEvents.collect { reason ->
                val now = System.currentTimeMillis()
                if (now - lastPushRefreshMs < PUSH_REFRESH_COOLDOWN_MS) return@collect
                lastPushRefreshMs = now

                when {
                    reason.startsWith("order.") -> loadUnpaidOrders()
                    reason.startsWith("payment.") -> loadReviewIntents()
                    else -> refreshActiveTab()
                }
            }
        }
    }

    fun selectTab(tab: VerifyTab) {
        _uiState.update { it.copy(selectedTab = tab) }
        when (tab) {
            VerifyTab.REVIEW_QUEUE -> loadReviewIntents()
            VerifyTab.UNCLAIMED_SMS -> loadUnclaimed()
            VerifyTab.ORDER_PAY -> loadUnpaidOrders()
        }
    }

    fun refreshActiveTab() {
        when (_uiState.value.selectedTab) {
            VerifyTab.REVIEW_QUEUE -> loadReviewIntents()
            VerifyTab.UNCLAIMED_SMS -> loadUnclaimed()
            VerifyTab.ORDER_PAY -> loadUnpaidOrders()
        }
    }

    fun loadReviewIntents() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingReviewIntents = true, reviewIntentsError = null) }
            val result = withContext(Dispatchers.IO) {
                apiClient.listPaymentIntents(limit = 50)
            }
            result.onSuccess { data ->
                val actionable = data.items.filter { intent ->
                    intent.status.uppercase(Locale.US) in setOf(
                        "MANUAL_REVIEW_REQUIRED",
                        "WAITING_FOR_SMS",
                        "OPEN"
                    )
                }.sortedByDescending { intent ->
                    when (intent.status.uppercase(Locale.US)) {
                        "MANUAL_REVIEW_REQUIRED" -> 3
                        "WAITING_FOR_SMS" -> 2
                        else -> 1
                    }
                }
                _uiState.update {
                    it.copy(
                        reviewIntents = actionable,
                        isLoadingReviewIntents = false,
                        reviewIntentsError = null
                    )
                }
            }.onFailure { err ->
                val detail = err.message ?: getApplication<Application>().getString(R.string.history_detail_unknown)
                _uiState.update {
                    it.copy(
                        isLoadingReviewIntents = false,
                        reviewIntentsError = detail
                    )
                }
            }
        }
    }

    fun loadUnpaidOrders() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingUnpaidOrders = true, unpaidOrdersError = null) }
            val result = withContext(Dispatchers.IO) {
                apiClient.fetchOrders()
            }
            result.onSuccess { data ->
                val pending = data.items.filter { order ->
                    order.paymentStatus.uppercase(Locale.US) != "PAID" &&
                        order.orderStatus.uppercase(Locale.US) != "CANCELLED"
                }
                _uiState.update {
                    it.copy(
                        unpaidOrders = pending,
                        isLoadingUnpaidOrders = false,
                        unpaidOrdersError = null
                    )
                }
            }.onFailure { err ->
                val detail = err.message ?: getApplication<Application>().getString(R.string.history_detail_unknown)
                _uiState.update {
                    it.copy(
                        isLoadingUnpaidOrders = false,
                        unpaidOrdersError = detail
                    )
                }
            }
        }
    }

    fun resolvePaymentIntent(
        intentId: String,
        decision: String,
        expectedStateVersion: Int? = null,
        reason: String? = null
    ) {
        if (_uiState.value.actionInProgressIntentId != null) return
        viewModelScope.launch {
            _uiState.update { it.copy(actionInProgressIntentId = intentId) }
            val result = withContext(Dispatchers.IO) {
                apiClient.resolvePaymentIntent(
                    intentId = intentId,
                    decision = decision,
                    expectedStateVersion = expectedStateVersion,
                    reason = reason
                )
            }
            result.onSuccess { data ->
                val ref = data.paymentIntent?.externalRefId ?: intentId
                val verb = if (decision.equals("APPROVE", ignoreCase = true)) "approved" else "rejected"
                _uiState.update {
                    it.copy(
                        actionInProgressIntentId = null,
                        feedbackMessage = "Payment $ref $verb"
                    )
                }
                loadReviewIntents()
                loadUnpaidOrders()
            }.onFailure { err ->
                val rawMessage = err.message.orEmpty()
                val isVersionConflict = rawMessage.contains("State version mismatch", ignoreCase = true) ||
                    rawMessage.contains("concurrently", ignoreCase = true) ||
                    rawMessage.contains("already", ignoreCase = true)
                val friendlyMessage = if (isVersionConflict) {
                    "This payment was already updated on the server. Refreshed latest status."
                } else {
                    "Resolve failed: ${rawMessage.ifBlank { "Unknown error" }}"
                }
                _uiState.update {
                    it.copy(
                        actionInProgressIntentId = null,
                        feedbackMessage = friendlyMessage
                    )
                }
                if (isVersionConflict) {
                    loadReviewIntents()
                    loadUnpaidOrders()
                }
            }
        }
    }

    fun triggerIntentAction(intentId: String, actionId: String, actionLabel: String) {
        if (_uiState.value.actionInProgressIntentId != null) return
        viewModelScope.launch {
            _uiState.update { it.copy(actionInProgressIntentId = intentId) }
            val result = withContext(Dispatchers.IO) {
                apiClient.triggerPaymentAction(intentId = intentId, actionId = actionId)
            }
            result.onSuccess { data ->
                val syncSuffix = if (data.webhookDispatched) " · Webhook dispatched" else ""
                _uiState.update {
                    it.copy(
                        actionInProgressIntentId = null,
                        feedbackMessage = "$actionLabel (${data.externalRefId})$syncSuffix"
                    )
                }
                loadReviewIntents()
            }.onFailure { err ->
                _uiState.update {
                    it.copy(
                        actionInProgressIntentId = null,
                        feedbackMessage = "$actionLabel failed: ${err.message ?: "Unknown error"}"
                    )
                }
            }
        }
    }

    fun performOrderAction(externalOrderId: String, action: String) {
        if (_uiState.value.actionInProgressOrderId != null) return
        viewModelScope.launch {
            _uiState.update { it.copy(actionInProgressOrderId = externalOrderId) }
            val result = withContext(Dispatchers.IO) {
                apiClient.performOrderAction(externalOrderId, action)
            }
            result.onSuccess { data ->
                val actionLabel = when (action.uppercase(Locale.US)) {
                    "MARK_PAID" -> "marked Paid"
                    "CONFIRM" -> "confirmed"
                    "CANCEL" -> "cancelled"
                    else -> action.lowercase(Locale.US)
                }
                val syncSuffix = if (data.webhookDispatched) " · Storefront updated" else ""
                _uiState.update {
                    it.copy(
                        actionInProgressOrderId = null,
                        feedbackMessage = "Order #$externalOrderId $actionLabel$syncSuffix"
                    )
                }
                loadUnpaidOrders()
            }.onFailure { err ->
                _uiState.update {
                    it.copy(
                        actionInProgressOrderId = null,
                        feedbackMessage = "Order update failed: ${err.message ?: "Unknown error"}"
                    )
                }
            }
        }
    }

    fun loadUnclaimed() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingUnclaimed = true, unclaimedError = null) }
            val result = withContext(Dispatchers.IO) {
                apiClient.fetchTransactions(50, 0, null, "UNCLAIMED", null)
            }
            result.onSuccess { page ->
                _uiState.update {
                    it.copy(
                        unclaimedItems = page.items,
                        isLoadingUnclaimed = false,
                        unclaimedError = null
                    )
                }
            }.onFailure { err ->
                val detail = err.message ?: getApplication<Application>().getString(R.string.history_detail_unknown)
                _uiState.update {
                    it.copy(
                        isLoadingUnclaimed = false,
                        unclaimedError = getApplication<Application>().getString(R.string.verify_error_load, detail)
                    )
                }
            }
        }
    }

    fun selectSms(sms: LedgerDto) {
        _uiState.update {
            it.copy(
                selectedSms = sms,
                candidates = emptyList(),
                isLoadingCandidates = true,
                candidatesError = null
            )
        }
        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                apiClient.fetchQueue()
            }
            result.onSuccess { queueDto ->
                val smsSenderNorm = normalizePhone(sms.senderNumber)
                val smsTrxNorm = sms.trxId.trim().uppercase(Locale.US)

                val ranked = queueDto.queue.map { item ->
                    var score = 0
                    val sameProvider = item.provider.equals(sms.provider, ignoreCase = true)
                    if (sameProvider) score += 40

                    val candidateTrx = item.submittedTrxId.orEmpty().trim().uppercase(Locale.US)
                    val editDist = if (candidateTrx.isNotBlank() && smsTrxNorm.isNotBlank()) {
                        levenshteinDistance(smsTrxNorm, candidateTrx)
                    } else {
                        Int.MAX_VALUE
                    }
                    val matchedEditDist = if (editDist <= 2) editDist else null
                    when (editDist) {
                        0 -> score += 40
                        1 -> score += 25
                        2 -> score += 15
                    }

                    val amountMatch = listOfNotNull(
                        item.baseAmount,
                        item.uniqueAmount,
                        item.expectedAmount
                    ).any { target -> abs(target - sms.amount) <= 1.0 }
                    if (amountMatch) score += 20

                    val candidateSenderNorm = normalizePhone(item.submittedSender)
                    val sameSender = smsSenderNorm.isNotBlank() &&
                        candidateSenderNorm.isNotBlank() &&
                        smsSenderNorm == candidateSenderNorm
                    if (sameSender) score += 15

                    RankedQueueCandidate(
                        id = item.id,
                        provider = item.provider,
                        externalOrderId = item.externalOrderId,
                        customerEmail = item.customerEmail?.takeIf { it.isNotBlank() },
                        expectedAmount = listOfNotNull(item.expectedAmount).firstOrNull() ?: 0.0,
                        baseAmount = item.baseAmount,
                        uniqueAmount = item.uniqueAmount,
                        submittedAmount = item.submittedAmount,
                        submittedTrxId = item.submittedTrxId.orEmpty(),
                        submittedSender = item.submittedSender.orEmpty(),
                        status = item.status,
                        expiresAt = item.expiresAt.orEmpty(),
                        score = score,
                        sameProvider = sameProvider,
                        trxEditDistance = matchedEditDist,
                        amountWithinTolerance = amountMatch,
                        sameSender = sameSender
                    )
                }.sortedWith(
                    compareByDescending<RankedQueueCandidate> { it.score }
                        .thenBy { abs((it.uniqueAmount ?: it.baseAmount ?: it.expectedAmount) - sms.amount) }
                )

                _uiState.update {
                    it.copy(
                        candidates = ranked,
                        isLoadingCandidates = false,
                        candidatesError = null
                    )
                }
            }.onFailure { err ->
                val detail = err.message ?: getApplication<Application>().getString(R.string.history_detail_unknown)
                _uiState.update {
                    it.copy(
                        isLoadingCandidates = false,
                        candidatesError = getApplication<Application>().getString(R.string.verify_candidates_error, detail)
                    )
                }
            }
        }
    }

    fun dismissSelectedSms() {
        _uiState.update {
            it.copy(
                selectedSms = null,
                candidates = emptyList(),
                isLoadingCandidates = false,
                candidatesError = null
            )
        }
    }

    fun confirmManualMatch(
        sms: LedgerDto,
        externalOrderId: String,
        customerEmail: String?,
        onCompleted: () -> Unit = {}
    ) {
        val trimmedOrderId = externalOrderId.trim()
        if (trimmedOrderId.isBlank() || _uiState.value.isSubmittingMatch) return
        val trimmedEmail = customerEmail?.trim()?.ifBlank { null }

        viewModelScope.launch {
            _uiState.update { it.copy(isSubmittingMatch = true) }
            val result = withContext(Dispatchers.IO) {
                apiClient.manualMatch(sms.id, trimmedOrderId, trimmedEmail)
            }
            result.onSuccess {
                val msg = getApplication<Application>().getString(
                    R.string.verify_match_success,
                    sms.trxId,
                    trimmedOrderId
                )
                _uiState.update {
                    it.copy(
                        isSubmittingMatch = false,
                        selectedSms = null,
                        candidates = emptyList(),
                        feedbackMessage = msg
                    )
                }
                onCompleted()
                loadUnclaimed()
            }.onFailure { err ->
                val detail = err.message ?: getApplication<Application>().getString(R.string.history_detail_unknown)
                val msg = getApplication<Application>().getString(R.string.verify_match_failed, detail)
                _uiState.update {
                    it.copy(
                        isSubmittingMatch = false,
                        feedbackMessage = msg
                    )
                }
            }
        }
    }

    fun clearFeedback() {
        _uiState.update { it.copy(feedbackMessage = null) }
    }

    companion object {
        private const val PUSH_REFRESH_COOLDOWN_MS = 10_000L

        fun normalizePhone(raw: String?): String {
            if (raw.isNullOrBlank()) return ""
            var digits = raw.replace(Regex("[^0-9]"), "")
            if (digits.startsWith("880") && digits.length >= 13) {
                digits = digits.substring(2)
            } else if (digits.startsWith("88") && digits.length >= 12) {
                digits = digits.substring(2)
            }
            if (!digits.startsWith("0") && digits.length == 10 && digits.startsWith("1")) {
                digits = "0$digits"
            }
            return digits
        }

        fun levenshteinDistance(a: String, b: String): Int {
            if (a == b) return 0
            if (a.isEmpty()) return b.length
            if (b.isEmpty()) return a.length

            val prev = IntArray(b.length + 1) { it }
            val curr = IntArray(b.length + 1)

            for (i in 1..a.length) {
                curr[0] = i
                for (j in 1..b.length) {
                    val cost = if (a[i - 1] == b[j - 1]) 0 else 1
                    curr[j] = min(
                        min(curr[j - 1] + 1, prev[j] + 1),
                        prev[j - 1] + cost
                    )
                }
                for (j in 0..b.length) {
                    prev[j] = curr[j]
                }
            }
            return prev[b.length]
        }
    }
}
