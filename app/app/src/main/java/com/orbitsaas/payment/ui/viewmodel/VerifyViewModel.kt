package com.orbitsaas.payment.ui.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.orbitsaas.payment.R
import com.orbitsaas.payment.data.local.PreferencesManager
import com.orbitsaas.payment.data.remote.LedgerDto
import com.orbitsaas.payment.data.remote.OrbitApiClient
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

data class VerifyUiState(
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

    private val _uiState = MutableStateFlow(VerifyUiState())
    val uiState: StateFlow<VerifyUiState> = _uiState.asStateFlow()

    init {
        loadUnclaimed()
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
