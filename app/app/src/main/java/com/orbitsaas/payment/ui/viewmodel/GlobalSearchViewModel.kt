package com.orbitsaas.payment.ui.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.orbitsaas.payment.data.local.OrbitDatabase
import com.orbitsaas.payment.data.local.PreferencesManager
import com.orbitsaas.payment.data.local.SmsEntity
import com.orbitsaas.payment.data.remote.LedgerDto
import com.orbitsaas.payment.data.remote.MerchantOrderDto
import com.orbitsaas.payment.data.remote.MerchantProjectDto
import com.orbitsaas.payment.data.remote.OrbitApiClient
import com.orbitsaas.payment.data.remote.PaymentIntentDto
import com.orbitsaas.payment.data.remote.PaymentLinkDto
import com.orbitsaas.payment.data.remote.WalletRotationDto
import com.orbitsaas.payment.ui.components.isLinkPaymentIntent
import com.orbitsaas.payment.ui.components.isPaymentLinkOrder
import com.orbitsaas.payment.ui.components.parseIsoEpochMs
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Locale

enum class SearchCategory {
    ALL,
    PAYMENTS,
    ORDERS,
    LINKS,
    SMS,
    SIMS,
    PROJECTS
}

data class SearchSmsItem(
    val id: String,
    val provider: String,
    val trxId: String,
    val amount: Double,
    val senderNumber: String,
    val rawSms: String,
    val status: String,
    val externalOrderId: String?,
    val receivedAtMs: Long,
    val simSlotIndex: Int?,
    val receiverNumber: String?,
    val source: String,
    val isLocal: Boolean
)

data class GlobalSearchUiState(
    val query: String = "",
    val selectedCategory: SearchCategory = SearchCategory.ALL,
    val isSearchingServer: Boolean = false,
    val recentQueries: List<String> = emptyList(),
    val matchedPayments: List<PaymentIntentDto> = emptyList(),
    val matchedOrders: List<MerchantOrderDto> = emptyList(),
    val matchedLinks: List<PaymentLinkDto> = emptyList(),
    val matchedSms: List<SearchSmsItem> = emptyList(),
    val matchedWallets: List<WalletRotationDto> = emptyList(),
    val matchedProjects: List<MerchantProjectDto> = emptyList()
) {
    val totalCount: Int
        get() = matchedPayments.size +
            matchedOrders.size +
            matchedLinks.size +
            matchedSms.size +
            matchedWallets.size +
            matchedProjects.size
}

class GlobalSearchViewModel(application: Application) : AndroidViewModel(application) {

    private val database = OrbitDatabase.getDatabase(application)
    private val preferences = PreferencesManager(application)
    private val apiClient = OrbitApiClient(preferences)

    private val _uiState = MutableStateFlow(GlobalSearchUiState())
    val uiState: StateFlow<GlobalSearchUiState> = _uiState.asStateFlow()

    private var latestDashboardState: DashboardUiState = DashboardUiState()
    private var serverSearchJob: Job? = null

    private var cachedLocalSms: List<SmsEntity> = emptyList()
    private var cachedServerIntents: List<PaymentIntentDto> = emptyList()
    private var cachedServerOrders: List<MerchantOrderDto> = emptyList()
    private var cachedServerSms: List<LedgerDto> = emptyList()

    fun bindDashboardState(dashboardState: DashboardUiState) {
        latestDashboardState = dashboardState
        recomputeMatches(_uiState.value.query)
    }

    fun updateQuery(query: String) {
        _uiState.update { it.copy(query = query) }
        recomputeMatches(query)

        serverSearchJob?.cancel()
        val trimmed = query.trim()
        if (trimmed.isEmpty()) {
            _uiState.update { it.copy(isSearchingServer = false) }
            cachedServerIntents = emptyList()
            cachedServerOrders = emptyList()
            cachedServerSms = emptyList()
            recomputeMatches("")
            return
        }

        serverSearchJob = viewModelScope.launch {
            // Instant local Room snapshot
            val localSnap = withContext(Dispatchers.IO) {
                database.smsDao().searchLocalSnapshot(trimmed, 60)
            }
            cachedLocalSms = localSnap
            recomputeMatches(trimmed)

            if (trimmed.length >= 2 && preferences.isLoggedIn()) {
                delay(260)
                _uiState.update { it.copy(isSearchingServer = true) }
                val fetched = withContext(Dispatchers.IO) {
                    coroutineScope {
                        val intentsDef = async { apiClient.listPaymentIntents(limit = 50, search = trimmed) }
                        val ordersDef = async { apiClient.fetchOrders(search = trimmed) }
                        val txDef = async { apiClient.fetchTransactions(limit = 50, offset = 0, search = trimmed) }
                        Triple(intentsDef.await(), ordersDef.await(), txDef.await())
                    }
                }
                fetched.first.onSuccess { cachedServerIntents = it.items }
                fetched.second.onSuccess { cachedServerOrders = it.items }
                fetched.third.onSuccess { cachedServerSms = it.items }
                _uiState.update { it.copy(isSearchingServer = false) }
                recomputeMatches(_uiState.value.query)
            } else {
                _uiState.update { it.copy(isSearchingServer = false) }
            }
        }
    }

    fun selectCategory(category: SearchCategory) {
        _uiState.update { it.copy(selectedCategory = category) }
    }

    fun recordRecentQuery(query: String) {
        val trimmed = query.trim()
        if (trimmed.length < 2) return
        _uiState.update { current ->
            val updated = (listOf(trimmed) + current.recentQueries.filterNot {
                it.equals(trimmed, ignoreCase = true)
            }).take(6)
            current.copy(recentQueries = updated)
        }
    }

    private fun recomputeMatches(rawQuery: String) {
        val tokens = rawQuery.trim()
            .lowercase(Locale.US)
            .split(Regex("\\s+"))
            .filter { it.isNotBlank() }

        val state = latestDashboardState

        val mergedIntents = LinkedHashMap<String, PaymentIntentDto>()
        state.paymentIntents.forEach { mergedIntents[it.id] = it }
        cachedServerIntents.forEach { mergedIntents.putIfAbsent(it.id, it) }

        val mergedOrders = LinkedHashMap<String, MerchantOrderDto>()
        state.orders.forEach { mergedOrders[it.externalOrderId] = it }
        cachedServerOrders.forEach { mergedOrders.putIfAbsent(it.externalOrderId, it) }

        val mergedSms = LinkedHashMap<String, SearchSmsItem>()
        val localSource = if (tokens.isEmpty()) state.transactions else cachedLocalSms
        localSource.forEach { sms ->
            val item = SearchSmsItem(
                id = "local_${sms.id}",
                provider = sms.provider,
                trxId = sms.trxId,
                amount = sms.amount,
                senderNumber = sms.senderNumber,
                rawSms = sms.rawSms,
                status = sms.status,
                externalOrderId = sms.externalOrderId,
                receivedAtMs = sms.receivedAt,
                simSlotIndex = sms.simSlotIndex,
                receiverNumber = sms.receiverNumber,
                source = sms.source,
                isLocal = true
            )
            mergedSms[item.trxId.uppercase(Locale.US).ifBlank { item.id }] = item
        }
        cachedServerSms.forEach { ledger ->
            val key = ledger.trxId.uppercase(Locale.US).ifBlank { "srv_${ledger.id}" }
            mergedSms.putIfAbsent(
                key,
                SearchSmsItem(
                    id = "srv_${ledger.id}",
                    provider = ledger.provider,
                    trxId = ledger.trxId,
                    amount = ledger.amount,
                    senderNumber = ledger.senderNumber,
                    rawSms = ledger.rawSms,
                    status = ledger.status,
                    externalOrderId = ledger.externalOrderId,
                    receivedAtMs = parseIsoEpochMs(ledger.smsReceivedAt) ?: 0L,
                    simSlotIndex = null,
                    receiverNumber = null,
                    source = ledger.source,
                    isLocal = false
                )
            )
        }

        val payments = if (tokens.isEmpty()) {
            mergedIntents.values.take(6)
        } else {
            mergedIntents.values.filter { matchesTokens(intentSearchBlob(it), tokens) }
        }

        val orders = if (tokens.isEmpty()) {
            mergedOrders.values.take(6)
        } else {
            mergedOrders.values.filter { matchesTokens(orderSearchBlob(it), tokens) }
        }

        val links = if (tokens.isEmpty()) {
            state.paymentLinks.take(6)
        } else {
            state.paymentLinks.filter { matchesTokens(linkSearchBlob(it), tokens) }
        }

        val smsList = if (tokens.isEmpty()) {
            mergedSms.values.take(6)
        } else {
            mergedSms.values.filter { matchesTokens(smsSearchBlob(it), tokens) }
        }

        val wallets = if (tokens.isEmpty()) {
            state.wallets.take(6)
        } else {
            state.wallets.filter { matchesTokens(walletSearchBlob(it), tokens) }
        }

        val projects = if (tokens.isEmpty()) {
            state.projects
        } else {
            state.projects.filter { matchesTokens(projectSearchBlob(it), tokens) }
        }

        _uiState.update {
            it.copy(
                matchedPayments = payments,
                matchedOrders = orders,
                matchedLinks = links,
                matchedSms = smsList,
                matchedWallets = wallets,
                matchedProjects = projects
            )
        }
    }

    private fun matchesTokens(blob: String, tokens: List<String>): Boolean {
        if (tokens.isEmpty()) return true
        val lower = blob.lowercase(Locale.US)
        return tokens.all { lower.contains(it) }
    }

    private fun intentSearchBlob(i: PaymentIntentDto): String = buildString {
        append(i.id).append(' ')
        append(i.externalRefId).append(' ')
        append(i.projectName.orEmpty()).append(' ')
        append(i.vertical).append(' ')
        append(i.status).append(' ')
        append(i.provider.orEmpty()).append(' ')
        append(i.trxId.orEmpty()).append(' ')
        append(i.senderNumber.orEmpty()).append(' ')
        append(i.uniqueAmount).append(' ')
        append(i.paidAmount ?: "").append(' ')
        append(i.customer?.name.orEmpty()).append(' ')
        append(i.customer?.phone.orEmpty()).append(' ')
        append(i.customer?.email.orEmpty()).append(' ')
        append(i.display.appName.orEmpty()).append(' ')
        append(i.display.title.orEmpty()).append(' ')
        append(i.display.subtitle.orEmpty()).append(' ')
        i.display.highlights.forEach { append(it.label).append(' ').append(it.value).append(' ') }
        if (isLinkPaymentIntent(i)) append("payment link ")
    }

    private fun orderSearchBlob(o: MerchantOrderDto): String = buildString {
        append(o.externalOrderId).append(' ')
        append(o.projectName.orEmpty()).append(' ')
        append(o.customerName.orEmpty()).append(' ')
        append(o.customerPhone.orEmpty()).append(' ')
        append(o.customerEmail.orEmpty()).append(' ')
        append(o.itemsSummary.orEmpty()).append(' ')
        append(o.shippingAddress.orEmpty()).append(' ')
        append(o.paymentMethod).append(' ')
        append(o.orderStatus).append(' ')
        append(o.paymentStatus).append(' ')
        append(o.mfsProvider.orEmpty()).append(' ')
        append(o.trxId.orEmpty()).append(' ')
        append(o.baseAmount).append(' ')
        if (isPaymentLinkOrder(o)) append("payment link ")
    }

    private fun linkSearchBlob(l: PaymentLinkDto): String = buildString {
        append(l.title).append(' ')
        append(l.description.orEmpty()).append(' ')
        append(l.slug).append(' ')
        append(l.shareUrl).append(' ')
        append(l.projectName.orEmpty()).append(' ')
        append(l.vertical).append(' ')
        append(l.amountType).append(' ')
        append(l.fixedAmount ?: "").append(' ')
        append(if (l.isActive) "active" else "paused")
    }

    private fun smsSearchBlob(s: SearchSmsItem): String = buildString {
        append(s.provider).append(' ')
        append(s.trxId).append(' ')
        append(s.amount).append(' ')
        append(s.senderNumber).append(' ')
        append(s.externalOrderId.orEmpty()).append(' ')
        append(s.status).append(' ')
        append(s.source).append(' ')
        append(s.rawSms)
    }

    private fun walletSearchBlob(w: WalletRotationDto): String = buildString {
        append(w.provider).append(' ')
        append(w.walletNumber).append(' ')
        append(w.accountType).append(' ')
        append(w.label.orEmpty()).append(' ')
        append(w.deviceName.orEmpty()).append(' ')
        append(w.rotationState).append(' ')
        if (w.isPrimary) append("primary ")
        append(if (w.isActive) "active" else "paused")
    }

    private fun projectSearchBlob(p: MerchantProjectDto): String = buildString {
        append(p.name).append(' ')
        append(p.slug).append(' ')
        append(p.description.orEmpty()).append(' ')
        append(p.accountMode).append(' ')
        append(p.verificationMode).append(' ')
        append(p.walletSelectionMode)
    }
}
