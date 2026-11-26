package com.orbitsaas.payment.ui.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.orbitsaas.payment.R
import com.orbitsaas.payment.data.local.OrbitDatabase
import com.orbitsaas.payment.data.local.PreferencesManager
import com.orbitsaas.payment.data.local.SmsEntity
import com.orbitsaas.payment.data.remote.LedgerDto
import com.orbitsaas.payment.data.remote.OrbitApiClient
import com.orbitsaas.payment.ui.components.parseIsoEpochMs
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

enum class HistoryTab {
    LOCAL,
    SERVER
}

data class HistoryItem(
    val id: String,
    val provider: String,
    val trxId: String,
    val amount: Double,
    val senderNumber: String,
    val rawSms: String,
    val status: String,
    val matchType: String?,
    val externalOrderId: String?,
    val receivedAtMs: Long,
    val verifiedAtMs: Long?,
    val smsSender: String?,
    val source: String,
    val trustFlag: String?,
    val isLocal: Boolean
)

data class HistoryUiState(
    val selectedTab: HistoryTab = HistoryTab.LOCAL,
    val searchQuery: String = "",
    val statusFilter: String? = null,
    val providerFilter: String? = null,
    val localItems: List<HistoryItem> = emptyList(),
    val serverItems: List<HistoryItem> = emptyList(),
    val serverTotal: Int = 0,
    val isServerLoading: Boolean = false,
    val isLoadingMore: Boolean = false,
    val serverError: String? = null
) {
    val hasMoreServer: Boolean
        get() = serverItems.size < serverTotal
}

@OptIn(ExperimentalCoroutinesApi::class, FlowPreview::class)
class HistoryViewModel(application: Application) : AndroidViewModel(application) {

    private val database = OrbitDatabase.getDatabase(application)
    private val preferences = PreferencesManager(application)
    private val apiClient = OrbitApiClient(preferences)

    private val _selectedTab = MutableStateFlow(HistoryTab.LOCAL)
    private val _searchQuery = MutableStateFlow("")
    private val _statusFilter = MutableStateFlow<String?>(null)
    private val _providerFilter = MutableStateFlow<String?>(null)

    private val _serverItems = MutableStateFlow<List<HistoryItem>>(emptyList())
    private val _serverTotal = MutableStateFlow(0)
    private val _isServerLoading = MutableStateFlow(false)
    private val _isLoadingMore = MutableStateFlow(false)
    private val _serverError = MutableStateFlow<String?>(null)

    private var serverFetchJob: Job? = null
    private var serverHasLoadedOnce = false

    private val localItemsFlow = combine(
        _searchQuery.debounce(150),
        _statusFilter,
        _providerFilter
    ) { query, status, provider ->
        val localStatus = if (status in LOCAL_STATUSES) status else null
        Triple(query.trim(), localStatus, provider)
    }.flatMapLatest { (query, status, provider) ->
        database.smsDao().searchFlow(query, status, provider)
    }.map { list ->
        list.map { it.toHistoryItem() }
    }

    private val filterStateFlow = combine(
        _selectedTab,
        _searchQuery,
        _statusFilter,
        _providerFilter
    ) { tab, query, status, provider ->
        FilterBundle(tab, query, status, provider)
    }

    private val serverStateFlow = combine(
        _serverItems,
        _serverTotal,
        _isServerLoading,
        _isLoadingMore,
        _serverError
    ) { items, total, loading, loadingMore, error ->
        ServerBundle(items, total, loading, loadingMore, error)
    }

    val uiState: StateFlow<HistoryUiState> = combine(
        filterStateFlow,
        localItemsFlow,
        serverStateFlow
    ) { filters, localItems, server ->
        HistoryUiState(
            selectedTab = filters.tab,
            searchQuery = filters.query,
            statusFilter = filters.status,
            providerFilter = filters.provider,
            localItems = localItems,
            serverItems = server.items,
            serverTotal = server.total,
            isServerLoading = server.loading,
            isLoadingMore = server.loadingMore,
            serverError = server.error
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = HistoryUiState()
    )

    init {
        viewModelScope.launch {
            combine(
                _selectedTab,
                _searchQuery.debounce(300),
                _statusFilter,
                _providerFilter
            ) { tab, query, status, provider ->
                FilterBundle(tab, query, status, provider)
            }.collect { filters ->
                if (filters.tab == HistoryTab.SERVER) {
                    loadServerTransactions(reset = true)
                }
            }
        }
    }

    fun selectTab(tab: HistoryTab) {
        if (_selectedTab.value == tab) return
        val currentStatus = _statusFilter.value
        val validForNewTab = when (tab) {
            HistoryTab.LOCAL -> currentStatus == null || currentStatus in LOCAL_STATUSES
            HistoryTab.SERVER -> currentStatus == null || currentStatus in SERVER_STATUSES
        }
        if (!validForNewTab) {
            _statusFilter.value = null
        }
        _selectedTab.value = tab
        if (tab == HistoryTab.SERVER && !serverHasLoadedOnce) {
            loadServerTransactions(reset = true)
        }
    }

    fun updateSearchQuery(query: String) {
        _searchQuery.value = query
    }

    fun selectStatusFilter(status: String?) {
        _statusFilter.value = if (_statusFilter.value == status) null else status
    }

    fun selectProviderFilter(provider: String?) {
        _providerFilter.value = if (_providerFilter.value == provider) null else provider
    }

    fun refreshServer() {
        loadServerTransactions(reset = true)
    }

    fun loadMoreServer() {
        if (_isServerLoading.value || _isLoadingMore.value) return
        if (_serverItems.value.size >= _serverTotal.value) return
        loadServerTransactions(reset = false)
    }

    private fun loadServerTransactions(reset: Boolean) {
        if (reset) {
            serverFetchJob?.cancel()
        }
        val query = _searchQuery.value.trim().ifBlank { null }
        val status = _statusFilter.value?.takeIf { it in SERVER_STATUSES }
        val provider = _providerFilter.value
        val offset = if (reset) 0 else _serverItems.value.size

        serverFetchJob = viewModelScope.launch {
            if (reset) {
                _isServerLoading.value = true
                _serverError.value = null
            } else {
                _isLoadingMore.value = true
            }

            val result = withContext(Dispatchers.IO) {
                apiClient.fetchTransactions(PAGE_SIZE, offset, query, status, provider)
            }

            result.onSuccess { page ->
                serverHasLoadedOnce = true
                val mapped = page.items.map { it.toHistoryItem() }
                if (reset) {
                    _serverItems.value = mapped
                } else {
                    val existingIds = _serverItems.value.mapTo(HashSet()) { it.id }
                    _serverItems.value = _serverItems.value + mapped.filter { it.id !in existingIds }
                }
                _serverTotal.value = page.total
                _serverError.value = null
            }.onFailure { err ->
                val detail = err.message ?: getApplication<Application>().getString(R.string.history_detail_unknown)
                _serverError.value = getApplication<Application>().getString(R.string.history_error_prefix, detail)
            }

            _isServerLoading.value = false
            _isLoadingMore.value = false
        }
    }

    private fun SmsEntity.toHistoryItem(): HistoryItem {
        return HistoryItem(
            id = "local_$id",
            provider = provider,
            trxId = trxId,
            amount = amount,
            senderNumber = senderNumber,
            rawSms = rawSms,
            status = status,
            matchType = null,
            externalOrderId = externalOrderId,
            receivedAtMs = receivedAt,
            verifiedAtMs = if (status == SmsEntity.STATUS_VERIFIED) syncedAt else null,
            smsSender = smsSender.ifBlank { null },
            source = source.ifBlank { "SMS" },
            trustFlag = null,
            isLocal = true
        )
    }

    private fun LedgerDto.toHistoryItem(): HistoryItem {
        return HistoryItem(
            id = id,
            provider = provider,
            trxId = trxId,
            amount = amount,
            senderNumber = senderNumber,
            rawSms = rawSms,
            status = status,
            matchType = matchType?.ifBlank { null },
            externalOrderId = externalOrderId?.ifBlank { null },
            receivedAtMs = parseIsoEpochMs(smsReceivedAt) ?: 0L,
            verifiedAtMs = parseIsoEpochMs(verifiedAt),
            smsSender = smsSender?.ifBlank { null },
            source = source.orEmpty().ifBlank { "SMS" },
            trustFlag = trustFlag?.ifBlank { null },
            isLocal = false
        )
    }

    private data class FilterBundle(
        val tab: HistoryTab,
        val query: String,
        val status: String?,
        val provider: String?
    )

    private data class ServerBundle(
        val items: List<HistoryItem>,
        val total: Int,
        val loading: Boolean,
        val loadingMore: Boolean,
        val error: String?
    )

    companion object {
        private const val PAGE_SIZE = 30
        val LOCAL_STATUSES = setOf(
            SmsEntity.STATUS_VERIFIED,
            SmsEntity.STATUS_UPLOADED,
            SmsEntity.STATUS_PENDING_UPLOAD
        )
        val SERVER_STATUSES = setOf("UNCLAIMED", "VERIFIED", "MANUAL_VERIFIED")
    }
}
